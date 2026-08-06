type CaptionDisplayProps = {
  text: string;
  interim?: string;
  label?: string;
};

export function CaptionDisplay({
  text,
  interim,
  label = "Live caption",
}: CaptionDisplayProps) {
  const shown = text || interim || "Listening…";
  return (
    <section
      aria-live="polite"
      aria-label={label}
      className="lb-panel min-h-[160px] p-6"
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#0f8b8d]">
        {label}
      </p>
      <p className={`lb-caption text-[#0b1f33] ${interim && !text ? "opacity-70" : ""}`}>
        {shown}
      </p>
    </section>
  );
}
