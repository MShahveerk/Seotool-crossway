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

  const report = payload?.report || payload;
  const sections = useMemo(() => {
    const secs = report?.sections || report?.data?.sections;
    return Array.isArray(secs) ? secs : [];
  }, [report]);

  const healthScore = report?.score ?? report?.health_score ?? report?.healthScore;
  const issueCounts = useMemo(() => {
    let errors = 0;
    let warnings = 0;
    let notices = 0;
    for (const sec of sections) {
      for (const chk of sec.checks || sec.issues || []) {
        const t = String(chk.type || chk.severity || "").toLowerCase();
        if (t === "error") errors += 1;
        else if (t === "warning") warnings += 1;
        else notices += 1;
      }
    }
    return { errors, warnings, notices };
  }, [sections]);

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

      {report ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="shadow-sm border-emerald-100 bg-emerald-50/40">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground">
                  <Shield className="size-4" />
                  Health score
                </div>
                <p className="mt-2 text-4xl font-bold tabular-nums">{healthScore ?? "—"}</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase text-destructive">
                  <AlertTriangle className="size-4" />
                  Errors
                </div>
                <p className="mt-2 text-3xl font-bold tabular-nums">{formatSerankingNum(issueCounts.errors)}</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs font-bold uppercase text-muted-foreground">Warnings</p>
                <p className="mt-2 text-3xl font-bold tabular-nums">{formatSerankingNum(issueCounts.warnings)}</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground">
                  <CheckCircle2 className="size-4" />
                  Notices
                </div>
                <p className="mt-2 text-3xl font-bold tabular-nums">{formatSerankingNum(issueCounts.notices)}</p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            {sections.map((sec, si) => (
              <Card key={si} className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{sec.name || sec.title || sec.uid || `Section ${si + 1}`}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <ul className="divide-y divide-border/60">
                    {(sec.checks || sec.issues || []).slice(0, 12).map((chk, ci) => (
                      <li key={ci} className="py-2.5 flex items-start justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium">{chk.name || chk.message || chk.code}</p>
                          {chk.count != null ? (
                            <p className="text-xs text-muted-foreground mt-0.5">{formatSerankingNum(chk.count)} URLs affected</p>
                          ) : null}
                        </div>
                        <Badge variant={severityVariant(chk.type || chk.severity)} className="shrink-0 capitalize">
                          {chk.type || chk.severity || "notice"}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {runStatus === "running"
            ? "Waiting for crawl to finish…"
            : "No audit report yet. Nightly scheduled refresh will queue a crawl, or run one manually above."}
        </p>
      )}
    </SerankingShell>
  );
}
