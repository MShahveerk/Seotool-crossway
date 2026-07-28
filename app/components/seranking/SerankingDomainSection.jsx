"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { BarChart3, Globe2, Users } from "lucide-react";
import SerankingShell, { formatSerankingCompact, formatSerankingNum, useSerankingStatus } from "./SerankingShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HoverLift } from "../ui-shared/Motion";

function Kpi({ icon: Icon, label, value, sub }) {
  return (
    <HoverLift>
      <Card className="border-sky-100 bg-gradient-to-br from-sky-50/70 to-white shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {Icon ? <Icon className="size-4 opacity-70" /> : null}
            {label}
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
          {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
        </CardContent>
      </Card>
    </HoverLift>
  );
}

export default function SerankingDomainSection({ selectedSite = "" }) {
  const { data: session } = useSession();
  const hasGlobalAccess = session?.user?.role === "super_admin" || session?.user?.role === "smm";
  const { credits, status: metaStatus } = useSerankingStatus(selectedSite);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState(null);
  const [competitors, setCompetitors] = useState(null);
  const [keywords, setKeywords] = useState(null);

  const load = useCallback(
    async (refresh = false) => {
      const site = hasGlobalAccess ? selectedSite : session?.user?.siteLink;
      if (!site?.startsWith("http")) return;
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      const q = new URLSearchParams({ part: "all" });
      if (hasGlobalAccess) q.set("url", site);
      if (refresh) q.set("refresh", "1");
      try {
        const res = await fetch(`/api/seranking/domain?${q}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to load domain intelligence.");
        } else {
          setOverview(data.overview);
          setCompetitors(data.competitors);
          setKeywords(data.keywords);
        }
      } catch {
        setError("Network error.");
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

  const organic = useMemo(() => {
    const o = overview?.organic || overview?.data?.organic || overview;
    return o && typeof o === "object" ? o : null;
  }, [overview]);

  const competitorRows = useMemo(() => {
    const d = competitors?.data || competitors?.competitors || competitors;
    return Array.isArray(d) ? d.slice(0, 10) : [];
  }, [competitors]);

  const keywordRows = useMemo(() => {
    const d = keywords?.data || keywords?.keywords || keywords;
    return Array.isArray(d) ? d.slice(0, 15) : [];
  }, [keywords]);

  return (
    <SerankingShell
      title="Domain Intelligence"
      description="Worldwide traffic estimates, organic competitors, and ranking keywords — one combined refresh uses up to 300 credits; scheduled rotation spreads cost across the month."
      selectedSite={selectedSite}
      loading={loading}
      error={error}
      credits={credits}
      configured={metaStatus?.configured !== false}
      fetchedAt={metaStatus?.snapshots?.domain_overview?.fetchedAt}
      expiresAt={metaStatus?.snapshots?.domain_overview?.expiresAt}
      onRefresh={() => load(true)}
      refreshing={refreshing}
      refreshDisabled={(credits?.remaining ?? 0) < 300}
      refreshLabel="Refresh all (300 cr)"
    >
      <div className="space-y-6">
        {organic ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi icon={Globe2} label="Est. traffic" value={formatSerankingCompact(organic.traffic || organic.etv)} />
            <Kpi icon={BarChart3} label="Keywords" value={formatSerankingCompact(organic.keywords || organic.count)} />
            <Kpi
              label="Traffic value"
              value={
                organic.price != null
                  ? `$${formatSerankingCompact(organic.price)}`
                  : organic.cost != null
                    ? `$${formatSerankingCompact(organic.cost)}`
                    : "—"
              }
            />
            <Kpi label="Top positions" value={formatSerankingNum(organic.positions_top10 || organic.top10 || "—")} sub="Top 10" />
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="size-4 text-violet-600" />
                Organic competitors
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {competitorRows.length ? (
                <ul className="divide-y divide-border/60">
                  {competitorRows.map((c, i) => (
                    <li key={i} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium truncate">{c.domain || c.competitor || c.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {c.common_keywords != null
                          ? `${formatSerankingNum(c.common_keywords)} shared`
                          : c.keywords != null
                            ? `${formatSerankingCompact(c.keywords)} kw`
                            : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground py-4">Loading competitor data from SE Ranking…</p>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Top organic keywords</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {keywordRows.length ? (
                <ul className="divide-y divide-border/60">
                  {keywordRows.map((k, i) => (
                    <li key={i} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium truncate">{k.keyword || k.query}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground text-xs">
                        {k.position != null ? `#${Number(k.position).toFixed(0)}` : ""}
                        {k.volume != null ? ` · ${formatSerankingCompact(k.volume)} vol` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground py-4">Loading keyword rankings from SE Ranking…</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </SerankingShell>
  );
}
