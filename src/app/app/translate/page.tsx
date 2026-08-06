"use client";

import { useEffect, useRef, useState } from "react";
import { MicButton } from "@/components/MicButton";
import { apiUrl } from "@/lib/api-base";
import { saveHubEntry } from "@/lib/hub";
import {
  createSpeechRecognition,
  isSpeechRecognitionSupported,
  speak,
  stopSpeaking,
} from "@/lib/speech";

const LANGS = [
  { id: "English", code: "en-IN", short: "EN" },
  { id: "Hindi", code: "hi-IN", short: "HI" },
  { id: "Tamil", code: "ta-IN", short: "TA" },
  { id: "Telugu", code: "te-IN", short: "TE" },
  { id: "Malayalam", code: "ml-IN", short: "ML" },
  { id: "Kannada", code: "kn-IN", short: "KN" },
];

const QUICK = [
  { src: "I need a doctor.", note: "Emergency" },
  { src: "Where is the pharmacy?", note: "Directions" },
  { src: "Please wait here.", note: "Clinic" },
];

export default function TranslatePage() {
  const [sourceLang, setSourceLang] = useState("Tamil");
  const [targetLang, setTargetLang] = useState("English");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [swapSpin, setSwapSpin] = useState(false);
  const [outKey, setOutKey] = useState(0);
  const recognitionRef = useRef<ReturnType<typeof createSpeechRecognition> | null>(
    null
  );

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      stopSpeaking();
    };
  }, []);

  async function translate(text = input) {
    if (!text.trim()) return;
    setBusy(true);
    setError("");
    setNotice("Translating…");
    try {
      const res = await fetch(apiUrl("/api/translate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, sourceLang, targetLang }),
      });
      const data = await res.json();
      if (!res.ok || !data.translation) {
        const raw = String(data.error || "Translation unavailable");
        setError("");
        setNotice(
          data.soft || res.status === 429 || /quota|rest|cool/i.test(raw)
            ? "Backup translator cooling down — try again in ~20 seconds."
            : raw
        );
        window.setTimeout(() => setNotice(""), 4000);
        return;
      }
      setOutput(data.translation);
      setOutKey((k) => k + 1);
      setNotice(
        data.notice ||
          (data.source === "fallback"
            ? `${sourceLang} → ${targetLang} (backup)`
            : `${sourceLang} → ${targetLang}`)
      );
      window.setTimeout(() => setNotice(""), 3500);
      const targetCode = LANGS.find((l) => l.id === targetLang)?.code || "en-IN";
      speak(data.translation, { lang: targetCode });
      saveHubEntry({
        type: "translate",
        title: `${sourceLang} → ${targetLang}`,
        content: `${text}\n\n→ ${data.translation}`,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Translation failed";
      setError("");
      setNotice(
        /quota|rest|cool/i.test(message)
          ? "Please try translating again in a few seconds."
          : message
      );
      window.setTimeout(() => setNotice(""), 4000);
    } finally {
      setBusy(false);
    }
  }

  function toggleListen() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    if (!isSpeechRecognitionSupported()) {
      setError("Speech recognition not supported in this browser.");
      return;
    }
    const code = LANGS.find((l) => l.id === sourceLang)?.code || "en-IN";
    const recognition = createSpeechRecognition({
      lang: code,
      continuous: false,
      onResult: ({ transcript, isFinal }) => {
        setInput(transcript);
        if (isFinal) {
          setListening(false);
          void translate(transcript);
        }
      },
      onEnd: () => setListening(false),
      onError: (err) => {
        if (!String(err).toLowerCase().includes("quota")) setError(err);
        setListening(false);
      },
    });
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
    setNotice(`Listening in ${sourceLang}…`);
  }

  function swapLanguages() {
    setSwapSpin(true);
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setInput(output);
    setOutput(input);
    setOutKey((k) => k + 1);
    window.setTimeout(() => setSwapSpin(false), 450);
  }

  const fromShort = LANGS.find((l) => l.id === sourceLang)?.short || "SRC";
  const toShort = LANGS.find((l) => l.id === targetLang)?.short || "TGT";

  return (
    <div className="space-y-6">
      <header className="lb-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#0f8b8d]">
            Speak · Translate · Hear
          </p>
          <h1 className="lb-display mt-1 text-4xl text-[#0b1f33] md:text-5xl">
            Live AI Translator
          </h1>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-[#486581]">
            Type or dictate in one language — get a spoken reply in another, built for
            clinics and counters.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#0b1f33] px-3 py-1.5 text-xs font-bold text-white">
            {fromShort}
          </span>
          <span
            className={`text-sm font-bold text-[#0f8b8d] transition-transform duration-300 ${
              swapSpin ? "rotate-180 scale-110" : ""
            }`}
          >
            →
          </span>
          <span className="rounded-full bg-[#0f8b8d] px-3 py-1.5 text-xs font-bold text-white">
            {toShort}
          </span>
        </div>
      </header>

      {/* Language bridge */}
      <section className="lb-slide-up relative overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/80 p-5 shadow-[0_20px_50px_rgba(11,31,51,0.08)] backdrop-blur-xl md:p-6">
        <div className="pointer-events-none absolute -left-12 top-0 h-36 w-36 rounded-full bg-[#19b5b8]/18 blur-3xl lb-orb" />
        <div
          className="pointer-events-none absolute -right-10 bottom-0 h-40 w-40 rounded-full bg-[#0b1f33]/10 blur-3xl lb-orb"
          style={{ animationDelay: "1s" }}
        />

        <div className="relative grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <label className="grid gap-1.5 text-sm font-semibold text-[#0b1f33]">
            From
            <select
              className="min-h-12 rounded-2xl border border-black/10 bg-white px-3 py-2 font-normal outline-none ring-[#19b5b8] transition focus:ring-2"
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value)}
            >
              {LANGS.map((l) => (
                <option key={l.id}>{l.id}</option>
              ))}
            </select>
          </label>

          <button
            type="button"
            aria-label="Swap languages"
            onClick={swapLanguages}
            className={`mb-0.5 grid h-12 w-12 place-items-center rounded-full bg-[#0b1f33] text-lg font-bold text-white shadow-lg transition hover:-translate-y-0.5 ${
              swapSpin ? "rotate-180" : ""
            }`}
            style={{ transition: "transform 400ms cubic-bezier(0.22,1,0.36,1)" }}
          >
            ⇄
          </button>

          <label className="grid gap-1.5 text-sm font-semibold text-[#0b1f33]">
            To
            <select
              className="min-h-12 rounded-2xl border border-black/10 bg-white px-3 py-2 font-normal outline-none ring-[#19b5b8] transition focus:ring-2"
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
            >
              {LANGS.map((l) => (
                <option key={l.id}>{l.id}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* Input / output stage */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section
          className="lb-slide-up flex min-h-[280px] flex-col overflow-hidden rounded-[1.75rem] border border-black/5 bg-[#0b1f33] p-5 text-white shadow-[0_20px_40px_rgba(11,31,51,0.18)]"
          style={{ animationDelay: "80ms" }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#7ef0f2]">
              You say · {sourceLang}
            </p>
            {listening ? (
              <span className="lb-listen-glow rounded-full bg-[#0f8b8d] px-2.5 py-1 text-[10px] font-bold uppercase">
                Listening
              </span>
            ) : null}
          </div>
          <textarea
            className="mt-3 min-h-[160px] flex-1 resize-none rounded-2xl border border-white/10 bg-white/5 p-4 text-lg font-semibold leading-relaxed text-white placeholder:text-white/40 outline-none focus:border-[#19b5b8]"
            placeholder="Type or dictate a sentence…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK.map((q) => (
              <button
                key={q.src}
                type="button"
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/90 transition hover:bg-white/10"
                onClick={() => {
                  setInput(q.src);
                  void translate(q.src);
                }}
              >
                {q.note}
              </button>
            ))}
          </div>
        </section>

        <section
          className="lb-slide-up relative flex min-h-[280px] flex-col overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/85 p-5 shadow-[0_20px_40px_rgba(11,31,51,0.08)] backdrop-blur-xl"
          style={{ animationDelay: "140ms" }}
          aria-live="polite"
        >
          <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[#19b5b8]/15 blur-2xl lb-orb" />
          <div className="relative flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#0f8b8d]">
              Translation · {targetLang}
            </p>
            {busy ? (
              <span className="rounded-full bg-[#d7f3f3] px-2.5 py-1 text-[10px] font-bold text-[#0f8b8d]">
                Working…
              </span>
            ) : output ? (
              <span className="rounded-full bg-[#0b1f33] px-2.5 py-1 text-[10px] font-bold text-white">
                Ready
              </span>
            ) : null}
          </div>
          <p
            key={outKey}
            className="lb-caption-in relative mt-4 flex-1 text-[clamp(1.35rem,2.6vw,1.9rem)] font-bold leading-snug tracking-tight text-[#0b1f33]"
          >
            {output || "Your translation will appear here."}
          </p>
          <div className="relative mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="lb-btn lb-btn-ghost text-sm"
              disabled={!output}
              onClick={() => {
                const code =
                  LANGS.find((l) => l.id === targetLang)?.code || "en-IN";
                speak(output, { lang: code });
              }}
            >
              Hear again
            </button>
            <button
              type="button"
              className="lb-btn lb-btn-ghost text-sm"
              disabled={!output}
              onClick={() => {
                setOutput("");
                setOutKey((k) => k + 1);
              }}
            >
              Clear output
            </button>
          </div>
        </section>
      </div>

      <div
        className="lb-slide-up flex flex-wrap gap-3"
        style={{ animationDelay: "180ms" }}
      >
        <MicButton listening={listening} onClick={toggleListen} disabled={busy} />
        <button
          type="button"
          className={`lb-btn lb-btn-primary ${busy ? "lb-listen-glow" : ""}`}
          disabled={busy || !input.trim()}
          onClick={() => void translate()}
        >
          {busy ? "Translating…" : "Translate"}
        </button>
        <button type="button" className="lb-btn lb-btn-ghost" onClick={swapLanguages}>
          Swap languages
        </button>
      </div>

      {notice ? (
        <p className="lb-slide-up rounded-2xl border border-[#0f8b8d]/25 bg-[#d7f3f3]/70 px-4 py-3 text-sm text-[#0b1f33]">
          {notice}
        </p>
      ) : null}
      {error && !error.toLowerCase().includes("quota") ? (
        <p className="rounded-2xl bg-[#fff1ed] px-4 py-3 text-sm text-[#e4572e]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
