"use client";

/** Ethereal lotus / flower bloom — Knight Vision purple glow (Veldara-style centerpiece). */
export function EtherealBloom({ className = "" }: { className?: string }) {
  return (
    <div className={`lb-bloom pointer-events-none ${className}`} aria-hidden>
      <div className="lb-bloom-glow" />
      <svg
        className="lb-bloom-svg"
        viewBox="0 0 400 400"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer petals */}
        {Array.from({ length: 8 }).map((_, i) => (
          <ellipse
            key={`o-${i}`}
            className="lb-bloom-petal lb-bloom-petal--outer"
            cx="200"
            cy="200"
            rx="48"
            ry="150"
            transform={`rotate(${i * 45} 200 200)`}
            style={{ animationDelay: `${i * 0.12}s` }}
          />
        ))}
        {/* Mid petals */}
        {Array.from({ length: 8 }).map((_, i) => (
          <ellipse
            key={`m-${i}`}
            className="lb-bloom-petal lb-bloom-petal--mid"
            cx="200"
            cy="200"
            rx="36"
            ry="118"
            transform={`rotate(${i * 45 + 22.5} 200 200)`}
            style={{ animationDelay: `${i * 0.1}s` }}
          />
        ))}
        {/* Inner petals */}
        {Array.from({ length: 6 }).map((_, i) => (
          <ellipse
            key={`i-${i}`}
            className="lb-bloom-petal lb-bloom-petal--inner"
            cx="200"
            cy="200"
            rx="28"
            ry="78"
            transform={`rotate(${i * 60} 200 200)`}
            style={{ animationDelay: `${i * 0.08}s` }}
          />
        ))}
        <circle className="lb-bloom-center" cx="200" cy="200" r="22" />
        <circle className="lb-bloom-center-core" cx="200" cy="200" r="10" />
      </svg>
      {/* Floating petal shards */}
      <span className="lb-bloom-drift lb-bloom-drift--1" />
      <span className="lb-bloom-drift lb-bloom-drift--2" />
    </div>
  );
}
