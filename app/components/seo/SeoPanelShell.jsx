"use client";

import { Globe } from "lucide-react";
import PageHeader from "../ui-shared/PageHeader";
import EmptyState from "../ui-shared/EmptyState";
import { LoadingSpinner, StatCardSkeleton } from "../ui-shared/LoadingBlock";
import { HoverLift } from "../ui-shared/Motion";
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
    <div className="min-h-[calc(100vh-2rem)] space-y-8 rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
      {/* Consistent Dark Hero Header Banner */}
      <header className="relative overflow-hidden rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-900 via-gray-800 to-emerald-950 p-6 text-white shadow-[0_8px_32px_rgba(0,0,0,0.12)] sm:p-8 animate-fade-in">
        <div className="absolute -right-16 -top-16 size-64 rounded-full bg-emerald-500/10 blur-3xl" aria-hidden />
        <div className="absolute -bottom-20 -left-10 size-48 rounded-full bg-teal-400/10 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300/90">{eyebrow || "SEO Tools"}</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
            {description ? (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-300">{description}</p>
            ) : null}
            {siteUrl ? (
              <p className="mt-2 text-sm font-medium text-emerald-300">
                {String(siteUrl).trim()}
              </p>
            ) : null}
          </div>
          {(onRangeChange || action) && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {onRangeChange ? (
                <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5 backdrop-blur-sm">
                  {RANGES.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => onRangeChange(r.id)}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                        range === r.id
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-300 hover:text-white"
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
