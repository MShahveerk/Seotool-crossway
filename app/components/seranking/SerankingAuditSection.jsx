"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { AlertTriangle, CheckCircle2, Shield } from "lucide-react";
import SerankingShell, { formatSerankingNum, useSerankingStatus } from "./SerankingShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function severityVariant(type) {
  const t = String(type || "").toLowerCase();
  if (t === "error" || t === "critical") return "destructive";
  if (t === "warning") return "secondary";
  return "outline";
}

export default function SerankingAuditSection({ selectedSite = "" }) {
  const { data: session } = useSession();
  const hasGlobalAccess = session?.user?.role === "super_admin" || session?.user?.role === "smm";
  const { credits, status: metaStatus, reload: reloadMeta } = useSerankingStatus(selectedSite);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);
  const [normalized, setNormalized] = useState(null);
  const [runStatus, setRunStatus] = useState("");
  const [progress, setProgress] = useState(null);

  const auditMaxPages = 20;
  const auditCost = auditMaxPages * 2;

  const load = useCallback(async () => {
    const site = hasGlobalAccess ? selectedSite : session?.user?.siteLink;
    if (!site?.startsWith("http")) return;
    setLoading(true);
    setError("");
    const q = new URLSearchParams();
    if (hasGlobalAccess) q.set("url", site);
    try {
      const res = await fetch(`/api/seranking/audit?${q}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load audit.");
      } else {
        setPayload(data.data);
        setNormalized(data.normalized || data.data?.normalized || null);
        setRunStatus(data.status || "");
        setProgress(data.progress ?? null);
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [selectedSite, hasGlobalAccess, session?.user?.siteLink]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (runStatus !== "running") return undefined;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [runStatus, load]);

  const startAudit = async () => {
    const site = hasGlobalAccess ? selectedSite : session?.user?.siteLink;
    if (!site?.startsWith("http")) return;
    setRefreshing(true);
    setError("");
    const q = new URLSearchParams();
    if (hasGlobalAccess) q.set("url", site);
    try {
      const res = await fetch(`/api/seranking/audit?${q}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Could not start audit.");
      else {
        setRunStatus(data.status || "running");
        reloadMeta();
      }
    } catch {
      setError("Network error.");
    } finally {
      setRefreshing(false);
      load();
    }
  };

  const report = useMemo(() => {
    if (normalized) return normalized;
    const raw = payload?.normalized || payload?.report || payload;
    if (raw?.score != null || raw?.sections) return raw;
    return null;
  }, [normalized, payload]);

  const sections = report?.sections || [];

  return (
    <SerankingShell
      title="SE Ranking Site Audit"
      description={`Technical crawl via SE Ranking (max ${auditMaxPages} pages ≈ ${auditCost} credits). Cached 30 days; nightly rotation refreshes stale sites.`}
      selectedSite={selectedSite}
      loading={loading}
      error={error}
      credits={credits}
      configured={metaStatus?.configured !== false}
      fetchedAt={metaStatus?.snapshots?.audit_report?.fetchedAt}
      expiresAt={metaStatus?.snapshots?.audit_report?.expiresAt}
      onRefresh={startAudit}
      refreshing={refreshing}
      refreshDisabled={(credits?.remaining ?? 0) < auditCost || runStatus === "running"}
      refreshLabel={runStatus === "running" ? "Audit running…" : `Run audit (~${auditCost} cr)`}
    >
      {runStatus === "running" ? (
        <Card className="border-amber-200 bg-amber-50/50 shadow-sm mb-4">
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-medium text-amber-950">Crawl in progress — this page auto-refreshes every 15s.</p>
            {progress != null ? (
              <div className="h-2 w-full rounded-full bg-amber-200/80 overflow-hidden">
                <div
                  className="h-full bg-amber-600 transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, Number(progress)))}%` }}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {report?.hasData !== false && report?.score != null ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Card className="shadow-sm border-emerald-100 bg-emerald-50/40">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground">
                  <Shield className="size-4" />
                  Health score
                </div>
                <p className="mt-2 text-4xl font-bold tabular-nums">{report.score ?? "—"}</p>
                {report.totalPages != null ? (
                  <p className="text-xs text-muted-foreground mt-1">{formatSerankingNum(report.totalPages)} pages crawled</p>
                ) : null}
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase text-destructive">
                  <AlertTriangle className="size-4" />
                  Errors
                </div>
                <p className="mt-2 text-3xl font-bold tabular-nums">{formatSerankingNum(report.totalErrors)}</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs font-bold uppercase text-muted-foreground">Warnings</p>
                <p className="mt-2 text-3xl font-bold tabular-nums">{formatSerankingNum(report.totalWarnings)}</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground">
                  <CheckCircle2 className="size-4" />
                  Notices
                </div>
                <p className="mt-2 text-3xl font-bold tabular-nums">{formatSerankingNum(report.totalNotices)}</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs font-bold uppercase text-muted-foreground">Passed checks</p>
                <p className="mt-2 text-3xl font-bold tabular-nums text-emerald-700">{formatSerankingNum(report.totalPassed)}</p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            {sections.map((sec) => (
              <Card key={sec.uid || sec.name} className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{sec.name || sec.uid}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {sec.checks?.length ? (
                    <ul className="divide-y divide-border/60">
                      {sec.checks.slice(0, 15).map((chk) => (
                        <li key={chk.code} className="py-2.5 flex items-start justify-between gap-3 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium">{chk.name || chk.code}</p>
                            {chk.count != null ? (
                              <p className="text-xs text-muted-foreground mt-0.5">{formatSerankingNum(chk.count)} URLs affected</p>
                            ) : null}
                          </div>
                          <Badge variant={severityVariant(chk.type)} className="shrink-0 capitalize">
                            {chk.type || "notice"}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground py-2">No issues in this category.</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {runStatus === "running"
            ? "Waiting for crawl to finish…"
            : "No audit report yet — one starts automatically when you open this page, or run manually above."}
        </p>
      )}
    </SerankingShell>
  );
}
