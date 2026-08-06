"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  PROFILE_OPTIONS,
  useProfile,
  type AccessibilityProfile,
} from "@/lib/profile";
import { speak } from "@/lib/speech";

const PROFILE_META: Record<
  AccessibilityProfile,
  { icon: string; hint: string; accent: string }
> = {
  blind: { icon: "◎", hint: "Listen & speak", accent: "bg-[#0b1f33]" },
  deaf: { icon: "✋", hint: "See & sign", accent: "bg-[#0f8b8d]" },
  speech: { icon: "⌨", hint: "Type & sign", accent: "bg-[#1d4e89]" },
  "low-vision": { icon: "◈", hint: "Bigger UI", accent: "bg-[#0b1f33]" },
  senior: { icon: "＋", hint: "Easy pace", accent: "bg-[#486581]" },
  autism: { icon: "◻", hint: "Steady UI", accent: "bg-[#2a9d8f]" },
  none: { icon: "◆", hint: "Everything", accent: "bg-[#0f8b8d]" },
};

export function ProfileSwitcher() {
  const { profile, setProfile } = useProfile();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const active = (profile || "none") as AccessibilityProfile;
  const current = PROFILE_OPTIONS.find((p) => p.id === active) || PROFILE_OPTIONS[6];
  const meta = PROFILE_META[active];

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

  function pick(id: AccessibilityProfile) {
    if (id === active) {
      setOpen(false);
      return;
    }
    setProfile(id);
    setOpen(false);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 700);

    const label = PROFILE_OPTIONS.find((p) => p.id === id)?.label || id;
    setToast(`Switched to ${label}`);

    // Short confirm only — full voice guidance stays on Home
    if (id === "blind" || id === "low-vision" || id === "senior") {
      speak(`Mode set to ${label}.`, { lang: "en-IN" });
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={`group flex items-center gap-2 rounded-full border border-black/8 bg-white py-1.5 pl-1.5 pr-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] ${
          flash ? "lb-profile-flash" : ""
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className={`grid h-8 w-8 place-items-center rounded-full text-sm font-black text-white transition group-hover:scale-105 ${meta.accent}`}
          aria-hidden
        >
          {meta.icon}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[#486581]">
            Mode
          </span>
          <span className="block text-sm font-bold leading-none text-[#0b1f33]">
            {current.label}
          </span>
        </span>
        <span
          className={`ml-0.5 text-[#486581] transition duration-300 sm:ml-1 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        >
          ▾
        </span>
      </button>

      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Comfort mode"
          className="lb-menu-pop absolute right-0 z-50 mt-2 w-[min(92vw,320px)] overflow-hidden rounded-2xl border border-black/8 bg-white/95 p-1.5 shadow-[0_24px_60px_rgba(11,31,51,0.22)] backdrop-blur-xl"
        >
          <p className="px-3 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#0f8b8d]">
            Choose your comfort mode
          </p>
          {PROFILE_OPTIONS.map((opt, i) => {
            const selected = opt.id === active;
            const m = PROFILE_META[opt.id];
            return (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => pick(opt.id)}
                className={`lb-menu-item flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition ${
                  selected
                    ? "bg-[#0b1f33] text-white"
                    : "text-[#0b1f33] hover:bg-[#eef6f8]"
                }`}
                style={{ animationDelay: `${i * 35}ms` }}
              >
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-bold ${
                    selected ? "bg-white/15 text-[#7ef0f2]" : `${m.accent} text-white`
                  }`}
                  aria-hidden
                >
                  {m.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold">{opt.label}</span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wide ${
                        selected ? "text-[#7ef0f2]" : "text-[#0f8b8d]"
                      }`}
                    >
                      {m.hint}
                    </span>
                  </span>
                  <span
                    className={`mt-0.5 block text-xs leading-snug ${
                      selected ? "text-white/70" : "text-[#486581]"
                    }`}
                  >
                    {opt.description}
                  </span>
                </span>
                {selected ? (
                  <span className="shrink-0 text-[#7ef0f2]" aria-hidden>
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {toast ? (
        <div
          className="lb-toast-in pointer-events-none absolute right-0 top-[calc(100%+0.6rem)] z-50 whitespace-nowrap rounded-full bg-[#0b1f33] px-3.5 py-2 text-xs font-bold text-white shadow-lg"
          role="status"
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}
