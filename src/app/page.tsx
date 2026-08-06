"use client";

import { useState } from "react";
import Link from "next/link";
import { Inter } from "next/font/google";
import { motion, type Variants } from "framer-motion";
import { ArrowUpRight, X } from "lucide-react";

const inter = Inter({
  subsets: ["latin"],
  weight: ["600"],
});

const ACCENT = "#5E0ED7";

/** Knight Vision content mapped onto the exact hero structure */
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

function LogoMark() {
  return (
    <div
      className="flex h-8 w-8 items-center justify-center rounded-full border-2"
      style={{ borderColor: ACCENT }}
      aria-hidden
    >
      <div
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: ACCENT }}
      />
    </div>
  );
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className={`${inter.className} relative flex min-h-[100svh] flex-col overflow-hidden bg-white font-semibold uppercase tracking-widest text-black`}
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* Full-screen video background */}
      <video
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260517_222138_3e3205be-3364-417b-a64a-bfe087acbec4.mp4"
        autoPlay
        muted
        loop
        playsInline
        aria-hidden
      />
      {/* Soft wash for black type readability */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/50 via-white/35 to-white/55"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/40 via-transparent to-white/50"
        aria-hidden
      />

      {/* 1. Nav */}
      <header className="relative z-20 flex items-center justify-between px-5 pt-5 sm:px-8 md:px-12 md:pt-6">
        <motion.div
          variants={fadeDown}
          initial="initial"
          animate="animate"
          custom={0}
        >
          <Link href="/" aria-label="Knight Vision AI home">
            <LogoMark />
          </Link>
        </motion.div>

        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 md:flex">
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
                className="text-[14px] font-semibold uppercase tracking-widest text-black transition hover:opacity-70"
              >
                {link.label}
              </Link>
            </motion.div>
          ))}
        </nav>

        <motion.button
          type="button"
          variants={fadeDown}
          initial="initial"
          animate="animate"
          custom={5}
          onClick={() => setMenuOpen(true)}
          className="flex h-9 w-9 flex-col items-center justify-center gap-1 rounded-full bg-black"
          aria-label="Open menu"
        >
          <span className="h-0.5 w-4 bg-white" />
          <span className="h-0.5 w-4 bg-white" />
          <span className="h-0.5 w-4 bg-white" />
        </motion.button>
      </header>

      {/* Mobile menu overlay */}
      {menuOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-white px-5 pt-5 sm:px-8 md:px-12 md:pt-6">
          <div className="flex items-center justify-between">
            <LogoMark />
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-white"
              aria-label="Close menu"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
          </div>

          <nav className="mt-16 flex flex-col gap-8">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="text-3xl font-semibold uppercase tracking-widest text-black"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <Link
            href="/app"
            onClick={() => setMenuOpen(false)}
            className="mt-auto mb-10 inline-flex items-center gap-2 text-xl font-semibold uppercase tracking-widest"
            style={{ color: ACCENT }}
          >
            Enter Knight Vision
            <ArrowUpRight size={22} />
          </Link>
        </div>
      ) : null}

      {/* 2. Stats row */}
      <section
        id="modules"
        className="relative z-10 flex flex-1 items-center justify-end px-5 py-8 sm:px-8 md:px-12 md:py-0"
      >
        <div className="flex items-end gap-5 sm:gap-8 md:gap-10">
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

      {/* 3. Bottom content */}
      <section className="relative z-10 flex flex-col gap-6 px-5 pb-8 sm:px-8 md:gap-12 md:px-12 md:pb-12">
        {/* Row A — tagline + CTA */}
        <div className="flex items-center justify-between gap-4">
          <motion.p
            id="purpose"
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

        {/* Row B — description + heading */}
        <div
          id="modes"
          className="flex items-end justify-between gap-3 sm:gap-4"
        >
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
  );
}
