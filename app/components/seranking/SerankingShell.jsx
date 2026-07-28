"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { RefreshCw, Coins, Clock, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import PageHeader from "../ui-shared/PageHeader";
import { LoadingSpinner } from "../ui-shared/LoadingBlock";
import EmptyState from "../ui-shared/EmptyState";
import { Globe } from "lucide-react";

function siteHost(url) {
  if (!url) return "";
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return String(url).replace(/^https?:\/\//, "").split("/")[0] || "";
  }
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function SerankingCreditBar({ credits, compact = false }) {
  if (!credits) return null;
  const pct = credits.percentUsed ?? 0;
  const tone = pct >= 90 ? "destructive" : pct >= 70 ? "secondary" : "default";
  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2 ${compact ? "text-xs" : "text-sm"}`}
    >
      <Coins className="size-4 text-violet-700 shrink-0" aria-hidden />
      <span className="font-semibold text-violet-900 tabular-nums">
        {credits.remaining?.toLocaleString()} / {credits.budget?.toLocaleString()} credits
      </span>
      <Badge variant={tone} className="tabular-nums">
        {pct}% used
      </Badge>
      {!compact ? (
        <span className="text-violet-800/70 text-xs">Scheduled refresh reserve: {credits.reserve?.toLocaleString()}</span>
      ) : null}
    </div>
  );
}

export default function SerankingShell({
  title,
  description,
  selectedSite,
  children,
  onRefresh,
  refreshing = false,
  refreshDisabled = false,
  refreshLabel = "Refresh now",
  error,
  loading,
  credits,
  fetchedAt,
  expiresAt,
  configured = true,
}) {
  const { data: session } = useSession();
  const hasGlobalAccess = session?.user?.role === "super_admin" || session?.user?.role === "smm";
  const userSite = session?.user?.siteLink || "";
  const effectiveSite = hasGlobalAccess ? selectedSite || userSite : userSite;

  const needsWebsite =
    !effectiveSite ||
    (!String(effectiveSite).startsWith("http") &&
      !String(effectiveSite).startsWith("sc-domain:") &&
      !String(effectiveSite).includes("."));

  if (needsWebsite) {
    return (
      <Card className="border-border/80 shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <EmptyState
            icon={Globe}
            title="Select a client website"
            description="SE Ranking analyzes website URLs only. Choose a website (not a Meta-only page) from the sidebar."
          />
        </CardContent>
      </Card>
    );
  }

  if (!configured) {
    return (
      <Card className="border-border/80 shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <EmptyState
            icon={AlertCircle}
            title="SE Ranking not configured"
            description="Add SERANKING_API_KEY to your environment. Missing data is fetched when you open a page; nightly cron at 04:45 refreshes stale snapshots."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="SE Ranking"
        title={title}
        description={description}
        action={
          onRefresh ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={refreshing || refreshDisabled}
              className="gap-2"
            >
              <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing…" : refreshLabel}
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            {siteHost(effectiveSite)}
          </Badge>
          {fetchedAt ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3.5" aria-hidden />
              Updated {formatDate(fetchedAt)}
            </span>
          ) : null}
          {expiresAt ? (
            <span className="text-xs text-muted-foreground">· cache until {formatDate(expiresAt)}</span>
          ) : null}
        </div>
        <SerankingCreditBar credits={credits} compact />
      </div>

      <p className="text-xs text-muted-foreground -mt-2">
        Nightly refresh 04:45 · empty cache fetches live on page load (uses manual credit reserve)
      </p>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <>
          <LoadingSpinner label={`Loading ${title}`} />
        </>
      ) : (
        children
      )}
    </div>
  );
}

export function useSerankingStatus(selectedSite) {
  const { data: session } = useSession();
  const hasGlobalAccess = session?.user?.role === "super_admin" || session?.user?.role === "smm";
  const userSite = session?.user?.siteLink || "";
  const effectiveSite = hasGlobalAccess ? selectedSite || userSite : userSite;

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!effectiveSite || !String(effectiveSite).startsWith("http")) {
      setStatus(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = new URLSearchParams();
    if (hasGlobalAccess) q.set("url", effectiveSite);
    try {
      const res = await fetch(`/api/seranking/status?${q}`, { cache: "no-store" });
      const data = await res.json();
      setStatus(res.ok ? data : { configured: false, error: data.error });
    } catch {
      setStatus({ configured: false, error: "Network error" });
    } finally {
      setLoading(false);
    }
  }, [effectiveSite, hasGlobalAccess]);

  useEffect(() => {
    load();
  }, [load]);

  return { status, loading, reload: load, effectiveSite, credits: status?.credits };
}

export function formatSerankingNum(n) {
  return new Intl.NumberFormat("en-US").format(Math.round(Number(n) || 0));
}

export function formatSerankingCompact(n) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    Math.max(0, Number(n) || 0)
  );
}
