"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Camera, type CameraHandle } from "@/components/Camera";
import { isVisionEasyProfile } from "@/lib/easy-mode";
import { saveHubEntry } from "@/lib/hub";
import { useProfile } from "@/lib/profile";
import { speak, stopSpeaking } from "@/lib/speech";
import {
  VisionSceneDetector,
  drawDetections,
  refineDetections,
  type DetectedItem,
} from "@/lib/vision/detector";
import { askGeminiVision, fallbackSceneHint } from "@/lib/vision/describeScene";

function VisionPageInner() {
  const cameraRef = useRef<CameraHandle>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectorRef = useRef<VisionSceneDetector | null>(null);
  const rafRef = useRef(0);
  const runningRef = useRef(false);
  const liveRef = useRef(false);
  const busyRef = useRef(false);
  const lastSpeakRef = useRef(0);
  const lastUiUpdateRef = useRef(0);
  const lastCountRef = useRef("");
  const lastCorrectRef = useRef(0);
  const lastSeenLabelsRef = useRef<Set<string>>(new Set());
  const extraLabelsRef = useRef<string[]>([]);
  const facingRef = useRef<"user" | "environment">("user");
  const profileRef = useRef<string | null>(null);
  const autoStarted = useRef(false);
  const autoLiveStarted = useRef(false);

  const { profile } = useProfile();
  const search = useSearchParams();
  const easy = isVisionEasyProfile(profile);
  profileRef.current = profile;

  const [description, setDescription] = useState(
    "Loading on-device detector… I’ll name people, objects, and hazards in the camera."
  );
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastAt, setLastAt] = useState("—");
  const [readyCam, setReadyCam] = useState(false);
  const [detectorReady, setDetectorReady] = useState(false);
  const [mode, setMode] = useState<"gemini" | "live" | "offline">("live");
  const [items, setItems] = useState<DetectedItem[]>([]);
  const [extraLabels, setExtraLabels] = useState<string[]>([]);
  const [countLabel, setCountLabel] = useState("0 detected");
  // Laptops usually only have a front camera — environment often shows a black feed
  const [facing, setFacing] = useState<"user" | "environment">("user");

  useEffect(() => {
    liveRef.current = live;
  }, [live]);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  useEffect(() => {
    facingRef.current = facing;
  }, [facing]);
  useEffect(() => {
    extraLabelsRef.current = extraLabels;
  }, [extraLabels]);
  useEffect(() => () => stopSpeaking(), []);

  // Init MediaPipe object + face detectors
  useEffect(() => {
    let cancelled = false;
    const detector = new VisionSceneDetector();
    detectorRef.current = detector;

    (async () => {
      try {
        await detector.init();
        if (cancelled) return;
        setDetectorReady(true);
        setDescription(
          "Detector ready — I’ll name what I see out loud. Point the camera and hold steady."
        );
        setNotice("Fast live detection + speak is on.");
        speak("Vision ready. I will tell you what I see.");
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Could not load the object detector. Check your network and refresh."
        );
      }
    })();

    return () => {
      cancelled = true;
      runningRef.current = false;
      cancelAnimationFrame(rafRef.current);
      detector.close();
    };
  }, [easy]);

  // Live detect loop — detect every frame; speak new finds quickly
  useEffect(() => {
    if (!readyCam || !detectorReady) return;
    runningRef.current = true;

    if (!autoLiveStarted.current) {
      autoLiveStarted.current = true;
      liveRef.current = true;
      setLive(true);
    }

    const tick = () => {
      if (!runningRef.current) return;
      const video = cameraRef.current?.getVideo();
      const canvas = canvasRef.current;
      const detector = detectorRef.current;

      if (video && canvas && detector?.isReady && video.readyState >= 2) {
        try {
          const raw = detector.detect(video);
          const detected = refineDetections(raw, extraLabelsRef.current);

          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;
          const ctx = canvas.getContext("2d", { alpha: true });
          if (ctx) drawDetections(ctx, detected, facingRef.current === "user");

          const now = Date.now();
          if (now - lastUiUpdateRef.current > 100) {
            lastUiUpdateRef.current = now;
            const label = detected.length
              ? `${detected.length} detected`
              : "Scanning…";
            if (label !== lastCountRef.current) {
              lastCountRef.current = label;
              setCountLabel(label);
            }
            setItems(detected);
          }

          // Fast announce: speak as soon as a new label locks in
          const currentLabels = new Set(
            detected.map((d) => (d.label === "face" ? "person" : d.label))
          );
          const brandNew = [...currentLabels].filter(
            (l) => !lastSeenLabelsRef.current.has(l)
          );
          if (brandNew.length) {
            lastSeenLabelsRef.current = currentLabels;
            if (
              liveRef.current &&
              !busyRef.current &&
              profileRef.current !== "deaf" &&
              now - lastSpeakRef.current > 900
            ) {
              lastSpeakRef.current = now;
              const line = detector.announceNew(brandNew, detected);
              if (line) {
                setDescription(line);
                setLastAt(new Date().toLocaleTimeString());
                setMode("live");
                speak(line);
              }
            }
          } else if (detected.length === 0) {
            lastSeenLabelsRef.current = new Set();
          } else {
            // Drop labels that left the scene so they can be re-announced later
            lastSeenLabelsRef.current = currentLabels;
          }

          // Background Gemini refine only for ambiguous small gadgets (non-blocking)
          const needsEnrich = raw.some((d) =>
            ["phone", "remote", "book", "clock"].includes(d.label)
          );
          if (
            needsEnrich &&
            !busyRef.current &&
            now - lastCorrectRef.current > 8000
          ) {
            lastCorrectRef.current = now;
            const shot = cameraRef.current?.captureDataUrl(0.65);
            if (shot) {
              void askGeminiVision(shot, detector.summarize(detected, 4)).then(
                (gemini) => {
                  if (!gemini?.objects?.length) return;
                  setExtraLabels(gemini.objects);
                  setItems(
                    refineDetections(detector.getLatest(), gemini.objects)
                  );
                }
              );
            }
          }

          // Periodic full list (keeps description fresh without drowning new alerts)
          if (liveRef.current && detected.length && !busyRef.current) {
            if (now - lastSpeakRef.current > 4000) {
              lastSpeakRef.current = now;
              const summary = detector.summarize(detected, 4);
              setDescription(summary);
              setLastAt(new Date().toLocaleTimeString());
              setMode("live");
              if (profileRef.current !== "deaf") speak(summary);
            }
          }
        } catch {
          /* drop frame */
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      runningRef.current = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [readyCam, detectorReady]);

  const describeAll = useCallback(async () => {
    if (busyRef.current) return;
    const detector = detectorRef.current;
    const video = cameraRef.current?.getVideo();
    if (!detector?.isReady || !video) {
      setError("Detector or camera not ready yet.");
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("Reading scene with detector + Gemini…");

    try {
      const detected = refineDetections(
        detector.detect(video),
        extraLabelsRef.current
      );
      setItems(detected);
      const localSummary = detector.summarize(detected, 5);
      let summary = localSummary;
      let source: "gemini" | "detector" | "offline" = detected.length
        ? "detector"
        : "offline";

      // Speak on-device result immediately — don't wait for Gemini
      setDescription(localSummary);
      setLastAt(new Date().toLocaleTimeString());
      setMode(detected.length ? "live" : "offline");
      if (profile !== "deaf" && localSummary) {
        lastSpeakRef.current = Date.now();
        speak(localSummary);
      }
      if (detected.length) {
        setNotice(`Told you ${detected.length} on-device item(s). Checking Gemini…`);
      }

      const shot = cameraRef.current?.captureDataUrl(0.75);
      if (shot) {
        const gemini = await askGeminiVision(shot, localSummary);
        if (gemini) {
          summary = gemini.description;
          source = "gemini";
          setMode("gemini");
          const spots = (gemini.objects || []).filter(Boolean);
          setExtraLabels(spots);
          setItems(refineDetections(detected, spots));
          setDescription(summary);
          setLastAt(new Date().toLocaleTimeString());
          const spotNote = spots.length
            ? ` Spotted: ${spots.slice(0, 8).join(", ")}.`
            : "";
          setNotice(
            detected.length
              ? `Gemini + ${detected.length} on-device detection(s).${spotNote}`
              : `Gemini scene description.${spotNote}`
          );
          if (profile !== "deaf") {
            lastSpeakRef.current = Date.now();
            speak(summary);
          }
        } else if (!detected.length) {
          summary = await fallbackSceneHint(shot);
          setMode("offline");
          setExtraLabels([]);
          setDescription(summary);
          setNotice("Used a quick offline hint.");
          if (profile !== "deaf") speak(summary);
        } else {
          setMode("live");
          setNotice(`Live on-device: ${detected.length} item(s).`);
        }
      } else if (!detected.length) {
        setNotice("Point at a person, chair, table, bottle, phone, or laptop.");
      }

      saveHubEntry({
        type: "vision",
        title:
          source === "gemini"
            ? "Vision (Gemini)"
            : source === "detector"
              ? "Vision detections"
              : "Vision offline hint",
        content: summary,
        meta: { source },
      });
    } catch {
      setError("Could not describe this frame. Try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [profile]);

  useEffect(() => {
    if (!readyCam || !detectorReady || autoStarted.current) return;
    if (search.get("autostart") === "1") {
      autoStarted.current = true;
      setLive(true);
      speak("Live vision started.");
    }
  }, [readyCam, detectorReady, search]);

  const uniqueLabels = [
    ...new Set([...items.map((i) => i.label), ...extraLabels]),
  ].slice(0, 16);

  return (
    <div className={`space-y-5 ${easy ? "easy-mode" : ""}`}>
      <header className="lb-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#5E0ED7]">
            Live object detection
          </p>
          <h1 className="lb-display mt-1 text-4xl text-[#0A0A0A] md:text-5xl">
            Vision Assistant
          </h1>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-[#737373]">
            Live boxes for chairs, tables, phones, people, and more. Tap{" "}
            <strong>Describe now</strong> to also spot headphones, mic, watch, ID
            card, and other everyday items — then hear the scene aloud.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              detectorReady ? "bg-[#EDE9FE] text-[#5E0ED7]" : "bg-black/5 text-[#737373]"
            }`}
          >
            {detectorReady ? "Detector ON" : "Loading detector…"}
          </span>
          <span className="rounded-full bg-[#0A0A0A] px-3 py-1.5 text-xs font-bold text-white">
            {countLabel}
          </span>
          <span
            className={`rounded-full px-3 py-1.5 text-xs font-bold shadow-sm ${
              mode === "gemini"
                ? "bg-[#5E0ED7] text-white"
                : mode === "live"
                  ? "bg-white text-[#0A0A0A]"
                  : "bg-[#fff1ed] text-[#c2410c]"
            }`}
          >
            {mode === "gemini"
              ? "Gemini ON"
              : mode === "live"
                ? "On-device"
                : "Offline hint"}
          </span>
          {easy ? (
            <Link href="/app/easy" className="lb-btn lb-btn-ghost text-sm">
              Easy Mode
            </Link>
          ) : null}
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <div className="relative overflow-hidden rounded-[1.75rem] bg-[#0A0A0A] shadow-[0_24px_60px_rgba(10,10,10,0.22)]">
          <Camera
            ref={cameraRef}
            facingMode={facing}
            mirrored={facing === "user"}
            className="aspect-[4/3] w-full !rounded-none"
            onError={(msg) => setError(msg)}
            onReady={() => {
              setReadyCam((prev) => (prev ? prev : true));
              setError((prev) => (prev ? "" : prev));
            }}
          />
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 z-10 h-full w-full bg-transparent"
            aria-hidden
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#0A0A0A]/90 via-[#0A0A0A]/30 to-transparent p-5 pt-16">
            <p className="text-sm font-semibold text-white/95">
              {live
                ? "Live speaking what I see"
                : "Yellow boxes = objects · Teal = faces"}
            </p>
            <p className="mt-1 text-xs text-white/65">
              Last spoken · {lastAt} · {facing === "user" ? "Front camera" : "Rear camera"}
            </p>
          </div>
          <button
            type="button"
            className="absolute left-4 top-4 z-30 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-[#0A0A0A] shadow"
            onClick={() => {
              setReadyCam(false);
              setFacing((f) => (f === "user" ? "environment" : "user"));
            }}
          >
            Flip camera
          </button>
          {busy ? (
            <div className="absolute right-4 top-4 z-30 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-[#0A0A0A] shadow">
              Describing…
            </div>
          ) : null}
        </div>

        <section
          className="relative flex min-h-[280px] flex-col overflow-hidden rounded-[1.75rem] border border-white/60 bg-white/80 p-6 shadow-[0_18px_40px_rgba(10,10,10,0.08)] backdrop-blur-xl"
          aria-live="polite"
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#5E0ED7]">
            Spoken description
          </p>
          <p className="mt-4 text-[clamp(1.25rem,2.4vw,1.75rem)] font-bold leading-snug tracking-tight text-[#0A0A0A]">
            {description}
          </p>

          {uniqueLabels.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {uniqueLabels.map((label) => (
                <span
                  key={label}
                  className="rounded-full bg-[#0A0A0A] px-3 py-1 text-xs font-bold text-white"
                >
                  {label}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm text-[#737373]">
              No objects locked yet — point at headphones, a mic, watch, ID card,
              table, chair, bottle, or person, then tap Describe now.
            </p>
          )}

          <div className="mt-auto flex flex-wrap gap-2 pt-8">
            <button
              type="button"
              className="lb-btn lb-btn-ghost text-sm"
              onClick={() => speak(description)}
            >
              Read aloud
            </button>
          </div>
        </section>
      </div>

      <div className={`grid gap-3 ${easy ? "grid-cols-1" : "sm:grid-cols-3"}`}>
        <button
          type="button"
          className={`lb-btn lb-btn-primary ${easy ? "min-h-16 text-xl" : "w-full"}`}
          onClick={() => void describeAll()}
          disabled={busy || !detectorReady || !readyCam}
        >
          {busy ? "Asking Gemini…" : "Describe with Gemini"}
        </button>
        <button
          type="button"
          className={`lb-btn w-full ${live ? "lb-btn-secondary" : "lb-btn-ghost"} ${easy ? "min-h-16 text-lg" : ""}`}
          onClick={() => {
            setLive((v) => {
              const next = !v;
              if (easy) speak(next ? "Live mode on." : "Live mode off.");
              if (next) lastSpeakRef.current = 0;
              return next;
            });
          }}
          disabled={!detectorReady}
        >
          {live ? "Stop live speak" : "Live speak"}
        </button>
        <button
          type="button"
          className={`lb-btn lb-btn-ghost w-full ${easy ? "min-h-16 text-lg" : ""}`}
          onClick={() => speak(description)}
        >
          Repeat aloud
        </button>
      </div>

      <div className="rounded-[1.5rem] border border-black/5 bg-white/70 p-4">
        <p className="text-sm font-bold text-[#0A0A0A]">What I can detect</p>
        <p className="mt-1 text-xs leading-relaxed text-[#737373]">
          Live speak is on by default — new objects are announced right away, then a
          short full list every few seconds. Boxes use a fast on-device model with
          smoothing. <strong>Describe with Gemini</strong> adds headphones, mic,
          watch, ID card, doors, and stairs when cloud is available.
        </p>
      </div>

      {notice ? (
        <p className="rounded-2xl border border-[#5E0ED7]/25 bg-[#EDE9FE]/70 px-4 py-3 text-sm text-[#0A0A0A]">
          {notice}
        </p>
      ) : null}
      {error && !error.toLowerCase().includes("quota") ? (
        <p className="rounded-2xl bg-[#fff1ed] px-4 py-3 text-sm text-[#e4572e]">{error}</p>
      ) : null}
    </div>
  );
}

export default function VisionPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl bg-white/70 p-8 text-[#737373]">
          Loading Vision Assistant…
        </div>
      }
    >
      <VisionPageInner />
    </Suspense>
  );
}
