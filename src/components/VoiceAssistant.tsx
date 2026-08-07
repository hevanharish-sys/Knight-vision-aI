"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useProfile, type AccessibilityProfile } from "@/lib/profile";
import {
  buildVoiceGuide,
  cleanSpokenName,
  parseAuthChoice,
  parsePin,
  parseSpokenNumber,
  parseYesNo,
  profileAskSpeech,
  isQuickVoiceChoice,
  PROFILE_VOICE_OPTIONS,
  VOICE_GUIDE_DONE_KEY,
  VOICE_ONBOARD_KEY,
  type GuideBeat,
  type VoicePhase,
} from "@/lib/voice-assistant";
import { VOICE_ORB_KEY } from "@/lib/easy-mode";
import {
  ensureVoicesLoaded,
  isSpeechRecognitionSupported,
  listenOnce,
  sampleMicLevel,
  speakAsync,
  stopSpeaking,
  warmMicPermission,
} from "@/lib/speech";
import { AssistantOrb, orbModeFromAssistant } from "@/components/AssistantOrb";
import { MIC_LOCK_EVENT } from "@/components/VoiceNavOrb";
type Props = {
  autoStart?: boolean;
};

export function VoiceAssistant({ autoStart = true }: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const forceAssist = search.get("assist") === "1";
  const { user, ready: authReady, register, login, logout } = useAuth();
  const { profile, setProfile, ready: profileReady } = useProfile();

  const [appeared, setAppeared] = useState(false);
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [caption, setCaption] = useState("");
  const [heard, setHeard] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingName, setPendingName] = useState("");
  const [pendingPin, setPendingPin] = useState("");
  const [guideSteps, setGuideSteps] = useState<GuideBeat[]>([]);
  const [guideIndex, setGuideIndex] = useState(0);
  const [micOk, setMicOk] = useState(true);
  const [micHint, setMicHint] = useState("");
  const [awaitingTap, setAwaitingTap] = useState(false);

  const runIdRef = useRef(0);
  const startedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const tapResolverRef = useRef<((text: string) => void) | null>(null);

  const say = useCallback(async (text: string) => {
    setCaption(text);
    await ensureVoicesLoaded();
    await speakAsync(text, { lang: "en-US", rate: 0.9, pitch: 1.05 });
  }, []);

  /** Cancel open mic listen (used when user taps a choice). */
  const cancelListen = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  /**
   * Wait for either speech OR a tap. Buttons always win — important when
   * Bluetooth headset mic is silent.
   */
  const hear = useCallback(async (promptAgain?: string): Promise<string> => {
    setListening(true);
    setAwaitingTap(true);
    setHeard("");
    setCaption((c) =>
      c.includes("Speak") || c.includes("Tap")
        ? c
        : "Speak clearly now — or tap a button below"
    );

    // Short mic sample — don't delay listening too long
    const sample = await sampleMicLevel(350);
    if (sample.label) {
      setMicHint(
        sample.ok
          ? `Mic ready · ${sample.label}`
          : `Mic quiet (${sample.label}). Tap buttons if voice fails — use laptop mic if using earbuds.`
      );
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const fromTap = new Promise<string>((resolve) => {
      tapResolverRef.current = (text: string) => resolve(text);
    });

    const listenPass = (delayMs: number) =>
      listenOnce({
        lang: "en-US",
        fallbackLang: "en-IN",
        timeoutMs: 9000,
        delayMs,
        signal: ac.signal,
        quickCommit: isQuickVoiceChoice,
        onPartial: (partial) => {
          if (partial) setHeard(partial);
        },
      });

    const fromVoice = (async () => {
      // Pause briefly so TTS fully releases the mic channel
      let text = await listenPass(550);
      if (!text.trim() && !ac.signal.aborted) {
        const tip =
          promptAgain ||
          "I did not catch that. Please say the number again, or tap a button.";
        setCaption(tip);
        await speakAsync(tip, { lang: "en-US", rate: 0.9, pitch: 1.05 });
        if (ac.signal.aborted) return "";
        text = await listenPass(650);
      }
      // Third try with en-IN primary for Indian accents on digits
      if (!text.trim() && !ac.signal.aborted) {
        text = await listenOnce({
          lang: "en-IN",
          fallbackLang: "en-US",
          timeoutMs: 8000,
          delayMs: 400,
          signal: ac.signal,
          quickCommit: isQuickVoiceChoice,
          onPartial: (partial) => {
            if (partial) setHeard(partial);
          },
        });
      }
      return text;
    })();

    try {
      const text = await Promise.race([fromTap, fromVoice]);
      cancelListen();
      tapResolverRef.current = null;
      setHeard(text);
      return text;
    } finally {
      setListening(false);
      setAwaitingTap(false);
      tapResolverRef.current = null;
      cancelListen();
    }
  }, [cancelListen]);

  function submitTap(text: string) {
    setHeard(text);
    setCaption(`Selected: ${text}`);
    // Resolve waiting hear() if any
    if (tapResolverRef.current) {
      const resolve = tapResolverRef.current;
      tapResolverRef.current = null;
      cancelListen();
      resolve(text);
      return;
    }
  }

  const runGuide = useCallback(
    async (p: AccessibilityProfile) => {
      const steps = buildVoiceGuide(p);
      const visionFirst = p === "blind" || p === "low-vision";
      setGuideSteps(steps);
      setGuideIndex(0);
      setPhase("guide");
      await say(
        visionFirst
          ? "I will guide you one step at a time. After each step, say next to continue, open to visit that page, or repeat to hear again."
          : "Here is a short guide. Say next after each step."
      );

      for (let i = 0; i < steps.length; i += 1) {
        setGuideIndex(i);
        const step = steps[i];
        await say(step.spoken);

        if (i === steps.length - 1) {
          localStorage.setItem(VOICE_GUIDE_DONE_KEY, "1");
          setPhase("ready");
          if (visionFirst) {
            localStorage.setItem(VOICE_ORB_KEY, "on");
            await say(
              "Taking you to Easy Mode. A voice orb stays in the top corner — say describe, listen, or document to move around. Say turn off for off mode."
            );
            router.push(step.href || "/app/easy");
          }
          return;
        }

        const reply = (await hear("Say next, open, repeat, or skip.")).toLowerCase();
        if (/\b(repeat|again)\b/.test(reply)) {
          i -= 1;
          continue;
        }
        if (/\b(skip|stop|done|finish)\b/.test(reply)) {
          localStorage.setItem(VOICE_GUIDE_DONE_KEY, "1");
          setPhase("ready");
          if (visionFirst) {
            localStorage.setItem(VOICE_ORB_KEY, "on");
            await say(
              "Guide paused. Opening Easy Mode. Use the top voice orb to navigate pages, or say turn off."
            );
            router.push("/app/easy");
          } else {
            await say("Guide paused. You can restart anytime.");
          }
          return;
        }
        // Blind users: "open" / "go" / "take me" → navigate to this step's page
        if (
          visionFirst &&
          step.href &&
          /\b(open|go|take me|visit|show|start)\b/.test(reply)
        ) {
          localStorage.setItem(VOICE_ORB_KEY, "on");
          await say(`Opening ${step.title}. The voice orb can move you to other pages.`);
          router.push(step.href);
          // Continue remaining guide only if still on home — usually we leave
          setPhase("ready");
          localStorage.setItem(VOICE_GUIDE_DONE_KEY, "1");
          return;
        }
        // "next" — for vision profiles, optionally peek the linked module then continue
        if (
          visionFirst &&
          step.href &&
          /\b(next|continue|go on)\b/.test(reply) &&
          i < steps.length - 2
        ) {
          // Keep guide flowing; do not navigate yet
          continue;
        }
        if (!/\b(next|continue|go on|okay|ok|yes)\b/.test(reply) && reply.trim()) {
          // Unknown — gently continue if they might have said next poorly
          if (!/\b(open|go|skip|stop)\b/.test(reply)) {
            await say("Say next to continue, or open to visit this page.");
            i -= 1;
          }
        }
      }
    },
    [hear, router, say]
  );

  const startArriveFlow = useCallback(() => {
    if (!authReady || !profileReady) return;
    setMicOk(isSpeechRecognitionSupported());
    setAppeared(true);
    setPhase("arrive");
    setError("");

    const id = ++runIdRef.current;
    setBusy(true);

    void (async () => {
      try {
        await new Promise((r) => setTimeout(r, 550));
        if (runIdRef.current !== id) return;

        setPhase("greet");
        await say(
          "Hello. I am your Knight Vision assistant. I will help you sign in, choose a comfort mode, and guide you gently into the app."
        );
        if (runIdRef.current !== id) return;

        let activeUser = user;

        if (!activeUser) {
          await warmMicPermission();
          setPhase("auth_choice");
          await say(
            "First, verify your account. Tap button 1 to create an account, or button 2 to sign in. You can also say one or two."
          );
          if (runIdRef.current !== id) return;

          setCaption("Tap 1 or 2 below — or say one / two");
          let mode = parseAuthChoice(
            await hear("Tap button 1 or 2, or say one or two.")
          );
          if (!mode) {
            setPhase("error");
            setError(
              "Use the big 1 / 2 buttons, or type Name + PIN and tap Create account. If using Airdopes, switch the site mic to your laptop microphone."
            );
            return;
          }

          setPhase("auth_name");
          await say(
            mode === "register"
              ? "Please say your full name clearly."
              : "Please say the name on your account."
          );
          let name = cleanSpokenName(await hear());
          if (name.length < 2) {
            await say("Please say your name again.");
            name = cleanSpokenName(await hear());
          }
          if (name.length < 2) {
            setError("Name not heard. Use the form below.");
            setPhase("error");
            return;
          }
          setPendingName(name);
          await say(`I heard ${name}. Now say a 4 digit P I N.`);
          setPhase("auth_pin");
          let pin = parsePin(await hear());
          if (!pin) {
            await say("Please say your 4 digit P I N again, digit by digit.");
            pin = parsePin(await hear());
          }
          if (!pin) {
            setError("PIN not heard. Use the form below.");
            setPhase("error");
            return;
          }
          setPendingPin(pin);

          if (mode === "register") {
            await say(
              `Creating account for ${name}. Say yes to confirm, or no to cancel.`
            );
            setPhase("auth_confirm");
            const yn = parseYesNo(await hear());
            if (yn !== "yes") {
              await say("Cancelled. Tap Start assistant to try again.");
              setPhase("idle");
              return;
            }
            const result = await register(name, pin);
            if (!result.ok) {
              await say(result.error);
              setError(result.error);
              setPhase("error");
              return;
            }
            await say(`Welcome ${name}. You are signed in.`);
            activeUser = { id: "new", name, pin, createdAt: "" };
          } else {
            const result = await login(name, pin);
            if (!result.ok) {
              await say(result.error);
              setError(result.error);
              setPhase("error");
              return;
            }
            await say(`Welcome back ${name}. You are verified.`);
            activeUser = { id: "login", name, pin, createdAt: "" };
          }
        } else {
          await say(`Welcome back ${activeUser.name}. You are already signed in.`);
        }

        if (runIdRef.current !== id) return;
        if (!activeUser) return;

        const needsProfile =
          !profile || localStorage.getItem(VOICE_ONBOARD_KEY) !== "1";

        if (needsProfile) {
          setPhase("profile_ask");
          await say(profileAskSpeech());
          let num = parseSpokenNumber(await hear("Say a number from one to seven."));
          if (!num) {
            await say("I still did not catch a number. Please say one, two, three, four, five, six, or seven.");
            num = parseSpokenNumber(await hear("Say just the number."));
          }
          let opt = PROFILE_VOICE_OPTIONS.find((o) => o.number === num);
          if (!opt) {
            setError("Profile number not recognized. Tap a comfort mode below.");
            setPhase("error");
            return;
          }

          setHeard(String(num));
          setCaption(`Selected: ${num} · ${opt.label}`);
          setPhase("profile_confirm");
          await say(
            `You chose ${opt.label}. Say yes to confirm, or no to choose again.`
          );
          let yn = parseYesNo(await hear());
          if (yn === "no") {
            setPhase("profile_ask");
            await say(profileAskSpeech());
            num = parseSpokenNumber(await hear());
            opt = PROFILE_VOICE_OPTIONS.find((o) => o.number === num);
            if (!opt) {
              setError("Could not set profile. Use the buttons below.");
              setPhase("error");
              return;
            }
            await say(`Now ${opt.label}. Say yes to confirm.`);
            yn = parseYesNo(await hear());
            if (yn !== "yes") {
              await say("Okay. Use the profile buttons when you are ready.");
              setPhase("idle");
              return;
            }
          }

          setProfile(opt.id);
          localStorage.setItem(VOICE_ONBOARD_KEY, "1");
          await runGuide(opt.id);
          return;
        }

        if (profile && localStorage.getItem(VOICE_GUIDE_DONE_KEY) !== "1") {
          await runGuide(profile);
          return;
        }

        setPhase("ready");
        await say(
          profile === "blind" || profile === "low-vision"
            ? "I am ready. Say start for Easy Mode, or restart the assistant anytime."
            : "I am ready. Browse modules below, or restart the assistant for a new guide."
        );
      } catch (e) {
        if (runIdRef.current !== id) return;
        const msg = e instanceof Error ? e.message : "Something went wrong";
        setError(msg);
        setPhase("error");
        setCaption(msg);
      } finally {
        if (runIdRef.current === id) setBusy(false);
      }
    })();
  }, [
    authReady,
    hear,
    login,
    profile,
    profileReady,
    register,
    runGuide,
    say,
    setProfile,
    user,
  ]);

  useEffect(() => {
    if (!autoStart || !authReady || !profileReady || startedRef.current) return;

    const fullyDone =
      user &&
      profile &&
      localStorage.getItem(VOICE_ONBOARD_KEY) === "1" &&
      localStorage.getItem(VOICE_GUIDE_DONE_KEY) === "1";

    // Landing “assist=1” always re-opens the assistant for blind/low-vision entry
    if (fullyDone && !forceAssist) {
      setAppeared(true);
      setPhase("ready");
      setCaption("Voice assistant ready. Tap Restart assistant to run setup again.");
      return;
    }

    if (forceAssist) {
      localStorage.removeItem(VOICE_GUIDE_DONE_KEY);
    }

    startedRef.current = true;
    startArriveFlow();
  }, [
    autoStart,
    authReady,
    profileReady,
    user,
    profile,
    forceAssist,
    startArriveFlow,
  ]);

  // Pause the global voice orb while this home assistant owns the mic
  useEffect(() => {
    const lock = busy || listening || phase === "guide" || phase === "greet";
    window.dispatchEvent(new CustomEvent(MIC_LOCK_EVENT, { detail: lock }));
    return () => {
      window.dispatchEvent(new CustomEvent(MIC_LOCK_EVENT, { detail: false }));
    };
  }, [busy, listening, phase]);

  // Kill voice + mic the moment user leaves Home
  useEffect(() => {
    return () => {
      runIdRef.current += 1;
      startedRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
      tapResolverRef.current = null;
      stopSpeaking();
      window.dispatchEvent(new CustomEvent(MIC_LOCK_EVENT, { detail: false }));
    };
  }, []);

  function manualStart() {
    stopSpeaking();
    runIdRef.current += 1;
    startedRef.current = true;
    setBusy(false);
    startArriveFlow();
  }

  function pickProfile(id: AccessibilityProfile) {
    setProfile(id);
    localStorage.setItem(VOICE_ONBOARD_KEY, "1");
    const label = PROFILE_VOICE_OPTIONS.find((o) => o.id === id)?.label || id;
    const idRun = ++runIdRef.current;
    setBusy(true);
    void (async () => {
      try {
        await say(`Profile set to ${label}. Starting your guide.`);
        if (runIdRef.current !== idRun) return;
        await runGuide(id);
      } finally {
        if (runIdRef.current === idRun) setBusy(false);
      }
    })();
  }

  const orbMode = orbModeFromAssistant({ listening, busy, phase });

  const showAuthForm =
    !user &&
    (phase === "error" ||
      phase === "auth_choice" ||
      phase === "auth_name" ||
      phase === "auth_pin" ||
      phase === "idle" ||
      !micOk);

  const showProfiles =
    phase === "profile_ask" ||
    phase === "profile_confirm" ||
    phase === "error" ||
    (Boolean(user) && !profile);

  return (
    <section
      className={`relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0A0A0A] text-white shadow-[0_30px_70px_rgba(10,10,10,0.45)] p-6 sm:p-8 ${
        appeared ? "lb-assistant-in" : "lb-assistant-wait"
      }`}
      aria-label="Knight Vision voice assistant"
    >
      <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-[#7C3AED]/25 blur-3xl lb-orb" />
      <div
        className="pointer-events-none absolute -bottom-16 right-0 h-48 w-48 rounded-full bg-[#5E0ED7]/20 blur-3xl lb-orb"
        style={{ animationDelay: "1s" }}
      />

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center">
        <div className="flex shrink-0 flex-col items-center justify-center self-center py-2 lg:self-start lg:pt-2">
          <AssistantOrb mode={orbMode} size={148} />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="sr-only">
            Knight Vision voice assistant
            {user ? ` for ${user.name}` : ""}
          </h2>

          <div
            className="mt-4 min-h-[5.5rem] rounded-2xl border border-white/10 bg-white/5 p-4 text-base leading-relaxed text-white/90 sm:text-lg"
            aria-live="polite"
          >
            {caption || "Tap Start assistant to begin."}
          </div>

          {heard ? (
            <p className="mt-2 text-sm text-[#DDD6FE]">
              Caught: <span className="font-semibold text-white">{heard}</span>
            </p>
          ) : null}
          {micHint ? (
            <p className="mt-2 text-xs font-semibold text-[#ffb4a2]">{micHint}</p>
          ) : null}
          {error ? (
            <p className="mt-2 text-sm font-semibold text-[#ffb4a2]" role="alert">
              {error}
            </p>
          ) : null}
          {!micOk ? (
            <p className="mt-2 text-sm text-[#ffb4a2]">
              Speech recognition needs Chrome or Edge. Tap the buttons below — voice is optional.
            </p>
          ) : null}

          {/* Big tap choices — works when Bluetooth mic is silent */}
          {phase === "auth_choice" ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                className="min-h-20 rounded-2xl bg-[#7C3AED] text-2xl font-black text-white shadow-lg transition active:scale-[0.98]"
                onClick={() => submitTap("one")}
              >
                1
                <span className="mt-1 block text-xs font-bold uppercase tracking-wide opacity-80">
                  Create account
                </span>
              </button>
              <button
                type="button"
                className="min-h-20 rounded-2xl bg-white text-2xl font-black text-[#0A0A0A] shadow-lg transition active:scale-[0.98]"
                onClick={() => submitTap("two")}
              >
                2
                <span className="mt-1 block text-xs font-bold uppercase tracking-wide opacity-70">
                  Sign in
                </span>
              </button>
            </div>
          ) : null}

          {phase === "auth_confirm" || phase === "profile_confirm" ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                className="min-h-14 rounded-2xl bg-[#7C3AED] text-lg font-black text-white"
                onClick={() => submitTap("yes")}
              >
                Yes
              </button>
              <button
                type="button"
                className="min-h-14 rounded-2xl bg-white/15 text-lg font-black text-white"
                onClick={() => submitTap("no")}
              >
                No
              </button>
            </div>
          ) : null}

          {phase === "profile_ask" || phase === "profile_confirm" ? (
            <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7">
              {PROFILE_VOICE_OPTIONS.map((opt) => {
                const selected =
                  heard === String(opt.number) ||
                  parseSpokenNumber(heard) === opt.number;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => submitTap(String(opt.number))}
                    className={`min-h-14 rounded-xl text-lg font-black transition ${
                      selected
                        ? "bg-[#7C3AED] text-white ring-2 ring-white/40"
                        : "bg-white/10 text-white hover:bg-[#7C3AED] hover:text-white"
                    }`}
                    aria-label={`Say ${opt.number} ${opt.label}`}
                    aria-pressed={selected}
                  >
                    {opt.number}
                  </button>
                );
              })}
            </div>
          ) : null}

          {phase === "guide" && guideSteps[guideIndex] ? (
            <div className="mt-4 rounded-2xl bg-[#7C3AED]/15 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#DDD6FE]">
                Guide {guideIndex + 1}/{guideSteps.length}
              </p>
              <p className="lb-display mt-1 text-xl">
                {guideSteps[guideIndex].title}
              </p>
              <p className="mt-1 text-sm text-white/75">
                {guideSteps[guideIndex].body}
              </p>
              {guideSteps[guideIndex].href ? (
                <Link
                  href={guideSteps[guideIndex].href!}
                  className="mt-3 inline-flex text-sm font-bold text-[#DDD6FE]"
                >
                  Open this step →
                </Link>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              className="lb-btn lb-btn-primary"
              onClick={manualStart}
              disabled={busy}
            >
              {busy ? "In progress…" : appeared ? "Restart assistant" : "Start assistant"}
            </button>
            {user ? (
              <button
                type="button"
                className="lb-btn border border-white/20 bg-white/10 text-white hover:bg-white/15"
                onClick={() => {
                  stopSpeaking();
                  runIdRef.current += 1;
                  logout();
                  localStorage.removeItem(VOICE_ONBOARD_KEY);
                  localStorage.removeItem(VOICE_GUIDE_DONE_KEY);
                  setCaption("Signed out. Tap Start assistant.");
                  setPhase("idle");
                  setBusy(false);
                }}
              >
                Sign out
              </button>
            ) : null}
            {phase === "guide" ? (
              <button
                type="button"
                className="lb-btn border border-white/20 bg-white/10 text-white hover:bg-white/15"
                onClick={() => {
                  stopSpeaking();
                  runIdRef.current += 1;
                  setBusy(false);
                  setPhase("ready");
                  localStorage.setItem(VOICE_GUIDE_DONE_KEY, "1");
                }}
              >
                Skip guide
              </button>
            ) : null}
          </div>

          {showAuthForm ? (
            <div className="mt-5 grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-white/60">
                Name
                <input
                  className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-[#7C3AED]"
                  value={pendingName}
                  onChange={(e) => setPendingName(e.target.value)}
                  placeholder="Your name"
                />
              </label>
              <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-white/60">
                4-digit PIN
                <input
                  className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-[#7C3AED]"
                  value={pendingPin}
                  onChange={(e) =>
                    setPendingPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  placeholder="1234"
                  inputMode="numeric"
                />
              </label>
              <button
                type="button"
                className="lb-btn lb-btn-primary"
                onClick={() => {
                  cancelListen();
                  runIdRef.current += 1;
                  void (async () => {
                    const result = await register(pendingName, pendingPin);
                    if (!result.ok) setError(result.error);
                    else {
                      setError("");
                      setBusy(false);
                      setCaption(
                        "Account created. Tap your comfort mode below (1 Voice Guide, 2 Captions & Sign…)."
                      );
                      setPhase("profile_ask");
                      void speakAsync(
                        "Account created. Tap your profile number below.",
                        { lang: "en-US" }
                      );
                    }
                  })();
                }}
              >
                Create account
              </button>
              <button
                type="button"
                className="lb-btn border border-white/20 bg-white/10 text-white hover:bg-white/15"
                onClick={() => {
                  cancelListen();
                  runIdRef.current += 1;
                  void (async () => {
                    const result = await login(pendingName, pendingPin);
                    if (!result.ok) setError(result.error);
                    else {
                      setError("");
                      setBusy(false);
                      setCaption(
                        "Signed in. Tap your comfort mode below (1 Voice Guide, 2 Captions & Sign…)."
                      );
                      setPhase("profile_ask");
                      void speakAsync(
                        "Signed in. Tap your profile number below.",
                        { lang: "en-US" }
                      );
                    }
                  })();
                }}
              >
                Sign in
              </button>
            </div>
          ) : null}

          {showProfiles ? (
            <div className="mt-5">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#DDD6FE]">
                Or tap a comfort mode
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {PROFILE_VOICE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => pickProfile(opt.id)}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-left transition hover:bg-white/10"
                  >
                    <span className="text-xs font-bold text-[#DDD6FE]">
                      Say {opt.number}
                    </span>
                    <span className="mt-0.5 block text-sm font-bold">
                      {opt.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
