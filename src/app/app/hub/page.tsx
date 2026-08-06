"use client";

import { useEffect, useState } from "react";
import { clearHub, loadHubEntries, type HubEntry } from "@/lib/hub";

export default function HubPage() {
  const [entries, setEntries] = useState<HubEntry[]>([]);

  useEffect(() => {
    const refresh = () => setEntries(loadHubEntries());
    refresh();
    window.addEventListener("knight-vision-hub-updated", refresh);
    return () => window.removeEventListener("knight-vision-hub-updated", refresh);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#0f8b8d]">
            Conversation hub
          </p>
          <h1 className="lb-display mt-2 text-4xl text-[#0b1f33]">
            Previous conversations
          </h1>
          <p className="mt-2 max-w-2xl text-[#486581]">
            Translated chats, hospital transcripts, vision notes, and SOS events — useful
            for doctors, caregivers, and family. Stored locally on this device.
          </p>
        </div>
        <button
          type="button"
          className="lb-btn lb-btn-ghost"
          onClick={() => {
            clearHub();
            setEntries([]);
          }}
        >
          Clear hub
        </button>
      </div>

      <ul className="space-y-3">
        {entries.length === 0 ? (
          <li className="lb-panel p-6 text-[#486581]">No entries yet. Use a module to begin.</li>
        ) : (
          entries.map((entry) => (
            <li key={entry.id} className="lb-panel p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="lb-display text-xl text-[#0b1f33]">{entry.title}</h2>
                <span className="rounded-full bg-[#0b1f33] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                  {entry.type}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-[#486581]">{entry.content}</p>
              <p className="mt-3 text-xs text-[#0f8b8d]">
                {new Date(entry.createdAt).toLocaleString()}
              </p>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
