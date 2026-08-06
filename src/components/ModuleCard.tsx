import Link from "next/link";

type ModuleCardProps = {
  href: string;
  title: string;
  description: string;
  badge?: string;
  highlight?: boolean;
  icon?: string;
  tone?: "dark" | "teal" | "light";
  delay?: number;
  large?: boolean;
  shortcut?: string;
  action?: string;
  index?: number;
};

export function ModuleCard({
  href,
  title,
  description,
  badge,
  highlight,
  icon = "◆",
  tone = "light",
  delay = 0,
  large = false,
  shortcut,
  action = "Open",
  index,
}: ModuleCardProps) {
  const dark = tone === "dark";
  const teal = tone === "teal";

  return (
    <Link
      href={href}
      className={`lb-slide-up lb-module-card group relative flex flex-col overflow-hidden rounded-[1.75rem] border p-5 outline-none transition duration-300 ease-out hover:-translate-y-2.5 focus-visible:ring-4 focus-visible:ring-[#19b5b8]/45 sm:p-6 ${
        large ? "min-h-[250px] sm:min-h-[270px]" : "min-h-[190px]"
      } ${
        dark
          ? "border-white/5 bg-[#0b1f33] text-white shadow-[0_22px_50px_rgba(11,31,51,0.28)] hover:shadow-[0_32px_70px_rgba(11,31,51,0.42)]"
          : teal
            ? "border-transparent bg-gradient-to-br from-[#0f8b8d] via-[#149ea1] to-[#19b5b8] text-white shadow-[0_22px_50px_rgba(15,139,141,0.3)] hover:shadow-[0_32px_70px_rgba(15,139,141,0.48)]"
            : "border-black/5 bg-white/92 text-[#0b1f33] shadow-[0_16px_40px_rgba(11,31,51,0.08)] backdrop-blur-xl hover:border-[#19b5b8]/40 hover:shadow-[0_28px_55px_rgba(15,139,141,0.18)]"
      } ${
        highlight
          ? "ring-2 ring-[#19b5b8] ring-offset-2 ring-offset-[#eef6f8] lb-highlight-glow"
          : ""
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <span
        className="pointer-events-none absolute inset-0 -translate-x-[120%] skew-x-[-18deg] bg-gradient-to-r from-transparent via-white/20 to-transparent transition duration-700 ease-out group-hover:translate-x-[120%]"
        aria-hidden
      />

      <div
        className={`pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl transition duration-500 group-hover:scale-[1.35] group-hover:opacity-100 ${
          dark
            ? "bg-[#19b5b8]/30 opacity-60"
            : teal
              ? "bg-white/25 opacity-70"
              : "bg-[#19b5b8]/22 opacity-50"
        }`}
        aria-hidden
      />

      {index != null ? (
        <span
          className={`pointer-events-none absolute -right-1 bottom-2 select-none font-black opacity-[0.07] transition duration-500 group-hover:opacity-[0.14] lb-display ${
            large ? "text-8xl" : "text-7xl"
          }`}
          aria-hidden
        >
          {index}
        </span>
      ) : null}

      <div className="relative flex items-start justify-between gap-3">
        <span
          className={`lb-module-icon grid h-12 w-12 place-items-center rounded-2xl text-xl font-bold transition duration-300 group-hover:scale-110 group-hover:-rotate-6 ${
            dark || teal
              ? "bg-white/15 shadow-inner"
              : "bg-[#eef6f8] text-[#0f8b8d] shadow-sm"
          }`}
          aria-hidden
        >
          {icon}
        </span>
        <div className="flex flex-col items-end gap-1.5">
          {highlight ? (
            <span className="lb-badge-pulse rounded-full bg-[#19b5b8] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
              For you
            </span>
          ) : null}
          {badge ? (
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                dark || teal
                  ? "bg-white/15 text-white"
                  : "bg-[#0b1f33] text-white"
              }`}
            >
              {badge}
            </span>
          ) : null}
        </div>
      </div>

      <h3
        className={`lb-display relative mt-5 transition duration-300 ${
          large ? "text-2xl sm:text-3xl" : "text-xl"
        } ${dark || teal ? "text-white" : "text-[#0b1f33] group-hover:text-[#0f8b8d]"}`}
      >
        {title}
      </h3>
      <p
        className={`relative mt-2 flex-1 text-sm leading-relaxed ${
          dark || teal ? "text-white/75" : "text-[#486581]"
        }`}
      >
        {description}
      </p>

      <div className="relative mt-5 flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold transition-all duration-300 group-hover:gap-3 group-hover:pr-4 ${
            dark || teal
              ? "bg-white/15 text-[#7ef0f2]"
              : "bg-[#eef6f8] text-[#0f8b8d] group-hover:bg-[#0f8b8d] group-hover:text-white"
          }`}
        >
          {action}
          <span className="transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden>
            →
          </span>
        </span>
        {shortcut ? (
          <span
            className={`rounded-lg px-2 py-1 font-mono text-[11px] font-bold transition group-hover:scale-105 ${
              dark || teal
                ? "bg-black/20 text-white/70"
                : "bg-[#0b1f33]/5 text-[#486581]"
            }`}
          >
            {shortcut}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
