"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  GUIDE_DISMISSED_KEY,
  GUIDE_MUTE_KEY,
  buildWelcomeTour,
  getModuleGuide,
  getWelcome,
} from "@/lib/guide";
import { useProfile, type AccessibilityProfile } from "@/lib/profile";
import { speak, stopSpeaking } from "@/lib/speech";

type Mode = "tour" | "tip" | "hidden";

export function GuideAssistant() {
  const pathname = usePathname();
  const { profile } = useProfile();
  const activeProfile = (profile || "none") as AccessibilityProfile;

  const [mode, setMode] = useState<Mode>("hidden");
  const [stepIndex, setStepIndex] = useState(0);
  const [openPanel, setOpenPanel] = useState(false);
  const [muted, setMuted] = useState(false);
  const lastSpokenRef = useRef("");

  const tour = useMemo(() => buildWelcomeTour(activeProfile), [activeProfile]);
  const tip = useMemo(
    () => getModuleGuide(pathname, activeProfile),
    [pathname, activeProfile]
  );
  const welcome = useMemo(() => getWelcome(activeProfile), [activeProfile]);

  const largeUi =
    activeProfile === "low-vision" ||
    activeProfile === "senior" ||
    activeProfile === "blind";
  const visualOnly = activeProfile === "deaf";
  const calm = activeProfile === "autism" || activeProfile === "senior";
  useEffect(() => {
    const done = localStorage.getItem(GUIDE_DISMISSED_KEY);
    const muteSaved = localStorage.getItem(GUIDE_MUTE_KEY) === "1";
    setMuted(muteSaved);
    // Never auto-open tour on module pages — voice lives on Home only
    if (!done) {
      setMode("tip");
      setOpenPanel(false);
      localStorage.setItem(GUIDE_DISMISSED_KEY, "1");
    } else {
      setMode("tip");
      setOpenPanel(false);
    }
  }, [activeProfile]);

  useEffect(() => {
    if (localStorage.getItem(GUIDE_DISMISSED_KEY)) {
      setMode("tip");
    }
    // Stop any guide speech when changing pages
    stopSpeaking();
    lastSpokenRef.current = "";
    setOpenPanel(false);
  }, [pathname]);

  const current =
    mode === "tour" ? tour[stepIndex] : mode === "tip" ? tip : null;

  // No auto-speak on module pages — only when user taps "Repeat tip"
  useEffect(() => {
    return () => stopSpeaking();
  }, []);

  function finishTour() {
    localStorage.setItem(GUIDE_DISMISSED_KEY, "1");
    setMode("tip");
    setOpenPanel(true);
    lastSpokenRef.current = "";
  }

  function nextTourStep() {
    if (stepIndex >= tour.length - 1) {
      finishTour();
      return;
    }
    setStepIndex((i) => i + 1);
    lastSpokenRef.current = "";
  }

  function replayWelcome() {
    localStorage.removeItem(GUIDE_DISMISSED_KEY);
    setStepIndex(0);
    setMode("tour");
    setOpenPanel(true);
    lastSpokenRef.current = "";
  }

  function toggleMute() {
    setMuted((m) => {
      const next = !m;
      localStorage.setItem(GUIDE_MUTE_KEY, next ? "1" : "0");
      if (next) stopSpeaking();
      return next;
    });
  }

  if (!current) return null;

  return (
    <>
      <button
        type="button"
        className={`fixed bottom-5 right-5 z-50 lb-btn lb-btn-secondary shadow-xl ${
          largeUi ? "min-h-14 px-6 text-lg" : ""
        } ${calm ? "" : "lb-motion"}`}
        onClick={() => {
          setOpenPanel((v) => !v);
          if (!openPanel) lastSpokenRef.current = "";
        }}
        aria-expanded={openPanel}
        aria-controls="knight-vision-guide-panel"
      >
        {openPanel ? "Hide guide" : "Guide me"}
      </button>

      {openPanel ? (
        <div
          id="knight-vision-guide-panel"
          role="complementary"
          aria-label="Knight Vision accessibility guide"
          className={`fixed bottom-24 right-5 z-50 w-[min(100%-2rem,400px)] lb-panel border-[#0f8b8d]/30 p-5 shadow-2xl ${
            largeUi ? "text-lg" : ""
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0f8b8d]">
                Knight Vision Guide · {activeProfile}
              </p>
              <h2 className={`lb-display mt-1 text-[#0b1f33] ${largeUi ? "text-3xl" : "text-2xl"}`}>
                {current.title}
              </h2>
            </div>
            {mode === "tour" ? (
              <span className="rounded-full bg-[#d7f3f3] px-2 py-1 text-xs font-semibold text-[#0b1f33]">
                {stepIndex + 1}/{tour.length}
              </span>
            ) : (
              <span className="rounded-full bg-[#0b1f33] px-2 py-1 text-xs font-semibold text-white">
                Tip
              </span>
            )}
          </div>

          <p
            className={`mt-3 leading-relaxed text-[#486581] ${largeUi ? "text-base" : "text-sm"}`}
            aria-live="polite"
          >
            {current.body}
          </p>

          {mode === "tip" ? (
            <p className="mt-3 rounded-xl bg-[#d7f3f3]/70 px-3 py-2 text-xs font-semibold text-[#0b1f33]">
              Recommended next:{" "}
              {welcome.priorities
                .slice(0, 3)
                .map((p) => p.replace("/app/", "") || "modules")
                .join(" · ")}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {mode === "tour" ? (
              <>
                <button
                  type="button"
                  className="lb-btn lb-btn-primary"
                  onClick={nextTourStep}
                >
                  {current.cta || "Next"}
                </button>
                {current.href ? (
                  <Link
                    href={current.href}
                    className="lb-btn lb-btn-ghost"
                    onClick={finishTour}
                  >
                    Open module
                  </Link>
                ) : null}
                <button
                  type="button"
                  className="lb-btn lb-btn-ghost"
                  onClick={finishTour}
                >
                  Skip tour
                </button>
              </>
            ) : (
              <>
                {current.href ? (
                  <Link href={current.href} className="lb-btn lb-btn-primary">
                    {current.cta || "Open"}
                  </Link>
                ) : null}
                <button
                  type="button"
                  className="lb-btn lb-btn-ghost"
                  onClick={() => {
                    if (!muted && !visualOnly) {
                      speak(`${tip.title}. ${tip.body}`, { lang: "en-IN" });
                    }
                  }}
                >
                  Repeat tip
                </button>
                <button
                  type="button"
                  className="lb-btn lb-btn-ghost"
                  onClick={replayWelcome}
                >
                  Full tour
                </button>
              </>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-black/5 pt-3 text-xs text-[#486581]">
            {!visualOnly ? (
              <button
                type="button"
                className="font-semibold text-[#0f8b8d]"
                onClick={toggleMute}
              >
                {muted ? "Unmute voice guide" : "Mute voice guide"}
              </button>
            ) : (
              <span className="font-semibold text-[#0b1f33]">
                Visual guide on (voice off in Captions & Sign mode)
              </span>
            )}
            <button
              type="button"
              className="font-semibold text-[#486581]"
              onClick={() => setOpenPanel(false)}
            >
              Minimize
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
