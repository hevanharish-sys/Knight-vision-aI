"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Inter } from "next/font/google";
import {
  AnimatePresence,
  motion,
  useScroll,
  useTransform,
  type Variants,
} from "framer-motion";
import {
  ArrowUpRight,
  Captions,
  Check,
  Eye,
  FileText,
  Focus,
  HandMetal,
  Keyboard,
  Languages,
  LayoutGrid,
  ListOrdered,
  Mic,
  ShieldAlert,
  Sparkles,
  Volume2,
  ZoomIn,
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import {
  useProfile,
  type AccessibilityProfile,
} from "@/lib/profile";
import { speak } from "@/lib/speech";

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

const HEADING_WORDS = ["Knight", "Vision", "AI"] as const;

const PURPOSE_PILLARS = [
  {
    title: "Speech",
    body: "Turn spoken words into clear captions and readable transcripts.",
    icon: Mic,
    href: "/app/speech",
  },
  {
    title: "Sign",
    body: "Interpret gesture into voice so caregivers and doctors can respond.",
    icon: HandMetal,
    href: "/app/sign",
  },
  {
    title: "Sight",
    body: "Describe the world aloud — labels, paths, and critical detail.",
    icon: Eye,
    href: "/app/vision",
  },
] as const;

const MODULES = [
  {
    name: "Speech ↔ Text",
    body: "Live captions and clip transcription so spoken clinic talk becomes readable text.",
    href: "/app/speech",
    icon: Captions,
  },
  {
    name: "Sign Interpreter",
    body: "Camera sign tracking that turns gestures into speech for doctors and caregivers.",
    href: "/app/sign",
    icon: HandMetal,
  },
  {
    name: "Vision Assistant",
    body: "Scene descriptions spoken aloud — hazards, labels, currency, and what’s ahead.",
    href: "/app/vision",
    icon: Eye,
  },
  {
    name: "Live Translator",
    body: "Speak or type across Indian languages ↔ English when words need a bridge.",
    href: "/app/translate",
    icon: Languages,
  },
  {
    name: "Document Reader",
    body: "Photograph prescriptions and notices; get plain-language explanations.",
    href: "/app/document",
    icon: FileText,
  },
  {
    name: "Hub & SOS",
    body: "Saved sessions, transcripts, and one-hold emergency help with location.",
    href: "/app/hub",
    icon: ShieldAlert,
  },
] as const;

const MODES: {
  id: AccessibilityProfile;
  name: string;
  tag: string;
  body: string;
  bestFor: string;
  opens: string;
  icon: typeof Volume2;
}[] = [
  {
    id: "blind",
    name: "Voice Guide",
    tag: "Blind-first",
    body: "The app speaks each step and listens for commands — hands-free guidance.",
    bestFor: "Blind or voice-first users",
    opens: "Easy Mode · Vision · Speech",
    icon: Volume2,
  },
  {
    id: "deaf",
    name: "Captions & Sign",
    tag: "Deaf-first",
    body: "Large captions, visual cues, and sign tools up front for clear clinic talk.",
    bestFor: "Deaf or hard-of-hearing users",
    opens: "Sign · Speech · Translate",
    icon: Captions,
  },
  {
    id: "speech",
    name: "Type & Sign",
    tag: "Speech-support",
    body: "Type or sign your message; optional spoken replies for caregivers.",
    bestFor: "Speech difficulties",
    opens: "Sign · Translate · Hub",
    icon: Keyboard,
  },
  {
    id: "low-vision",
    name: "Large & Clear",
    tag: "Low vision",
    body: "Bigger type, high contrast, and simpler screens that are easier to scan.",
    bestFor: "Low-vision users",
    opens: "Easy Mode · Vision · Docs",
    icon: ZoomIn,
  },
  {
    id: "senior",
    name: "Simple Steps",
    tag: "Senior pace",
    body: "Fewer choices, calm guidance, and an easy SOS path when help is needed.",
    bestFor: "Seniors & caregivers",
    opens: "Easy Mode · Docs · SOS",
    icon: ListOrdered,
  },
  {
    id: "autism",
    name: "Steady Focus",
    tag: "Calm UI",
    body: "Predictable layout, softer motion, and clear next actions — less overload.",
    bestFor: "Autism / sensory comfort",
    opens: "Hub · Translate · Speech",
    icon: Focus,
  },
  {
    id: "none",
    name: "Everything",
    tag: "Full toolkit",
    body: "All modules open with no profile bias — explore speech, sign, and sight.",
    bestFor: "Everyone / demos",
    opens: "All six modules",
    icon: LayoutGrid,
  },
];

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

const staggerParent: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.11, delayChildren: 0.06 },
  },
};

const staggerItem: Variants = {
  hidden: { opacity: 0, y: 48 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: easeOut },
  },
};

const wordReveal: Variants = {
  hidden: { opacity: 0, y: "80%" },
  show: {
    opacity: 1,
    y: "0%",
    transition: { duration: 0.55, ease: easeOut },
  },
};

export default function LandingPage() {
  const router = useRouter();
  const { profile, setProfile, ready } = useProfile();
  const [selectedMode, setSelectedMode] =
    useState<AccessibilityProfile>("deaf");
  const [touchedMode, setTouchedMode] = useState(false);
  const purposeRef = useRef<HTMLElement>(null);
  const { scrollYProgress: purposeProgress } = useScroll({
    target: purposeRef,
    offset: ["start end", "end start"],
  });
  const purposeOrbY = useTransform(purposeProgress, [0, 1], [60, -80]);
  const purposeOrbScale = useTransform(purposeProgress, [0, 0.5, 1], [0.85, 1.1, 0.95]);

  useEffect(() => {
    if (ready && profile && !touchedMode) {
      setSelectedMode(profile);
    }
  }, [ready, profile, touchedMode]);

  const activeMode =
    MODES.find((m) => m.id === selectedMode) || MODES[1];
  const ActiveIcon = activeMode.icon;

  function pickMode(id: AccessibilityProfile) {
    setTouchedMode(true);
    setSelectedMode(id);
  }

  function applyMode(goOnboarding = false) {
    setProfile(selectedMode);
    if (selectedMode === "blind" || selectedMode === "low-vision") {
      speak(`Mode set to ${activeMode.name}. Opening Knight Vision.`, {
        lang: "en-IN",
      });
    }
    router.push(goOnboarding ? "/onboarding" : "/app");
  }

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
        ref={purposeRef}
        id="purpose"
        className="relative scroll-mt-24 overflow-hidden border-t border-black/5 bg-white px-5 py-16 sm:px-8 md:px-12 md:py-24"
      >
        <motion.div
          className="pointer-events-none absolute -right-20 top-10 h-72 w-72 rounded-full blur-3xl"
          style={{
            background: "rgba(94, 14, 215, 0.12)",
            y: purposeOrbY,
            scale: purposeOrbScale,
          }}
          aria-hidden
        />

        <motion.div
          variants={staggerParent}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.25 }}
        >
          <motion.p
            variants={staggerItem}
            className="text-xs font-semibold uppercase tracking-[0.22em]"
            style={{ color: ACCENT }}
          >
            Purpose
          </motion.p>

          <motion.h2
            className="mt-4 max-w-3xl font-semibold uppercase leading-[0.95] text-black"
            style={{ fontSize: "clamp(2rem, 6vw, 4.5rem)" }}
            variants={staggerParent}
          >
            {"One AI. Infinite Ways To Communicate."
              .split(" ")
              .map((word) => (
                <span
                  key={word}
                  className="mr-[0.28em] inline-block overflow-hidden align-bottom"
                >
                  <motion.span variants={wordReveal} className="inline-block">
                    {word}
                  </motion.span>
                </span>
              ))}
          </motion.h2>

          <motion.p
            variants={staggerItem}
            className="mt-6 max-w-2xl text-sm font-semibold uppercase leading-relaxed tracking-widest text-black/70 sm:text-base"
          >
            Knight Vision bridges speech, sign, and sight so clinics, families, and
            communities share one understanding — without leaving anyone outside
            the conversation.
          </motion.p>
        </motion.div>

        <motion.div
          className="mt-10 h-px origin-left bg-gradient-to-r from-[#5E0ED7] via-black/15 to-transparent"
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, amount: 0.8 }}
          transition={{ duration: 0.9, ease: easeOut }}
        />

        <motion.div
          className="mt-10 grid gap-6 sm:grid-cols-3 sm:gap-8"
          variants={staggerParent}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
        >
          {PURPOSE_PILLARS.map((item) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.title}
                variants={staggerItem}
                whileHover={{ y: -8 }}
                transition={{ type: "spring", stiffness: 340, damping: 22 }}
              >
                <Link
                  href={item.href}
                  className="group relative block h-full overflow-hidden border border-black/8 bg-[#FAFAFA] px-5 py-6 transition duration-300 hover:border-[#5E0ED7]/55 hover:bg-white hover:shadow-[0_20px_50px_rgba(94,14,215,0.12)]"
                >
                  <span
                    className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 transition duration-500 group-hover:scale-x-100"
                    style={{ backgroundColor: ACCENT }}
                  />
                  <motion.span
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: ACCENT }}
                    whileHover={{ scale: 1.08, rotate: -6 }}
                  >
                    <Icon className="h-5 w-5" strokeWidth={2.25} />
                  </motion.span>
                  <p
                    className="mt-5 text-xs font-semibold uppercase tracking-[0.2em]"
                    style={{ color: ACCENT }}
                  >
                    {item.title}
                  </p>
                  <p className="mt-3 text-sm font-semibold uppercase leading-relaxed tracking-widest text-black sm:text-base">
                    {item.body}
                  </p>
                  <span
                    className="mt-5 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-widest transition duration-300 group-hover:gap-2"
                    style={{ color: ACCENT }}
                  >
                    Try it
                    <ArrowUpRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.25, duration: 0.55, ease: easeOut }}
          className="mt-12"
        >
          <Link
            href="/app"
            className="group inline-flex items-center gap-2 text-base font-semibold uppercase tracking-widest transition"
            style={{ color: ACCENT }}
          >
            <motion.span
              animate={{ rotate: [0, 12, -8, 0] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <Sparkles className="h-4 w-4" />
            </motion.span>
            Start with Knight Vision
            <ArrowUpRight className="h-5 w-5 transition group-hover:translate-x-1 group-hover:-translate-y-1" />
          </Link>
        </motion.div>
      </section>

      {/* ── Modules ── */}
      <section
        id="modules"
        className="relative scroll-mt-24 overflow-hidden border-t border-black/5 bg-[#FAFAFA] px-5 py-16 sm:px-8 md:px-12 md:py-24"
      >
        <motion.div
          variants={staggerParent}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
        >
          <motion.p
            variants={staggerItem}
            className="text-xs font-semibold uppercase tracking-[0.22em]"
            style={{ color: ACCENT }}
          >
            Modules
          </motion.p>
          <motion.h2
            variants={staggerItem}
            className="mt-4 max-w-3xl font-semibold uppercase leading-[0.95] text-black"
            style={{ fontSize: "clamp(2rem, 6vw, 4.5rem)" }}
          >
            Six Access Tools. One Bridge.
          </motion.h2>
          <motion.p
            variants={staggerItem}
            className="mt-6 max-w-2xl text-sm font-semibold uppercase leading-relaxed tracking-widest text-black/70 sm:text-base"
          >
            Each module solves a real barrier — then connects back into the same
            hub, profile, and SOS safety net. Tap any tool to open it.
          </motion.p>
        </motion.div>

        <motion.ul
          className="mt-12 grid gap-4 sm:grid-cols-2"
          variants={staggerParent}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.12 }}
        >
          {MODULES.map((mod, i) => {
            const Icon = mod.icon;
            return (
              <motion.li
                key={mod.name}
                variants={staggerItem}
                whileHover={{ y: -5, scale: 1.01 }}
                transition={{ type: "spring", stiffness: 360, damping: 24 }}
              >
                <Link
                  href={mod.href}
                  className="group flex h-full gap-4 border border-black/8 bg-white px-5 py-6 transition duration-300 hover:border-[#5E0ED7]/50 hover:shadow-[0_18px_40px_rgba(94,14,215,0.1)]"
                >
                  <span
                    className="mt-0.5 grid h-12 w-12 shrink-0 place-items-center rounded-full text-white transition duration-300 group-hover:scale-110"
                    style={{ backgroundColor: ACCENT }}
                  >
                    <Icon className="h-5 w-5" strokeWidth={2.25} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-black/40">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <ArrowUpRight className="h-4 w-4 text-black/25 transition duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[#5E0ED7]" />
                    </span>
                    <h3 className="mt-1 text-lg font-semibold uppercase tracking-widest text-black sm:text-xl">
                      {mod.name}
                    </h3>
                    <p className="mt-2 text-xs font-semibold uppercase leading-relaxed tracking-widest text-black/65 sm:text-sm">
                      {mod.body}
                    </p>
                  </span>
                </Link>
              </motion.li>
            );
          })}
        </motion.ul>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, ease: easeOut }}
        >
          <Link
            href="/app"
            className="mt-12 inline-flex items-center gap-1.5 text-base font-semibold uppercase tracking-widest transition hover:gap-3"
            style={{ color: ACCENT }}
          >
            Open All Modules
            <ArrowUpRight className="h-5 w-5" />
          </Link>
        </motion.div>
      </section>

      {/* ── Modes ── */}
      <section
        id="modes"
        className="relative scroll-mt-24 overflow-hidden border-t border-black/5 bg-white px-5 py-16 sm:px-8 md:px-12 md:py-28"
      >
        <motion.div
          className="pointer-events-none absolute -left-24 bottom-0 h-72 w-72 rounded-full blur-3xl"
          style={{ background: "rgba(94, 14, 215, 0.08)" }}
          animate={{ scale: [1, 1.12, 1], opacity: [0.4, 0.75, 0.4] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          aria-hidden
        />

        <motion.div
          variants={staggerParent}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          className="relative"
        >
          <motion.p
            variants={staggerItem}
            className="text-xs font-semibold uppercase tracking-[0.22em]"
            style={{ color: ACCENT }}
          >
            Modes
          </motion.p>
          <motion.h2
            variants={staggerItem}
            className="mt-4 max-w-3xl font-semibold uppercase leading-[0.95] text-black"
            style={{ fontSize: "clamp(2rem, 6vw, 4.5rem)" }}
          >
            Comfort Modes That Fit The Person.
          </motion.h2>
          <motion.p
            variants={staggerItem}
            className="mt-6 max-w-2xl text-sm font-semibold uppercase leading-relaxed tracking-widest text-black/70 sm:text-base"
          >
            Tap a comfort mode to preview it. Knight Vision adapts captions, voice,
            button size, and recommended modules to match.
          </motion.p>
        </motion.div>

        <div className="relative mt-12 grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
          {/* Interactive grid */}
          <motion.div
            className="grid gap-3 sm:grid-cols-2"
            variants={staggerParent}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.15 }}
            role="listbox"
            aria-label="Comfort modes"
          >
            {MODES.map((mode) => {
              const Icon = mode.icon;
              const selected = selectedMode === mode.id;
              return (
                <motion.button
                  key={mode.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  variants={staggerItem}
                  whileHover={{ y: -4 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => pickMode(mode.id)}
                  className={`group relative flex min-h-[148px] flex-col overflow-hidden border px-4 py-4 text-left transition duration-300 ${
                    selected
                      ? "border-[#5E0ED7] bg-white shadow-[0_18px_44px_rgba(94,14,215,0.16)]"
                      : "border-black/8 bg-[#FAFAFA] hover:border-[#5E0ED7]/35 hover:bg-white"
                  }`}
                >
                  <span
                    className={`absolute inset-x-0 top-0 h-0.5 transition-transform duration-400 ${
                      selected ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                    }`}
                    style={{ backgroundColor: ACCENT, transformOrigin: "left" }}
                  />
                  <span className="flex items-start justify-between gap-2">
                    <span
                      className={`grid h-10 w-10 place-items-center rounded-full transition ${
                        selected ? "text-white" : "bg-white text-[#5E0ED7] shadow-sm"
                      }`}
                      style={
                        selected ? { backgroundColor: ACCENT } : undefined
                      }
                    >
                      <Icon className="h-4 w-4" strokeWidth={2.25} />
                    </span>
                    {selected ? (
                      <motion.span
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="grid h-6 w-6 place-items-center rounded-full text-white"
                        style={{ backgroundColor: ACCENT }}
                      >
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </motion.span>
                    ) : (
                      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/35">
                        {mode.tag}
                      </span>
                    )}
                  </span>
                  <h3 className="mt-4 text-sm font-semibold uppercase tracking-widest text-black sm:text-base">
                    {mode.name}
                  </h3>
                  <p className="mt-2 flex-1 text-[11px] font-semibold uppercase leading-relaxed tracking-widest text-black/60">
                    {mode.body}
                  </p>
                </motion.button>
              );
            })}
          </motion.div>

          {/* Live preview panel */}
          <motion.aside
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.65, ease: easeOut }}
            className="relative flex flex-col overflow-hidden border border-black/8 bg-[#0A0A0A] p-6 text-white sm:p-8 lg:sticky lg:top-24"
          >
            <div
              className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl"
              style={{ background: "rgba(94, 14, 215, 0.45)" }}
              aria-hidden
            />
            <p className="relative text-[11px] font-semibold uppercase tracking-[0.22em] text-[#DDD6FE]">
              Knight Vision · Live preview
            </p>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeMode.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.35, ease: easeOut }}
                className="relative mt-6 flex flex-1 flex-col"
              >
                <span
                  className="inline-flex h-14 w-14 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: ACCENT }}
                >
                  <ActiveIcon className="h-6 w-6" strokeWidth={2.25} />
                </span>
                <p
                  className="mt-5 text-xs font-semibold uppercase tracking-[0.2em]"
                  style={{ color: "#C4B5FD" }}
                >
                  {activeMode.tag}
                </p>
                <h3
                  className="mt-2 font-semibold uppercase leading-tight tracking-wide"
                  style={{ fontSize: "clamp(1.6rem, 3vw, 2.25rem)" }}
                >
                  {activeMode.name}
                </h3>
                <p className="mt-4 text-sm font-semibold uppercase leading-relaxed tracking-widest text-white/70">
                  {activeMode.body}
                </p>

                <div className="mt-8 space-y-3 border-t border-white/10 pt-6">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
                      Best for
                    </p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-white">
                      {activeMode.bestFor}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
                      Opens first
                    </p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-[#DDD6FE]">
                      {activeMode.opens}
                    </p>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="relative mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => applyMode(false)}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold uppercase tracking-widest text-white transition hover:brightness-110"
                style={{ backgroundColor: ACCENT }}
              >
                Use {activeMode.name}
                <ArrowUpRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => applyMode(true)}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 px-5 py-3.5 text-sm font-semibold uppercase tracking-widest text-white transition hover:border-white/50"
              >
                Full setup
              </button>
            </div>
          </motion.aside>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, ease: easeOut }}
          className="relative mt-10 flex flex-wrap items-center gap-4"
        >
          <Link
            href="/app"
            className="inline-flex items-center gap-2 rounded-full border border-black/15 px-6 py-3.5 text-sm font-semibold uppercase tracking-widest text-black transition hover:border-[#5E0ED7] hover:text-[#5E0ED7]"
          >
            Skip To App
            <ArrowUpRight className="h-4 w-4" />
          </Link>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-black/45">
            Selected: {activeMode.name} · Change anytime in the app header
          </p>
        </motion.div>
      </section>

    </div>
  );
}
