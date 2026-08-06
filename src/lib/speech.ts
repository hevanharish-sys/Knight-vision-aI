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
    recognition.maxAlternatives = 3;
  }

  recognition.onstart = () => options.onStart?.();

  recognition.onresult = (event) => {
    let interim = "";
    let finalText = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const item = event.results[i];
      const piece = (item[0]?.transcript || "").trim();
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

export function speak(
  text: string,
  options?: {
    lang?: string;
    rate?: number;
    pitch?: number;
    onEnd?: () => void;
  }
) {
  if (!isSpeechSynthesisSupported() || !text.trim()) {
    options?.onEnd?.();
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = options?.lang ?? "en-IN";
  utterance.rate = options?.rate ?? 1;
  utterance.pitch = options?.pitch ?? 1;
  utterance.onend = () => options?.onEnd?.();
  utterance.onerror = () => options?.onEnd?.();
  window.speechSynthesis.speak(utterance);
  kickSpeechSynthesis();
}

/** Speak and resolve when the utterance finishes (or fails / times out). */
export function speakAsync(
  text: string,
  options?: { lang?: string; rate?: number; pitch?: number }
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

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = options?.lang ?? "en-IN";
    utterance.rate = options?.rate ?? 0.95;
    utterance.pitch = options?.pitch ?? 1;
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);

    // Keep synthesis unstuck in Chrome
    const kick = window.setInterval(kickSpeechSynthesis, 250);
    // Fallback if onend never fires (~ words * 420ms + buffer)
    const safety = window.setTimeout(
      finish,
      Math.min(45000, Math.max(2500, text.split(/\s+/).length * 420 + 1500))
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
};

/**
 * Robust one-shot listen:
 * - continuous mode for a window (Chrome drops continuous:false often)
 * - accepts final OR best interim transcript
 * - ignores no-speech until timeout
 * - longer post-TTS delay so mic isn't blocked
 */
export async function listenOnce(options?: ListenOptions): Promise<string> {
  // en-US is more reliable for short digits ("one", "two") than en-IN on many PCs
  const primaryLang = options?.lang ?? "en-US";
  const fallbackLang = options?.fallbackLang ?? "en-IN";
  const timeoutMs = options?.timeoutMs ?? 10000;
  const delayMs = options?.delayMs ?? 900;
  const signal = options?.signal;

  if (!isSpeechRecognitionSupported()) {
    throw new Error("Speech recognition is not supported in this browser");
  }
  if (signal?.aborted) return "";

  // Ensure TTS has fully released the audio channel
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
      let intentionalAbort = false;

      const finish = (value: string, err?: Error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(hardTimer);
        window.clearTimeout(silenceTimer);
        signal?.removeEventListener("abort", onAbort);
        try {
          recognition?.abort();
        } catch {
          /* ignore */
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

      const scheduleSilenceStop = () => {
        window.clearTimeout(silenceTimer);
        silenceTimer = window.setTimeout(() => {
          if (best) finish(best);
        }, 900);
      };

      const startAt = Date.now();

      try {
        recognition = createSpeechRecognition({
          lang,
          continuous: true,
          onResult: ({ transcript, isFinal }) => {
            if (!transcript) return;
            if (transcript.length >= best.length) best = transcript;
            options?.onPartial?.(best);
            if (isFinal && transcript.length >= 1) {
              finish(transcript);
              return;
            }
            scheduleSilenceStop();
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
              }, 200);
              return;
            }
            finish(best);
          },
        });

        recognition.start();
        hardTimer = window.setTimeout(() => finish(best), timeoutMs);
      } catch (e) {
        finish("", e instanceof Error ? e : new Error("Mic failed"));
      }
    });

  let text = await attempt(primaryLang);
  if (signal?.aborted) return text;
  if (!text && fallbackLang && fallbackLang !== primaryLang) {
    await wait(300);
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
