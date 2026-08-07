"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { GuideAssistant } from "@/components/GuideAssistant";
import { ProfileSwitcher } from "@/components/ProfileSwitcher";
import { SOSButton } from "@/components/SOSButton";
import { VoiceNavOrb } from "@/components/VoiceNavOrb";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/profile";

const NAV = [
  { href: "/app", label: "Home" },
  { href: "/app/speech", label: "Speech" },
  { href: "/app/sign", label: "Sign" },
  { href: "/app/vision", label: "Vision" },
  { href: "/app/translate", label: "Translate" },
  { href: "/app/document", label: "Docs" },
  { href: "/app/hub", label: "Hub" },
];

const PREFETCH_ROUTES = [
  "/app",
  "/app/easy",
  "/app/speech",
  "/app/sign",
  "/app/vision",
  "/app/translate",
  "/app/document",
  "/app/hub",
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  return pathname.startsWith(href);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile } = useProfile();
  const { user } = useAuth();
  const easyUser = profile === "blind" || profile === "low-vision";
  const wide =
    pathname.startsWith("/app/sign") || pathname.startsWith("/app/vision");
  const onHome = pathname === "/app";
  const showGuide = !onHome;

  useEffect(() => {
    for (const href of PREFETCH_ROUTES) {
      router.prefetch(href);
    }
  }, [router]);

  const navItems = easyUser
    ? [
        { href: "/app/easy", label: "Easy" },
        { href: "/app/vision", label: "Vision" },
        { href: "/app/speech", label: "Speech" },
        { href: "/app/document", label: "Docs" },
        { href: "/app/translate", label: "Translate" },
        { href: "/app", label: "Home" },
        { href: "/app/hub", label: "Hub" },
      ]
    : NAV;

  return (
    <div className="relative min-h-screen min-h-[100dvh] bg-white text-black">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="lb-bg-blob absolute -left-24 top-24 h-72 w-72 rounded-full bg-[#5E0ED7]/10 blur-3xl" />
        <div
          className="lb-bg-blob absolute -right-20 top-40 h-80 w-80 rounded-full bg-[#7C3AED]/08 blur-3xl"
          style={{ animationDelay: "2s" }}
        />
      </div>

      <header className="kv-safe-top sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur-2xl">
        <div
          className={`mx-auto flex items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-4 ${
            wide ? "max-w-[1400px]" : "max-w-6xl"
          }`}
        >
          <BrandLogo
            variant="emblem"
            height={44}
            href={easyUser ? "/app/easy" : "/app"}
          />

          <nav
            className="hidden items-center gap-1 rounded-full border border-black/5 bg-white/90 p-1 shadow-sm lg:flex"
            aria-label="App"
          >
            {navItems.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch
                  className={`relative rounded-full px-3.5 py-2 text-[13px] font-semibold uppercase tracking-wide transition-colors duration-100 ${
                    active
                      ? "bg-black text-white shadow"
                      : "text-[#737373] hover:bg-[#FAFAFA] hover:text-black"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {user ? (
              <span className="hidden max-w-[8rem] truncate rounded-full border border-black/8 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-black shadow-sm sm:inline-flex">
                {user.name}
              </span>
            ) : null}
            <ProfileSwitcher />
            <SOSButton compact />
          </div>
        </div>

        <div className="kv-scroll-x flex gap-1.5 px-3 pb-3 lg:hidden">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-4 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors duration-100 ${
                  active
                    ? "bg-black text-white"
                    : "bg-[#FAFAFA] text-black shadow-sm"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </header>

      <div
        className={`mx-auto w-full px-3 py-4 sm:px-4 sm:py-6 ${
          wide ? "max-w-[1400px]" : "max-w-6xl"
        } ${onHome ? "pb-10" : ""} kv-safe-bottom`}
      >
        <main>{children}</main>
      </div>

      {showGuide ? <GuideAssistant /> : null}
      <VoiceNavOrb />
    </div>
  );
}
