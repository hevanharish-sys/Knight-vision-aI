"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MicButton } from "@/components/MicButton";
import { apiUrl } from "@/lib/api-base";
import { isVisionEasyProfile } from "@/lib/easy-mode";
import { saveHubEntry } from "@/lib/hub";
import { profilePrefersTTS, useProfile } from "@/lib/profile";
import {
  createSpeechRecognition,
  humanizeSpeechError,
  isBenignSpeechError,
  isSpeechRecognitionSupported,
  speak,
  stopSpeaking,
  warmMicPermission,
} from "@/lib/speech";

const DEMO_LINES = [
  {
    line: "Take this medicine after lunch.",
    hint: "Medication timing",
  },
  {
    line: "Please wait outside for ten minutes.",
    hint: "Waiting room",
  },
  {
    line: "Your next appointment is on Monday morning.",
    hint: "Follow-up",
  },
];

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

function Waveform({ active }: { active: boolean }) {
  const bars = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  return (
    <div className="flex h-14 items-center justify-center gap-1.5" aria-hidden>
      {bars.map((i) => (
        <span
          key={i}
          className="lb-wave-bar"
          style={{
            height: `${18 + ((i * 7) % 28)}px`,
            animationPlayState: active ? "running" : "paused",
            animationDelay: `${i * 0.07}s`,
            opacity: active ? 1 : 0.25,
          }}
        />
      ))}
    </div>
  );
}

function SpeechPageInner() {
  const { profile } = useProfile();
  const search = useSearchParams();
  const easy = isVisionEasyProfile(profile);
  const [listening, setListening] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [whisperBusy, setWhisperBusy] = useState(false);
  const [captionKey, setCaptionKey] = useState(0);
  const recognitionRef = useRef<ReturnType<typeof createSpeechRecognition> | null>(
    null
  );
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const autoStarted = useRef(false);
  const wantListenRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);
  const startingRef = useRef(false);

  function clearRestartTimer() {
    if (restartTimerRef.current != null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }

  const [browserSttOk, setBrowserSttOk] = useState(true);

  useEffect(() => {
    setBrowserSttOk(isSpeechRecognitionSupported());
  }, []);

  useEffect(() => {
    return () => {
      wantListenRef.current = false;
      clearRestartTimer();
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      stopSpeaking();
      mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function appendFinal(text: string, opts?: { speakAloud?: boolean }) {
    const cleaned = text.trim();
    if (!cleaned) return;
    setFinalText(cleaned);
    setCaptionKey((k) => k + 1);
    setLog((prev) => [...prev, cleaned]);
    // Never TTS while live STT is open — Chrome kills recognition when TTS starts.
    const speakAloud =
      opts?.speakAloud ??
      (!wantListenRef.current && (profilePrefersTTS(profile) || easy));
    if (speakAloud) speak(cleaned);
  }

  function beginRecognition() {
    if (!wantListenRef.current || startingRef.current) return;
    if (!isSpeechRecognitionSupported()) {
      setError("Browser speech recognition unavailable. Use Gemini clip instead.");
      wantListenRef.current = false;
      setListening(false);
      return;
    }

    startingRef.current = true;
    clearRestartTimer();
    try {
      recognitionRef.current?.abort();
    } catch {
      /* ignore */
    }
    recognitionRef.current = null;

    const recognition = createSpeechRecognition({
      lang: "en-IN",
      continuous: true,
      onStart: () => {
        startingRef.current = false;
        setListening(true);
        setError("");
      },
      onResult: ({ transcript, isFinal }) => {
        if (!transcript) return;
        if (isFinal) {
          setInterim("");
          appendFinal(transcript);
        } else {
          setInterim(transcript);
          setCaptionKey((k) => k + 1);
        }
      },
      onError: (err) => {
        if (isBenignSpeechError(err)) return;
        if (
          err === "not-allowed" ||
          err === "service-not-allowed" ||
          err === "audio-capture"
        ) {
          wantListenRef.current = false;
          clearRestartTimer();
          setListening(false);
          setError(humanizeSpeechError(err));
          return;
        }
        setError(humanizeSpeechError(err));
      },
      onEnd: () => {
        startingRef.current = false;
        if (!wantListenRef.current) {
          setListening(false);
          return;
        }
        // Chrome ends after a pause — keep captions going until user stops.
        clearRestartTimer();
        restartTimerRef.current = window.setTimeout(() => {
          if (!wantListenRef.current) {
            setListening(false);
            return;
          }
          try {
            recognition.start();
            setListening(true);
          } catch {
            beginRecognition();
          }
        }, 300);
      },
    });

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      startingRef.current = false;
      restartTimerRef.current = window.setTimeout(() => {
        if (!wantListenRef.current) return;
        try {
          recognition.start();
          setListening(true);
        } catch {
          setError("Could not start the microphone. Tap Start listening again.");
          wantListenRef.current = false;
          setListening(false);
        }
      }, 350);
    } finally {
      window.setTimeout(() => {
        startingRef.current = false;
      }, 500);
    }
  }

  async function startBrowserSTT() {
    if (!isSpeechRecognitionSupported()) {
      setError("Browser speech recognition unavailable. Use Gemini clip instead.");
      return;
    }

    setError("");
    stopSpeaking();
    wantListenRef.current = true;

    const micOk = await warmMicPermission();
    if (!micOk) {
      wantListenRef.current = false;
      setListening(false);
      setError(
        "Microphone permission denied. Allow mic access in the browser address bar, then try again."
      );
      return;
    }

    // Brief gap so getUserMedia fully releases before SpeechRecognition grabs the mic
    await new Promise((r) => window.setTimeout(r, 200));
    if (!wantListenRef.current) return;

    // Don't announce with TTS here — it blocks/aborts Web Speech in Chrome.
    beginRecognition();
  }

  function stopBrowserSTT() {
    wantListenRef.current = false;
    clearRestartTimer();
    startingRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      try {
        recognitionRef.current?.abort();
      } catch {
        /* ignore */
      }
    }
    recognitionRef.current = null;
    setListening(false);
    setInterim("");
  }

  function toggleListen() {
    if (listening || wantListenRef.current) stopBrowserSTT();
    else void startBrowserSTT();
  }

  useEffect(() => {
    if (autoStarted.current) return;
    if (search.get("autolisten") === "1") {
      autoStarted.current = true;
      speak("Speech captions ready. Starting microphone.");
      window.setTimeout(() => void startBrowserSTT(), 1100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function startWhisperCapture() {
    setError("");
    if (wantListenRef.current || listening) stopBrowserSTT();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const mimeType = pickRecorderMime();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        setWhisperBusy(true);
        const blobType = mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: blobType });
        const ext = blobType.includes("mp4") ? "m4a" : "webm";
        const form = new FormData();
        form.append("audio", blob, `speech.${ext}`);
        try {
          if (!blob.size) throw new Error("No audio captured. Try again.");
          const res = await fetch(apiUrl("/api/speech/transcribe"), {
            method: "POST",
            body: form,
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Gemini transcription failed");
          const text = String(data.text || "").trim();
          if (!text) throw new Error("No speech detected in the clip.");
          appendFinal(text, { speakAloud: profilePrefersTTS(profile) || easy });
        } catch (e) {
          const message =
            e instanceof Error ? e.message : "Gemini transcription failed";
          if (!message.toLowerCase().includes("quota")) {
            setError(message);
          }
        } finally {
          setWhisperBusy(false);
          stream.getTracks().forEach((t) => t.stop());
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setListening(true);
      setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
          setListening(false);
        }
      }, 5000);
    } catch {
      setError("Microphone permission denied.");
    }
  }

  function playDemo(line: string) {
    if (wantListenRef.current) stopBrowserSTT();
    setFinalText(line);
    setCaptionKey((k) => k + 1);
    setLog((prev) => [...prev, `Doctor: ${line}`]);
    speak(line);
  }

  function saveSession() {
    const content = log.join("\n") || finalText;
    if (!content) return;
    saveHubEntry({ type: "speech", title: "Speech ↔ Text session", content });
    if (easy) speak("Session saved to hub.");
  }

  const shown =
    interim ||
    finalText ||
    (listening ? "Listening… speak now" : "Tap Start listening to begin");
  const isInterim = Boolean(interim);

  return (
    <div className={`space-y-6 ${easy ? "easy-mode" : ""}`}>
      <header className="lb-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#5E0ED7]">
            Hear · Read · Reply
          </p>
          <h1 className="lb-display mt-1 text-4xl text-[#0A0A0A] md:text-5xl">
            Speech ↔ Text
          </h1>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-[#737373]">
            {easy
              ? "Huge captions for conversations. Start listening, or capture a short Gemini clip."
              : "Live clinic captions — speak once, read clearly, save the session. Works best in Chrome."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              listening
                ? "lb-listen-glow bg-[#5E0ED7] text-white"
                : "bg-white text-[#0A0A0A] shadow-sm"
            }`}
          >
            {listening ? "Mic live" : "Mic idle"}
          </span>
          {easy ? (
            <Link href="/app/easy" className="lb-btn lb-btn-ghost text-sm">
              Easy Mode
            </Link>
          ) : null}
        </div>
      </header>

      <section
        aria-live="polite"
        aria-label="Large readable text"
        className="relative overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/80 shadow-[0_24px_60px_rgba(10,10,10,0.1)] backdrop-blur-xl"
      >
        <div className="pointer-events-none absolute -left-16 top-0 h-40 w-40 rounded-full bg-[#7C3AED]/20 blur-3xl lb-orb" />
        <div
          className="pointer-events-none absolute -right-10 bottom-0 h-44 w-44 rounded-full bg-[#0A0A0A]/10 blur-3xl lb-orb"
          style={{ animationDelay: "1.2s" }}
        />

        <div className="relative grid gap-6 p-6 md:grid-cols-[1fr_180px] md:p-8">
          <div className="min-h-[200px]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#5E0ED7]">
                Large readable text
              </p>
              {isInterim ? (
                <span className="rounded-full bg-[#EDE9FE] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#5E0ED7]">
                  Interim
                </span>
              ) : finalText ? (
                <span className="rounded-full bg-[#0A0A0A] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                  Final
                </span>
              ) : null}
            </div>
            <p
              key={captionKey}
              className={`lb-caption-in lb-caption mt-4 text-[#0A0A0A] ${
                isInterim || (!finalText && listening) ? "opacity-70" : ""
              }`}
            >
              {shown}
            </p>
          </div>

          <div
            className={`flex flex-col items-center justify-center rounded-2xl px-4 py-5 transition-colors duration-300 ${
              listening ? "bg-[#0A0A0A] text-white" : "bg-[#FAFAFA] text-[#0A0A0A]"
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-70">
              Sound
            </p>
            <div className="mt-3">
              <Waveform active={listening || whisperBusy} />
            </div>
            <p className="mt-3 text-xs font-semibold opacity-80">
              {whisperBusy
                ? "Transcribing…"
                : listening
                  ? "Capturing voice"
                  : "Ready when you are"}
            </p>
          </div>
        </div>
      </section>

      <div
        className={`lb-slide-up flex flex-wrap gap-3 ${easy ? "flex-col" : ""}`}
        style={{ animationDelay: "80ms" }}
      >
        <MicButton
          listening={listening && !whisperBusy}
          onClick={toggleListen}
          disabled={whisperBusy}
        />
        <button
          type="button"
          className={`lb-btn lb-btn-secondary ${whisperBusy ? "lb-listen-glow" : ""} ${easy ? "min-h-16 text-lg" : ""}`}
          onClick={() => void startWhisperCapture()}
          disabled={whisperBusy}
        >
          {whisperBusy ? "Transcribing…" : "Gemini clip (5s)"}
        </button>
        <button
          type="button"
          className={`lb-btn lb-btn-ghost ${easy ? "min-h-16 text-lg" : ""}`}
          onClick={saveSession}
        >
          Save to hub
        </button>
        <button
          type="button"
          className={`lb-btn lb-btn-ghost ${easy ? "min-h-16 text-lg" : ""}`}
          onClick={() => {
            setFinalText("");
            setInterim("");
            setLog([]);
            setCaptionKey((k) => k + 1);
            stopSpeaking();
          }}
        >
          Clear
        </button>
      </div>

      {error && !error.toLowerCase().includes("quota") ? (
        <p className="lb-slide-up rounded-2xl bg-[#fff1ed] px-4 py-3 text-sm text-[#e4572e]">
          {error}
        </p>
      ) : null}

      {!browserSttOk ? (
        <p className="rounded-2xl bg-[#EDE9FE] px-4 py-3 text-sm text-[#5E0ED7]">
          This browser has no live speech recognition. Use Chrome, or try Gemini
          clip (5s).
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <section
          className="lb-slide-up overflow-hidden rounded-[1.5rem] border border-black/5 bg-white/70 p-5"
          style={{ animationDelay: "140ms" }}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="lb-display text-xl text-[#0A0A0A]">This session</h2>
            <span className="rounded-full bg-[#EDE9FE] px-2.5 py-1 text-[10px] font-bold text-[#5E0ED7]">
              {log.length} lines
            </span>
          </div>
          <ul className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">
            {log.length === 0 ? (
              <li className="rounded-xl bg-[#FAFAFA] px-4 py-6 text-sm text-[#737373]">
                Captions will stack here as people speak.
              </li>
            ) : (
              log
                .slice()
                .reverse()
                .map((line, i) => (
                  <li
                    key={`${line}-${i}`}
                    className="lb-caption-in rounded-xl border border-black/5 bg-white px-4 py-3 text-sm font-semibold text-[#0A0A0A] shadow-sm"
                    style={{ animationDelay: `${Math.min(i, 5) * 40}ms` }}
                  >
                    {line}
                  </li>
                ))
            )}
          </ul>
        </section>

        <section
          className="lb-slide-up overflow-hidden rounded-[1.5rem] border border-black/5 bg-[#0A0A0A] p-5 text-white"
          style={{ animationDelay: "200ms" }}
        >
          <h2 className="lb-display text-xl">Hospital demo lines</h2>
          <p className="mt-1 text-sm text-white/65">
            Tap a line to speak it and show the caption.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {DEMO_LINES.map((item, index) => (
              <button
                key={item.line}
                type="button"
                onClick={() => playDemo(item.line)}
                className="group rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:-translate-y-0.5 hover:bg-white/10"
                style={{ transitionDelay: `${index * 40}ms` }}
              >
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#DDD6FE]">
                  {item.hint}
                </span>
                <span className="mt-1 block text-sm font-semibold leading-snug">
                  “{item.line}”
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function SpeechPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl bg-white/70 p-8 text-[#737373]">
          Loading Speech Assistant…
        </div>
      }
    >
      <SpeechPageInner />
    </Suspense>
  );
}
