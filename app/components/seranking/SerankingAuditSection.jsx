"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import SerankingShell, { useSerankingStatus } from "./SerankingShell";
import SerankingAuditReport from "./SerankingAuditReport";
import { Card, CardContent } from "@/components/ui/card";

export default function SerankingAuditSection({ selectedSite = "" }) {
  const { data: session } = useSession();
  const hasGlobalAccess = session?.user?.role === "super_admin" || session?.user?.role === "smm";
  const { credits, status: metaStatus, reload: reloadMeta } = useSerankingStatus(selectedSite);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);
  const [normalized, setNormalized] = useState(null);
  const [auditId, setAuditId] = useState(null);
  const [pages, setPages] = useState([]);
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
        setAuditId(data.auditId || data.data?.auditId || null);
        setPages(Array.isArray(data.pages) ? data.pages : []);
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
    const t = setInterval(load, 30000);
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

  return (
    <SerankingShell
      title="SE Ranking Site Audit"
      description={`Technical crawl via SE Ranking (max ${auditMaxPages} pages ≈ ${auditCost} credits). Each issue includes full details and step-by-step fix guidance.`}
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
            <p className="text-sm font-medium text-amber-950">Crawl in progress — this page auto-refreshes every 30s.</p>
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
        <SerankingAuditReport report={report} auditId={auditId} pages={pages} />
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
