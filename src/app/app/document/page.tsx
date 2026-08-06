"use client";

import { useRef, useState } from "react";
import { apiUrl } from "@/lib/api-base";
import { saveHubEntry } from "@/lib/hub";
import { speak } from "@/lib/speech";

const LANGS = ["English", "Hindi", "Tamil", "Telugu", "Malayalam", "Kannada"];

const DOC_TYPES = [
  { id: "Rx", label: "Prescription" },
  { id: "Bank", label: "Bank notice" },
  { id: "Gov", label: "Government letter" },
  { id: "Bill", label: "Bill / invoice" },
];

export default function DocumentPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [language, setLanguage] = useState("English");
  const [busy, setBusy] = useState(false);
  const [originalText, setOriginalText] = useState("");
  const [simple, setSimple] = useState("");
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resultKey, setResultKey] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  async function onFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please upload a PNG or JPG image of the document.");
      return;
    }
    setFileName(file.name);
    setError("");
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function analyze() {
    if (!preview) return;
    setBusy(true);
    setError("");
    setNotice("Reading document…");
    try {
      const res = await fetch(apiUrl("/api/document/analyze"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: preview, language }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(String(data.error || "Analysis failed"));
      }
      setOriginalText(data.originalText || "");
      setSimple(data.simpleExplanation || "");
      setDeadline(data.deadlineHint || "");
      setResultKey((k) => k + 1);
      if (data.soft) {
        setError("");
        setNotice(data.simpleExplanation || "Try again in about 20 seconds.");
        speak(data.simpleExplanation || "Please try again shortly.");
      } else {
        setNotice("Plain-language summary ready.");
        speak(data.simpleExplanation || "");
        saveHubEntry({
          type: "document",
          title: "Document simplified",
          content: `${data.simpleExplanation}\n\nDeadline: ${data.deadlineHint || "n/a"}`,
        });
      }
      window.setTimeout(() => setNotice(""), 5000);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Analysis failed";
      setError("");
      setNotice(
        /quota|rest|cool/i.test(message)
          ? "Please try again in about 20 seconds."
          : message
      );
      window.setTimeout(() => setNotice(""), 5000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#0f8b8d]">
            Read · Simplify · Hear
          </p>
          <h1 className="lb-display mt-1 text-4xl text-[#0b1f33] md:text-5xl">
            Document Reader
          </h1>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-[#486581]">
            Upload a prescription, bank notice, government letter, or bill — get a
            plain-language explanation and voice narration.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {DOC_TYPES.map((d) => (
            <span
              key={d.id}
              className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#0b1f33] shadow-sm"
            >
              {d.label}
            </span>
          ))}
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
        {/* Upload stage */}
        <section
          className={`lb-slide-up relative overflow-hidden rounded-[1.75rem] border-2 border-dashed p-5 transition ${
            dragOver
              ? "border-[#0f8b8d] bg-[#d7f3f3]/50"
              : "border-black/10 bg-white/80"
          } shadow-[0_18px_45px_rgba(11,31,51,0.08)] backdrop-blur-xl`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void onFile(e.dataTransfer.files?.[0] || null);
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-[#19b5b8]/15 blur-3xl lb-orb" />
          <div className="relative">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#0f8b8d]">
              Upload
            </p>
            <h2 className="lb-display mt-1 text-2xl text-[#0b1f33]">
              Drop a document image
            </h2>
            <p className="mt-1 text-sm text-[#486581]">
              PNG or JPG works best. Or choose a file below.
            </p>

            <button
              type="button"
              className="lb-btn lb-btn-primary mt-5"
              onClick={() => inputRef.current?.click()}
            >
              Choose file
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => void onFile(e.target.files?.[0] || null)}
            />
            {fileName ? (
              <p className="mt-3 text-xs font-semibold text-[#0b1f33]">{fileName}</p>
            ) : null}

            <div className="mt-5 overflow-hidden rounded-2xl bg-[#eef6f8]">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt="Document preview"
                  className="lb-caption-in mx-auto max-h-[340px] w-full object-contain p-3"
                />
              ) : (
                <div className="grid min-h-[220px] place-items-center px-6 text-center text-sm text-[#486581]">
                  Preview appears here after you upload.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Controls + result */}
        <div className="space-y-4">
          <section
            className="lb-slide-up rounded-[1.75rem] border border-white/70 bg-[#0b1f33] p-5 text-white shadow-[0_18px_40px_rgba(11,31,51,0.18)]"
            style={{ animationDelay: "80ms" }}
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#7ef0f2]">
              Settings
            </p>
            <label className="mt-3 grid gap-1.5 text-sm font-semibold">
              Explanation language
              <select
                className="min-h-12 rounded-2xl border border-white/15 bg-white/10 px-3 py-2 font-normal text-white outline-none"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {LANGS.map((lang) => (
                  <option key={lang} value={lang} className="text-[#0b1f33]">
                    {lang}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className={`lb-btn lb-btn-primary ${busy ? "lb-listen-glow" : ""}`}
                disabled={!preview || busy}
                onClick={() => void analyze()}
              >
                {busy ? "Reading…" : "Simplify document"}
              </button>
              <button
                type="button"
                className="lb-btn bg-white/10 text-white border border-white/15 hover:bg-white/15"
                disabled={!simple}
                onClick={() => speak(simple)}
              >
                Narrate again
              </button>
            </div>
          </section>

          <section
            className="lb-slide-up relative min-h-[280px] overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/85 p-5 shadow-[0_18px_40px_rgba(11,31,51,0.08)] backdrop-blur-xl"
            style={{ animationDelay: "140ms" }}
            aria-live="polite"
          >
            <div className="pointer-events-none absolute -left-8 bottom-0 h-28 w-28 rounded-full bg-[#19b5b8]/15 blur-2xl lb-orb" />
            <div className="relative flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#0f8b8d]">
                Simple explanation
              </p>
              {simple ? (
                <span className="rounded-full bg-[#0b1f33] px-2.5 py-1 text-[10px] font-bold text-white">
                  Ready
                </span>
              ) : null}
            </div>
            <p
              key={resultKey}
              className="lb-caption-in relative mt-4 text-[clamp(1.2rem,2.2vw,1.55rem)] font-bold leading-snug text-[#0b1f33]"
            >
              {simple || "Upload a document, then tap Simplify."}
            </p>
            {deadline ? (
              <p className="relative mt-4 rounded-2xl bg-[#d7f3f3] px-4 py-3 text-sm font-bold text-[#0b1f33]">
                Deadline hint: {deadline}
              </p>
            ) : null}
          </section>
        </div>
      </div>

      {originalText ? (
        <section className="lb-slide-up rounded-[1.5rem] border border-black/5 bg-white/75 p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#0f8b8d]">
            Original text (OCR)
          </p>
          <p className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-[#486581]">
            {originalText}
          </p>
        </section>
      ) : null}

      {notice ? (
        <p className="rounded-2xl border border-[#0f8b8d]/25 bg-[#d7f3f3]/70 px-4 py-3 text-sm text-[#0b1f33]">
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
