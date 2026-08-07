export type SpeechRecognitionResultLike = {
  transcript: string;
  isFinal: boolean;
};

type RecognitionCtor = new () => SpeechRecognitionLike;

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives?: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
    length: number;
    [index: number]: { transcript: string };
  }>;
};

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported() {
  return Boolean(getRecognitionCtor());
}

export function isSpeechSynthesisSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function createSpeechRecognition(options: {
  lang?: string;
  continuous?: boolean;
  onResult: (result: SpeechRecognitionResultLike) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
  onStart?: () => void;
}) {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    throw new Error("Speech recognition is not supported in this browser");
  }

  const recognition = new Ctor();
  recognition.continuous = options.continuous ?? true;
  recognition.interimResults = true;
  recognition.lang = options.lang ?? "en-IN";
  if (typeof recognition.maxAlternatives === "number") {
    recognition.maxAlternatives = 5;
  }

  recognition.onstart = () => options.onStart?.();

  recognition.onresult = (event) => {
    let interim = "";
    let finalText = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const item = event.results[i];
      // Prefer top alternative; keep shorter digit-like alts if useful
      let piece = (item[0]?.transcript || "").trim();
      if (item.length > 1) {
        for (let a = 1; a < Math.min(item.length, 5); a += 1) {
          const alt = (item[a]?.transcript || "").trim();
          if (!alt) continue;
          if (/^[1-7]$/.test(alt) || /^(one|two|three|four|five|six|seven|yes|no)$/i.test(alt)) {
            piece = alt;
            break;
          }
        }
      }
      if (!piece) continue;
      if (item.isFinal) finalText = finalText ? `${finalText} ${piece}` : piece;
      else interim = interim ? `${interim} ${piece}` : piece;
    }
    if (finalText) {
      options.onResult({ transcript: finalText, isFinal: true });
    }
    if (interim) {
      options.onResult({ transcript: interim, isFinal: false });
    }
  };

  recognition.onerror = (event) => {
    options.onError?.(event.error);
  };

  recognition.onend = () => {
    options.onEnd?.();
  };

  return recognition;
}

/** Errors that should not surface as hard failures during live captions. */
export function isBenignSpeechError(error: string) {
  const e = error.toLowerCase();
  return (
    e === "no-speech" ||
    e === "aborted" ||
    e === "network" ||
    e.includes("quota")
  );
}

export function humanizeSpeechError(error: string) {
  const e = error.toLowerCase();
  if (e === "not-allowed" || e === "service-not-allowed") {
    return "Microphone permission denied. Allow mic access in the browser and try again.";
  }
  if (e === "audio-capture") {
    return "No microphone found. Plug in a mic and try again.";
  }
  if (e === "network") {
    return "Speech service network error. Check your connection, or use Gemini clip.";
  }
  return `Speech error: ${error}`;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** Chrome often pauses speechSynthesis; nudge it. */
function kickSpeechSynthesis() {
  if (!isSpeechSynthesisSupported()) return;
  try {
    window.speechSynthesis.resume();
  } catch {
    /* ignore */
  }
}

/** Prefer natural / neural English voices when the browser provides them. */
export function pickElegantVoice(
  langHint = "en"
): SpeechSynthesisVoice | null {
  if (!isSpeechSynthesisSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const english = voices.filter((v) =>
    v.lang.toLowerCase().startsWith(langHint.toLowerCase().slice(0, 2))
  );
  const pool = english.length ? english : voices;

  const preferred = [
    /google us english/i,
    /microsoft aria/i,
    /microsoft jenny/i,
    /microsoft guy/i,
    /microsoft natasha/i,
    /samantha/i,
    /karen/i,
    /moira/i,
    /daniel/i,
    /natural/i,
    /neural/i,
    /premium/i,
  ];

  for (const re of preferred) {
    const hit = pool.find((v) => re.test(v.name));
    if (hit) return hit;
  }

  return (
    pool.find((v) => /en-US/i.test(v.lang)) ||
    pool.find((v) => /en-GB/i.test(v.lang)) ||
    pool.find((v) => /en-IN/i.test(v.lang)) ||
    pool[0] ||
    null
  );
}

/** Ensure voice list is loaded (Chrome loads async). */
export function ensureVoicesLoaded(): Promise<void> {
  if (!isSpeechSynthesisSupported()) return Promise.resolve();
  if (window.speechSynthesis.getVoices().length) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      window.speechSynthesis.onvoiceschanged = null;
      resolve();
    };
    window.speechSynthesis.onvoiceschanged = done;
    window.setTimeout(done, 600);
  });
}

export function speak(
  text: string,
  options?: {
    lang?: string;
    rate?: number;
    pitch?: number;
    volume?: number;
    onEnd?: () => void;
  }
) {
  if (!isSpeechSynthesisSupported() || !text.trim()) {
    options?.onEnd?.();
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const lang = options?.lang ?? "en-US";
  utterance.lang = lang;
  utterance.rate = options?.rate ?? 0.92;
  utterance.pitch = options?.pitch ?? 1.02;
  utterance.volume = options?.volume ?? 1;
  const voice = pickElegantVoice(lang);
  if (voice) utterance.voice = voice;
  utterance.onend = () => options?.onEnd?.();
  utterance.onerror = () => options?.onEnd?.();
  window.speechSynthesis.speak(utterance);
  kickSpeechSynthesis();
}

/** Speak and resolve when the utterance finishes (or fails / times out). */
export function speakAsync(
  text: string,
  options?: { lang?: string; rate?: number; pitch?: number; volume?: number }
): Promise<void> {
  return new Promise((resolve) => {
    if (!isSpeechSynthesisSupported() || !text.trim()) {
      resolve();
      return;
    }

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearInterval(kick);
      window.clearTimeout(safety);
      resolve();
    };

    void ensureVoicesLoaded().then(() => {
      if (done) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const lang = options?.lang ?? "en-US";
      utterance.lang = lang;
      // Slightly slower + warmer = more elegant assistant tone
      utterance.rate = options?.rate ?? 0.9;
      utterance.pitch = options?.pitch ?? 1.05;
      utterance.volume = options?.volume ?? 1;
      const voice = pickElegantVoice(lang);
      if (voice) utterance.voice = voice;
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.speak(utterance);
    });

    const kick = window.setInterval(kickSpeechSynthesis, 250);
    const safety = window.setTimeout(
      finish,
      Math.min(50000, Math.max(2800, text.split(/\s+/).length * 480 + 1800))
    );
  });
}

export type ListenOptions = {
  lang?: string;
  /** Total time to keep the mic open */
  timeoutMs?: number;
  /** Wait after TTS before opening mic (Chrome needs this) */
  delayMs?: number;
  /** Prefer en-US fallback if en-IN returns empty */
  fallbackLang?: string;
  onPartial?: (transcript: string) => void;
  /** Cancel listening early (e.g. user tapped a button) */
  signal?: AbortSignal;
  /**
   * When true, commit as soon as a short digit / yes-no style answer is heard
   * (including strong interim results).
   */
  quickCommit?: (transcript: string) => boolean;
};

/**
 * Robust one-shot listen:
 * - continuous mode for a window (Chrome drops continuous:false often)
 * - accepts final OR best interim transcript
 * - ignores no-speech until timeout
 * - longer post-TTS delay so mic isn't blocked
 * - optional quickCommit for digit / yes-no answers
 */
export async function listenOnce(options?: ListenOptions): Promise<string> {
  const primaryLang = options?.lang ?? "en-US";
  const fallbackLang = options?.fallbackLang ?? "en-IN";
  const timeoutMs = options?.timeoutMs ?? 10000;
  const delayMs = options?.delayMs ?? 700;
  const signal = options?.signal;
  const quickCommit = options?.quickCommit;

  if (!isSpeechRecognitionSupported()) {
    throw new Error("Speech recognition is not supported in this browser");
  }
  if (signal?.aborted) return "";

  if (isSpeechSynthesisSupported()) {
    window.speechSynthesis.cancel();
  }
  await wait(delayMs);
  if (signal?.aborted) return "";

  const attempt = (lang: string) =>
    new Promise<string>((resolve, reject) => {
      let settled = false;
      let recognition: SpeechRecognitionLike | null = null;
      let best = "";
      let hardTimer = 0;
      let silenceTimer = 0;
      let quickTimer = 0;
      let intentionalAbort = false;

      const finish = (value: string, err?: Error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(hardTimer);
        window.clearTimeout(silenceTimer);
        window.clearTimeout(quickTimer);
        signal?.removeEventListener("abort", onAbort);
        try {
          recognition?.stop();
        } catch {
          try {
            recognition?.abort();
          } catch {
            /* ignore */
          }
        }
        recognition = null;
        if (err) reject(err);
        else resolve(value.trim());
      };

      const onAbort = () => {
        intentionalAbort = true;
        finish(best);
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      const scheduleSilenceStop = (ms = 700) => {
        window.clearTimeout(silenceTimer);
        silenceTimer = window.setTimeout(() => {
          if (best) finish(best);
        }, ms);
      };

      const maybeQuickCommit = (text: string, isFinal: boolean) => {
        if (!quickCommit || !text) return;
        if (!quickCommit(text)) return;
        window.clearTimeout(quickTimer);
        // Digits often arrive as interim — commit quickly once stable
        quickTimer = window.setTimeout(
          () => finish(text),
          isFinal ? 80 : 280
        );
      };

      const startAt = Date.now();

      try {
        recognition = createSpeechRecognition({
          lang,
          continuous: true,
          onResult: ({ transcript, isFinal }) => {
            if (!transcript) return;
            // Prefer longer / later transcripts; also keep shorter digit answers
            if (
              transcript.length >= best.length ||
              (quickCommit?.(transcript) && transcript.length <= 12)
            ) {
              best = transcript;
            }
            options?.onPartial?.(best);
            maybeQuickCommit(best, isFinal);
            if (isFinal && transcript.length >= 1) {
              if (quickCommit?.(transcript)) {
                finish(transcript);
                return;
              }
              scheduleSilenceStop(450);
              return;
            }
            scheduleSilenceStop(quickCommit?.(best) ? 350 : 750);
          },
          onError: (error) => {
            if (intentionalAbort || error === "aborted") {
              finish(best);
              return;
            }
            if (error === "no-speech" || error === "audio-capture") {
              return;
            }
            if (error === "not-allowed") {
              finish("", new Error("Microphone permission denied"));
              return;
            }
            finish(best);
          },
          onEnd: () => {
            if (settled || intentionalAbort) return;
            if (Date.now() - startAt < timeoutMs - 400) {
              window.setTimeout(() => {
                if (settled || intentionalAbort) return;
                try {
                  recognition?.start();
                } catch {
                  finish(best);
                }
              }, 180);
              return;
            }
            finish(best);
          },
        });

        if (typeof recognition.maxAlternatives === "number") {
          recognition.maxAlternatives = 5;
        }

        recognition.start();
        hardTimer = window.setTimeout(() => finish(best), timeoutMs);
      } catch (e) {
        finish("", e instanceof Error ? e : new Error("Mic failed"));
      }
    });

  let text = await attempt(primaryLang);
  if (signal?.aborted) return text;
  if (!text && fallbackLang && fallbackLang !== primaryLang) {
    await wait(250);
    if (signal?.aborted) return text;
    text = await attempt(fallbackLang);
  }
  return text;
}

/**
 * Listen with automatic retries + optional spoken prompts between tries.
 */
export async function listenWithRetry(options?: ListenOptions & {
  attempts?: number;
  betweenAttempts?: (attempt: number) => Promise<void>;
}): Promise<string> {
  const attempts = options?.attempts ?? 3;
  let last = "";
  for (let i = 0; i < attempts; i += 1) {
    if (options?.signal?.aborted) return last;
    last = await listenOnce({
      ...options,
      delayMs: i === 0 ? options?.delayMs ?? 950 : 450,
      timeoutMs: options?.timeoutMs ?? 10000,
    });
    if (last.trim()) return last.trim();
    if (options?.signal?.aborted) return last;
    if (i < attempts - 1 && options?.betweenAttempts) {
      await options.betweenAttempts(i + 1);
    }
  }
  return last;
}

/** Warm up mic permission without leaving the stream open (avoids fighting SpeechRecognition). */
export async function warmMicPermission(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return false;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}

/** Sample mic loudness for a short window; use before SpeechRecognition. */
export async function sampleMicLevel(
  ms = 1200
): Promise<{ peak: number; label: string; ok: boolean }> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { peak: 0, label: "", ok: false };
  }
  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const label = stream.getAudioTracks()[0]?.label || "Microphone";
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = new Ctx();
    if (ctx.state === "suspended") await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let peak = 0;
    const start = Date.now();
    while (Date.now() - start < ms) {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      peak = Math.max(peak, Math.sqrt(sum / data.length));
      await wait(50);
    }
    return { peak, label, ok: peak > 0.02 };
  } catch {
    return { peak: 0, label: "", ok: false };
  } finally {
    stream?.getTracks().forEach((t) => t.stop());
    void ctx?.close();
  }
}

export function stopSpeaking() {
  if (isSpeechSynthesisSupported()) {
    window.speechSynthesis.cancel();
  }
}
