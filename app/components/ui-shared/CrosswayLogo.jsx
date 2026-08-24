"use client";

import { cn } from "@/lib/utils";

const LOCKUP = "/brand/roboseo-lockup.png";

/**
 * RoboSEO.Ai mark + lockup, cropped from the official promotional graphic.
 * `mark` — square crop of the robot (sidebar chrome).
 * `lockup` — robot + wordmark crop (auth, emails).
 */
export default function BrandLogo({
  variant = "mark",
  size = 36,
  className,
  imgClassName,
  alt = "RoboSEO.Ai",
}) {
  const lockup = variant === "lockup";
  const width = lockup ? Math.round(size * 4.4) : size;
  const height = lockup ? Math.round(size * 2.55) : size;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden",
        lockup ? "rounded-xl ring-1 ring-[var(--cw-hairline)] bg-[#050b18]" : "rounded-lg bg-[#050b18]",
        className
      )}
      style={{ width, height }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={LOCKUP}
        alt={alt}
        width={width}
        height={height}
        className={cn(
          "h-full w-full",
          lockup
            ? "object-cover object-[center_18%]"
            : "scale-[1.65] object-cover object-[center_8%]",
          imgClassName
        )}
      />
    </span>
  );
}

export function RoboSeoWordmark({ className, tagline = true }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="font-heading truncate text-sm font-bold leading-tight tracking-tight text-[var(--cw-ink)]">
        Robo
        <span className="bg-gradient-to-b from-[#4DC4FF] to-[#00A3FF] bg-clip-text text-transparent">
          SEO
        </span>
        <span className="text-[0.85em] font-semibold text-[var(--cw-ink)]">.Ai</span>
      </p>
      {tagline ? (
        <p className="truncate text-[11px] tracking-wide text-[var(--cw-ink-faint)]">
          AI powered SEO &amp; SMM Automation
        </p>
      ) : null}
    </div>
  );
}

/** @deprecated Use BrandLogo. Kept so existing imports keep working. */
export { BrandLogo as CrosswayLogo };
