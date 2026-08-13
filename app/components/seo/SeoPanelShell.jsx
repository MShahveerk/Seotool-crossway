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
      <div className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm">
        <EmptyState
          icon={Globe}
          title="Select a client website"
          description="Choose a website from the Client Account menu in the sidebar to use this tool. Meta-only pages do not support website SEO features."
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
                        ? "bg-background text-foreground shadow-sm"
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
    <div className="min-h-[calc(100vh-2rem)] space-y-8 rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-5 sm:p-6">
      {/* Section hero — the one place a page states what it is. */}
      <header className="cw-grid animate-fade-in relative overflow-hidden rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-canvas)] p-6 sm:p-8">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_75%_at_6%_0%,rgba(14,255,42,0.13),transparent_62%),radial-gradient(ellipse_45%_60%_at_96%_8%,rgba(56,225,255,0.055),transparent_62%)]"
          aria-hidden
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold tracking-[0.18em] text-[var(--cw-neon)] uppercase">
              {eyebrow || "SEO Tools"}
            </p>
            <h1 className="font-heading mt-2 text-2xl font-semibold tracking-tight text-balance text-[var(--cw-ink)] sm:text-[32px]">
              {title}
            </h1>
            {description ? (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--cw-ink-muted)]">
                {description}
              </p>
            ) : null}
            {siteUrl ? (
              <p className="mt-2.5 font-mono text-[13px] text-[var(--cw-ink-dim)]">
                {String(siteUrl).trim()}
              </p>
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
        </div>
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
