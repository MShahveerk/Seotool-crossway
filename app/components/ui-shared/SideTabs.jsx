"use client";

/**
 * SideTabs — vertical section nav for dense detail views (the SERP competitor
 * profile, audit reports, anything that would otherwise be a long stack of
 * headings you have to scroll past).
 *
 * On narrow screens it degrades to a horizontal scrolling rail so the same
 * component works in a modal on mobile.
 *
 *   <SideTabs
 *     items={[{ id: "overview", label: "Overview", icon: Eye, count: 12 }]}
 *     value={tab}
 *     onChange={setTab}
 *   />
 */

import { cn } from "@/lib/utils";

export default function SideTabs({
  items = [],
  value,
  onChange,
  className = "",
  ariaLabel = "Sections",
}) {
  return (
    <nav
      role="tablist"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      className={cn(
        // Mobile: horizontal rail. md+: vertical column.
        "flex shrink-0 gap-1 overflow-x-auto md:w-52 md:flex-col md:overflow-visible",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      {items.map((item) => {
        const active = item.id === value;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={item.disabled}
            onClick={() => onChange?.(item.id)}
            className={cn(
              "group relative flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left",
              "text-[13px] font-semibold whitespace-nowrap transition-smooth",
              "disabled:cursor-not-allowed disabled:opacity-40",
              active
                ? "bg-[color-mix(in_srgb,var(--cw-neon)_10%,var(--cw-raised))] text-[var(--cw-neon)]"
                : "text-[var(--cw-ink-muted)] hover:bg-[var(--cw-raised)] hover:text-[var(--cw-ink)]"
            )}
          >
            {/* Active marker: a lit bar on the leading edge (top edge on mobile) */}
            <span
              aria-hidden
              className={cn(
                "absolute transition-smooth",
                "inset-x-3 top-0 h-0.5 md:inset-x-auto md:inset-y-2 md:left-0 md:h-auto md:w-0.5",
                "rounded-full",
                active
                  ? "bg-[var(--cw-neon)] opacity-100 shadow-[0_0_10px_rgb(0_163_255_/_0.7)]"
                  : "bg-[var(--cw-hairline-strong)] opacity-0 group-hover:opacity-100"
              )}
            />

            {Icon ? (
              <Icon
                className={cn(
                  "size-4 shrink-0 transition-smooth",
                  active ? "text-[var(--cw-neon)]" : "text-[var(--cw-ink-faint)] group-hover:text-[var(--cw-ink-dim)]"
                )}
                aria-hidden
              />
            ) : null}

            <span className="min-w-0 flex-1 truncate">{item.label}</span>

            {item.count != null ? (
              <span
                className={cn(
                  "shrink-0 rounded-full px-1.5 font-mono text-[10px] leading-4 font-bold tabular-nums",
                  active
                    ? "bg-[color-mix(in_srgb,var(--cw-neon)_18%,transparent)] text-[var(--cw-neon)]"
                    : "bg-[var(--cw-hairline)] text-[var(--cw-ink-muted)]"
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
