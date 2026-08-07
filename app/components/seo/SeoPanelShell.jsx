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
      <div className="rounded-2xl border border-border/60 bg-card/80 p-6 sm:p-8 shadow-[0_4px_32px_rgba(0,0,0,0.4)] backdrop-blur-sm">
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
              <div className="inline-flex rounded-lg border border-border/60 bg-card/80 p-0.5">
                {RANGES.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onRangeChange(r.id)}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      range === r.id
                        ? "bg-primary/10 text-primary border border-primary/30"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
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
          <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
            <AlertDescription className="text-destructive">{error}</AlertDescription>
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
    <div className="min-h-[calc(100vh-2rem)] space-y-6 rounded-2xl border border-border/60 bg-card/60 p-4 sm:p-5 shadow-[0_8px_48px_rgba(0,0,0,0.55)] backdrop-blur-sm">
      {/* Dark Hero Header Banner — deep black-to-emerald with gold accent */}
      <header className="relative overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-br from-[#050908] via-[#0A120F] to-[#061410] p-6 text-white shadow-[0_8px_40px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(16,185,129,0.1)] sm:p-8">
        {/* Ambient glow orbs */}
        <div className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-emerald-500/10 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 -left-12 size-56 rounded-full bg-emerald-600/8 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute right-1/3 -top-8 size-40 rounded-full bg-amber-500/6 blur-2xl" aria-hidden />
        {/* Subtle grid texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: "linear-gradient(oklch(0.695 0.17 165) 1px, transparent 1px), linear-gradient(90deg, oklch(0.695 0.17 165) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
          aria-hidden
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {/* Gold eyebrow */}
            <p className="text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: "oklch(0.72 0.17 80)" }}>
              {eyebrow || "SEO Tools"}
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
            {description ? (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-emerald-100/50">{description}</p>
            ) : null}
            {siteUrl ? (
              <p className="mt-2 text-sm font-medium" style={{ color: "oklch(0.695 0.17 165)" }}>
                {String(siteUrl).trim()}
              </p>
            ) : null}
          </div>
          {(onRangeChange || action) && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {onRangeChange ? (
                <div className="inline-flex rounded-xl border border-white/8 bg-white/4 p-0.5 backdrop-blur-sm">
                  {RANGES.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => onRangeChange(r.id)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                        range === r.id
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm"
                          : "text-white/50 hover:text-white/80 hover:bg-white/5"
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
        <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
          <AlertDescription className="text-destructive">{error}</AlertDescription>
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
