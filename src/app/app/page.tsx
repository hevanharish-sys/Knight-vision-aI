"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ModuleCard } from "@/components/ModuleCard";
import { VoiceAssistant } from "@/components/VoiceAssistant";
import { getWelcome } from "@/lib/guide";
import { isVisionEasyProfile } from "@/lib/easy-mode";
import { useProfile, type AccessibilityProfile } from "@/lib/profile";
import { VOICE_GUIDE_DONE_KEY, VOICE_ONBOARD_KEY } from "@/lib/voice-assistant";

const CORE = [
  {
    href: "/app/sign",
    title: "Sign ↔ Doctor",
    description: "Two-hand tracking, 40+ languages, live clinic conversation.",
    badge: "Core",
    icon: "✋",
    tone: "dark" as const,
    shortcut: "Sign",
    action: "Start signing",
  },
  {
    href: "/app/speech",
    title: "Speech ↔ Text",
    description: "Live captions and Gemini clip transcription for clinics.",
    badge: "Core",
    icon: "🎙",
    tone: "teal" as const,
    shortcut: "Speech",
    action: "Start captions",
  },
  {
    href: "/app/vision",
    title: "Vision Assistant",
    description: "On-device detection plus spoken scene guidance.",
    badge: "Core",
    icon: "👁",
    tone: "light" as const,
    shortcut: "Vision",
    action: "Look around",
  },
];

const SUPPORT = [
  {
    href: "/app/translate",
    title: "Translator",
    description: "Indian languages ↔ English, speak or type.",
    icon: "⇄",
    shortcut: "TR",
    action: "Translate",
    tone: "light" as const,
  },
  {
    href: "/app/document",
    title: "Documents",
    description: "Simplify prescriptions, bills, and notices.",
    icon: "📄",
    shortcut: "Docs",
    action: "Read now",
    tone: "light" as const,
  },
  {
    href: "/app/hub",
    title: "Hub",
    description: "Saved chats, transcripts, and SOS events.",
    icon: "◈",
    shortcut: "Hub",
    action: "Open hub",
    tone: "light" as const,
  },
  {
    href: "/app/easy",
    title: "Easy Mode",
    description: "Huge buttons and voice commands for low vision.",
    badge: "Assist",
    icon: "◎",
    shortcut: "Easy",
    action: "Enter easy",
    tone: "teal" as const,
  },
];

function ModuleHubInner() {
  const { profile } = useProfile();
  const router = useRouter();
  const search = useSearchParams();
  const active = (profile || "none") as AccessibilityProfile;
  const welcome = getWelcome(active);
  const fromEasy = search.get("from") === "easy";
  const easyUser = isVisionEasyProfile(profile);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 40);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const voiceDone =
      localStorage.getItem(VOICE_ONBOARD_KEY) === "1" &&
      localStorage.getItem(VOICE_GUIDE_DONE_KEY) === "1";
    if (easyUser && !fromEasy && voiceDone) {
      router.replace("/app/easy");
    }
  }, [easyUser, fromEasy, router]);

  return (
    <div className={`space-y-8 ${ready ? "lb-page-in" : "opacity-0"}`}>
      {/* Voice assistant only on Home — cleaned up on navigate away */}
      <VoiceAssistant autoStart />

      <section className="lb-hero-stage relative overflow-hidden rounded-[2rem] bg-[#0b1f33] px-6 py-9 text-white shadow-[0_30px_70px_rgba(11,31,51,0.28)] sm:px-9 sm:py-12">
        <div className="pointer-events-none absolute -left-16 top-0 h-52 w-52 rounded-full bg-[#19b5b8]/30 blur-3xl lb-orb" />
        <div
          className="pointer-events-none absolute -right-12 bottom-0 h-60 w-60 rounded-full bg-[#0f8b8d]/25 blur-3xl lb-orb"
          style={{ animationDelay: "1.1s" }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.08] lb-hero-grid"
          aria-hidden
        />
        <div className="lb-hero-beam pointer-events-none absolute -left-1/4 top-0 h-full w-1/2" aria-hidden />

        <div className="relative max-w-3xl">
          <p
            className="lb-fade-up text-[11px] font-bold uppercase tracking-[0.24em] text-[#7ef0f2]"
            style={{ animationDelay: "80ms" }}
          >
            Knight Vision · Module hub
          </p>
          <h1
            className="lb-display lb-fade-up mt-3 text-4xl leading-[1.05] tracking-tight sm:text-5xl md:text-6xl"
            style={{ animationDelay: "160ms" }}
          >
            Choose how you want to{" "}
            <span className="lb-text-shimmer">communicate</span>
          </h1>
          <p
            className="lb-fade-up mt-4 max-w-2xl text-base leading-relaxed text-white/75 sm:text-lg"
            style={{ animationDelay: "240ms" }}
          >
            {welcome.body}
          </p>
          <div
            className="lb-fade-up mt-7 flex flex-wrap gap-2.5"
            style={{ animationDelay: "320ms" }}
          >
            <Link href="/app/sign" className="lb-btn lb-btn-primary lb-btn-pop">
              Start with Sign
            </Link>
            <Link
              href="/app/speech"
              className="lb-btn lb-btn-pop border border-white/20 bg-white/10 text-white hover:bg-white/15"
            >
              Open Speech
            </Link>
            <Link
              href="/app/vision"
              className="lb-btn lb-btn-pop border border-white/20 bg-white/10 text-white hover:bg-white/15"
            >
              Vision
            </Link>
            {easyUser ? (
              <Link
                href="/app/easy"
                className="lb-btn lb-btn-pop border border-white/20 bg-white/10 text-white hover:bg-white/15"
              >
                Easy Mode
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className="lb-modules-band rounded-[2rem] border border-black/5 p-4 shadow-[0_16px_40px_rgba(11,31,51,0.05)] backdrop-blur-sm sm:p-6">
        <div
          className="lb-fade-up mb-6 flex flex-wrap items-end justify-between gap-3"
          style={{ animationDelay: "380ms" }}
        >
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#0f8b8d]">
              Core
            </p>
            <h2 className="lb-display mt-1 text-2xl text-[#0b1f33] sm:text-3xl">
              Start here
            </h2>
            <p className="mt-1 max-w-xl text-sm text-[#486581]">
              Hover to preview motion. Profile matches get a “For you” badge.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {CORE.map((mod, i) => (
              <Link
                key={`chip-${mod.href}`}
                href={mod.href}
                className="lb-chip-bounce rounded-full border border-black/8 bg-white px-3.5 py-1.5 text-xs font-bold text-[#0b1f33] shadow-sm transition hover:-translate-y-0.5 hover:border-[#19b5b8]/50 hover:text-[#0f8b8d]"
                style={{ animationDelay: `${420 + i * 60}ms` }}
              >
                {mod.shortcut}
              </Link>
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {CORE.map((mod, i) => (
            <ModuleCard
              key={mod.href}
              {...mod}
              large
              index={i + 1}
              delay={200 + i * 100}
              highlight={welcome.priorities.includes(mod.href)}
            />
          ))}
        </div>
      </section>

      <section>
        <div
          className="lb-fade-up mb-5"
          style={{ animationDelay: "520ms" }}
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#0f8b8d]">
            More tools
          </p>
          <h2 className="lb-display mt-1 text-2xl text-[#0b1f33]">
            Supporting modules
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {SUPPORT.map((mod, i) => (
            <ModuleCard
              key={mod.href}
              {...mod}
              delay={280 + i * 90}
              highlight={
                welcome.priorities.includes(mod.href) ||
                (easyUser && mod.href === "/app/easy")
              }
            />
          ))}
        </div>
      </section>
    </div>
  );
}

export default function ModuleHubPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl bg-white/70 p-8 text-[#486581] lb-pulse-soft">
          Loading modules…
        </div>
      }
    >
      <ModuleHubInner />
    </Suspense>
  );
}
