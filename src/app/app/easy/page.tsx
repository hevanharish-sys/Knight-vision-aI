"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AssistantOrb, type OrbMode } from "@/components/AssistantOrb";
import {
  BLIND_INTRO,
  interpretBlindUtterance,
  type BlindTurn,
} from "@/lib/blind-assistant";
import { EASY_ACTIONS, type EasyAction } from "@/lib/easy-mode";
import { useProfile } from "@/lib/profile";
import {
  isSpeechRecognitionSupported,
  listenWithRetry,
  speakAsync,
  stopSpeaking,
} from "@/lib/speech";

type LoopState =
  | "intro"
  | "listening"
  | "confirming"
  | "responding"
  | "paused"
  | "error";

const QUICK = EASY_ACTIONS.filter((a) =>
  ["describe", "listen", "document", "translate", "sos", "help"].includes(a.id)
);

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
  const [liveHeard, setLiveHeard] = useState("");
  const [supported, setSupported] = useState(true);
  const [active, setActive] = useState(true);

  const runIdRef = useRef(0);
  const activeRef = useRef(true);
  const lastAssistantRef = useRef("");
  const navigatingRef = useRef(false);

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
      setLoop("responding");
      await speakAsync(text, { lang: "en-IN", rate: 0.92 });
    },
    [pushTurn]
  );

  const runAction = useCallback(
    async (action: EasyAction) => {
      if (action.id === "repeat") {
        await say(lastAssistantRef.current || "There is nothing to repeat yet.");
        return;
      }
      if (action.id === "help" || action.id === "home") {
        await say(action.spoken);
        return;
      }
      if (action.id === "sos") {
        await say(action.spoken);
        document
          .querySelector<HTMLButtonElement>('button[aria-label="Emergency SOS"]')
          ?.click();
        return;
      }
      if (action.href) {
        await say(action.spoken);
        await new Promise((r) => setTimeout(r, 650));
        navigatingRef.current = true;
        router.push(action.href);
        return;
      }
      await say(action.spoken);
    },
    [router, say]
  );

  useEffect(() => {
    activeRef.current = active;

    if (!active) {
      runIdRef.current += 1;
      stopSpeaking();
      setLoop("paused");
      return;
    }

    const id = ++runIdRef.current;
    navigatingRef.current = false;

    void (async () => {
      if (!isSpeechRecognitionSupported()) {
        setSupported(false);
        setLoop("error");
        await say(
          "Speech recognition is not available. Use the large buttons below, or open Chrome or Edge."
        );
        return;
      }
      setSupported(true);

      setLoop("intro");
      await say(BLIND_INTRO);
      if (runIdRef.current !== id || !activeRef.current) return;

      // Turn-taking: listen → confirm what was heard → respond → listen again
      while (activeRef.current && runIdRef.current === id && !navigatingRef.current) {
        setLoop("listening");
        setLiveHeard("");

        let transcript = "";
        try {
          transcript = await listenWithRetry({
            lang: "en-IN",
            fallbackLang: "en-US",
            timeoutMs: 10000,
            delayMs: 1000,
            attempts: 2,
            onPartial: (partial) => setLiveHeard(partial),
            betweenAttempts: async () => {
              if (runIdRef.current !== id || !activeRef.current) return;
              await say("Please speak again after this.");
            },
          });
        } catch {
          if (runIdRef.current !== id || !activeRef.current) return;
          setLoop("error");
          await say(
            "Microphone error. Check permission, then tap Resume."
          );
          activeRef.current = false;
          setActive(false);
          return;
        }

        if (runIdRef.current !== id || !activeRef.current) return;

        setLiveHeard(transcript);
        if (transcript.trim()) {
          pushTurn("user", transcript.trim());
        }

        const result = interpretBlindUtterance(transcript);
        setLoop("confirming");

        // 1) Always tell the user what was caught
        await say(result.confirmSpeech);
        if (runIdRef.current !== id || !activeRef.current) return;

        // 2) Then respond / act
        if (!result.action) {
          if (result.responseSpeech) {
            await say(result.responseSpeech);
          }
          continue;
        }

        if (result.action.id === "repeat") {
          await say(lastAssistantRef.current || "Nothing to repeat.");
          continue;
        }

        await runAction(result.action);
        if (navigatingRef.current) return;
      }
    })();

    return () => {
      runIdRef.current += 1;
      stopSpeaking();
    };
  }, [active, pushTurn, runAction, say]);

  const orbMode: OrbMode =
    loop === "listening"
      ? "listening"
      : loop === "confirming"
        ? "thinking"
        : loop === "responding" || loop === "intro"
          ? "speaking"
          : loop === "error"
            ? "error"
            : loop === "paused"
              ? "idle"
              : "ready";

  async function tapAction(action: EasyAction) {
    runIdRef.current += 1;
    stopSpeaking();
    activeRef.current = false;
    setActive(false);
    pushTurn("user", action.label);
    await say(`I heard: ${action.label}.`);
    await runAction(action);
    if (!navigatingRef.current) {
      window.setTimeout(() => {
        activeRef.current = true;
        setActive(true);
      }, 200);
    }
  }

  return (
    <div className="blind-easy mx-auto flex min-h-[70vh] max-w-3xl flex-col gap-6">
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {loop === "listening"
          ? "Listening for your command."
          : loop === "confirming"
            ? `I heard ${liveHeard || "nothing"}`
            : loop === "responding" || loop === "intro"
              ? lastAssistantRef.current
              : loop === "paused"
                ? "Assistant paused."
                : !supported
                  ? "Speech recognition not supported."
                  : ""}
      </div>

      <section
        className="relative flex flex-1 flex-col items-center justify-center overflow-hidden rounded-[2rem] bg-[#050e16] px-6 py-10 text-white shadow-[0_30px_80px_rgba(5,14,22,0.55)]"
        aria-label="Voice Guide Easy Mode assistant"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(124,58,237,0.18),transparent_55%)]" />

        <AssistantOrb mode={orbMode} size={180} />

        <div
          className="relative mt-8 w-full max-w-lg space-y-3"
          aria-label="Conversation"
        >
          {turns.length === 0 ? (
            <p className="text-center text-lg text-white/70">
              Starting voice assistant…
            </p>
          ) : (
            turns.slice(-6).map((t) => (
              <div
                key={t.id}
                className={`rounded-2xl px-4 py-3 text-lg leading-relaxed ${
                  t.role === "assistant"
                    ? "bg-white/10 text-white"
                    : "ml-6 bg-[#7C3AED]/25 text-[#e8fffe]"
                }`}
              >
                <span className="sr-only">
                  {t.role === "assistant" ? "Assistant: " : "You: "}
                </span>
                {t.text}
              </div>
            ))
          )}
          {loop === "listening" ? (
            <p
              className="text-center text-2xl font-bold tracking-[0.35em] text-[#DDD6FE]"
              aria-hidden
            >
              · · ·
            </p>
          ) : null}
        </div>

        <div className="relative mt-8 flex w-full max-w-lg flex-wrap justify-center gap-3">
          <button
            type="button"
            className="lb-btn min-h-14 min-w-[9rem] bg-white text-lg font-bold text-[#0A0A0A]"
            onClick={() => {
              stopSpeaking();
              runIdRef.current += 1;
              setTurns([]);
              setActive(false);
              window.setTimeout(() => setActive(true), 100);
            }}
          >
            Start over
          </button>
          <button
            type="button"
            className="lb-btn min-h-14 min-w-[9rem] border border-white/25 bg-white/10 text-lg font-bold text-white"
            onClick={() => {
              if (active) {
                setActive(false);
                void speakAsync("Assistant paused. Tap resume when ready.", {
                  lang: "en-IN",
                });
              } else {
                setActive(true);
              }
            }}
          >
            {active ? "Pause" : "Resume"}
          </button>
          <button
            type="button"
            className="lb-btn min-h-14 min-w-[9rem] border border-white/25 bg-white/10 text-lg font-bold text-white"
            onClick={() => {
              void speakAsync(
                lastAssistantRef.current || "No message to repeat.",
                { lang: "en-IN" }
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
            onClick={() => void tapAction(action)}
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
    ["describe", "listen", "document", "translate", "sos"].includes(a.id)
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
    void speakAsync(action.spoken, { lang: "en-IN" });
    if (action.id === "sos") {
      document
        .querySelector<HTMLButtonElement>('button[aria-label="Emergency SOS"]')
        ?.click();
      return;
    }
    if (action.href) {
      window.setTimeout(() => router.push(action.href!), 900);
    }
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
