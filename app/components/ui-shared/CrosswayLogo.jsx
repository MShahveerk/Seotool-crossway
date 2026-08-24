"use client";

import { cn } from "@/lib/utils";

const MARK = "/brand/roboseo-mark.png";

/**
 * RoboSEO.Ai mark — the isolated robot (not the promotional banner).
 * Pair with `RoboSeoWordmark` for a lockup. `variant` is kept for callers;
 * both `mark` and `lockup` render the robot square.
 */
export default function BrandLogo({
  variant = "mark",
  size = 36,
  className,
  imgClassName,
  alt = "RoboSEO.Ai",
}) {
  const lockup = variant === "lockup";
  const edge = lockup ? Math.max(size, 56) : size;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#050b18]",
        className
      )}
      style={{ width: edge, height: edge }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={MARK}
        alt={alt}
        width={edge}
        height={edge}
        className={cn("h-full w-full object-contain", imgClassName)}
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
