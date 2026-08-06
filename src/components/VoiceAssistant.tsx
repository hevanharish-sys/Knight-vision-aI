"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
  PROFILE_VOICE_OPTIONS,
  VOICE_GUIDE_DONE_KEY,
  VOICE_ONBOARD_KEY,
  type GuideBeat,
  type VoicePhase,
} from "@/lib/voice-assistant";
import {
  isSpeechRecognitionSupported,
  listenOnce,
  sampleMicLevel,
  speakAsync,
  stopSpeaking,
  warmMicPermission,
} from "@/lib/speech";
import { AssistantOrb, orbModeFromAssistant } from "@/components/AssistantOrb";
type Props = {
  autoStart?: boolean;
};

export function VoiceAssistant({ autoStart = true }: Props) {
  const router = useRouter();
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
    await speakAsync(text, { lang: "en-US", rate: 0.95 });
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
      c.includes("Speak") || c.includes("Tap") ? c : "Speak now, or tap a button below"
    );

    const sample = await sampleMicLevel(900);
    if (sample.label) {
      setMicHint(
        sample.ok
          ? `Mic: ${sample.label}`
          : `Mic quiet (${sample.label || "unknown"}). Tap buttons if voice fails — switch browser mic to your laptop if using Airdopes.`
      );
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const fromTap = new Promise<string>((resolve) => {
      tapResolverRef.current = (text: string) => resolve(text);
    });

    const fromVoice = (async () => {
      // Single longer listen — retries fight with silent BT mics
      let text = await listenOnce({
        lang: "en-US",
        fallbackLang: "en-IN",
        timeoutMs: 8000,
        delayMs: 400,
        signal: ac.signal,
        onPartial: (partial) => {
          if (partial) setHeard(partial);
        },
      });
      if (!text.trim() && !ac.signal.aborted) {
        const tip =
          promptAgain ||
          "I did not hear speech. Tap a button below, or speak again.";
        setCaption(tip);
        await speakAsync(tip, { lang: "en-US", rate: 0.95 });
        if (ac.signal.aborted) return "";
        text = await listenOnce({
          lang: "en-US",
          fallbackLang: "en-IN",
          timeoutMs: 8000,
          delayMs: 500,
          signal: ac.signal,
          onPartial: (partial) => {
            if (partial) setHeard(partial);
          },
        });
      }
      return text;
    })();

    try {
      const text = await Promise.race([fromTap, fromVoice]);
      // Stop the other path
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
      setGuideSteps(steps);
      setGuideIndex(0);
      setPhase("guide");
      await say(
        p === "blind" || p === "low-vision"
          ? "I will now guide you one step at a time. After each step, say next, or say repeat."
          : "Here is a short guide. Say next after each step."
      );

      for (let i = 0; i < steps.length; i += 1) {
        setGuideIndex(i);
        const step = steps[i];
        await say(step.spoken);

        if (i === steps.length - 1) {
          localStorage.setItem(VOICE_GUIDE_DONE_KEY, "1");
          setPhase("ready");
          if (step.href && (p === "blind" || p === "low-vision")) {
            await say("Taking you to Easy Mode.");
            router.push(step.href);
          }
          return;
        }

        const reply = (await hear()).toLowerCase();
        if (/\b(repeat|again)\b/.test(reply)) {
          i -= 1;
          continue;
        }
        if (/\b(skip|stop|done|finish)\b/.test(reply)) {
          localStorage.setItem(VOICE_GUIDE_DONE_KEY, "1");
          setPhase("ready");
          await say("Guide paused. You can restart anytime.");
          if (p === "blind" || p === "low-vision") router.push("/app/easy");
          return;
        }
        if (/\b(open|go)\b/.test(reply) && step.href) {
          await say(`Opening ${step.title}.`);
          router.push(step.href);
          return;
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
          "Hello. I am your Knight Vision voice assistant. I will help you sign in, choose your accessibility profile, and guide you step by step."
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
          let num = parseSpokenNumber(await hear());
          if (!num) {
            await say("Please say a number from 1 to 7.");
            num = parseSpokenNumber(await hear());
          }
          let opt = PROFILE_VOICE_OPTIONS.find((o) => o.number === num);
          if (!opt) {
            setError("Profile number not recognized. Tap a profile below.");
            setPhase("error");
            return;
          }

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

    if (fullyDone) {
      setAppeared(true);
      setPhase("ready");
      setCaption("Voice assistant ready. Tap Restart assistant to run setup again.");
      return;
    }

    startedRef.current = true;
    startArriveFlow();
  }, [autoStart, authReady, profileReady, user, profile, startArriveFlow]);

  // Kill voice + mic the moment user leaves Home
  useEffect(() => {
    return () => {
      runIdRef.current += 1;
      startedRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
      tapResolverRef.current = null;
      stopSpeaking();
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
      className={`relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#071825] text-white shadow-[0_30px_70px_rgba(7,24,37,0.45)] p-6 sm:p-8 ${
        appeared ? "lb-assistant-in" : "lb-assistant-wait"
      }`}
      aria-label="Knight Vision voice assistant"
    >
      <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-[#19b5b8]/25 blur-3xl lb-orb" />
      <div
        className="pointer-events-none absolute -bottom-16 right-0 h-48 w-48 rounded-full bg-[#0f8b8d]/20 blur-3xl lb-orb"
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
            <p className="mt-2 text-sm text-[#7ef0f2]">
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
                className="min-h-20 rounded-2xl bg-[#19b5b8] text-2xl font-black text-[#071825] shadow-lg transition active:scale-[0.98]"
                onClick={() => submitTap("one")}
              >
                1
                <span className="mt-1 block text-xs font-bold uppercase tracking-wide opacity-80">
                  Create account
                </span>
              </button>
              <button
                type="button"
                className="min-h-20 rounded-2xl bg-white text-2xl font-black text-[#071825] shadow-lg transition active:scale-[0.98]"
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
                className="min-h-14 rounded-2xl bg-[#19b5b8] text-lg font-black text-[#071825]"
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

          {phase === "profile_ask" ? (
            <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7">
              {PROFILE_VOICE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => submitTap(String(opt.number))}
                  className="min-h-14 rounded-xl bg-white/10 text-lg font-black text-white transition hover:bg-[#19b5b8] hover:text-[#071825]"
                  aria-label={`Say ${opt.number} ${opt.label}`}
                >
                  {opt.number}
                </button>
              ))}
            </div>
          ) : null}

          {phase === "guide" && guideSteps[guideIndex] ? (
            <div className="mt-4 rounded-2xl bg-[#19b5b8]/15 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#7ef0f2]">
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
                  className="mt-3 inline-flex text-sm font-bold text-[#7ef0f2]"
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
                  className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-[#19b5b8]"
                  value={pendingName}
                  onChange={(e) => setPendingName(e.target.value)}
                  placeholder="Your name"
                />
              </label>
              <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-white/60">
                4-digit PIN
                <input
                  className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-[#19b5b8]"
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
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#7ef0f2]">
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
                    <span className="text-xs font-bold text-[#7ef0f2]">
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
