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
  isSpeechRecognitionSupported,
  speak,
  stopSpeaking,
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

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      stopSpeaking();
      mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function appendFinal(text: string) {
    if (!text) return;
    setFinalText(text);
    setCaptionKey((k) => k + 1);
    setLog((prev) => [...prev, text]);
    if (profilePrefersTTS(profile) || easy) {
      speak(text);
    }
  }

  function startBrowserSTT() {
    if (!isSpeechRecognitionSupported()) {
      setError("Browser speech recognition unavailable. Use Gemini clip instead.");
      if (easy) speak("Speech recognition unavailable. Use the Gemini clip button.");
      return;
    }
    setError("");
    const recognition = createSpeechRecognition({
      lang: "en-IN",
      continuous: true,
      onResult: ({ transcript, isFinal }) => {
        if (isFinal) {
          setInterim("");
          appendFinal(transcript);
        } else {
          setInterim(transcript);
          setCaptionKey((k) => k + 1);
        }
      },
      onError: (err) => {
        if (String(err).toLowerCase().includes("quota")) setError("");
        else setError(err);
      },
      onEnd: () => setListening(false),
    });
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
    if (easy) speak("Listening started.");
  }

  function stopBrowserSTT() {
    recognitionRef.current?.stop();
    setListening(false);
    if (easy) speak("Listening stopped.");
  }

  function toggleListen() {
    if (listening) stopBrowserSTT();
    else startBrowserSTT();
  }

  useEffect(() => {
    if (autoStarted.current) return;
    if (search.get("autolisten") === "1") {
      autoStarted.current = true;
      speak("Speech captions ready. Starting microphone.");
      window.setTimeout(() => startBrowserSTT(), 700);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function startWhisperCapture() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        setWhisperBusy(true);
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const form = new FormData();
        form.append("audio", blob, "speech.webm");
        try {
          const res = await fetch(apiUrl("/api/speech/transcribe"), {
            method: "POST",
            body: form,
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Gemini transcription failed");
          appendFinal(data.text);
        } catch (e) {
          const message =
            e instanceof Error ? e.message : "Gemini transcription failed";
          if (message.toLowerCase().includes("quota")) {
            setError("");
          } else {
            setError(message);
          }
        } finally {
          setWhisperBusy(false);
          stream.getTracks().forEach((t) => t.stop());
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
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
    finalText || interim || (listening ? "Listening…" : "Tap Start listening to begin");
  const isInterim = Boolean(interim && !finalText);

  return (
    <div className={`space-y-6 ${easy ? "easy-mode" : ""}`}>
      <header className="lb-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#0f8b8d]">
            Hear · Read · Reply
          </p>
          <h1 className="lb-display mt-1 text-4xl text-[#0b1f33] md:text-5xl">
            Speech ↔ Text
          </h1>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-[#486581]">
            {easy
              ? "Huge captions for conversations. Start listening, or capture a short Gemini clip."
              : "Live clinic captions — speak once, read clearly, save the session."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              listening
                ? "lb-listen-glow bg-[#0f8b8d] text-white"
                : "bg-white text-[#0b1f33] shadow-sm"
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

      {/* Caption stage */}
      <section
        aria-live="polite"
        aria-label="Large readable text"
        className="relative overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/80 shadow-[0_24px_60px_rgba(11,31,51,0.1)] backdrop-blur-xl"
      >
        <div className="pointer-events-none absolute -left-16 top-0 h-40 w-40 rounded-full bg-[#19b5b8]/20 blur-3xl lb-orb" />
        <div
          className="pointer-events-none absolute -right-10 bottom-0 h-44 w-44 rounded-full bg-[#0b1f33]/10 blur-3xl lb-orb"
          style={{ animationDelay: "1.2s" }}
        />

        <div className="relative grid gap-6 p-6 md:grid-cols-[1fr_180px] md:p-8">
          <div className="min-h-[200px]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#0f8b8d]">
                Large readable text
              </p>
              {isInterim ? (
                <span className="rounded-full bg-[#d7f3f3] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#0f8b8d]">
                  Interim
                </span>
              ) : finalText ? (
                <span className="rounded-full bg-[#0b1f33] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                  Final
                </span>
              ) : null}
            </div>
            <p
              key={captionKey}
              className={`lb-caption-in lb-caption mt-4 text-[#0b1f33] ${
                isInterim || (!finalText && listening) ? "opacity-70" : ""
              }`}
            >
              {shown}
            </p>
          </div>

          <div
            className={`flex flex-col items-center justify-center rounded-2xl px-4 py-5 transition-colors duration-300 ${
              listening ? "bg-[#0b1f33] text-white" : "bg-[#eef6f8] text-[#0b1f33]"
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

      {/* Actions */}
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
          disabled={whisperBusy || listening}
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

      {/* Session + demos */}
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <section
          className="lb-slide-up overflow-hidden rounded-[1.5rem] border border-black/5 bg-white/70 p-5"
          style={{ animationDelay: "140ms" }}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="lb-display text-xl text-[#0b1f33]">This session</h2>
            <span className="rounded-full bg-[#d7f3f3] px-2.5 py-1 text-[10px] font-bold text-[#0f8b8d]">
              {log.length} lines
            </span>
          </div>
          <ul className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">
            {log.length === 0 ? (
              <li className="rounded-xl bg-[#eef6f8] px-4 py-6 text-sm text-[#486581]">
                Captions will stack here as people speak.
              </li>
            ) : (
              log
                .slice()
                .reverse()
                .map((line, i) => (
                  <li
                    key={`${line}-${i}`}
                    className="lb-caption-in rounded-xl border border-black/5 bg-white px-4 py-3 text-sm font-semibold text-[#0b1f33] shadow-sm"
                    style={{ animationDelay: `${Math.min(i, 5) * 40}ms` }}
                  >
                    {line}
                  </li>
                ))
            )}
          </ul>
        </section>

        <section
          className="lb-slide-up overflow-hidden rounded-[1.5rem] border border-black/5 bg-[#0b1f33] p-5 text-white"
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
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7ef0f2]">
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
        <div className="rounded-2xl bg-white/70 p-8 text-[#486581]">
          Loading Speech Assistant…
        </div>
      }
    >
      <SpeechPageInner />
    </Suspense>
  );
}
