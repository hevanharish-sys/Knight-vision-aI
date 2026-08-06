"use client";

export type OrbMode = "idle" | "speaking" | "listening" | "thinking" | "error" | "ready";

type Props = {
  mode: OrbMode;
  size?: number;
  className?: string;
};

/**
 * Siri / Bixby–style animated AI orb — no text labels.
 * Patterns change by assistant state.
 */
export function AssistantOrb({ mode, size = 128, className = "" }: Props) {
  const label =
    mode === "listening"
      ? "Assistant listening"
      : mode === "speaking"
        ? "Assistant speaking"
        : mode === "thinking"
          ? "Assistant thinking"
          : mode === "error"
            ? "Assistant needs input"
            : mode === "ready"
              ? "Assistant ready"
              : "Assistant idle";

  return (
    <div
      className={`lb-ai-orb lb-ai-orb--${mode} ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      {/* Outer reactive rings */}
      <span className="lb-ai-ring lb-ai-ring--a" aria-hidden />
      <span className="lb-ai-ring lb-ai-ring--b" aria-hidden />
      <span className="lb-ai-ring lb-ai-ring--c" aria-hidden />

      {/* Soft glow aura */}
      <span className="lb-ai-aura" aria-hidden />

      {/* Core sphere with swirling layers */}
      <span className="lb-ai-core" aria-hidden>
        <span className="lb-ai-swirl lb-ai-swirl--1" />
        <span className="lb-ai-swirl lb-ai-swirl--2" />
        <span className="lb-ai-swirl lb-ai-swirl--3" />
        <span className="lb-ai-blob lb-ai-blob--1" />
        <span className="lb-ai-blob lb-ai-blob--2" />
        <span className="lb-ai-blob lb-ai-blob--3" />
        <span className="lb-ai-shine" />
      </span>

      {/* Listening waveform arcs */}
      {mode === "listening" ? (
        <span className="lb-ai-wave-wrap" aria-hidden>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className="lb-ai-wave"
              style={{ animationDelay: `${i * 0.08}s` }}
            />
          ))}
        </span>
      ) : null}
    </div>
  );
}

export function orbModeFromAssistant(state: {
  listening: boolean;
  busy: boolean;
  phase: string;
}): OrbMode {
  if (state.listening) return "listening";
  if (state.phase === "error") return "error";
  if (state.phase === "ready" || state.phase === "idle") {
    return state.busy ? "thinking" : state.phase === "ready" ? "ready" : "idle";
  }
  if (state.busy) {
    // Speaking TTS or processing between turns
    return "speaking";
  }
  return "idle";
}
