"use client";

/**
 * Btn — the action vocabulary.
 *
 *   primary   neon fill, dark ink. One per screen region. This is "go".
 *   secondary graphite fill, hairline border. The everyday button.
 *   ghost     text only until hovered. Toolbars and dense rows.
 *   danger    red, for cancel/destroy.
 *
 * Every variant presses down 1px on :active, so clicks feel physical.
 */

import { cn } from "@/lib/utils";

const VARIANTS = {
  primary: cn(
    "bg-[var(--cw-neon)] text-[var(--cw-neon-ink)] border border-[var(--cw-neon)]",
    "shadow-[0_0_20px_-6px_rgb(0_163_255_/_0.6)]",
    "hover:bg-[var(--cw-neon-soft)] hover:border-[var(--cw-neon-soft)]",
    "hover:shadow-[0_0_28px_-6px_rgb(0_163_255_/_0.75)]"
  ),
  secondary: cn(
    "bg-[var(--cw-raised)] text-[var(--cw-ink)] border border-[var(--cw-hairline-strong)]",
    "hover:bg-[var(--cw-overlay)] hover:border-[color-mix(in_srgb,var(--cw-neon)_35%,var(--cw-hairline-strong))]"
  ),
  ghost: cn(
    "bg-transparent text-[var(--cw-ink-muted)] border border-transparent",
    "hover:bg-[var(--cw-raised)] hover:text-[var(--cw-ink)]"
  ),
  outline: cn(
    "bg-transparent text-[var(--cw-neon)] border border-[color-mix(in_srgb,var(--cw-neon)_40%,transparent)]",
    "hover:bg-[color-mix(in_srgb,var(--cw-neon)_10%,transparent)]"
  ),
  danger: cn(
    "bg-[color-mix(in_srgb,var(--cw-danger)_14%,transparent)] text-[var(--cw-danger)]",
    "border border-[color-mix(in_srgb,var(--cw-danger)_40%,transparent)]",
    "hover:bg-[color-mix(in_srgb,var(--cw-danger)_22%,transparent)]"
  ),
};

const SIZES = {
  xs: "gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px]",
  sm: "gap-1.5 rounded-lg px-3 py-1.5 text-xs",
  md: "gap-2 rounded-xl px-3.5 py-2 text-[13px]",
  lg: "gap-2 rounded-xl px-4.5 py-2.5 text-sm",
};

export default function Btn({
  as: Tag = "button",
  variant = "secondary",
  size = "md",
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  className = "",
  children,
  ...rest
}) {
  const isButton = Tag === "button";
  return (
    <Tag
      {...(isButton ? { type: rest.type || "button" } : null)}
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap",
        "transition-smooth active:translate-y-px",
        "disabled:pointer-events-none disabled:opacity-45",
        SIZES[size] || SIZES.md,
        VARIANTS[variant] || VARIANTS.secondary,
        className
      )}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden
          className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : Icon ? (
        <Icon className="size-3.5 shrink-0" aria-hidden />
      ) : null}
      {children}
      {IconRight && !loading ? <IconRight className="size-3.5 shrink-0" aria-hidden /> : null}
    </Tag>
  );
}
