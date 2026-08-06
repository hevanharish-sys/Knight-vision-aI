import Image from "next/image";
import Link from "next/link";

type BrandLogoProps = {
  /** Kept for call-site compatibility */
  variant?: "emblem" | "wordmark" | "mark";
  /** Pass `null` to render without a link */
  href?: string | null;
  className?: string;
  /** Logo height in px */
  height?: number;
  priority?: boolean;
};

/** Site logo — public/image.png (cache-busted) */
const LOGO_SRC = "/image.png?v=20260806b";
const LOGO_ASPECT = 641 / 547;

export function BrandLogo({
  variant: _variant = "emblem",
  href = "/",
  className = "",
  height = 44,
  priority = false,
}: BrandLogoProps) {
  void _variant;
  const width = Math.round(height * LOGO_ASPECT);

  const img = (
    <Image
      src={LOGO_SRC}
      alt="Knight Vision AI"
      width={width}
      height={height}
      priority={priority}
      unoptimized
      className={`object-contain ${className}`}
      style={{ height, width: "auto", maxWidth: "100%" }}
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
