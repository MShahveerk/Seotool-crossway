"use client";

import { Globe } from "lucide-react";
import PageHeader from "../ui-shared/PageHeader";
import EmptyState from "../ui-shared/EmptyState";
import { LoadingSpinner, StatCardSkeleton } from "../ui-shared/LoadingBlock";
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
}) {
  if (!selectedSite || (!String(selectedSite).startsWith("http") && !/^\d+$/.test(String(selectedSite)))) {
    return (
      <Card className="border-border/80 shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <EmptyState
            icon={Globe}
            title="Select a client website"
            description="Choose a website from the Client Account menu in the sidebar to use this tool. Meta-only pages do not support website SEO features."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="min-h-[calc(100vh-5.5rem)] border-border/80 shadow-sm">
      <CardContent className="space-y-6 p-5 sm:p-6">
        <PageHeader
          eyebrow={eyebrow}
          title={title}
          description={description}
          actions={
            <div className="flex flex-wrap items-center gap-2">
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
          }
        />

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
      </CardContent>
    </Card>
  );
}
