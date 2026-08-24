"use client";

/**
 * TabRail — the app's one tab control.
 *
 * Tabs sit inside a recessed track; the active tab is a raised neon pill that
 * *slides* between positions rather than cutting. That movement is what makes a
 * tab read as a button you pressed instead of a link you followed.
 *
 * Every tab can carry a count badge and a `live` flag (pulsing neon dot) so a
 * running agent stays visible from any other tab.
 *
 *   <TabRail
 *     tabs={[{ id: "run", label: "Run" }, { id: "runs", label: "Runs", live: true }]}
 *     value={tab}
 *     onChange={setTab}
 *   />
 */

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export default function TabRail({
  tabs = [],
  value,
  onChange,
  size = "md",
  className = "",
  ariaLabel = "Sections",
}) {
  const trackRef = useRef(null);
  const pillRef = useRef(null);
  const tabRefs = useRef({});
  const measuredOnce = useRef(false);

  // The pill is positioned by writing to the DOM node directly rather than
  // through state: measuring in an effect and then setting state would render
  // the rail twice on every tab change, and the pill would lag the click.
  const measure = useCallback(() => {
    const pill = pillRef.current;
    const node = tabRefs.current[value];
    if (!pill || !node) return;

    // The very first placement must not animate in from x=0.
    pill.style.transition = measuredOnce.current
      ? "transform 340ms cubic-bezier(0.22,1,0.36,1), width 340ms cubic-bezier(0.22,1,0.36,1), opacity 200ms"
      : "none";
    pill.style.transform = `translateX(${node.offsetLeft}px)`;
    pill.style.width = `${node.offsetWidth}px`;
    pill.style.opacity = "1";
    measuredOnce.current = true;
  }, [value]);

  useLayoutEffect(measure, [measure, tabs.length]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return undefined;
    const track = trackRef.current;
    if (!track) return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    Object.values(tabRefs.current).forEach((n) => n && ro.observe(n));
    return () => ro.disconnect();
  }, [measure, tabs.length]);

  // Fonts land after first paint and shift tab widths — re-measure once ready.
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts?.ready) return;
    document.fonts.ready.then(measure).catch(() => {});
  }, [measure]);

  // Keep the active tab in view when the rail scrolls horizontally.
  useEffect(() => {
    const node = tabRefs.current[value];
    node?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [value]);

  const onKeyDown = (event) => {
    const dir = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    event.preventDefault();
    const idx = tabs.findIndex((t) => t.id === value);
    const next = tabs[(idx + dir + tabs.length) % tabs.length];
    if (next) onChange?.(next.id);
  };

  const pad = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-[13px]";

  return (
    <div
      ref={trackRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn(
        "relative inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-2xl",
        "border border-[var(--cw-hairline)] bg-[var(--cw-raised)] p-1",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      {/* Sliding pill */}
      <span
        ref={pillRef}
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1 bottom-1 left-0 rounded-xl opacity-0",
          "border border-[color-mix(in_srgb,var(--cw-neon)_45%,transparent)]",
          "bg-[color-mix(in_srgb,var(--cw-neon)_13%,var(--cw-surface))]",
          "shadow-[0_0_18px_-4px_rgb(0_163_255_/_0.45)]"
        )}
      />

      {tabs.map((tab) => {
        const active = tab.id === value;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            ref={(node) => {
              tabRefs.current[tab.id] = node;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            title={tab.hint || tab.label}
            onClick={() => onChange?.(tab.id)}
            className={cn(
              "relative z-10 inline-flex shrink-0 items-center gap-1.5 rounded-xl font-semibold whitespace-nowrap",
              "transition-colors duration-200 focus-visible:outline-none",
              pad,
              active
                ? "text-[var(--cw-neon)]"
                : "text-[var(--cw-ink-muted)] hover:text-[var(--cw-ink)]"
            )}
          >
            {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden /> : null}
            <span>{tab.label}</span>

            {tab.live ? (
              <span className="relative ml-0.5 inline-flex size-1.5 shrink-0">
                <span className="cw-pulse absolute inset-0 rounded-full text-[var(--cw-neon)]" />
                <span className="relative inline-flex size-1.5 rounded-full bg-[var(--cw-neon)]" />
              </span>
            ) : tab.badge ? (
              <span
                className={cn(
                  "ml-0.5 inline-flex min-w-4 shrink-0 items-center justify-center rounded-full px-1",
                  "font-mono text-[10px] leading-4 font-bold tabular-nums",
                  active
                    ? "bg-[color-mix(in_srgb,var(--cw-neon)_20%,transparent)] text-[var(--cw-neon)]"
                    : "bg-[var(--cw-hairline)] text-[var(--cw-ink-muted)]"
                )}
              >
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
