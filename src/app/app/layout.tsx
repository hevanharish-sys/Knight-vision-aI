"use client";

import { AppShell } from "@/components/AppShell";
import { useProfile } from "@/lib/profile";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { ready } = useProfile();

  // Don't block the shell on first paint — profile hydrates in the background.
  return (
    <AppShell>
      {ready ? (
        children
      ) : (
        <div className="grid min-h-[40vh] place-items-center text-sm text-[#737373]">
          Loading…
        </div>
      )}
    </AppShell>
  );
}
