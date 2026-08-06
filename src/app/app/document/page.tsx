"use client";

import { useRef, useState } from "react";
import { Camera, type CameraHandle } from "@/components/Camera";
import { apiUrl } from "@/lib/api-base";
import { readDocumentLocally } from "@/lib/document/localRead";
import { saveHubEntry } from "@/lib/hub";
import { speak, stopSpeaking } from "@/lib/speech";

const LANGS = ["English", "Hindi", "Tamil", "Telugu", "Malayalam", "Kannada"];

const DOC_TYPES = [
  { id: "Rx", label: "Prescription" },
  { id: "Bank", label: "Bank notice" },
  { id: "Gov", label: "Government letter" },
  { id: "Bill", label: "Bill / invoice" },
];

type SourceMode = "camera" | "upload";

export default function DocumentPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<CameraHandle>(null);
  const [mode, setMode] = useState<SourceMode>("camera");
  const [cameraOn, setCameraOn] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
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

  function setPreviewFromDataUrl(dataUrl: string, name: string) {
    setPreview(dataUrl);
    setFileName(name);
    setError("");
  }

  async function onFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please upload a PNG or JPG image of the document.");
      return;
    }
    setError("");
    const reader = new FileReader();
    reader.onload = () => {
      setPreviewFromDataUrl(String(reader.result), file.name);
      setMode("upload");
    };
    reader.readAsDataURL(file);
  }

  async function analyzeImage(image: string, label: string) {
    setBusy(true);
    setError("");
    setNotice("Reading document…");
    stopSpeaking();
    try {
      let original = "";
      let explanation = "";
      let deadlineHint = "";
      let usedLocal = false;

      try {
        const res = await fetch(apiUrl("/api/document/analyze"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image, language }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(String(data.error || "Analysis failed"));
        }

        const needsFallback =
          Boolean(data.fallback) ||
          Boolean(data.soft) ||
          !String(data.simpleExplanation || "").trim() ||
          /cool|quota|rest|key|busy/i.test(
            String(data.simpleExplanation || data.error || "")
          );

        if (!needsFallback) {
          original = data.originalText || "";
          explanation =
            data.simpleExplanation || "Could not simplify this document.";
          deadlineHint = data.deadlineHint || "";
        } else {
          setNotice("Cloud busy — reading on this device…");
          const local = await readDocumentLocally(image, language);
          original = local.originalText;
          explanation = local.simpleExplanation;
          deadlineHint = local.deadlineHint;
          usedLocal = true;
        }
      } catch {
        setNotice("Cloud unavailable — reading on this device…");
        const local = await readDocumentLocally(image, language);
        original = local.originalText;
        explanation = local.simpleExplanation;
        deadlineHint = local.deadlineHint;
        usedLocal = true;
      }

      setOriginalText(original);
      setSimple(explanation);
      setDeadline(deadlineHint);
      setResultKey((k) => k + 1);
      setFileName(label);
      setNotice(
        usedLocal
          ? "On-device reading ready. Cloud summary will return when quota recovers."
          : "Plain-language summary ready."
      );
      speak(explanation);
      saveHubEntry({
        type: "document",
        title: usedLocal ? "Document (on-device)" : "Document simplified",
        content: `${explanation}\n\nDeadline: ${deadlineHint || "n/a"}\n\nOCR:\n${original || ""}`,
      });
      window.setTimeout(() => setNotice(""), 6000);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Analysis failed";
      setError(message);
      setNotice("");
      speak("Sorry, I could not read that document. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function scanFromCamera() {
    setError("");
    if (!cameraOn) {
      setCameraOn(true);
      setNotice("Opening camera… point it at the document, then tap Scan again.");
      window.setTimeout(() => setNotice(""), 4000);
      return;
    }
    if (!cameraReady) {
      setNotice("Camera is still starting. Wait a moment, then tap Scan & read.");
      window.setTimeout(() => setNotice(""), 3500);
      return;
    }

    const shot = cameraRef.current?.captureDataUrl(0.88);
    if (!shot) {
      setError("Could not capture from camera. Check permission and try again.");
      return;
    }

    setPreviewFromDataUrl(shot, `scan-${new Date().toISOString().slice(11, 19)}.jpg`);
    setNotice("Captured. Reading text…");
    await analyzeImage(shot, "Camera scan");
  }

  async function analyzePreview() {
    if (!preview) {
      setError("Scan with the camera or upload an image first.");
      return;
    }
    await analyzeImage(preview, fileName || "Document");
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#5E0ED7]">
            Scan · Upload · Hear
          </p>
          <h1 className="lb-display mt-1 text-4xl text-[#0A0A0A] md:text-5xl">
            Document Reader
          </h1>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-[#737373]">
            Open the camera to scan a prescription or letter, or upload a photo —
            then hear a plain-language explanation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {DOC_TYPES.map((d) => (
            <span
              key={d.id}
              className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#0A0A0A] shadow-sm"
            >
              {d.label}
            </span>
          ))}
        </div>
      </header>

      {/* Source mode */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`lb-btn ${mode === "camera" ? "lb-btn-primary" : "lb-btn-ghost"}`}
          onClick={() => {
            setMode("camera");
            setCameraOn(true);
            setCameraReady(false);
          }}
        >
          Camera scan
        </button>
        <button
          type="button"
          className={`lb-btn ${mode === "upload" ? "lb-btn-primary" : "lb-btn-ghost"}`}
          onClick={() => {
            setMode("upload");
            setCameraOn(false);
          }}
        >
          Upload image
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        {/* Capture stage */}
        <section className="lb-slide-up relative overflow-hidden rounded-[1.75rem] border border-black/5 bg-white/85 p-5 shadow-[0_18px_45px_rgba(10,10,10,0.08)] backdrop-blur-xl">
          <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-[#7C3AED]/15 blur-3xl lb-orb" />

          {mode === "camera" ? (
            <div className="relative space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#5E0ED7]">
                    Live camera
                  </p>
                  <h2 className="lb-display mt-1 text-2xl text-[#0A0A0A]">
                    Point at the document
                  </h2>
                  <p className="mt-1 text-sm text-[#737373]">
                    Hold steady, fill the frame, then tap Scan &amp; read.
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                    cameraOn && cameraReady
                      ? "bg-[#5E0ED7] text-white"
                      : "bg-[#FAFAFA] text-[#0A0A0A]"
                  }`}
                >
                  {cameraOn
                    ? cameraReady
                      ? "Camera ready"
                      : "Starting…"
                    : "Camera off"}
                </span>
              </div>

              {cameraOn ? (
                <div className="relative">
                  <Camera
                    key="doc-cam"
                    ref={cameraRef}
                    facingMode="environment"
                    mirrored={false}
                    className="aspect-[4/3] min-h-[260px] w-full sm:min-h-[320px]"
                    onReady={() => setCameraReady(true)}
                    onError={(msg) => {
                      setCameraReady(false);
                      setError(msg);
                    }}
                  />
                  {/* Scan frame guide */}
                  <div
                    className="pointer-events-none absolute inset-6 rounded-xl border-2 border-dashed border-white/70 sm:inset-8"
                    aria-hidden
                  />
                  <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                    Align document inside frame
                  </p>
                </div>
              ) : (
                <div className="grid min-h-[260px] place-items-center rounded-2xl bg-[#0A0A0A] text-sm text-white/80 sm:min-h-[320px]">
                  Camera is off. Tap Open camera to scan.
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`lb-btn lb-btn-primary ${busy ? "lb-listen-glow" : ""}`}
                  disabled={busy}
                  onClick={() => void scanFromCamera()}
                >
                  {busy ? "Reading…" : "Scan & read"}
                </button>
                <button
                  type="button"
                  className="lb-btn lb-btn-ghost"
                  disabled={busy}
                  onClick={() => {
                    setCameraOn((v) => !v);
                    setCameraReady(false);
                    if (cameraOn) setNotice("");
                  }}
                >
                  {cameraOn ? "Close camera" : "Open camera"}
                </button>
                <button
                  type="button"
                  className="lb-btn lb-btn-ghost"
                  disabled={busy}
                  onClick={() => {
                    setMode("upload");
                    setCameraOn(false);
                    inputRef.current?.click();
                  }}
                >
                  Upload instead
                </button>
              </div>
            </div>
          ) : (
            <div
              className={`relative rounded-2xl border-2 border-dashed p-4 transition ${
                dragOver
                  ? "border-[#5E0ED7] bg-[#EDE9FE]/50"
                  : "border-black/10 bg-[#FAFAFA]/80"
              }`}
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
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#5E0ED7]">
                Upload
              </p>
              <h2 className="lb-display mt-1 text-2xl text-[#0A0A0A]">
                Drop a document image
              </h2>
              <p className="mt-1 text-sm text-[#737373]">
                PNG or JPG works best. Or choose a file below.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="lb-btn lb-btn-primary"
                  onClick={() => inputRef.current?.click()}
                >
                  Choose file
                </button>
                <button
                  type="button"
                  className="lb-btn lb-btn-ghost"
                  onClick={() => {
                    setMode("camera");
                    setCameraOn(true);
                    setCameraReady(false);
                  }}
                >
                  Use camera
                </button>
              </div>

              {fileName ? (
                <p className="mt-3 text-xs font-semibold text-[#0A0A0A]">{fileName}</p>
              ) : null}

              <div className="mt-4 overflow-hidden rounded-2xl bg-white">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview}
                    alt="Document preview"
                    className="lb-caption-in mx-auto max-h-[340px] w-full object-contain p-3"
                  />
                ) : (
                  <div className="grid min-h-[220px] place-items-center px-6 text-center text-sm text-[#737373]">
                    Preview appears here after you upload.
                  </div>
                )}
              </div>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => void onFile(e.target.files?.[0] || null)}
          />
        </section>

        {/* Controls + result */}
        <div className="space-y-4">
          <section
            className="lb-slide-up rounded-[1.75rem] border border-white/70 bg-[#0A0A0A] p-5 text-white shadow-[0_18px_40px_rgba(10,10,10,0.18)]"
            style={{ animationDelay: "80ms" }}
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#DDD6FE]">
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
                  <option key={lang} value={lang} className="text-[#0A0A0A]">
                    {lang}
                  </option>
                ))}
              </select>
            </label>

            {mode === "camera" && preview ? (
              <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-white/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="Last scan"
                  className="max-h-36 w-full object-contain"
                />
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {mode === "camera" ? (
                <button
                  type="button"
                  className={`lb-btn lb-btn-primary ${busy ? "lb-listen-glow" : ""}`}
                  disabled={busy}
                  onClick={() => void scanFromCamera()}
                >
                  {busy ? "Reading…" : "Scan & read"}
                </button>
              ) : (
                <button
                  type="button"
                  className={`lb-btn lb-btn-primary ${busy ? "lb-listen-glow" : ""}`}
                  disabled={!preview || busy}
                  onClick={() => void analyzePreview()}
                >
                  {busy ? "Reading…" : "Simplify document"}
                </button>
              )}
              <button
                type="button"
                className="lb-btn border border-white/15 bg-white/10 text-white hover:bg-white/15"
                disabled={!simple || busy}
                onClick={() => speak(simple)}
              >
                Narrate again
              </button>
              {preview && mode === "camera" ? (
                <button
                  type="button"
                  className="lb-btn border border-white/15 bg-white/10 text-white hover:bg-white/15"
                  disabled={busy}
                  onClick={() => void analyzePreview()}
                >
                  Re-read last scan
                </button>
              ) : null}
            </div>
          </section>

          <section
            className="lb-slide-up relative min-h-[280px] overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/85 p-5 shadow-[0_18px_40px_rgba(10,10,10,0.08)] backdrop-blur-xl"
            style={{ animationDelay: "140ms" }}
            aria-live="polite"
          >
            <div className="pointer-events-none absolute -left-8 bottom-0 h-28 w-28 rounded-full bg-[#7C3AED]/15 blur-2xl lb-orb" />
            <div className="relative flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#5E0ED7]">
                Simple explanation
              </p>
              {simple ? (
                <span className="rounded-full bg-[#0A0A0A] px-2.5 py-1 text-[10px] font-bold text-white">
                  Ready
                </span>
              ) : null}
            </div>
            <p
              key={resultKey}
              className="lb-caption-in relative mt-4 text-[clamp(1.2rem,2.2vw,1.55rem)] font-bold leading-snug text-[#0A0A0A]"
            >
              {simple ||
                (mode === "camera"
                  ? "Open the camera, scan the page, and we’ll speak the meaning."
                  : "Upload a document, then tap Simplify.")}
            </p>
            {deadline ? (
              <p className="relative mt-4 rounded-2xl bg-[#EDE9FE] px-4 py-3 text-sm font-bold text-[#0A0A0A]">
                Deadline hint: {deadline}
              </p>
            ) : null}
          </section>
        </div>
      </div>

      {originalText ? (
        <section className="lb-slide-up rounded-[1.5rem] border border-black/5 bg-white/75 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#5E0ED7]">
              Original text (OCR)
            </p>
            <button
              type="button"
              className="lb-btn lb-btn-ghost text-sm"
              onClick={() => speak(originalText)}
            >
              Read OCR aloud
            </button>
          </div>
          <p className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-[#737373]">
            {originalText}
          </p>
        </section>
      ) : null}

      {notice ? (
        <p className="rounded-2xl border border-[#5E0ED7]/25 bg-[#EDE9FE]/70 px-4 py-3 text-sm text-[#0A0A0A]">
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
