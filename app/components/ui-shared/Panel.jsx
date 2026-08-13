"use client";

/**
 * Panel — the single card surface used everywhere.
 *
 * One elevation model, no drop shadows fighting each other: a graphite fill,
 * a 1px hairline, and an optional lit top edge (`lit`) that makes the surface
 * read as raised without a shadow. `glow` marks a panel as live.
 */

import { cn } from "@/lib/utils";

export function Panel({
  as: Tag = "div",
  lit = true,
  glow = false,
  inset = false,
  className = "",
  children,
  ...rest
}) {
  return (
    <Tag
      className={cn(
        "relative rounded-2xl border border-[var(--cw-hairline)]",
        inset ? "bg-[var(--cw-canvas)]" : "bg-[var(--cw-surface)]",
        lit && "cw-lit",
        glow && "cw-glow",
        className
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * PanelHeader — title block with an optional eyebrow, description and actions.
 * Keeps every panel's header rhythm identical across the app.
 */
export function PanelHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
  className = "",
  compact = false,
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-[var(--cw-hairline)]",
        compact ? "px-4 py-3" : "px-5 py-4",
        className
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] text-[var(--cw-neon)]">
            <Icon className="size-4" aria-hidden />
          </span>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[10px] font-bold tracking-[0.14em] text-[var(--cw-ink-faint)] uppercase">
              {eyebrow}
            </p>
          ) : null}
          {title ? (
            <h3 className="font-heading truncate text-[15px] font-semibold text-[var(--cw-ink)]">
              {title}
            </h3>
          ) : null}
          {description ? (
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--cw-ink-muted)]">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Small uppercase label used above field groups and inside panels. */
export function FieldLabel({ className = "", children, ...rest }) {
  return (
    <span
      className={cn(
        "block text-[10px] font-bold tracking-[0.12em] text-[var(--cw-ink-faint)] uppercase",
        className
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

export default Panel;
