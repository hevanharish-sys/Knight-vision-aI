export type HubEntryType =
  | "speech"
  | "sign"
  | "vision"
  | "translate"
  | "document"
  | "sos";

export type HubEntry = {
  id: string;
  type: HubEntryType;
  title: string;
  content: string;
  createdAt: string;
  meta?: Record<string, string>;
};

const HUB_KEY = "knight-vision-hub";

export function loadHubEntries(): HubEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HUB_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HubEntry[];
  } catch {
    return [];
  }
}

export function saveHubEntry(
  entry: Omit<HubEntry, "id" | "createdAt"> & { id?: string; createdAt?: string }
) {
  const next: HubEntry = {
    id: entry.id ?? crypto.randomUUID(),
    createdAt: entry.createdAt ?? new Date().toISOString(),
    type: entry.type,
    title: entry.title,
    content: entry.content,
    meta: entry.meta,
  };
  const existing = loadHubEntries();
  const updated = [next, ...existing].slice(0, 100);
  localStorage.setItem(HUB_KEY, JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent("knight-vision-hub-updated"));
  return next;
}

export function clearHub() {
  localStorage.removeItem(HUB_KEY);
  window.dispatchEvent(new CustomEvent("knight-vision-hub-updated"));
}
