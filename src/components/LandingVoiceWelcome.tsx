"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AssistantOrb, type OrbMode } from "@/components/AssistantOrb";
import { useProfile, type AccessibilityProfile } from "@/lib/profile";
import {
  isSpeechRecognitionSupported,
  listenOnce,
  speakAsync,
  stopSpeaking,
  warmMicPermission,
} from "@/lib/speech";

const DISMISS_KEY = "knight-vision-landing-voice-dismiss";
const WELCOME =
  "Welcome to Knight Vision A I. I am your voice guide. " +
  "If you cannot see the screen well, say enter, or say voice guide. " +
  "I will take you into the app and help you from there. " +
  "You can also tap the large purple button.";

type PanelState = "hidden" | "minimized" | "open";

export function LandingVoiceWelcome() {
  const router = useRouter();
  const { setProfile, ready } = useProfile();
  const [panel, setPanel] = useState<PanelState>("hidden");
  const [caption, setCaption] = useState("");
  const [heard, setHeard] = useState("");
  const [orbMode, setOrbMode] = useState<OrbMode>("idle");
  const [needsTap, setNeedsTap] = useState(true);
  const [listening, setListening] = useState(false);
  const startedRef = useRef(false);
  const runIdRef = useRef(0);

  const enterApp = useCallback(
    async (profileId: AccessibilityProfile, dest: "/app" | "/app/easy") => {
      stopSpeaking();
      setProfile(profileId);
      setOrbMode("thinking");
      setCaption(
        profileId === "blind" || profileId === "low-vision"
          ? "Opening voice guide. Taking you into Knight Vision."
          : "Opening Knight Vision."
      );
      await speakAsync(
        profileId === "blind" || profileId === "low-vision"
          ? "Opening your voice guide now. Taking you into Knight Vision."
          : "Opening Knight Vision.",
        { lang: "en-US", rate: 0.95 }
      );
      router.push(`${dest}?assist=1`);
    },
    [router, setProfile]
  );

  const handleSpoken = useCallback(
    async (raw: string) => {
      const text = raw.toLowerCase().trim();
      setHeard(raw);
      if (!text) return;

      if (
        /\b(blind|voice guide|can't see|cannot see|low vision|help me|assist)\b/.test(
          text
        )
      ) {
        await enterApp("blind", "/app/easy");
        return;
      }
      if (/\b(low vision|large|bigger|magnify)\b/.test(text)) {
        await enterApp("low-vision", "/app/easy");
        return;
      }
      if (/\b(enter|open|start|go|yes|okay|ok|inside|app)\b/.test(text)) {
        await enterApp("blind", "/app");
        return;
      }
      if (/\b(dismiss|close|not now|later|no)\b/.test(text)) {
        stopSpeaking();
        setPanel("minimized");
        sessionStorage.setItem(DISMISS_KEY, "1");
        setCaption("Okay. Tap the purple orb anytime for voice help.");
        await speakAsync("Okay. Tap the purple orb anytime for voice help.", {
          lang: "en-US",
          rate: 0.95,
        });
        return;
      }

      setCaption(
        "Say enter, voice guide, or low vision. Or tap a large button below."
      );
      await speakAsync(
        "Say enter, voice guide, or low vision. Or tap a large button.",
        { lang: "en-US", rate: 0.95 }
      );
    },
    [enterApp]
  );

  const listenForCommand = useCallback(async () => {
    if (!isSpeechRecognitionSupported()) {
      setCaption("Mic speech not available here. Tap a large button to enter.");
      return;
    }
    const id = ++runIdRef.current;
    setListening(true);
    setOrbMode("listening");
    setCaption("Listening… say enter, or voice guide.");
    try {
      await warmMicPermission();
      const text = await listenOnce({
        lang: "en-US",
        fallbackLang: "en-IN",
        timeoutMs: 7000,
        delayMs: 250,
        onPartial: (p) => {
          if (p) setHeard(p);
        },
      });
      if (runIdRef.current !== id) return;
      setListening(false);
      setOrbMode("speaking");
      await handleSpoken(text);
    } catch {
      setCaption("Tap a large button if the mic did not hear you.");
      setOrbMode("ready");
    } finally {
      if (runIdRef.current === id) {
        setListening(false);
        setOrbMode((m) => (m === "listening" ? "ready" : m));
      }
    }
  }, [handleSpoken]);

  const startWelcome = useCallback(async () => {
    setNeedsTap(false);
    setPanel("open");
    setOrbMode("speaking");
    setCaption(WELCOME);
    try {
      await speakAsync(WELCOME, { lang: "en-US", rate: 0.95 });
      setOrbMode("ready");
      // Auto-listen after welcome so blind users can speak without finding a button
      void listenForCommand();
    } catch {
      setNeedsTap(true);
      setOrbMode("ready");
      setCaption("Tap Start voice guide to hear me and enter the app.");
    }
  }, [listenForCommand]);

  // Popup when user arrives on the site
  useEffect(() => {
    if (!ready || startedRef.current) return;
    if (sessionStorage.getItem(DISMISS_KEY) === "1") {
      setPanel("minimized");
      startedRef.current = true;
      return;
    }
    startedRef.current = true;
    const t = window.setTimeout(() => {
      setPanel("open");
      setCaption(
        "Voice guide ready. Tap the purple button to hear welcome and enter the app."
      );
      setOrbMode("ready");
      // Try auto-speak (works after prior site interaction; else tap CTA)
      void (async () => {
        try {
          setNeedsTap(false);
          setOrbMode("speaking");
          setCaption(WELCOME);
          await speakAsync(WELCOME, { lang: "en-US", rate: 0.95 });
          setOrbMode("ready");
          void listenForCommand();
        } catch {
          setNeedsTap(true);
          setOrbMode("ready");
          setCaption(
            "Tap Start voice guide — browsers need one tap before sound can play."
          );
        }
      })();
    }, 700);
    return () => window.clearTimeout(t);
  }, [ready, listenForCommand]);

  useEffect(() => () => stopSpeaking(), []);

  if (panel === "hidden") return null;

  if (panel === "minimized") {
    return (
      <button
        type="button"
        className="fixed bottom-5 right-5 z-[60] flex items-center gap-3 rounded-full border border-black/10 bg-white/95 p-2 pr-5 shadow-[0_18px_50px_rgba(94,14,215,0.28)] backdrop-blur-xl"
        onClick={() => {
          sessionStorage.removeItem(DISMISS_KEY);
          void startWelcome();
        }}
        aria-label="Open Knight Vision voice guide"
      >
        <AssistantOrb mode="ready" size={56} />
        <span className="text-left text-xs font-bold uppercase tracking-widest text-black">
          Voice help
        </span>
      </button>
    );
  }

  return (
    <div
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:left-auto"
      role="dialog"
      aria-modal="false"
      aria-label="Knight Vision voice guide"
    >
      <div className="overflow-hidden rounded-[1.75rem] border border-black/10 bg-white/95 shadow-[0_24px_70px_rgba(10,10,10,0.22)] backdrop-blur-xl">
        <div className="flex items-start gap-4 p-5 sm:p-6">
          <AssistantOrb mode={orbMode} size={88} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#5E0ED7]">
              Voice guide
            </p>
            <h2 className="mt-1 text-xl font-bold uppercase tracking-wide text-black sm:text-2xl">
              Need help getting in?
            </h2>
            <p
              className="mt-3 text-sm font-semibold leading-relaxed text-black/75 normal-case tracking-normal"
              aria-live="polite"
            >
              {caption}
            </p>
            {heard ? (
              <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-[#5E0ED7]">
                Heard: {heard}
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-2 border-t border-black/5 bg-[#FAFAFA] p-4 sm:p-5">
          {needsTap ? (
            <button
              type="button"
              className="lb-btn lb-btn-primary min-h-14 w-full text-base"
              onClick={() => void startWelcome()}
            >
              Start voice guide
            </button>
          ) : null}

          <button
            type="button"
            className="lb-btn lb-btn-primary min-h-14 w-full text-base"
            onClick={() => void enterApp("blind", "/app/easy")}
          >
            I need voice — enter Easy Mode
          </button>
          <button
            type="button"
            className="lb-btn lb-btn-secondary min-h-12 w-full text-sm"
            onClick={() => void enterApp("low-vision", "/app/easy")}
          >
            Low vision — large & clear
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="lb-btn lb-btn-ghost min-h-12 text-sm"
              disabled={listening}
              onClick={() => void listenForCommand()}
            >
              {listening ? "Listening…" : "I will speak"}
            </button>
            <button
              type="button"
              className="lb-btn lb-btn-ghost min-h-12 text-sm"
              onClick={() => void enterApp("none", "/app")}
            >
              Enter app
            </button>
          </div>
          <button
            type="button"
            className="w-full py-2 text-xs font-bold uppercase tracking-widest text-black/45"
            onClick={() => {
              stopSpeaking();
              setPanel("minimized");
              sessionStorage.setItem(DISMISS_KEY, "1");
            }}
          >
            Minimize for now
          </button>
        </div>
      </div>
    </div>
  );
}
