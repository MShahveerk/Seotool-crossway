"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { RefreshCw, Coins, Clock, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import PageHeader from "../ui-shared/PageHeader";
import Btn from "../ui-shared/Btn";
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
  // Budget pressure is the message — colour only escalates as it runs out.
  const tone =
    pct >= 90
      ? "text-[var(--cw-danger)] border-[color-mix(in_srgb,var(--cw-danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--cw-danger)_8%,transparent)]"
      : pct >= 70
        ? "text-[var(--cw-caution)] border-[color-mix(in_srgb,var(--cw-caution)_35%,transparent)] bg-[color-mix(in_srgb,var(--cw-caution)_8%,transparent)]"
        : "text-[var(--cw-ink-dim)] border-[var(--cw-hairline)] bg-[var(--cw-raised)]";

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 ${tone} ${compact ? "text-xs" : "text-sm"}`}
    >
      <Coins className="size-3.5 shrink-0" aria-hidden />
      <span className="font-mono font-semibold tabular-nums">
        {credits.remaining?.toLocaleString()} / {credits.budget?.toLocaleString()}
      </span>
      <span className="text-[var(--cw-ink-faint)]">credits</span>
      <span className="rounded-full bg-[color-mix(in_srgb,currentColor_14%,transparent)] px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums">
        {pct}% used
      </span>
      {!compact ? (
        <span className="text-xs text-[var(--cw-ink-faint)]">
          Refresh reserve: {credits.reserve?.toLocaleString()}
        </span>
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
  requireWebsite = true,
  siteBadge,
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

  if (requireWebsite && needsWebsite) {
    return (
      <Card className="border-border/80 shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <EmptyState
            icon={Globe}
            title="Select a client website"
            description="These tools analyze website URLs only. Choose a website (not a Meta-only page) from the sidebar."
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
            title="Live SEO data not configured"
            description="Contact your administrator to enable live SEO metrics. Missing data is fetched when you open a page; nightly refresh runs at 04:45."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="SEO Tools"
        title={title}
        description={description}
        actions={
          onRefresh ? (
            <Btn
              variant="secondary"
              icon={RefreshCw}
              loading={refreshing}
              onClick={onRefresh}
              disabled={refreshing || refreshDisabled}
            >
              {refreshing ? "Refreshing…" : refreshLabel}
            </Btn>
          ) : null
        }
      />

      {/* Provenance strip: which site, how fresh, what it costs. */}
      <div className="flex flex-col gap-3 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-2 py-1 font-mono text-[11px] text-[var(--cw-ink-dim)]">
            {siteBadge || siteHost(effectiveSite)}
          </span>
          {fetchedAt ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--cw-ink-muted)]">
              <Clock className="size-3" aria-hidden />
              Updated {formatDate(fetchedAt)}
            </span>
          ) : null}
          {expiresAt ? (
            <span className="text-[11px] text-[var(--cw-ink-faint)]">
              · cache until {formatDate(expiresAt)}
            </span>
          ) : null}
        </div>
        <SerankingCreditBar credits={credits} compact />
      </div>

      <p className="-mt-2 text-[11px] leading-relaxed text-[var(--cw-ink-faint)]">
        Nightly refresh 04:45 · empty or expired cache fetches live on page load · Force new audit
        bypasses a valid cache and spends credits.
      </p>

      {error ? (
        <div className="rounded-xl border border-[color-mix(in_srgb,var(--cw-danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--cw-danger)_8%,transparent)] px-4 py-3 text-sm text-[var(--cw-danger)]">
          {error}
        </div>
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

export function useSerankingStatus(selectedSite, { siteOptional = false } = {}) {
  const { data: session } = useSession();
  const hasGlobalAccess = session?.user?.role === "super_admin" || session?.user?.role === "smm";
  const userSite = session?.user?.siteLink || "";
  const effectiveSite = hasGlobalAccess ? selectedSite || userSite : userSite;

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const hasSite = effectiveSite && String(effectiveSite).startsWith("http");
    if (!siteOptional && !hasSite) {
      setStatus(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = new URLSearchParams();
    if (siteOptional && !hasSite) {
      q.set("global", "1");
    } else if (hasGlobalAccess) {
      q.set("url", effectiveSite);
    }
    try {
      const res = await fetch(`/api/seranking/status?${q}`, { cache: "no-store" });
      const data = await res.json();
      setStatus(res.ok ? data : { configured: false, error: data.error });
    } catch {
      setStatus({ configured: false, error: "Network error" });
    } finally {
      setLoading(false);
    }
  }, [effectiveSite, hasGlobalAccess, siteOptional]);

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
