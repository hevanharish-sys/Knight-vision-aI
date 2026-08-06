"use client";

type SignAvatarProps = {
  phrase: string;
};

/** Lightweight CSS “3D” avatar cue for reverse communication wow-factor. */
export function SignAvatar({ phrase }: SignAvatarProps) {
  const pose =
    phrase.includes("HELP") || phrase.includes("help")
      ? "help"
      : phrase.includes("PAIN") || phrase.includes("pain")
        ? "pain"
        : phrase.includes("YES") || phrase.includes("yes")
          ? "yes"
          : phrase.includes("WATER") || phrase.includes("water")
            ? "water"
            : "idle";

  return (
    <div className="lb-panel flex flex-col items-center justify-center p-6">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#0f8b8d]">
        Sign avatar cue
      </p>
      <div className="lb-float relative h-40 w-28">
        <div className="absolute inset-x-6 top-0 h-14 rounded-full bg-gradient-to-b from-[#f2d0b0] to-[#e2b992] shadow-lg" />
        <div className="absolute inset-x-4 top-12 h-24 rounded-[2rem] bg-gradient-to-b from-[#0f8b8d] to-[#0b1f33] shadow-xl" />
        <div
          className={`absolute h-10 w-10 rounded-full bg-[#f2d0b0] shadow-md transition-all duration-500 ${
            pose === "help"
              ? "left-[-8px] top-16 rotate-[-25deg]"
              : pose === "pain"
                ? "left-8 top-20"
                : pose === "yes"
                  ? "right-[-6px] top-14 rotate-[30deg]"
                  : pose === "water"
                    ? "right-0 top-16 rotate-[10deg]"
                    : "right-[-4px] top-18"
          }`}
          aria-hidden
        />
        <div
          className={`absolute h-10 w-10 rounded-full bg-[#f2d0b0] shadow-md transition-all duration-500 ${
            pose === "help"
              ? "right-[-8px] top-16 rotate-[25deg]"
              : "left-[-4px] top-18"
          }`}
          aria-hidden
        />
      </div>
      <p className="mt-4 text-center text-sm font-semibold text-[#0b1f33]">
        {phrase || "Waiting for speech…"}
      </p>
    </div>
  );
}
