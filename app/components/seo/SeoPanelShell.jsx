"use client";

import { Globe } from "lucide-react";
import PageHeader from "../ui-shared/PageHeader";
import EmptyState from "../ui-shared/EmptyState";
import { LoadingSpinner, StatCardSkeleton } from "../ui-shared/LoadingBlock";
import { HoverLift } from "../ui-shared/Motion";
import TabRail from "../ui-shared/TabRail";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function formatNum(n) {
  return new Intl.NumberFormat("en-US").format(Math.round(Number(n) || 0));
}

export function formatPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0%";
  return `${(v * 100).toFixed(1)}%`;
}

export function formatPos(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(1);
}

const RANGES = [
  { id: "7d", label: "7d" },
  { id: "28d", label: "28d" },
  { id: "3m", label: "3m" },
  { id: "6m", label: "6m" },
  { id: "12m", label: "12m" },
];

export default function SeoPanelShell({
  title,
  description,
  selectedSite,
  range,
  onRangeChange,
  loading,
  error,
  children,
  action,
  eyebrow = "SEO Tools",
  siteUrl,
  embedded = false,
}) {
  if (!embedded && (!selectedSite || (!String(selectedSite).startsWith("http") && !/^\d+$/.test(String(selectedSite))))) {
    return (
      <div className="rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-6 shadow-sm sm:p-8">
        <EmptyState
          icon={Globe}
          title="Select a project"
          description="Choose a project from the switcher in the sidebar to use this tool. Meta-only projects have no website behind them, so website SEO tools stay unavailable for them."
        />
      </div>
    );
  }

  if (embedded) {
    return (
      <div className="space-y-4">
        {(onRangeChange || action) && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {onRangeChange ? (
              <div className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5">
                {RANGES.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onRangeChange(r.id)}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      range === r.id
                        ? "bg-[color-mix(in_srgb,var(--cw-neon)_14%,var(--cw-surface))] text-[var(--cw-neon)]"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            ) : null}
            {action}
          </div>
        )}

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {loading ? (
          <>
            <LoadingSpinner label={`Loading ${title}`} />
            <StatCardSkeleton count={4} />
          </>
        ) : (
          children
        )}
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] space-y-5">
      {/* De-nested: content sits on the canvas (like the dashboard), not inside
          a surface card. The workspace rail above already frames where you are,
          so this is a title line and its controls — not a landing banner. */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[var(--cw-hairline)] pb-4">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-heading truncate text-lg font-semibold tracking-tight text-[var(--cw-ink)]">
            {title}
          </h1>
          {siteUrl ? (
            <span className="truncate font-mono text-[11px] text-[var(--cw-ink-faint)]">
              {String(siteUrl).trim()}
            </span>
          ) : null}
          {description ? (
            <span className="hidden max-w-xl truncate text-xs text-[var(--cw-ink-muted)] xl:inline">
              {description}
            </span>
          ) : null}
        </div>
        {(onRangeChange || action) && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {onRangeChange ? (
              <TabRail
                size="sm"
                tabs={RANGES.map((r) => ({ id: r.id, label: r.label }))}
                value={range}
                onChange={onRangeChange}
                ariaLabel="Date range"
              />
            ) : null}
            {action}
          </div>
        )}
      </header>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <>
          <LoadingSpinner label={`Loading ${title}`} />
          <StatCardSkeleton count={4} />
        </>
      ) : (
        children
      )}
    </div>
  );
}
