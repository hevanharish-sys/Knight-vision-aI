/** Map Knight Vision language names → ISO codes for MyMemory fallback. */
const LANG_CODES: Record<string, string> = {
  English: "en",
  Hindi: "hi",
  Tamil: "ta",
  Telugu: "te",
  Malayalam: "ml",
  Kannada: "kn",
  auto: "autodetect",
  "auto-detect": "autodetect",
};

export function langToCode(name: string) {
  return LANG_CODES[name] || name.slice(0, 2).toLowerCase() || "en";
}

/**
 * Free public fallback when Gemini is rate-limited.
 * Uses MyMemory Translation API (no key required for light use).
 */
export async function fallbackTranslate(options: {
  text: string;
  sourceLang: string;
  targetLang: string;
}): Promise<string | null> {
  const q = options.text.trim().slice(0, 450);
  if (!q) return null;

  const from = langToCode(options.sourceLang || "English");
  const to = langToCode(options.targetLang);
  if (!to || to === "autodetect") return null;

  const pair =
    from === "autodetect" || from === to ? `en|${to}` : `${from}|${to}`;

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${pair}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      responseData?: { translatedText?: string };
      responseStatus?: number;
    };
    const text = data.responseData?.translatedText?.trim();
    if (!text || text.toUpperCase() === "INVALID LANGUAGE PAIR SUPPORTED") {
      return null;
    }
    // MyMemory sometimes echoes QUERY LENGTH LIMIT messages
    if (/MYMEMORY WARNING/i.test(text)) return null;
    return text;
  } catch {
    return null;
  }
}
