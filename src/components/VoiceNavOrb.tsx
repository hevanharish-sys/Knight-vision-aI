"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AssistantOrb, type OrbMode } from "@/components/AssistantOrb";
import { useVoiceCommands } from "@/hooks/useVoiceCommands";
import {
  EASY_ACTIONS,
  VOICE_ORB_KEY,
  type EasyAction,
} from "@/lib/easy-mode";
import { useProfile } from "@/lib/profile";
import {
  ensureVoicesLoaded,
  speakAsync,
  stopSpeaking,
} from "@/lib/speech";

export const MIC_LOCK_EVENT = "knight-vision-mic-lock";

const QUICK_LINKS = [
  { id: "describe", label: "Vision" },
  { id: "listen", label: "Speech" },
  { id: "sign", label: "Sign" },
  { id: "document", label: "Docs" },
  { id: "translate", label: "Translate" },
  { id: "home", label: "Easy" },
  { id: "hub", label: "Hub" },
] as const;

/**
 * Always-on voice navigator for blind / low-vision users.
 * Catches speech, shows it, navigates immediately, supports Off mode.
 */
export function VoiceNavOrb() {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, ready } = useProfile();
  const easyUser = profile === "blind" || profile === "low-vision";

  const [orbOn, setOrbOn] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [caption, setCaption] = useState("");
  const [caught, setCaught] = useState("");
  const [expanded, setExpanded] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [micLocked, setMicLocked] = useState(false);
  const lastSpokenRef = useRef("");

  useEffect(() => {
    const saved = localStorage.getItem(VOICE_ORB_KEY);
    setOrbOn(saved !== "off");
    setHydrated(true);
    if (saved !== "off") setExpanded(true);
  }, []);

  useEffect(() => {
    const onLock = (e: Event) => {
      setMicLocked(Boolean((e as CustomEvent<boolean>).detail));
    };
    window.addEventListener(MIC_LOCK_EVENT, onLock);
    return () => window.removeEventListener(MIC_LOCK_EVENT, onLock);
  }, []);

  const setOrbPower = useCallback((on: boolean) => {
    setOrbOn(on);
    localStorage.setItem(VOICE_ORB_KEY, on ? "on" : "off");
  }, []);

  const say = useCallback(async (text: string) => {
    lastSpokenRef.current = text;
    setCaption(text);
    setSpeaking(true);
    try {
      await ensureVoicesLoaded();
      await speakAsync(text, { lang: "en-US", rate: 0.9, pitch: 1.05 });
    } finally {
      setSpeaking(false);
    }
  }, []);

  const runAction = useCallback(
    async (action: EasyAction, transcript: string) => {
      setCaught(transcript);
      setExpanded(true);
      window.dispatchEvent(
        new CustomEvent("knight-vision-voice-caught", {
          detail: { transcript, actionId: action.id, label: action.label },
        })
      );

      if (action.id === "orb_off") {
        setOrbPower(false);
        await say(action.spoken);
        return;
      }
      if (action.id === "orb_on") {
        setOrbPower(true);
        await say(action.spoken);
        return;
      }
      if (action.id === "repeat") {
        await say(lastSpokenRef.current || "Nothing to repeat yet.");
        return;
      }
      if (action.id === "help") {
        await say(action.spoken);
        return;
      }
      if (action.id === "sos") {
        window.dispatchEvent(new CustomEvent("knight-vision-sos"));
        void say(action.spoken);
        return;
      }

      if (action.href) {
        const pathOnly = action.href.split("?")[0];
        setCaption(action.spoken);
        // Navigate immediately — do not wait for TTS
        if (pathname !== pathOnly || action.href.includes("?")) {
          router.push(action.href);
        }
        void say(action.spoken);
        return;
      }

      void say(action.spoken);
    },
    [pathname, router, say, setOrbPower]
  );

  const listeningEnabled = hydrated && ready && easyUser && orbOn && !micLocked;

  const { listening, lastHeard, supported } = useVoiceCommands({
    enabled: listeningEnabled,
    lang: "en-US",
    paused: speaking || micLocked,
    onHeard: (text) => setCaught(text),
    onCommand: (action, transcript) => {
      void runAction(action, transcript);
    },
  });

  async function togglePower() {
    const next = !orbOn;
    stopSpeaking();
    setOrbPower(next);
    setExpanded(true);
    if (next) {
      await say(
        "Voice navigation on. Say describe for Vision, listen for Speech, sign, document, translate, home, hub, or help. Say turn off for off mode."
      );
    } else {
      await say("Voice navigation off.");
    }
  }

  function tapAction(id: string) {
    const action = EASY_ACTIONS.find((a) => a.id === id);
    if (action) void runAction(action, id);
  }

  if (!ready || !easyUser || !hydrated) return null;

  const orbMode: OrbMode = !orbOn
    ? "idle"
    : speaking
      ? "speaking"
      : listening
        ? "listening"
        : "ready";

  const heardText = caught || lastHeard;
  const statusLine = !orbOn
    ? "Off mode — tap On to navigate by voice."
    : micLocked
      ? "Paused while setup assistant uses the mic."
      : speaking
        ? caption
        : listening
          ? "Listening… say a page name or command."
          : caption || "Voice ready. Say describe, listen, sign, document…";

  return (
    <div className="fixed right-3 top-[4.6rem] z-[60] flex flex-col items-end gap-2 sm:right-5 sm:top-[5.1rem]">
      <div className="flex items-center gap-2 rounded-full border border-black/10 bg-white/95 p-1.5 shadow-[0_14px_44px_rgba(94,14,215,0.28)] backdrop-blur-xl">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="relative grid place-items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5E0ED7]"
          aria-label={
            orbOn
              ? listening
                ? "Voice orb listening"
                : "Voice orb on"
              : "Voice orb off"
          }
        >
          <AssistantOrb mode={orbMode} size={56} />
          {!orbOn ? (
            <span className="absolute inset-0 rounded-full bg-black/40" aria-hidden />
          ) : null}
          {orbOn && listening ? (
            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-white" />
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => void togglePower()}
          className={`mr-1 min-h-11 rounded-full px-4 text-xs font-bold uppercase tracking-widest ${
            orbOn ? "bg-[#5E0ED7] text-white" : "bg-black/10 text-black"
          }`}
          aria-pressed={orbOn}
        >
          {orbOn ? "On" : "Off"}
        </button>
      </div>

      {expanded ? (
        <div
          className="w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-black/10 bg-white/95 p-4 shadow-[0_20px_55px_rgba(10,10,10,0.2)] backdrop-blur-xl"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#5E0ED7]">
              Voice navigate
            </p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-black/45">
              {orbOn
                ? listening
                  ? "Listening"
                  : speaking
                    ? "Speaking"
                    : "On"
                : "Off"}
            </p>
          </div>

          <p className="mt-2 text-sm font-semibold leading-snug text-black normal-case tracking-normal">
            {statusLine}
          </p>

          {heardText ? (
            <div className="mt-3 rounded-xl bg-[#EDE9FE] px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#5E0ED7]">
                Caught
              </p>
              <p className="mt-0.5 text-sm font-bold text-black normal-case tracking-normal">
                {heardText}
              </p>
            </div>
          ) : null}

          {!supported ? (
            <p className="mt-2 text-xs text-[#c2410c]">
              Use Chrome or Edge for voice. Tap the page buttons below anytime.
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-1.5">
            {QUICK_LINKS.map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => tapAction(link.id)}
                className="rounded-full bg-black px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white"
              >
                {link.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => tapAction("help")}
              className="rounded-full bg-[#FAFAFA] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-black"
            >
              Help
            </button>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="rounded-full bg-[#FAFAFA] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-black/50"
            >
              Hide
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
