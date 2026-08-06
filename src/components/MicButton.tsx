"use client";

type MicButtonProps = {
  listening: boolean;
  onClick: () => void;
  disabled?: boolean;
  labelListen?: string;
  labelStop?: string;
};

export function MicButton({
  listening,
  onClick,
  disabled,
  labelListen = "Start listening",
  labelStop = "Stop listening",
}: MicButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={listening}
      className={`lb-btn relative min-w-[180px] overflow-hidden ${
        listening ? "lb-btn-secondary lb-listen-glow" : "lb-btn-primary"
      } disabled:opacity-50`}
    >
      <span
        className={`grid h-2.5 w-2.5 place-items-center rounded-full ${
          listening ? "bg-[#e4572e]" : "bg-white"
        }`}
        aria-hidden
      />
      {listening ? labelStop : labelListen}
    </button>
  );
}
