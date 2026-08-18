"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Link2, Shield, TrendingUp } from "lucide-react";
import SerankingShell, { formatSerankingCompact, formatSerankingNum, useSerankingStatus } from "./SerankingShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HoverLift } from "../ui-shared/Motion";

function Kpi({ icon: Icon, label, value, sub, accent = "violet" }) {
  const accents = {
    violet: "border-violet-100 bg-gradient-to-br from-violet-50/80 to-white",
    sky: "border-sky-100 bg-gradient-to-br from-sky-50/80 to-white",
    emerald: "border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white",
  };
  return (
    <HoverLift>
      <Card className={`${accents[accent] || accents.violet} shadow-sm`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {Icon ? <Icon className="size-4 opacity-70" /> : null}
            {label}
          </div>
          <p className="mt-2 text-2xl sm:text-3xl font-bold tabular-nums text-foreground">{value}</p>
          {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
        </CardContent>
      </Card>
    </HoverLift>
  );
}

export default function SerankingBacklinksSection({ selectedSite = "" }) {
  const { data: session } = useSession();
  const hasGlobalAccess = session?.user?.role === "super_admin" || session?.user?.role === "smm";
  const { credits, status: metaStatus } = useSerankingStatus(selectedSite);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);

  const load = useCallback(
    async (refresh = false) => {
      const site = hasGlobalAccess ? selectedSite : session?.user?.siteLink;
      if (!site?.startsWith("http")) return;
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      const q = new URLSearchParams();
      if (hasGlobalAccess) q.set("url", site);
      if (refresh) q.set("refresh", "1");
      try {
        const res = await fetch(`/api/seranking/backlinks?${q}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to load backlinks.");
          setSummary(null);
        } else {
          setSummary(data.summary || null);
          setFetchedAt(data.fetchedAt || null);
          setExpiresAt(data.expiresAt || null);
        }
      } catch {
        setError("Network error loading backlinks.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedSite, hasGlobalAccess, session?.user?.siteLink]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const topAnchors = summary?.topAnchors || [];
  const topPages = summary?.topPages || [];
  const hasMetrics =
    summary &&
    ((summary.backlinks != null && summary.backlinks > 0) ||
      (summary.refdomains != null && summary.refdomains > 0) ||
      topAnchors.length > 0 ||
      topPages.length > 0);

  return (
    <SerankingShell
      title="Backlink Profile"
      description="Referring domains, anchor distribution, and authority — refreshed monthly per site to conserve API credits."
      selectedSite={selectedSite}
      loading={loading}
      error={error}
      credits={credits}
      configured={metaStatus?.configured !== false}
      fetchedAt={fetchedAt || metaStatus?.snapshots?.backlinks_summary?.fetchedAt}
      expiresAt={expiresAt || metaStatus?.snapshots?.backlinks_summary?.expiresAt}
      onRefresh={() => load(true)}
      refreshing={refreshing}
      refreshDisabled={false}
      refreshLabel="Refresh (100 cr)"
    >
      {hasMetrics ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi icon={Link2} label="Backlinks" value={formatSerankingCompact(summary.backlinks)} accent="violet" />
            <Kpi
              icon={TrendingUp}
              label="Referring domains"
              value={formatSerankingCompact(summary.refdomains)}
              accent="sky"
            />
            <Kpi
              icon={Shield}
              label="Domain authority"
              value={summary.domainInlinkRank ?? "—"}
              sub="Inlink rank"
              accent="emerald"
            />
            <Kpi
              label="Dofollow"
              value={formatSerankingCompact(summary.dofollowBacklinks)}
              sub={`${formatSerankingNum(summary.nofollowBacklinks)} nofollow`}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top anchors</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="divide-y divide-border/60">
                  {(topAnchors.slice(0, 8) || []).map((a, i) => (
                    <li key={i} className="py-2 flex justify-between gap-3 text-sm">
                      <span className="truncate font-medium">{a.anchor || "—"}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatSerankingNum(a.backlinks)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top linked pages</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="divide-y divide-border/60">
                  {(topPages.slice(0, 8) || []).map((p, i) => {
                    let path = p.url || "";
                    try {
                      path = new URL(p.url).pathname || p.url;
                    } catch {
                      /* keep */
                    }
                    return (
                      <li key={i} className="py-2 flex justify-between gap-3 text-sm">
                        <span className="truncate font-medium" title={p.url}>
                          {path}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {formatSerankingNum(p.backlinks)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : summary && !loading ? (
        <p className="text-sm text-muted-foreground">
          No backlink metrics returned yet. Click <strong>Refresh</strong> to fetch live data (100
          credits).
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">No backlink data yet — fetching live data…</p>
      )}
    </SerankingShell>
  );
}
