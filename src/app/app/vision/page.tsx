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
  const facingRef = useRef<"user" | "environment">("user");
  const profileRef = useRef<string | null>(null);
  const autoStarted = useRef(false);

  const { profile } = useProfile();
  const search = useSearchParams();
  const easy = isVisionEasyProfile(profile);
  profileRef.current = profile;

  const [description, setDescription] = useState(
    "Loading on-device detector… I’ll name people, objects, and hazards in the camera."
  );
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastAt, setLastAt] = useState("—");
  const [readyCam, setReadyCam] = useState(false);
  const [detectorReady, setDetectorReady] = useState(false);
  const [mode, setMode] = useState<"gemini" | "live" | "offline">("live");
  const [items, setItems] = useState<DetectedItem[]>([]);
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
          "Detector ready. Point the camera — boxes appear on what I see. Tap Describe all for a full spoken list."
        );
        setNotice("On-device detection is active (works without Gemini).");
        if (easy) speak("Vision detector is ready.");
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

  // Live detect loop — draw every frame; React state only ~5x/sec
  useEffect(() => {
    if (!readyCam || !detectorReady) return;
    runningRef.current = true;

    const tick = () => {
      if (!runningRef.current) return;
      const video = cameraRef.current?.getVideo();
      const canvas = canvasRef.current;
      const detector = detectorRef.current;

      if (video && canvas && detector?.isReady && video.readyState >= 2) {
        try {
          const detected = detector.detect(video);

          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;
          const ctx = canvas.getContext("2d", { alpha: true });
          if (ctx) drawDetections(ctx, detected, facingRef.current === "user");

          const now = Date.now();
          if (now - lastUiUpdateRef.current > 200) {
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

          if (liveRef.current && detected.length && !busyRef.current) {
            if (now - lastSpeakRef.current > 4500) {
              lastSpeakRef.current = now;
              const summary = detector.summarize(detected);
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
      const detected = detector.detect(video);
      setItems(detected);
      const localSummary = detector.summarize(detected);
      let summary = localSummary;
      let source: "gemini" | "detector" | "offline" = detected.length
        ? "detector"
        : "offline";

      const shot = cameraRef.current?.captureDataUrl(0.45);
      if (shot) {
        // Gemini connected for normal rich descriptions (OCR, hazards, context)
        const gemini = await askGeminiVision(shot, localSummary);
        if (gemini) {
          summary = gemini;
          source = "gemini";
          setMode("gemini");
          setNotice(
            detected.length
              ? `Gemini + ${detected.length} on-device detection(s).`
              : "Gemini scene description."
          );
        } else if (!detected.length) {
          summary = await fallbackSceneHint(shot);
          setMode("offline");
          setNotice("Used a quick offline hint. Fuller reading available shortly.");
        } else {
          setMode("live");
          setNotice(
            `Showing ${detected.length} on-device detection(s). Tap Describe again shortly for a fuller reading.`
          );
        }
      } else if (!detected.length) {
        setNotice("Point at people, bottles, chairs, phones, or cars.");
      } else {
        setMode("live");
        setNotice(`Found ${detected.length} on-device item(s).`);
      }

      setDescription(summary);
      setLastAt(new Date().toLocaleTimeString());
      if (profile !== "deaf") speak(summary);
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

  const uniqueLabels = [...new Set(items.map((i) => i.label))].slice(0, 12);

  return (
    <div className={`space-y-5 ${easy ? "easy-mode" : ""}`}>
      <header className="lb-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#0f8b8d]">
            Live object detection
          </p>
          <h1 className="lb-display mt-1 text-4xl text-[#0b1f33] md:text-5xl">
            Vision Assistant
          </h1>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-[#486581]">
            On-device boxes for 80+ objects, plus Gemini for full spoken scene reading
            (hazards, signs, text). If Gemini is rate-limited, detections still work.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              detectorReady ? "bg-[#d7f3f3] text-[#0f8b8d]" : "bg-black/5 text-[#486581]"
            }`}
          >
            {detectorReady ? "Detector ON" : "Loading detector…"}
          </span>
          <span className="rounded-full bg-[#0b1f33] px-3 py-1.5 text-xs font-bold text-white">
            {countLabel}
          </span>
          <span
            className={`rounded-full px-3 py-1.5 text-xs font-bold shadow-sm ${
              mode === "gemini"
                ? "bg-[#0f8b8d] text-white"
                : mode === "live"
                  ? "bg-white text-[#0b1f33]"
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
        <div className="relative overflow-hidden rounded-[1.75rem] bg-[#0b1f33] shadow-[0_24px_60px_rgba(11,31,51,0.22)]">
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
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#0b1f33]/90 via-[#0b1f33]/30 to-transparent p-5 pt-16">
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
            className="absolute left-4 top-4 z-30 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-[#0b1f33] shadow"
            onClick={() => {
              setReadyCam(false);
              setFacing((f) => (f === "user" ? "environment" : "user"));
            }}
          >
            Flip camera
          </button>
          {busy ? (
            <div className="absolute right-4 top-4 z-30 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-[#0b1f33] shadow">
              Describing…
            </div>
          ) : null}
        </div>

        <section
          className="relative flex min-h-[280px] flex-col overflow-hidden rounded-[1.75rem] border border-white/60 bg-white/80 p-6 shadow-[0_18px_40px_rgba(11,31,51,0.08)] backdrop-blur-xl"
          aria-live="polite"
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#0f8b8d]">
            Spoken description
          </p>
          <p className="mt-4 text-[clamp(1.25rem,2.4vw,1.75rem)] font-bold leading-snug tracking-tight text-[#0b1f33]">
            {description}
          </p>

          {uniqueLabels.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {uniqueLabels.map((label) => (
                <span
                  key={label}
                  className="rounded-full bg-[#0b1f33] px-3 py-1 text-xs font-bold text-white"
                >
                  {label}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm text-[#486581]">
              No objects locked yet — point at a person, bottle, chair, phone, or doorway.
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
        <p className="text-sm font-bold text-[#0b1f33]">What I can detect</p>
        <p className="mt-1 text-xs leading-relaxed text-[#486581]">
          Live boxes: people, cars, chairs, bottles, phones, animals, and more (COCO-80).
          <strong> Describe with Gemini</strong> adds natural language, OCR, and hazard
          detail. Live speak stays on-device so it never burns your API quota.
        </p>
      </div>

      {notice ? (
        <p className="rounded-2xl border border-[#0f8b8d]/25 bg-[#d7f3f3]/70 px-4 py-3 text-sm text-[#0b1f33]">
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
        <div className="rounded-2xl bg-white/70 p-8 text-[#486581]">
          Loading Vision Assistant…
        </div>
      }
    >
      <VisionPageInner />
    </Suspense>
  );
}
