"use client";

/**
 * StatTile — one number, said once, properly.
 *
 * The number is the loudest thing on the tile; the label is quiet and above it;
 * the delta is a small tinted chip. `accent` promotes the number to neon — use
 * it for the single figure that matters most in a row, not for all of them.
 */

import { cn } from "@/lib/utils";

export default function StatTile({
  label,
  value,
  unit,
  hint,
  delta,
  deltaDirection,
  icon: Icon,
  accent = false,
  size = "md",
  className = "",
  ...rest
}) {
  const dir =
    deltaDirection ||
    (typeof delta === "number" ? (delta > 0 ? "up" : delta < 0 ? "down" : "flat") : "flat");

  const deltaText =
    typeof delta === "number" ? `${delta > 0 ? "+" : ""}${delta}` : delta ? String(delta) : null;

  return (
    <div
      className={cn(
        "cw-lit group relative overflow-hidden rounded-2xl border border-[var(--cw-hairline)]",
        "bg-[var(--cw-surface)] transition-smooth hover:border-[var(--cw-hairline-strong)]",
        size === "sm" ? "px-3.5 py-3" : "px-4 py-3.5",
        className
      )}
      {...rest}
    >
      <div className="flex items-center gap-1.5">
        {Icon ? <Icon className="size-3 shrink-0 text-[var(--cw-ink-faint)]" aria-hidden /> : null}
        <p className="truncate text-[10px] font-bold tracking-[0.12em] text-[var(--cw-ink-faint)] uppercase">
          {label}
        </p>
      </div>

      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span
          className={cn(
            "font-heading leading-none font-semibold tabular-nums",
            size === "sm" ? "text-xl" : "text-[26px]",
            accent ? "text-[var(--cw-neon)]" : "text-[var(--cw-ink)]"
          )}
        >
          {value ?? "—"}
        </span>
        {unit ? (
          <span className="text-xs font-semibold text-[var(--cw-ink-faint)]">{unit}</span>
        ) : null}
        {deltaText ? (
          <span
            className={cn(
              "ml-auto rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums",
              dir === "up" &&
                "bg-[color-mix(in_srgb,var(--cw-neon)_13%,transparent)] text-[var(--cw-neon)]",
              dir === "down" &&
                "bg-[color-mix(in_srgb,var(--cw-danger)_13%,transparent)] text-[var(--cw-danger)]",
              dir === "flat" && "bg-[var(--cw-raised)] text-[var(--cw-ink-muted)]"
            )}
          >
            {deltaText}
          </span>
        ) : null}
      </div>

      {hint ? (
        <p className="mt-1.5 truncate text-[11px] text-[var(--cw-ink-muted)]" title={hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
