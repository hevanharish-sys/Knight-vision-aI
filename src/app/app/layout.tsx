"use client";

import { AppShell } from "@/components/AppShell";
import { useProfile } from "@/lib/profile";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { ready } = useProfile();

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center text-[#737373]">
        Preparing Knight Vision…
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
