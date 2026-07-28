"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Crosshair,
  Globe2,
  Link2,
  Search,
  Shield,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import SerankingShell, { formatSerankingCompact, formatSerankingNum, useSerankingStatus } from "./SerankingShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function Kpi({ icon: Icon, label, value, sub }) {
  return (
    <Card className="shadow-sm border-sky-100 bg-gradient-to-br from-sky-50/70 to-white">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {Icon ? <Icon className="size-4 opacity-70" /> : null}
          {label}
        </div>
        <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
        {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}

function defaultTarget(selectedSite, userSite) {
  const raw = selectedSite || userSite || "";
  if (!raw) return "";
  try {
    const host = new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname;
    return host.replace(/^www\./, "");
  } catch {
    return raw.replace(/^https?:\/\//, "").split("/")[0] || "";
  }
}

export default function SerankingExplorerSection({ selectedSite = "" }) {
  const { data: session } = useSession();
  const hasGlobalAccess = session?.user?.role === "super_admin" || session?.user?.role === "smm";
  const { credits, reload: reloadMeta } = useSerankingStatus(selectedSite, { siteOptional: true });

  const [targetInput, setTargetInput] = useState("");
  const [activeTarget, setActiveTarget] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [startingAudit, setStartingAudit] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    const seed = defaultTarget(hasGlobalAccess ? selectedSite : "", session?.user?.siteLink);
    if (seed && !targetInput) setTargetInput(seed);
  }, [selectedSite, hasGlobalAccess, session?.user?.siteLink, targetInput]);

  const load = useCallback(
    async (target, { refresh = false, autostart = false } = {}) => {
      const domain = String(target || "").trim();
      if (!domain) {
        setError("Enter a domain to explore.");
        return;
      }
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      const q = new URLSearchParams({ target: domain });
      if (refresh) q.set("refresh", "1");
      if (autostart) q.set("autostart", "1");
      try {
        const res = await fetch(`/api/seranking/explorer?${q}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Explorer request failed.");
          setPayload(null);
        } else {
          setPayload(data);
          setActiveTarget(data.target || domain);
          reloadMeta();
        }
      } catch {
        setError("Network error.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [reloadMeta]
  );

  useEffect(() => {
    if (activeTarget && payload?.audit?.status === "running") {
      const t = setInterval(() => load(activeTarget, { refresh: false }), 15000);
      return () => clearInterval(t);
    }
    return undefined;
  }, [activeTarget, payload?.audit?.status, load]);

  const explore = () => load(targetInput.trim());

  const startAudit = async () => {
    const domain = activeTarget || targetInput.trim();
    if (!domain) return;
    setStartingAudit(true);
    setError("");
    try {
      const res = await fetch("/api/seranking/explorer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: domain }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Could not start audit.");
      else await load(domain);
    } catch {
      setError("Network error starting audit.");
    } finally {
      setStartingAudit(false);
    }
  };

  const overview = payload?.overview;
  const backlinks = payload?.backlinks;
  const pages = payload?.pages || [];
  const audit = payload?.audit;
  const auditReport = audit?.normalized;

  const auditCost = 40;
  const exploreCost = 300;

  const topAnchors = backlinks?.topAnchors || [];
  const topLinked = backlinks?.topPages || [];

  const auditSections = useMemo(() => auditReport?.sections || [], [auditReport]);

  return (
    <SerankingShell
      title="Site Explorer"
      description="Research any domain with SE Ranking — organic overview, backlinks, top pages, and on-demand site audit. No client website selection required."
      selectedSite={selectedSite}
      requireWebsite={false}
      siteBadge={activeTarget || "Any domain"}
      loading={loading && !payload}
      error={error}
      credits={credits}
      configured
      onRefresh={activeTarget ? () => load(activeTarget, { refresh: true }) : undefined}
      refreshing={refreshing}
      refreshDisabled={!activeTarget || (credits?.remaining ?? 0) < exploreCost}
      refreshLabel={`Refresh (~${exploreCost} cr)`}
    >
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="example.com or https://example.com"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && explore()}
            />
          </div>
          <Button onClick={explore} disabled={loading || !targetInput.trim()}>
            <Crosshair className="size-4 mr-2" />
            Explore
          </Button>
        </div>

        {activeTarget ? (
          <p className="text-sm text-muted-foreground">
            Showing data for <span className="font-semibold text-foreground">{activeTarget}</span>
            {payload?.creditsSpent ? (
              <span className="ml-2">· {payload.creditsSpent} credits spent this load</span>
            ) : null}
          </p>
        ) : null}

        {payload ? (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="flex flex-wrap h-auto gap-1">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="pages">Top pages ({pages.length})</TabsTrigger>
              <TabsTrigger value="audit">Site audit</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6 mt-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi
                  icon={TrendingUp}
                  label="Est. traffic"
                  value={formatSerankingCompact(overview?.traffic)}
                  sub="Organic (worldwide)"
                />
                <Kpi
                  icon={Globe2}
                  label="Keywords"
                  value={formatSerankingCompact(overview?.keywords)}
                />
                <Kpi
                  icon={Link2}
                  label="Backlinks"
                  value={formatSerankingCompact(backlinks?.backlinks)}
                  sub={`${formatSerankingCompact(backlinks?.refdomains)} ref. domains`}
                />
                <Kpi
                  icon={Shield}
                  label="Inlink rank"
                  value={backlinks?.domainInlinkRank ?? "—"}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Top anchors</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {topAnchors.length ? (
                      <ul className="divide-y divide-border/60">
                        {topAnchors.slice(0, 8).map((a, i) => (
                          <li key={i} className="py-2 flex justify-between gap-3 text-sm">
                            <span className="truncate font-medium">{a.anchor || "—"}</span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">
                              {formatSerankingNum(a.backlinks)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">No anchor data for this domain.</p>
                    )}
                  </CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Top linked pages</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {topLinked.length ? (
                      <ul className="divide-y divide-border/60">
                        {topLinked.slice(0, 8).map((p, i) => (
                          <li key={i} className="py-2 flex justify-between gap-3 text-sm">
                            <span className="truncate font-medium" title={p.url}>
                              {p.url}
                            </span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">
                              {formatSerankingNum(p.backlinks)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">No linked-page data for this domain.</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="pages" className="mt-4">
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Top organic pages</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 overflow-x-auto">
                  {pages.length ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 pr-3 font-medium">URL</th>
                          <th className="py-2 px-3 font-medium text-right">Traffic</th>
                          <th className="py-2 pl-3 font-medium text-right">Keywords</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pages.map((p, i) => (
                          <tr key={i} className="border-b border-border/40">
                            <td className="py-2 pr-3 max-w-md truncate" title={p.url}>
                              {p.url}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums">
                              {formatSerankingCompact(p.traffic)}
                            </td>
                            <td className="py-2 pl-3 text-right tabular-nums">
                              {formatSerankingCompact(p.keywords)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-sm text-muted-foreground">No page data returned for this domain.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="audit" className="space-y-4 mt-4">
              <div className="flex flex-wrap items-center gap-3">
                {audit?.status === "running" ? (
                  <Badge variant="secondary">Crawling… {audit.progress != null ? `${audit.progress}%` : ""}</Badge>
                ) : auditReport?.score != null ? (
                  <Badge variant={auditReport.score >= 80 ? "default" : "secondary"}>
                    Health score {auditReport.score}%
                  </Badge>
                ) : (
                  <Badge variant="outline">{audit?.status || "No audit"}</Badge>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startAudit}
                  disabled={startingAudit || audit?.status === "running" || (credits?.remaining ?? 0) < auditCost}
                >
                  {audit?.status === "running" ? "Audit running…" : `Run site audit (~${auditCost} cr)`}
                </Button>
                {audit?.message ? (
                  <span className="text-sm text-muted-foreground">{audit.message}</span>
                ) : null}
              </div>

              {auditReport ? (
                <div className="space-y-4">
                  {auditSections.map((sec) => (
                    <Card key={sec.uid || sec.name} className="shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <AlertTriangle className="size-4 text-amber-600" />
                          {sec.name}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        {sec.checks?.length ? (
                          <ul className="divide-y divide-border/60 text-sm">
                            {sec.checks.slice(0, 12).map((chk) => (
                              <li key={chk.code} className="py-2 flex justify-between gap-3">
                                <span>{chk.name}</span>
                                <Badge variant={chk.type === "error" ? "destructive" : "secondary"}>
                                  {chk.count ?? chk.type}
                                </Badge>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground">No open issues in this section.</p>
                        )}
                      </CardContent>
                    </Card>
                  ))}

                  {audit?.pages?.length ? (
                    <Card className="shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Crawled pages</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left text-muted-foreground">
                              <th className="py-2 pr-3">URL</th>
                              <th className="py-2 px-2 text-right">Status</th>
                              <th className="py-2 px-2 text-right">Issues</th>
                            </tr>
                          </thead>
                          <tbody>
                            {audit.pages.slice(0, 30).map((p, i) => (
                              <tr key={i} className="border-b border-border/40">
                                <td className="py-2 pr-3 max-w-md truncate" title={p.url}>
                                  {p.url}
                                </td>
                                <td className="py-2 px-2 text-right tabular-nums">{p.status ?? "—"}</td>
                                <td className="py-2 px-2 text-right tabular-nums">{p.issues ?? p.errors ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </CardContent>
                    </Card>
                  ) : null}
                </div>
              ) : audit?.status !== "running" ? (
                <p className="text-sm text-muted-foreground">
                  Run a site audit to crawl up to 20 pages and get technical SEO checks for this domain.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Audit in progress — this tab updates automatically.</p>
              )}
            </TabsContent>
          </Tabs>
        ) : !loading ? (
          <p className="text-sm text-muted-foreground">
            Enter any domain above to load SE Ranking overview, backlinks, and top pages.
          </p>
        ) : null}
      </div>
    </SerankingShell>
  );
}
