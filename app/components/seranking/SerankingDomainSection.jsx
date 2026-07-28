"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Award,
  BarChart3,
  Bot,
  Globe2,
  Link2,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import SerankingShell, { formatSerankingCompact, formatSerankingNum, useSerankingStatus } from "./SerankingShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HoverLift } from "../ui-shared/Motion";

function Kpi({ icon: Icon, label, value, sub, accent = "sky" }) {
  const accents = {
    sky: "border-sky-100 bg-gradient-to-br from-sky-50/70 to-white",
    violet: "border-violet-100 bg-gradient-to-br from-violet-50/70 to-white",
    emerald: "border-emerald-100 bg-gradient-to-br from-emerald-50/70 to-white",
    amber: "border-amber-100 bg-gradient-to-br from-amber-50/70 to-white",
  };
  return (
    <HoverLift>
      <Card className={`${accents[accent] || accents.sky} shadow-sm`}>
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
  const [loadingAi, setLoadingAi] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

  const load = useCallback(
    async (refresh = false, includeAi = false) => {
      const site = hasGlobalAccess ? selectedSite : session?.user?.siteLink;
      if (!site?.startsWith("http")) return;
      if (includeAi) setLoadingAi(true);
      else if (refresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      const q = new URLSearchParams();
      if (hasGlobalAccess) q.set("url", site);
      if (refresh) q.set("refresh", "1");
      if (includeAi) q.set("ai", "1");
      try {
        const res = await fetch(`/api/seranking/domain?${q}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) setError(data.error || "Failed to load SEO overview.");
        else setPayload(data);
      } catch {
        setError("Network error.");
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingAi(false);
      }
    },
    [selectedSite, hasGlobalAccess, session?.user?.siteLink]
  );

  useEffect(() => {
    load(false, false);
  }, [load]);

  const overview = payload?.overview;
  const backlinks = payload?.backlinks;
  const ai = payload?.ai;
  const aiEngines = payload?.aiEngines;
  const competitorRows = payload?.competitors?.slice(0, 10) || [];
  const keywordRows = payload?.keywords?.slice(0, 15) || [];

  const refreshCost = 400;
  const aiCost = 2400;

  return (
    <SerankingShell
      title="SEO Performance Overview"
      description="SE Ranking domain, backlink, and AI visibility metrics — similar to a SEMrush overview. Refresh loads domain + backlinks + competitors (~400 cr). AI engines add ~2,400 cr."
      selectedSite={selectedSite}
      loading={loading}
      error={error}
      credits={credits}
      configured={metaStatus?.configured !== false}
      fetchedAt={metaStatus?.snapshots?.domain_overview?.fetchedAt}
      expiresAt={metaStatus?.snapshots?.domain_overview?.expiresAt}
      onRefresh={() => load(true, false)}
      refreshing={refreshing}
      refreshDisabled={(credits?.remaining ?? 0) < refreshCost}
      refreshLabel={`Refresh (~${refreshCost} cr)`}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <Kpi
            icon={Award}
            label="Authority (InLink)"
            value={backlinks?.domainInlinkRank ?? "—"}
            sub="SE Ranking 0–100"
            accent="violet"
          />
          <Kpi
            icon={TrendingUp}
            label="Organic traffic"
            value={overview?.traffic != null ? formatSerankingCompact(overview.traffic) : "—"}
            sub="Worldwide est."
            accent="emerald"
          />
          <Kpi
            icon={BarChart3}
            label="Organic keywords"
            value={overview?.keywords != null ? formatSerankingCompact(overview.keywords) : "—"}
            sub="Ranking terms"
          />
          <Kpi icon={Link2} label="Backlinks" value={formatSerankingCompact(backlinks?.backlinks)} sub="Live links" accent="amber" />
          <Kpi
            icon={Globe2}
            label="Referring domains"
            value={formatSerankingCompact(backlinks?.refdomains)}
            sub="Unique domains"
            accent="sky"
          />
          <Kpi
            label="Traffic value"
            value={overview?.price != null ? `$${formatSerankingCompact(overview.price)}` : "—"}
            sub={`Top 10 kw: ${formatSerankingNum(overview?.top10)}`}
          />
        </div>

        {overview?.trafficShareUs != null ? (
          <Card className="shadow-sm border-sky-100">
            <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-muted-foreground">US traffic share</p>
                <p className="text-2xl font-bold tabular-nums">{overview.trafficShareUs}%</p>
              </div>
              <p className="text-sm text-muted-foreground">
                US est. {formatSerankingCompact(overview.usTraffic)} / {formatSerankingCompact(overview.traffic)} worldwide
              </p>
            </CardContent>
          </Card>
        ) : null}

        <Card className="shadow-sm border-violet-100">
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="size-4 text-violet-600" />
              AI Search Visibility
            </CardTitle>
            {!ai?.hasData ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={loadingAi || (credits?.remaining ?? 0) < aiCost}
                onClick={() => load(false, true)}
              >
                {loadingAi ? "Loading…" : `Load AI metrics (~${aiCost} cr)`}
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="pt-0">
            {ai?.hasData ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi icon={Sparkles} label="AI visibility" value={formatSerankingNum(ai.aiVisibility)} sub="Brand presence" accent="violet" />
                <Kpi label="Mentions / links" value={formatSerankingNum(ai.mentions)} sub="Link presence in LLMs" accent="violet" />
                <Kpi label="Cited pages" value={formatSerankingNum(ai.citedPages)} sub="Pages cited in AI answers" accent="violet" />
                <Kpi label="AI traffic est." value={formatSerankingCompact(ai.aiTraffic)} sub="Opportunity traffic" accent="violet" />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-2">
                AI visibility is optional (~2,400 credits) — loads ChatGPT + AI Mode engine data plus aggregated trends.
              </p>
            )}
            {aiEngines ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {Object.entries(aiEngines).map(([engine, row]) => (
                  <span
                    key={engine}
                    className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-1.5 text-xs"
                  >
                    <span className="font-bold uppercase">{engine.replace("-", " ")}</span>
                    <span className="tabular-nums">{row.visibility ?? "—"} visibility</span>
                  </span>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

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
                  {competitorRows.map((c) => (
                    <li key={c.domain} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium truncate">{c.domain}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {c.commonKeywords != null
                          ? `${formatSerankingNum(c.commonKeywords)} shared`
                          : c.keywords != null
                            ? `${formatSerankingCompact(c.keywords)} kw`
                            : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground py-4">No competitor data — click Refresh to fetch from SE Ranking.</p>
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
                  {keywordRows.map((k) => (
                    <li key={k.keyword} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium truncate">{k.keyword}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground text-xs">
                        {k.position != null ? `#${Math.round(k.position)}` : ""}
                        {k.volume != null ? ` · ${formatSerankingCompact(k.volume)} vol` : ""}
                        {k.traffic != null ? ` · ${formatSerankingCompact(k.traffic)} traf` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground py-4">No keyword rankings — click Refresh to fetch from SE Ranking.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </SerankingShell>
  );
}
