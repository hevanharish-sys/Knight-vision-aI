"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, type CameraHandle } from "@/components/Camera";
import { MicButton } from "@/components/MicButton";
import { apiUrl } from "@/lib/api-base";
import {
  HAND_CONNECTIONS,
  PHRASE_SPEECH,
  classifyTwoHandGesture,
  extractHandFeatures,
  landmarksForApi,
  summarizeHands,
  type Landmark,
  type TrackedHand,
} from "@/lib/sign/gestures";
import {
  SIGN_LANGUAGES,
  getSignLanguage,
  languagesByRegion,
} from "@/lib/sign/languages";
import { saveHubEntry } from "@/lib/hub";
import {
  createSpeechRecognition,
  isSpeechRecognitionSupported,
  speak,
  stopSpeaking,
} from "@/lib/speech";

type HandLandmarkerResult = {
  landmarks?: Landmark[][];
  handedness?: Array<Array<{ categoryName?: string; displayName?: string; score?: number }>>;
};

type HandLandmarkerType = {
  detectForVideo: (video: HTMLVideoElement, timestamp: number) => HandLandmarkerResult;
  close: () => void;
};

type ChatMessage = {
  id: string;
  role: "signer" | "doctor";
  text: string;
  at: string;
};

const LANG_KEY = "knight-vision-sign-language";
const HAND_COLORS = ["#19b5b8", "#e4572e"]; // left-ish / right-ish

export default function SignPage() {
  const cameraRef = useRef<CameraHandle>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<HandLandmarkerType | null>(null);
  const rafRef = useRef(0);
  const langRef = useRef(SIGN_LANGUAGES[0]);
  const handsRef = useRef<TrackedHand[]>([]);
  const handCountRef = useRef(0);
  const featuresRef = useRef("");
  const localGuessRef = useRef("");
  const busyRef = useRef(false);
  const liveRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const lastSignerTextRef = useRef("");
  const lastQuickRef = useRef({ label: "", at: 0 });
  const recognitionRef = useRef<ReturnType<typeof createSpeechRecognition> | null>(null);

  const [langId, setLangId] = useState("isl");
  const [regionFilter, setRegionFilter] = useState("South Asia");
  const [ready, setReady] = useState(false);
  const [handCount, setHandCount] = useState(0);
  const [featuresText, setFeaturesText] = useState("Show both hands to the camera");
  const [status, setStatus] = useState("Use both hands — skeleton tracks each hand");
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [liveOn, setLiveOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [quickOn, setQuickOn] = useState(true);
  const [doctorListening, setDoctorListening] = useState(false);
  const [doctorDraft, setDoctorDraft] = useState("");
  const [liveCaption, setLiveCaption] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => getSignLanguage(langId), [langId]);
  const grouped = useMemo(() => languagesByRegion(), []);
  const filtered = useMemo(() => {
    if (regionFilter === "All") return SIGN_LANGUAGES;
    return SIGN_LANGUAGES.filter((l) => l.region === regionFilter);
  }, [regionFilter]);

  useEffect(() => {
    langRef.current = selected;
  }, [selected]);
  useEffect(() => {
    liveRef.current = liveOn;
  }, [liveOn]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && SIGN_LANGUAGES.some((l) => l.id === saved)) setLangId(saved);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, liveCaption]);

  const pushMessage = useCallback((role: "signer" | "doctor", text: string) => {
    const clean = text.trim();
    if (!clean) return;

    if (role === "signer") {
      const same =
        clean.toLowerCase() === lastSignerTextRef.current.toLowerCase() &&
        Date.now() - lastQuickRef.current.at < 4500;
      if (same) return;
      lastSignerTextRef.current = clean;
      lastQuickRef.current = { label: clean, at: Date.now() };
    }

    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role,
      text: clean,
      at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, msg]);

    if (role === "signer") {
      speak(clean, { lang: "en-IN" });
      saveHubEntry({
        type: "sign",
        title: `${langRef.current.name} → Doctor`,
        content: clean,
        meta: { language: langRef.current.id, hands: String(handCountRef.current) },
      });
    } else {
      saveHubEntry({
        type: "sign",
        title: `Doctor → patient`,
        content: clean,
      });
    }
  }, []);

  const interpretConversation = useCallback(async () => {
    if (busyRef.current) return;

    const image = cameraRef.current?.captureDataUrl(0.88);
    if (!image) {
      setStatus("Camera not ready");
      return;
    }
    if (handCountRef.current < 1) {
      setStatus("Bring one or both hands into the frame (skeleton should appear)");
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setStatus(
      handCountRef.current >= 2
        ? "Reading both-hand sign…"
        : "Reading one-hand sign… (two hands work better)"
    );
    setError("");

    try {
      const history = messagesRef.current.slice(-8).map((m) => ({
        role: m.role === "signer" ? "Patient (signing)" : "Doctor",
        text: m.text,
      }));

      const bothHandsLandmarks = handsRef.current.map((h) => ({
        label: h.label,
        points: landmarksForApi(h.landmarks),
      }));

      const res = await fetch(apiUrl("/api/sign/converse"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image,
          languageName: langRef.current.name,
          featuresSummary: featuresRef.current,
          handCount: handCountRef.current,
          bothHandsLandmarks,
          localGuess: localGuessRef.current,
          history,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const raw = String(data.error || "");
        if (
          res.status === 429 ||
          raw.toLowerCase().includes("quota") ||
          raw.toLowerCase().includes("cooldown")
        ) {
          if (localGuessRef.current) {
            pushMessage("signer", localGuessRef.current);
            setStatus("Cloud resting — used quick pose from skeleton");
            setError("");
            return;
          }
          setError("");
          setStatus("Cloud resting (API limit). Use Quick poses or try again shortly.");
          return;
        }
        throw new Error(raw || "Could not interpret sign");
      }

      if (data.detected && data.text) {
        pushMessage("signer", data.text);
        setStatus(
          `Translated (${data.handsUsed || handCountRef.current} hand${
            (data.handsUsed || handCountRef.current) > 1 ? "s" : ""
          })`
        );
      } else if (localGuessRef.current) {
        pushMessage("signer", localGuessRef.current);
        setStatus("Used skeleton pose guess");
      } else {
        setStatus(data.notes || "Keep signing with both hands if possible");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Interpret failed";
      if (
        message.toLowerCase().includes("quota") ||
        message.toLowerCase().includes("cooldown")
      ) {
        setError("");
        if (localGuessRef.current) {
          pushMessage("signer", localGuessRef.current);
          setStatus("Cloud resting — used quick pose");
        } else {
          setStatus("Cloud resting — try Quick poses or wait a minute");
        }
      } else {
        setError(message);
        if (localGuessRef.current) {
          pushMessage("signer", localGuessRef.current);
          setStatus("AI failed — used both-hand skeleton pose");
        } else {
          setStatus("Interpretation failed — try again with both hands visible");
        }
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [pushMessage]);

  useEffect(() => {
    if (!liveOn) return;
    const id = window.setInterval(() => {
      if (liveRef.current && handCountRef.current > 0 && !busyRef.current) {
        void interpretConversation();
      }
    }, 3000);
    return () => window.clearInterval(id);
  }, [liveOn, interpretConversation]);

  useEffect(() => {
    let cancelled = false;
    // MediaPipe TFLite INFO logs via console.error — quiet them for Next overlay
    const originalError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      const text = args.map(String).join(" ");
      if (
        text.includes("XNNPACK") ||
        text.includes("TensorFlow Lite") ||
        text.includes("INFO:")
      ) {
        return;
      }
      originalError(...args);
    };

    async function init() {
      try {
        const cdn =
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
        const dynamicImport = new Function(
          "u",
          "return import(u)"
        ) as (u: string) => Promise<{
          FilesetResolver: {
            forVisionTasks: (wasm: string) => Promise<unknown>;
          };
          HandLandmarker: {
            createFromOptions: (
              fileset: unknown,
              options: unknown
            ) => Promise<HandLandmarkerType>;
          };
        }>;
        const vision = await dynamicImport(`${cdn}/vision_bundle.mjs`);
        const { FilesetResolver, HandLandmarker } = vision;
        const fileset = await FilesetResolver.forVisionTasks(`${cdn}/wasm`);
        const modelAssetPath =
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

        const options = {
          baseOptions: { modelAssetPath, delegate: "GPU" as const },
          runningMode: "VIDEO" as const,
          numHands: 2,
          minHandDetectionConfidence: 0.4,
          minHandPresenceConfidence: 0.4,
          minTrackingConfidence: 0.4,
        };

        let landmarker;
        try {
          landmarker = await HandLandmarker.createFromOptions(fileset, options);
        } catch {
          landmarker = await HandLandmarker.createFromOptions(fileset, {
            ...options,
            baseOptions: { modelAssetPath, delegate: "CPU" },
          });
        }
        if (cancelled) {
          landmarker.close();
          return;
        }
        landmarkerRef.current = landmarker;
        setReady(true);
        setStatus("Two-hand skeleton ready — show both hands");
        // No auto voice — keep speech on Home assistant only
      } catch {
        setError("Hand tracking failed to load.");
        setReady(true);
      }
    }
    init();
    return () => {
      cancelled = true;
      console.error = originalError;
      cancelAnimationFrame(rafRef.current);
      landmarkerRef.current?.close();
      recognitionRef.current?.abort();
      stopSpeaking();
    };
  }, []);

  // Draw BOTH hand skeletons + build two-hand features
  useEffect(() => {
    if (!ready) return;
    let lastTs = 0;

    const tick = () => {
      const video = cameraRef.current?.getVideo();
      const landmarker = landmarkerRef.current;
      const canvas = canvasRef.current;

      if (video && landmarker && canvas && video.readyState >= 2) {
        const now = performance.now();
        const ts = now <= lastTs ? lastTs + 1 : now;
        lastTs = ts;
        const result = landmarker.detectForVideo(video, ts);
        const landmarks = result.landmarks || [];
        const handedness = result.handedness || [];

        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext("2d");

        const tracked: TrackedHand[] = [];

        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          landmarks.forEach((hand, index) => {
            const category =
              handedness[index]?.[0]?.categoryName ||
              handedness[index]?.[0]?.displayName ||
              "";
            const label =
              category.toLowerCase().includes("left")
                ? ("Left" as const)
                : category.toLowerCase().includes("right")
                  ? ("Right" as const)
                  : index === 0
                    ? ("Left" as const)
                    : ("Right" as const);

            const features = extractHandFeatures(hand as Landmark[]);
            if (!features) return;

            tracked.push({
              label,
              landmarks: hand as Landmark[],
              features,
            });

            const color = HAND_COLORS[index % HAND_COLORS.length];
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = 4;

            for (const [a, b] of HAND_CONNECTIONS) {
              ctx.beginPath();
              ctx.moveTo(hand[a].x * canvas.width, hand[a].y * canvas.height);
              ctx.lineTo(hand[b].x * canvas.width, hand[b].y * canvas.height);
              ctx.stroke();
            }
            for (const p of hand) {
              ctx.beginPath();
              ctx.arc(p.x * canvas.width, p.y * canvas.height, 5, 0, Math.PI * 2);
              ctx.fill();
            }

            // Label each hand near wrist
            const wrist = hand[0];
            ctx.font = "bold 14px sans-serif";
            ctx.fillStyle = "#fff";
            ctx.strokeStyle = "#000";
            ctx.lineWidth = 3;
            const tag = `${label}`;
            const tx = wrist.x * canvas.width;
            const ty = wrist.y * canvas.height - 10;
            ctx.strokeText(tag, tx, ty);
            ctx.fillText(tag, tx, ty);
          });
        }

        handsRef.current = tracked;
        handCountRef.current = tracked.length;
        setHandCount(tracked.length);

        const summary = summarizeHands(tracked);
        featuresRef.current = summary;
        setFeaturesText(summary);

        const twoHand = classifyTwoHandGesture(tracked);
        if (twoHand && twoHand.kind === "phrase") {
          localGuessRef.current = twoHand.spoken;
          // Instant quick replies from skeleton (both hands supported)
          if (
            quickOn &&
            !liveRef.current &&
            (Date.now() - lastQuickRef.current.at > 1600 ||
              lastQuickRef.current.label !== twoHand.spoken)
          ) {
            pushMessage("signer", twoHand.spoken);
            setStatus(`Skeleton detected (${tracked.length} hand${tracked.length > 1 ? "s" : ""}): ${twoHand.label}`);
          } else if (liveRef.current) {
            setStatus(`Tracking ${tracked.length} hand(s) · hint: ${twoHand.label}`);
          }
        } else if (tracked.length) {
          localGuessRef.current = "";
          setStatus(
            tracked.length >= 2
              ? "Both hands tracked — sign naturally"
              : "1 hand tracked — raise your other hand for two-handed signs"
          );
        } else {
          localGuessRef.current = "";
          setFeaturesText("No hands — show both hands to the camera");
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [ready, quickOn, pushMessage]);

  function sendDoctorText(text: string) {
    const clean = text.trim();
    if (!clean) return;
    pushMessage("doctor", clean);
    setDoctorDraft("");
    setLiveCaption(clean);
  }

  function toggleDoctorMic() {
    if (doctorListening) {
      recognitionRef.current?.stop();
      setDoctorListening(false);
      return;
    }
    if (!isSpeechRecognitionSupported()) {
      setError("Doctor mic needs Chrome speech recognition.");
      return;
    }
    let buffer = "";
    const recognition = createSpeechRecognition({
      lang: "en-IN",
      continuous: true,
      onResult: ({ transcript, isFinal }) => {
        setLiveCaption(transcript);
        buffer = transcript;
        if (isFinal) {
          pushMessage("doctor", transcript);
          buffer = "";
        }
      },
      onEnd: () => {
        if (buffer.trim()) pushMessage("doctor", buffer);
        setDoctorListening(false);
      },
      onError: (err) => setError(err),
    });
    recognitionRef.current = recognition;
    recognition.start();
    setDoctorListening(true);
  }

  const lastPatient =
    [...messages].reverse().find((m) => m.role === "signer")?.text || "";

  return (
    <div className="space-y-3">
      {/* Compact top bar */}
      <div className="lb-rise flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0f8b8d]">
            Sign ↔ Doctor
          </p>
          <h1 className="lb-display truncate text-2xl text-[#0b1f33] sm:text-3xl">
            {selected.name}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Region"
            className="min-h-10 rounded-full border border-black/10 bg-white px-3 text-sm font-semibold text-[#0b1f33]"
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
          >
            <option value="All">All regions</option>
            {grouped.map((g) => (
              <option key={g.region} value={g.region}>
                {g.region}
              </option>
            ))}
          </select>
          <select
            aria-label="Sign language"
            className="min-h-10 max-w-[220px] rounded-full border border-black/10 bg-white px-3 text-sm font-semibold text-[#0b1f33]"
            value={langId}
            onChange={(e) => {
              setLangId(e.target.value);
              localStorage.setItem(LANG_KEY, e.target.value);
            }}
          >
            {filtered.map((lang) => (
              <option key={lang.id} value={lang.id}>
                {lang.name}
              </option>
            ))}
          </select>
          <span
            className={`rounded-full px-3 py-2 text-xs font-bold ${
              ready ? "bg-[#d7f3f3] text-[#0f8b8d]" : "bg-black/5 text-[#486581]"
            }`}
          >
            {ready ? "Tracking ready" : "Loading…"}
          </span>
        </div>
      </div>

      {/* Camera + live chat side by side */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)] lg:items-stretch">
        <section className="relative overflow-hidden rounded-[1.5rem] bg-[#0b1f33] shadow-[0_28px_70px_rgba(11,31,51,0.28)]">
          <div className="relative aspect-[16/10] min-h-[46vh] w-full sm:min-h-[52vh] lg:min-h-full lg:aspect-auto lg:h-full lg:min-h-[560px]">
            <Camera
              ref={cameraRef}
              className="absolute inset-0 h-full w-full !rounded-none"
              onError={(msg) => {
                if (
                  !msg.toLowerCase().includes("quota") &&
                  !msg.toLowerCase().includes("cooldown")
                ) {
                  setError(msg);
                }
              }}
            />
            <canvas
              ref={canvasRef}
              className="pointer-events-none absolute inset-0 z-10 h-full w-full scale-x-[-1] bg-transparent"
            />

            <div className="absolute left-3 top-3 z-20 flex flex-wrap gap-2">
              <span className="rounded-full bg-black/55 px-3 py-1.5 text-xs font-bold text-white backdrop-blur">
                {handCount === 0
                  ? "No hands"
                  : handCount === 1
                    ? "1 hand"
                    : "2 hands"}
              </span>
              <span className="rounded-full bg-[#19b5b8] px-3 py-1.5 text-xs font-bold text-white">
                L
              </span>
              <span className="rounded-full bg-[#e4572e] px-3 py-1.5 text-xs font-bold text-white">
                R
              </span>
              {liveOn ? (
                <span className="lb-listen-glow rounded-full bg-[#e4572e] px-3 py-1.5 text-xs font-bold text-white">
                  LIVE
                </span>
              ) : null}
              {busy ? (
                <span className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-[#0b1f33]">
                  Translating…
                </span>
              ) : null}
            </div>

            <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#0b1f33] via-[#0b1f33]/75 to-transparent px-3 pb-3 pt-20 sm:px-5 sm:pb-5">
              <p className="mb-3 text-sm font-semibold text-white/90" aria-live="polite">
                {status}
              </p>
              <p className="mb-3 hidden text-xs text-white/55 sm:block">{featuresText}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`lb-btn min-h-12 ${liveOn ? "lb-btn-secondary" : "lb-btn-primary"}`}
                  onClick={() => {
                    setLiveOn((v) => {
                      const next = !v;
                      setStatus(
                        next
                          ? "Live on — sign naturally; translating every few seconds"
                          : "Live paused"
                      );
                      if (next) {
                        void interpretConversation();
                      }
                      return next;
                    });
                  }}
                >
                  {liveOn ? "Stop live" : "Start live"}
                </button>
                <button
                  type="button"
                  className="lb-btn min-h-12 bg-white text-[#0b1f33] hover:bg-white/90"
                  disabled={busy || !ready}
                  onClick={() => void interpretConversation()}
                >
                  {busy ? "Translating…" : "Translate now"}
                </button>
                <button
                  type="button"
                  className={`lb-btn min-h-12 ${
                    quickOn
                      ? "bg-[#19b5b8] text-white"
                      : "bg-white/15 text-white border border-white/20"
                  }`}
                  onClick={() => setQuickOn((v) => !v)}
                >
                  Quick poses {quickOn ? "ON" : "OFF"}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Conversation docked beside camera */}
        <section
          className="flex min-h-[280px] flex-col overflow-hidden rounded-[1.5rem] border border-black/5 bg-white shadow-[0_20px_50px_rgba(11,31,51,0.12)] lg:min-h-[560px]"
          aria-label="Conversation near camera"
        >
          <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#0f8b8d]">
                Live chat
              </p>
              <h2 className="text-base font-bold text-[#0b1f33]">Conversation</h2>
            </div>
            <button
              type="button"
              className="rounded-full bg-[#eef6f8] px-3 py-1.5 text-xs font-bold text-[#0f8b8d]"
              onClick={() => {
                setMessages([]);
                setLiveCaption("");
                lastSignerTextRef.current = "";
              }}
            >
              Clear
            </button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {messages.length === 0 ? (
              <p className="rounded-xl bg-[#eef6f8] px-3 py-4 text-sm text-[#486581]">
                Chat stays next to the camera. Show both hands, then Start live.
              </p>
            ) : (
              messages.slice(-16).map((m) => (
                <div
                  key={m.id}
                  className={`rounded-2xl px-3 py-2.5 text-sm font-semibold ${
                    m.role === "signer"
                      ? "ml-4 bg-[#0b1f33] text-white"
                      : "mr-4 bg-[#d7f3f3] text-[#0b1f33]"
                  }`}
                >
                  <span className="text-[10px] font-bold uppercase opacity-70">
                    {m.role === "signer" ? "Patient" : "Doctor"}
                  </span>
                  <p className="mt-0.5">{m.text}</p>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>
        </section>
      </div>

      {/* Captions + doctor reply under the camera/chat row */}
      <section className="lb-slide-up grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-[1.4rem] border-2 border-[#0f8b8d] bg-white p-4 shadow-sm sm:p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#0f8b8d]">
            Captions for patient
          </p>
          <p className="lb-caption-in mt-2 text-[clamp(1.4rem,3vw,2.2rem)] font-bold leading-snug text-[#0b1f33]">
            {liveCaption || lastPatient || "Doctor’s words appear here"}
          </p>
          {lastPatient && liveCaption ? (
            <p className="mt-2 text-sm text-[#486581]">
              Last signed:{" "}
              <span className="font-semibold text-[#0b1f33]">{lastPatient}</span>
            </p>
          ) : null}
        </div>

        <div className="rounded-[1.4rem] border border-black/5 bg-white/80 p-4 shadow-sm backdrop-blur">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#0f8b8d]">
            Doctor reply
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <MicButton
              listening={doctorListening}
              onClick={toggleDoctorMic}
              labelListen="Doctor speak"
              labelStop="Stop mic"
            />
            <div className="flex gap-2">
              <input
                className="min-h-12 flex-1 rounded-2xl border border-black/10 bg-white px-3 text-sm"
                placeholder="Type for patient…"
                value={doctorDraft}
                onChange={(e) => setDoctorDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendDoctorText(doctorDraft);
                }}
              />
              <button
                type="button"
                className="lb-btn lb-btn-primary px-4"
                onClick={() => sendDoctorText(doctorDraft)}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="lb-slide-up rounded-[1.4rem] border border-black/5 bg-[#0b1f33] p-4 text-white">
        <h2 className="text-sm font-bold">Quick clinic signs</h2>
        <p className="mt-1 text-xs text-white/60">Tap to speak instantly</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(PHRASE_SPEECH).map(([label, spoken]) => (
            <button
              key={label}
              type="button"
              className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold transition hover:bg-white/20"
              onClick={() => pushMessage("signer", spoken)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {error &&
      !error.toLowerCase().includes("quota") &&
      !error.toLowerCase().includes("cooldown") ? (
        <p className="rounded-2xl bg-[#fff1ed] px-4 py-3 text-sm text-[#e4572e]">{error}</p>
      ) : null}
    </div>
  );
}
