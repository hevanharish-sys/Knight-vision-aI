"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PROFILE_OPTIONS, useProfile, type AccessibilityProfile } from "@/lib/profile";
import { speak } from "@/lib/speech";

export default function OnboardingPage() {
  const router = useRouter();
  const { setProfile, profile, medical, setMedical } = useProfile();

  function choose(id: AccessibilityProfile) {
    setProfile(id);
    if (id === "blind" || id === "low-vision") {
      speak(
        `Mode set to ${PROFILE_OPTIONS.find((p) => p.id === id)?.label}. Opening Home voice assistant.`,
        { lang: "en-IN" }
      );
    }
    router.push("/app");
  }

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#0f8b8d]">
        Comfort mode
      </p>
      <h1 className="lb-display mt-3 text-4xl text-[#0b1f33] md:text-5xl">
        How would you like Knight Vision to help?
      </h1>
      <p className="mt-3 max-w-2xl text-[#486581]">
        Prefer voice? Open Home and the Knight Vision voice assistant will help you
        pick a comfort mode — like Voice Guide, Captions & Sign, and more.
      </p>

      <Link href="/app" className="lb-btn lb-btn-primary mt-6 inline-flex">
        Start with voice assistant
      </Link>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {PROFILE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => choose(opt.id)}
            className={`lb-panel lb-motion p-5 text-left transition hover:-translate-y-0.5 ${
              profile === opt.id ? "ring-2 ring-[#19b5b8]" : ""
            }`}
          >
            <span className="lb-display text-2xl text-[#0b1f33]">{opt.label}</span>
            <p className="mt-2 text-sm text-[#486581]">{opt.description}</p>
          </button>
        ))}
      </div>

      <section className="lb-panel mt-10 p-6">
        <h2 className="lb-display text-2xl text-[#0b1f33]">Medical profile for SOS</h2>
        <p className="mt-1 text-sm text-[#486581]">
          Shown when Emergency SOS is triggered. Stored only on this device.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(
            [
              ["name", "Full name"],
              ["bloodType", "Blood type"],
              ["allergies", "Allergies"],
              ["conditions", "Conditions"],
              ["emergencyContact", "Emergency contact"],
              ["emergencyPhone", "Emergency phone"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="grid gap-1 text-sm font-semibold text-[#0b1f33]">
              {label}
              <input
                className="rounded-xl border border-black/10 bg-white px-3 py-2 font-normal"
                value={medical[key]}
                onChange={(e) => setMedical({ ...medical, [key]: e.target.value })}
              />
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
