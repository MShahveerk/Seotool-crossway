"use client";

/**
 * Status vocabulary — one place that decides what "running" looks like.
 *
 * Neon is reserved: only a genuinely live thing pulses. Succeeded is calm
 * green-on-graphite, failed is red, everything unstarted is grey.
 */

import { cn } from "@/lib/utils";

const STATUS = {
  running: {
    label: "Running",
    dot: "bg-[var(--cw-neon)] text-[var(--cw-neon)]",
    pill: "border-[color-mix(in_srgb,var(--cw-neon)_45%,transparent)] bg-[color-mix(in_srgb,var(--cw-neon)_12%,transparent)] text-[var(--cw-neon)]",
    pulse: true,
  },
  queued: {
    label: "Queued",
    dot: "bg-[var(--cw-caution)] text-[var(--cw-caution)]",
    pill: "border-[color-mix(in_srgb,var(--cw-caution)_40%,transparent)] bg-[color-mix(in_srgb,var(--cw-caution)_11%,transparent)] text-[var(--cw-caution)]",
    pulse: true,
  },
  waiting: {
    label: "Waiting",
    dot: "bg-[var(--cw-caution)] text-[var(--cw-caution)]",
    pill: "border-[color-mix(in_srgb,var(--cw-caution)_40%,transparent)] bg-[color-mix(in_srgb,var(--cw-caution)_11%,transparent)] text-[var(--cw-caution)]",
    pulse: true,
  },
  succeeded: {
    label: "Done",
    dot: "bg-[var(--cw-neon-deep)] text-[var(--cw-neon-deep)]",
    pill: "border-[color-mix(in_srgb,var(--cw-neon)_28%,transparent)] bg-[color-mix(in_srgb,var(--cw-neon)_7%,transparent)] text-[var(--cw-neon-soft)]",
  },
  failed: {
    label: "Failed",
    dot: "bg-[var(--cw-danger)] text-[var(--cw-danger)]",
    pill: "border-[color-mix(in_srgb,var(--cw-danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--cw-danger)_11%,transparent)] text-[var(--cw-danger)]",
  },
  cancelled: {
    label: "Cancelled",
    dot: "bg-[var(--cw-ink-faint)] text-[var(--cw-ink-faint)]",
    pill: "border-[var(--cw-hairline-strong)] bg-[var(--cw-raised)] text-[var(--cw-ink-muted)]",
  },
  pending: {
    label: "Waiting",
    dot: "bg-[var(--cw-hairline-strong)] text-[var(--cw-hairline-strong)]",
    pill: "border-[var(--cw-hairline)] bg-[var(--cw-raised)] text-[var(--cw-ink-faint)]",
  },
};

const ALIASES = {
  completed: "succeeded",
  success: "succeeded",
  ok: "succeeded",
  done: "succeeded",
  error: "failed",
  canceled: "cancelled",
  idle: "pending",
  waiting: "waiting",
  "": "pending",
};

export function statusMeta(status) {
  const key = String(status || "").toLowerCase();
  return STATUS[key] || STATUS[ALIASES[key]] || STATUS.pending;
}

/** A status dot. Live states get an expanding halo. */
export function GlowDot({ status = "pending", size = 8, className = "" }) {
  const meta = statusMeta(status);
  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {meta.pulse ? (
        <span className={cn("cw-pulse absolute inset-0 rounded-full", meta.dot)} />
      ) : null}
      <span className={cn("relative inline-block size-full rounded-full", meta.dot)} />
    </span>
  );
}

/** Pill-shaped status chip. Pass `label` to override the default wording. */
export function StatusPill({ status = "pending", label, className = "", size = "md" }) {
  const meta = statusMeta(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]",
        meta.pill,
        className
      )}
    >
      <GlowDot status={status} size={size === "sm" ? 5 : 6} />
      {label || meta.label}
    </span>
  );
}

export default StatusPill;
