"use client";

import Link from "next/link";
import { Inter } from "next/font/google";
import { motion, type Variants } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";

const inter = Inter({
  subsets: ["latin"],
  weight: ["600"],
});

const ACCENT = "#5E0ED7";

const NAV_LINKS = [
  { label: "Purpose", href: "#purpose" },
  { label: "Modules", href: "#modules" },
  { label: "Modes", href: "#modes" },
  { label: "App", href: "/app" },
] as const;

const STATS = [
  { value: "6", label: "ACCESS\nMODULES" },
  { value: "7", label: "COMFORT\nMODES" },
  { value: "1", label: "UNIFIED\nBRIDGE" },
] as const;

const HEADING_WORDS = ["Every", "Voice", "Bridged"] as const;

const MODULES = [
  {
    name: "Speech ↔ Text",
    body: "Live captions and clip transcription so spoken clinic talk becomes readable text.",
  },
  {
    name: "Sign Interpreter",
    body: "Camera sign tracking that turns gestures into speech for doctors and caregivers.",
  },
  {
    name: "Vision Assistant",
    body: "Scene descriptions spoken aloud — hazards, labels, currency, and what’s ahead.",
  },
  {
    name: "Live Translator",
    body: "Speak or type across Indian languages ↔ English when words need a bridge.",
  },
  {
    name: "Document Reader",
    body: "Photograph prescriptions and notices; get plain-language explanations.",
  },
  {
    name: "Hub & SOS",
    body: "Saved sessions, transcripts, and one-hold emergency help with location.",
  },
] as const;

const MODES = [
  {
    name: "Voice Guide",
    body: "Blind-first — the app speaks each step and listens for commands.",
  },
  {
    name: "Captions & Sign",
    body: "Deaf-first — large captions, visual cues, and sign tools up front.",
  },
  {
    name: "Type & Sign",
    body: "Speech-support — type or sign; optional spoken replies for others.",
  },
  {
    name: "Large & Clear",
    body: "Low vision — bigger type, high contrast, simpler layouts.",
  },
  {
    name: "Simple Steps",
    body: "Senior pace — fewer choices, calm guidance, easy SOS.",
  },
  {
    name: "Steady Focus",
    body: "Autism comfort — predictable UI, softer motion, clear next actions.",
  },
  {
    name: "Everything",
    body: "Full toolkit — all modules open with no profile bias.",
  },
] as const;

const easeOut = [0.22, 1, 0.36, 1] as const;

const fadeDown: Variants = {
  initial: { opacity: 0, y: -20 },
  animate: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: index * 0.1,
      duration: 0.5,
      ease: easeOut,
    },
  }),
};

const fadeUp: Variants = {
  initial: { opacity: 0, y: 32 },
  animate: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: index * 0.12,
      duration: 0.6,
      ease: easeOut,
    },
  }),
};

export default function LandingPage() {
  return (
    <div
      className={`${inter.className} scroll-smooth overflow-x-hidden bg-white font-semibold uppercase tracking-widest text-black`}
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* ── Hero ── */}
      <div className="relative flex min-h-[100svh] min-h-[100dvh] flex-col">
        <video
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260517_222138_3e3205be-3364-417b-a64a-bfe087acbec4.mp4"
          autoPlay
          muted
          loop
          playsInline
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/50 via-white/35 to-white/55"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/40 via-transparent to-white/50"
          aria-hidden
        />

        <header className="relative z-20 flex items-center justify-between px-5 pt-5 sm:px-8 md:px-12 md:pt-6">
          <motion.div
            variants={fadeDown}
            initial="initial"
            animate="animate"
            custom={0}
          >
            <BrandLogo variant="emblem" height={52} priority href="/" />
          </motion.div>

          <nav className="absolute left-1/2 flex -translate-x-1/2 items-center gap-5 sm:gap-8">
            {NAV_LINKS.map((link, i) => (
              <motion.div
                key={link.label}
                variants={fadeDown}
                initial="initial"
                animate="animate"
                custom={i + 1}
              >
                <Link
                  href={link.href}
                  className="text-[12px] font-semibold uppercase tracking-widest text-black transition hover:opacity-70 sm:text-[14px]"
                >
                  {link.label}
                </Link>
              </motion.div>
            ))}
          </nav>

          <div className="h-12 w-12 shrink-0" aria-hidden />
        </header>

        <section className="relative z-10 flex flex-1 items-center justify-end overflow-x-auto px-5 py-8 sm:px-8 md:px-12 md:py-0">
          <div className="flex shrink-0 items-end gap-4 sm:gap-8 md:gap-10">
            {STATS.map((stat, i) => (
              <motion.div
                key={stat.label}
                variants={fadeUp}
                initial="initial"
                animate="animate"
                custom={i + 2}
                className="text-right"
              >
                <p
                  className="font-semibold leading-none text-black"
                  style={{ fontSize: "clamp(1.5rem, 5vw, 3.5rem)" }}
                >
                  <span
                    className="align-super"
                    style={{ color: ACCENT, fontSize: "0.5em" }}
                  >
                    +
                  </span>
                  {stat.value}
                </p>
                <p className="mt-1 whitespace-pre-line text-[10px] font-semibold uppercase leading-tight tracking-widest text-black sm:text-xs md:text-sm">
                  {stat.label}
                </p>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="relative z-10 flex flex-col gap-6 px-5 pb-8 sm:px-8 md:gap-12 md:px-12 md:pb-12">
          <div className="flex items-center justify-between gap-4">
            <motion.p
              variants={fadeUp}
              initial="initial"
              animate="animate"
              custom={5}
              className="max-w-[130px] text-[10px] font-semibold uppercase tracking-widest text-black sm:max-w-[160px] sm:text-xs md:max-w-xs md:text-sm"
            >
              Bridging Speech
              <br />
              Sign And Sight
              <br />
              For Every Tribe
            </motion.p>

            <motion.div
              variants={fadeUp}
              initial="initial"
              animate="animate"
              custom={6}
            >
              <Link
                href="/app"
                className="inline-flex items-center gap-1.5 whitespace-nowrap text-base font-semibold uppercase tracking-widest sm:text-xl md:text-2xl"
                style={{ color: ACCENT }}
              >
                Enter Knight Vision
                <ArrowUpRight className="h-[18px] w-[18px] sm:h-[22px] sm:w-[22px]" />
              </Link>
            </motion.div>
          </div>

          <div className="flex items-end justify-between gap-3 sm:gap-4">
            <motion.div
              variants={fadeUp}
              initial="initial"
              animate="animate"
              custom={7}
              className="w-[120px] shrink-0 sm:w-[180px] md:w-[280px]"
            >
              <p className="text-left text-[9px] font-semibold uppercase tracking-widest text-black sm:text-xs md:text-right md:text-sm">
                Multimodal Access Built Around Elevating Every Voice Into Shared
                Understanding
              </p>
            </motion.div>

            <h1 className="text-right font-semibold uppercase text-black">
              {HEADING_WORDS.map((word, wordIndex) => (
                <span key={word} className="block overflow-hidden">
                  <motion.span
                    className="block"
                    style={{
                      fontSize: "clamp(2rem, 9vw, 9rem)",
                      lineHeight: 0.88,
                    }}
                    initial={{ y: "110%" }}
                    animate={{ y: 0 }}
                    transition={{
                      delay: 0.4 + wordIndex * 0.14,
                      duration: 0.7,
                      ease: easeOut,
                    }}
                  >
                    {word}
                  </motion.span>
                </span>
              ))}
            </h1>
          </div>
        </section>
      </div>

      {/* ── Purpose ── */}
      <section
        id="purpose"
        className="scroll-mt-24 border-t border-black/5 bg-white px-5 py-16 sm:px-8 md:px-12 md:py-24"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: ACCENT }}>
          Purpose
        </p>
        <h2
          className="mt-4 max-w-3xl font-semibold uppercase leading-[0.95] text-black"
          style={{ fontSize: "clamp(2rem, 6vw, 4.5rem)" }}
        >
          One AI. Infinite Ways To Communicate.
        </h2>
        <p className="mt-6 max-w-2xl text-sm font-semibold uppercase leading-relaxed tracking-widest text-black/70 sm:text-base">
          Knight Vision bridges speech, sign, and sight so clinics, families, and
          communities share one understanding — without leaving anyone outside
          the conversation.
        </p>
        <div className="mt-12 grid gap-10 border-t border-black/10 pt-10 sm:grid-cols-3">
          {[
            {
              title: "Speech",
              body: "Turn spoken words into clear captions and readable transcripts.",
            },
            {
              title: "Sign",
              body: "Interpret gesture into voice so caregivers and doctors can respond.",
            },
            {
              title: "Sight",
              body: "Describe the world aloud — labels, paths, and critical detail.",
            },
          ].map((item) => (
            <div key={item.title}>
              <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: ACCENT }}>
                {item.title}
              </p>
              <p className="mt-3 text-sm font-semibold uppercase leading-relaxed tracking-widest text-black sm:text-base">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Modules ── */}
      <section
        id="modules"
        className="scroll-mt-24 border-t border-black/5 bg-[#FAFAFA] px-5 py-16 sm:px-8 md:px-12 md:py-24"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: ACCENT }}>
          Modules
        </p>
        <h2
          className="mt-4 max-w-3xl font-semibold uppercase leading-[0.95] text-black"
          style={{ fontSize: "clamp(2rem, 6vw, 4.5rem)" }}
        >
          Six Access Tools. One Bridge.
        </h2>
        <p className="mt-6 max-w-2xl text-sm font-semibold uppercase leading-relaxed tracking-widest text-black/70 sm:text-base">
          Each module solves a real barrier — then connects back into the same
          hub, profile, and SOS safety net.
        </p>
        <ul className="mt-12 grid gap-0 border-t border-black/10 sm:grid-cols-2">
          {MODULES.map((mod, i) => (
            <li
              key={mod.name}
              className={`border-b border-black/10 py-8 ${
                i % 2 === 0 ? "sm:border-r sm:pr-10" : "sm:pl-10"
              }`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-black/40">
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-2 text-lg font-semibold uppercase tracking-widest text-black sm:text-xl">
                {mod.name}
              </h3>
              <p className="mt-3 max-w-md text-xs font-semibold uppercase leading-relaxed tracking-widest text-black/65 sm:text-sm">
                {mod.body}
              </p>
            </li>
          ))}
        </ul>
        <Link
          href="/app"
          className="mt-12 inline-flex items-center gap-1.5 text-base font-semibold uppercase tracking-widest"
          style={{ color: ACCENT }}
        >
          Open Modules
          <ArrowUpRight className="h-5 w-5" />
        </Link>
      </section>

      {/* ── Modes ── */}
      <section
        id="modes"
        className="scroll-mt-24 border-t border-black/5 bg-white px-5 py-16 sm:px-8 md:px-12 md:py-24"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: ACCENT }}>
          Modes
        </p>
        <h2
          className="mt-4 max-w-3xl font-semibold uppercase leading-[0.95] text-black"
          style={{ fontSize: "clamp(2rem, 6vw, 4.5rem)" }}
        >
          Comfort Modes That Fit The Person.
        </h2>
        <p className="mt-6 max-w-2xl text-sm font-semibold uppercase leading-relaxed tracking-widest text-black/70 sm:text-base">
          Pick a profile once — captions, voice, button size, and recommended
          modules adapt so the app meets you where you are.
        </p>
        <ul className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {MODES.map((mode) => (
            <li key={mode.name} className="border-t border-black/10 pt-6">
              <h3 className="text-base font-semibold uppercase tracking-widest text-black sm:text-lg">
                {mode.name}
              </h3>
              <p className="mt-3 text-xs font-semibold uppercase leading-relaxed tracking-widest text-black/65 sm:text-sm">
                {mode.body}
              </p>
            </li>
          ))}
        </ul>
        <Link
          href="/onboarding"
          className="mt-12 inline-flex items-center gap-1.5 text-base font-semibold uppercase tracking-widest"
          style={{ color: ACCENT }}
        >
          Choose Your Mode
          <ArrowUpRight className="h-5 w-5" />
        </Link>
      </section>

    </div>
  );
}
