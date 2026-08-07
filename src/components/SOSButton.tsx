"use client";

import { useEffect, useRef, useState } from "react";
import { useProfile } from "@/lib/profile";
import { saveHubEntry } from "@/lib/hub";
import { speak } from "@/lib/speech";

const LOCAL_ANNOUNCE: Record<string, string> = {
  en: "I need medical assistance.",
  hi: "मुझे चिकित्सकीय सहायता चाहिए।",
  ta: "எனக்கு மருத்துவ உதவி தேவை.",
  te: "నాకు వైద్య సహాయం కావాలి.",
};

const LANGS = [
  { id: "en", label: "EN" },
  { id: "hi", label: "HI" },
  { id: "ta", label: "TA" },
  { id: "te", label: "TE" },
];

export function SOSButton({ compact = false }: { compact?: boolean }) {
  const { medical, profile } = useProfile();
  const [open, setOpen] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [locationText, setLocationText] = useState("Locating…");
  const [lang, setLang] = useState("en");
  const [pulse, setPulse] = useState(false);
  const holdRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  function clearHold() {
    if (holdRef.current != null) {
      window.clearTimeout(holdRef.current);
      holdRef.current = null;
    }
    setPressed(false);
  }

  function triggerSOS() {
    if (firedRef.current && open) return;
    firedRef.current = true;
    clearHold();
    setOpen(true);
    setPulse(true);
    setLocationText("Locating…");

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocationText(
            `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`
          );
        },
        () => setLocationText("Location unavailable — share manually")
      );
    } else {
      setLocationText("Geolocation not supported");
    }

    const announcement = LOCAL_ANNOUNCE[lang] || LOCAL_ANNOUNCE.en;
    speak(announcement, {
      lang: lang === "hi" ? "hi-IN" : lang === "ta" ? "ta-IN" : "en-IN",
    });

    saveHubEntry({
      type: "sos",
      title: "Emergency SOS triggered",
      content: `${announcement}\nContact: ${medical.emergencyContact} (${medical.emergencyPhone})\nBlood: ${medical.bloodType}`,
      meta: { profile: profile || "none", lang },
    });
  }

  useEffect(() => {
    const onVoiceSos = () => {
      firedRef.current = false;
      triggerSOS();
    };
    window.addEventListener("knight-vision-sos", onVoiceSos);
    return () => window.removeEventListener("knight-vision-sos", onVoiceSos);
    // triggerSOS closes over latest medical/lang
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, medical, profile, open]);

  function onPressStart() {
    if (open) return;
    firedRef.current = false;
    setPressed(true);
    holdRef.current = window.setTimeout(() => {
      triggerSOS();
    }, 450);
  }

  function onPressEnd() {
    // Short tap still triggers (accessible); long press already fired via timeout
    if (!firedRef.current && pressed) {
      clearHold();
      triggerSOS();
      return;
    }
    clearHold();
  }

  return (
    <>
      <button
        type="button"
        onPointerDown={onPressStart}
        onPointerUp={onPressEnd}
        onPointerLeave={clearHold}
        onPointerCancel={clearHold}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            triggerSOS();
          }
        }}
        className={`lb-btn lb-sos relative overflow-hidden transition ${
          compact ? "px-4 text-sm" : "px-6"
        } ${pressed ? "scale-110 brightness-110" : ""}`}
        aria-label="Emergency SOS"
        title="Tap for SOS"
      >
        {pressed ? (
          <span
            className="pointer-events-none absolute inset-0 origin-left bg-white/30 lb-sos-fill"
            aria-hidden
          />
        ) : null}
        <span className="relative z-[1] flex items-center gap-1.5 font-black tracking-wide">
          <span
            className={`inline-block h-2 w-2 rounded-full bg-white ${
              pressed ? "scale-125" : ""
            }`}
            aria-hidden
          />
          SOS
        </span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-[#0A0A0A]/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Emergency SOS panel"
        >
          <div
            className={`lb-sos-panel relative w-full max-w-lg overflow-hidden rounded-[1.75rem] border border-white/10 bg-white p-6 text-[#0A0A0A] shadow-[0_30px_80px_rgba(228,87,46,0.35)] ${
              pulse ? "lb-sos-shake" : ""
            }`}
            onAnimationEnd={() => setPulse(false)}
          >
            <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-[#e4572e]/20 blur-2xl" />
            <div className="relative flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#e4572e]">
                  Emergency active
                </p>
                <h2 className="lb-display mt-1 text-3xl text-[#e4572e]">SOS</h2>
              </div>
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#fff1ed] text-xl font-black text-[#e4572e] lb-sos">
                !
              </span>
            </div>
            <p className="relative mt-2 text-sm text-[#737373]">
              Location shared · Contact notified (demo) · Medical card ready
            </p>

            <div className="relative mt-4 flex flex-wrap gap-2">
              {LANGS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLang(l.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                    lang === l.id
                      ? "bg-[#e4572e] text-white shadow"
                      : "bg-[#fff1ed] text-[#e4572e] hover:bg-[#ffe4da]"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>

            <div className="relative mt-4 grid gap-2.5 text-sm">
              <p className="rounded-xl bg-[#FAFAFA] px-3 py-2">
                <strong>Location:</strong> {locationText}
              </p>
              <div className="grid gap-2 rounded-xl border border-black/5 bg-[#fafcfd] p-3 sm:grid-cols-2">
                <p>
                  <strong>Name:</strong> {medical.name}
                </p>
                <p>
                  <strong>Blood:</strong> {medical.bloodType}
                </p>
                <p>
                  <strong>Allergies:</strong> {medical.allergies}
                </p>
                <p>
                  <strong>Conditions:</strong> {medical.conditions}
                </p>
                <p className="sm:col-span-2">
                  <strong>Contact:</strong> {medical.emergencyContact} ·{" "}
                  {medical.emergencyPhone}
                </p>
              </div>
              <p className="rounded-xl bg-[#fff1ed] p-3 font-semibold text-[#e4572e] lb-caption-in">
                {LOCAL_ANNOUNCE[lang]}
              </p>
            </div>

            <div className="relative mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                className="lb-btn lb-btn-primary"
                onClick={() =>
                  speak(LOCAL_ANNOUNCE[lang], {
                    lang:
                      lang === "hi"
                        ? "hi-IN"
                        : lang === "ta"
                          ? "ta-IN"
                          : "en-IN",
                  })
                }
              >
                Announce again
              </button>
              <button
                type="button"
                className="lb-btn lb-btn-ghost"
                onClick={() => {
                  firedRef.current = false;
                  setOpen(false);
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
