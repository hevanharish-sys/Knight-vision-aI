"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AssistantOrb, type OrbMode } from "@/components/AssistantOrb";
import { type BlindTurn } from "@/lib/blind-assistant";
import { EASY_ACTIONS, VOICE_ORB_KEY, type EasyAction } from "@/lib/easy-mode";
import { useProfile } from "@/lib/profile";
import { speakAsync, stopSpeaking } from "@/lib/speech";

type LoopState = "intro" | "ready" | "paused" | "error";

const QUICK = EASY_ACTIONS.filter((a) =>
  ["describe", "listen", "sign", "document", "translate", "sos", "help"].includes(
    a.id
  )
);

const EASY_INTRO =
  "Easy Mode is ready. Use the purple voice orb at the top right — it is listening. " +
  "Say describe, listen, sign, document, translate, home, or help. " +
  "You can also tap the large buttons below.";

export default function EasyModePage() {
  const router = useRouter();
  const { profile } = useProfile();

  if (profile === "blind") {
    return <BlindEasyAssistant router={router} />;
  }

  return <LowVisionEasy router={router} />;
}

function BlindEasyAssistant({
  router,
}: {
  router: ReturnType<typeof useRouter>;
}) {
  const [loop, setLoop] = useState<LoopState>("intro");
  const [turns, setTurns] = useState<BlindTurn[]>([]);
  const [caught, setCaught] = useState("");
  const lastAssistantRef = useRef("");

  const pushTurn = useCallback((role: "assistant" | "user", text: string) => {
    setTurns((prev) => [
      ...prev.slice(-12),
      { id: `${Date.now()}-${Math.random()}`, role, text, at: Date.now() },
    ]);
  }, []);

  const say = useCallback(
    async (text: string) => {
      lastAssistantRef.current = text;
      pushTurn("assistant", text);
      await speakAsync(text, { lang: "en-US", rate: 0.9, pitch: 1.05 });
    },
    [pushTurn]
  );

  const runAction = useCallback(
    async (action: EasyAction, heard?: string) => {
      if (heard) {
        setCaught(heard);
        pushTurn("user", heard);
      }
      if (action.id === "repeat") {
        await say(lastAssistantRef.current || "There is nothing to repeat yet.");
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
        setLoop("ready");
        // Navigate immediately, speak in parallel
        router.push(action.href);
        void say(action.spoken);
        return;
      }
      void say(action.spoken);
    },
    [pushTurn, router, say]
  );

  // One welcome; top-right VoiceNavOrb owns continuous listening
  useEffect(() => {
    localStorage.setItem(VOICE_ORB_KEY, "on");
    let cancelled = false;
    void (async () => {
      setLoop("intro");
      await say(EASY_INTRO);
      if (!cancelled) setLoop("ready");
    })();

    const onCaught = (e: Event) => {
      const detail = (e as CustomEvent<{ transcript?: string }>).detail;
      if (detail?.transcript) {
        setCaught(detail.transcript);
        pushTurn("user", detail.transcript);
      }
    };
    window.addEventListener("knight-vision-voice-caught", onCaught);

    return () => {
      cancelled = true;
      stopSpeaking();
      window.removeEventListener("knight-vision-voice-caught", onCaught);
    };
  }, [pushTurn, say]);

  const orbMode: OrbMode =
    loop === "intro" ? "speaking" : loop === "paused" ? "idle" : "ready";

  return (
    <div className="blind-easy mx-auto flex min-h-[70vh] max-w-3xl flex-col gap-6">
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {caught ? `Caught ${caught}` : lastAssistantRef.current}
      </div>

      <section
        className="relative flex flex-1 flex-col items-center justify-center overflow-hidden rounded-[2rem] bg-[#050e16] px-6 py-10 text-white shadow-[0_30px_80px_rgba(5,14,22,0.55)]"
        aria-label="Voice Guide Easy Mode"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(124,58,237,0.18),transparent_55%)]" />

        <AssistantOrb mode={orbMode} size={160} />

        <p className="relative mt-6 text-[11px] font-bold uppercase tracking-[0.22em] text-[#DDD6FE]">
          Use the top-right voice orb
        </p>
        <p className="relative mt-2 max-w-md text-center text-lg font-semibold leading-relaxed text-white/90">
          Say describe, listen, sign, document, translate, home, hub, help — or
          turn off.
        </p>

        {caught ? (
          <div className="relative mt-5 w-full max-w-md rounded-2xl bg-[#7C3AED]/30 px-4 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#DDD6FE]">
              Caught
            </p>
            <p className="mt-1 text-xl font-bold text-white">{caught}</p>
          </div>
        ) : null}

        <div className="relative mt-6 w-full max-w-lg space-y-3" aria-label="Log">
          {turns.slice(-5).map((t) => (
            <div
              key={t.id}
              className={`rounded-2xl px-4 py-3 text-base leading-relaxed ${
                t.role === "assistant"
                  ? "bg-white/10 text-white"
                  : "ml-6 bg-[#7C3AED]/25 text-[#e8fffe]"
              }`}
            >
              {t.text}
            </div>
          ))}
        </div>

        <div className="relative mt-8 flex w-full max-w-lg flex-wrap justify-center gap-3">
          <button
            type="button"
            className="lb-btn min-h-14 min-w-[9rem] bg-white text-lg font-bold text-[#0A0A0A]"
            onClick={() => {
              void say(EASY_INTRO);
            }}
          >
            Hear intro
          </button>
          <button
            type="button"
            className="lb-btn min-h-14 min-w-[9rem] border border-white/25 bg-white/10 text-lg font-bold text-white"
            onClick={() => {
              void speakAsync(
                lastAssistantRef.current || "No message to repeat.",
                { lang: "en-US", rate: 0.9 }
              );
            }}
          >
            Repeat
          </button>
        </div>
      </section>

      <section aria-label="Quick actions" className="grid gap-3">
        {QUICK.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() => void runAction(action, action.label)}
            className={`min-h-16 rounded-2xl px-5 py-4 text-left text-xl font-bold transition active:scale-[0.99] ${
              action.id === "sos"
                ? "bg-[#e4572e] text-white"
                : "bg-[#0A0A0A] text-white"
            }`}
            aria-label={action.label}
          >
            {action.label}
          </button>
        ))}
      </section>
    </div>
  );
}

function LowVisionEasy({ router }: { router: ReturnType<typeof useRouter> }) {
  const PRIMARY = EASY_ACTIONS.filter((a) =>
    ["describe", "listen", "sign", "document", "translate", "sos"].includes(a.id)
  );
  const [status, setStatus] = useState(
    "Easy Mode. Tap a large button."
  );

  useEffect(() => {
    void speakAsync(
      "Easy Mode for low vision. Large buttons are ready. Tap describe to open Vision.",
      { lang: "en-IN", rate: 0.95 }
    );
    return () => stopSpeaking();
  }, []);

  function run(action: EasyAction) {
    setStatus(action.spoken);
    if (action.id === "sos") {
      window.dispatchEvent(new CustomEvent("knight-vision-sos"));
      void speakAsync(action.spoken, { lang: "en-US", rate: 0.9 });
      return;
    }
    if (action.href) {
      router.push(action.href);
    }
    void speakAsync(action.spoken, { lang: "en-US", rate: 0.9 });
  }

  return (
    <div className="easy-mode space-y-4">
      <header className="lb-panel p-5">
        <h1 className="lb-display text-4xl text-[#0A0A0A]">Easy Mode</h1>
        <p className="mt-2 text-lg font-semibold text-[#0A0A0A]" aria-live="polite">
          {status}
        </p>
      </header>
      <div className="grid gap-3">
        {PRIMARY.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() => run(action)}
            className={`easy-action ${
              action.id === "sos" ? "easy-action-sos" : "easy-action-main"
            }`}
          >
            <span className="easy-action-label">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
