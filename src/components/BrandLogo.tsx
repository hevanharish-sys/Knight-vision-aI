import Image from "next/image";
import Link from "next/link";

type BrandLogoProps = {
  /** Compact KV wordmark for headers; full knight emblem for brand moments */
  variant?: "wordmark" | "emblem";
  /** Pass `null` to render without a link */
  href?: string | null;
  className?: string;
  /** Emblem / wordmark height in px */
  height?: number;
  priority?: boolean;
};

export function BrandLogo({
  variant = "wordmark",
  href = "/",
  className = "",
  height = 36,
  priority = false,
}: BrandLogoProps) {
  const isEmblem = variant === "emblem";
  const src = isEmblem
    ? "/knight-vision-logo.png"
    : "/knight-vision-wordmark.png";
  const width = isEmblem ? Math.round(height * 1.05) : Math.round(height * 4.2);

  const img = (
    <Image
      src={src}
      alt="Knight Vision AI — Your AI Eyes to the World"
      width={width}
      height={height}
      priority={priority}
      className={`object-contain ${isEmblem ? "rounded-xl" : ""} ${className}`}
      style={{ height, width: "auto", maxWidth: "none" }}
      sizes={`${width}px`}
    />
  );

  if (href === null) return img;

  return (
    <Link
      href={href ?? "/"}
      className="inline-flex shrink-0 items-center"
      aria-label="Knight Vision AI home"
    >
      {img}
    </Link>
  );
}
