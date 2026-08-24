"use client";

import { Fragment, useCallback, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Shield,
  Wrench,
} from "lucide-react";
import { formatSerankingNum } from "./SerankingShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function severityVariant(type) {
  const t = String(type || "").toLowerCase();
  if (t === "error" || t === "critical") return "destructive";
  if (t === "warning") return "secondary";
  return "outline";
}

function SnippetBlock({ snippet }) {
  if (!snippet || typeof snippet !== "object") return null;
  const entries = Object.entries(snippet).filter(([, v]) => v != null && v !== "");
  if (!entries.length) return null;
  return (
    <div className="mt-3 rounded-md border border-border/60 bg-muted/30 p-3 text-xs">
      <p className="font-bold uppercase text-muted-foreground mb-2">Evidence from crawl</p>
      <dl className="space-y-1.5">
        {entries.map(([key, val]) => (
          <div key={key}>
            <dt className="font-medium text-muted-foreground inline">{key}: </dt>
            <dd className="inline break-all">
              {typeof val === "object" ? JSON.stringify(val, null, 2) : String(val)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function AuditIssueRow({ check, auditId, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [urls, setUrls] = useState(null);
  const [urlsLoading, setUrlsLoading] = useState(false);
  const [urlsError, setUrlsError] = useState("");
  const [urlsTotal, setUrlsTotal] = useState(null);

  const loadUrls = useCallback(async () => {
    if (!auditId || !check?.code || urlsLoading) return;
    setUrlsLoading(true);
    setUrlsError("");
    try {
      const q = new URLSearchParams({ auditId: String(auditId), code: check.code, limit: "50" });
      const res = await fetch(`/api/seranking/audit/details?${q}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load URLs");
      setUrls(Array.isArray(data.urls) ? data.urls : []);
      setUrlsTotal(data.totalUrls ?? data.urls?.length ?? 0);
    } catch (err) {
      setUrlsError(err.message || "Could not load affected URLs.");
    } finally {
      setUrlsLoading(false);
    }
  }, [auditId, check?.code, urlsLoading]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && auditId && check?.code && urls == null && (check.count ?? 0) > 0) {
      loadUrls();
    }
  };

  return (
    <li className="border-b border-border/50 last:border-0">
      <button
        type="button"
        onClick={toggle}
        className="w-full py-3 flex items-start justify-between gap-3 text-sm text-left hover:bg-muted/30 px-1 -mx-1 rounded-md transition-colors"
      >
        <div className="flex items-start gap-2 min-w-0 flex-1">
          {open ? (
            <ChevronDown className="size-4 shrink-0 mt-0.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 shrink-0 mt-0.5 text-muted-foreground" />
          )}
          <div className="min-w-0">
            <p className="font-medium">{check.title || check.name || check.code}</p>
            {check.code ? (
              <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{check.code}</p>
            ) : null}
            {check.count != null ? (
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatSerankingNum(check.count)} URL{check.count === 1 ? "" : "s"} affected
              </p>
            ) : null}
          </div>
        </div>
        <Badge variant={severityVariant(check.type || check.severity)} className="shrink-0 capitalize">
          {check.type || check.severity || "notice"}
        </Badge>
      </button>

      {open ? (
        <div className="pb-4 pl-6 pr-1 space-y-4 text-sm">
          {check.description ? (
            <div>
              <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">What this means</p>
              <p className="text-muted-foreground leading-relaxed">{check.description}</p>
            </div>
          ) : null}

          {check.impact ? (
            <div>
              <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Why it matters</p>
              <p className="text-muted-foreground leading-relaxed">{check.impact}</p>
            </div>
          ) : null}

          {check.fixSteps?.length ? (
            <div>
              <p className="text-[10px] font-bold uppercase text-muted-foreground mb-2 flex items-center gap-1">
                <Wrench className="size-3" />
                How to fix
              </p>
              <ol className="list-decimal list-inside space-y-2 text-muted-foreground leading-relaxed">
                {check.fixSteps.map((step, i) => (
                  <li key={i} className="pl-1">
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          <SnippetBlock snippet={check.snippet} />

          {auditId && check.code && (check.count ?? 0) > 0 ? (
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Affected URLs</p>
                {urls == null && !urlsLoading ? (
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={loadUrls}>
                    Load URLs
                  </Button>
                ) : null}
                {urlsTotal != null ? (
                  <span className="text-xs text-muted-foreground">
                    Showing {urls?.length ?? 0} of {formatSerankingNum(urlsTotal)}
                  </span>
                ) : null}
              </div>
              {urlsLoading ? <p className="text-xs text-muted-foreground">Loading affected URLs…</p> : null}
              {urlsError ? <p className="text-xs text-destructive">{urlsError}</p> : null}
              {urls?.length ? (
                <ul className="rounded-md border border-border/60 divide-y divide-border/40 max-h-48 overflow-y-auto text-xs">
                  {urls.map((u) => (
                    <li key={u} className="px-3 py-2 truncate">
                      <a
                        href={u}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#b184ff] hover:underline inline-flex items-center gap-1 max-w-full"
                        title={u}
                      >
                        <span className="truncate">{u}</span>
                        <ExternalLink className="size-3 shrink-0" />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : urls && !urls.length ? (
                <p className="text-xs text-muted-foreground">No URLs returned for this issue.</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function AuditPageRow({ page, auditId }) {
  const [open, setOpen] = useState(false);
  const [issues, setIssues] = useState(null);
  const [pageData, setPageData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadIssues = async () => {
    if (!auditId || loading) return;
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({ auditId: String(auditId) });
      if (page.id) q.set("urlId", String(page.id));
      else if (page.url) q.set("url", page.url);
      const res = await fetch(`/api/seranking/audit/details?${q}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load page issues");
      setIssues(Array.isArray(data.issues) ? data.issues : []);
      setPageData(data.pageData || null);
    } catch (err) {
      setError(err.message || "Could not load page issues.");
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && issues == null) loadIssues();
  };

  const issueCount = page.issues ?? page.errors ?? 0;

  return (
    <Fragment>
      <tr
        className={`border-b border-border/40 cursor-pointer hover:bg-muted/30 ${open ? "bg-muted/20" : ""}`}
        onClick={toggle}
      >
        <td className="py-2 pr-2 w-6 text-muted-foreground">
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </td>
        <td className="py-2 pr-3 max-w-md truncate" title={page.url}>
          {page.url}
        </td>
        <td className="py-2 px-2 text-right tabular-nums">{page.status ?? "—"}</td>
        <td className="py-2 px-2 text-right tabular-nums">{issueCount || "—"}</td>
        <td className="py-2 px-2 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
          {page.loadMs != null ? `${page.loadMs} ms` : "—"}
        </td>
      </tr>
      {open ? (
        <tr className="bg-muted/10">
          <td colSpan={5} className="p-4">
            {loading ? <p className="text-sm text-muted-foreground">Loading page issues…</p> : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {pageData ? (
              <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {pageData.title ? (
                  <div className="col-span-2 sm:col-span-4">
                    <span className="font-bold text-muted-foreground">Title: </span>
                    {pageData.title}
                  </div>
                ) : null}
                {pageData.h1 ? (
                  <div className="col-span-2">
                    <span className="font-bold text-muted-foreground">H1: </span>
                    {pageData.h1}
                  </div>
                ) : null}
                {pageData.words != null || pageData.words_count != null ? (
                  <div>
                    <span className="font-bold text-muted-foreground">Words: </span>
                    {pageData.words ?? pageData.words_count}
                  </div>
                ) : null}
                {pageData.inlinks != null ? (
                  <div>
                    <span className="font-bold text-muted-foreground">Inlinks: </span>
                    {pageData.inlinks}
                  </div>
                ) : null}
              </div>
            ) : null}
            {issues?.length ? (
              <ul className="divide-y divide-border/50 border border-border/60 rounded-md">
                {issues.map((issue) => (
                  <AuditIssueRow key={issue.code} check={issue} auditId={null} />
                ))}
              </ul>
            ) : issues && !issues.length ? (
              <p className="text-sm text-muted-foreground">No issues on this page.</p>
            ) : null}
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

export default function SerankingAuditReport({ report, auditId = null, pages = [], showPages = true }) {
  if (!report || report.hasData === false) return null;

  const sections = report.sections || [];

  return (
    <div className="space-y-6">
      {report.score != null ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3" data-guide="intel-scores">
          <Card className="shadow-sm border-[color-mix(in_srgb,var(--cw-neon)_32%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-neon)_10%,var(--cw-surface))]">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground">
                <Shield className="size-4" />
                Health score
              </div>
              <p className="mt-2 text-4xl font-bold tabular-nums">{report.score ?? "—"}</p>
              {report.totalPages != null ? (
                <p className="text-xs text-muted-foreground mt-1">
                  {formatSerankingNum(report.totalPages)} pages crawled
                </p>
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
              <p className="mt-2 text-3xl font-bold tabular-nums text-[var(--cw-neon)]">
                {formatSerankingNum(report.totalPassed)}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="space-y-4" data-guide="intel-issues">
      <p className="text-xs text-muted-foreground">
        Expand any issue for a full explanation, SEO impact, step-by-step fix guide, and affected URLs.
      </p>
        {sections.map((sec) => (
          <Card key={sec.uid || sec.name} className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="size-4 text-[var(--cw-caution)]" />
                {sec.name || sec.uid}
                {sec.checks?.length ? (
                  <Badge variant="secondary" className="ml-auto tabular-nums font-normal">
                    {sec.checks.length} issue{sec.checks.length === 1 ? "" : "s"}
                  </Badge>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {sec.checks?.length ? (
                <ul>
                  {sec.checks.map((chk) => (
                    <AuditIssueRow key={chk.code} check={chk} auditId={auditId} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground py-2">No open issues in this category.</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {showPages && pages?.length && auditId ? (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Crawled pages</CardTitle>
            <p className="text-xs text-muted-foreground font-normal mt-1">
              Expand a row to see all issues on that URL with fix guidance.
            </p>
          </CardHeader>
          <CardContent className="pt-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b text-left text-[11px] font-bold uppercase text-muted-foreground">
                  <th className="py-2 w-6" />
                  <th className="py-2 pr-3">URL</th>
                  <th className="py-2 px-2 text-right">Status</th>
                  <th className="py-2 px-2 text-right">Issues</th>
                  <th className="py-2 px-2 text-right hidden sm:table-cell">Load</th>
                </tr>
              </thead>
              <tbody>
                {pages.slice(0, 50).map((p, i) => (
                  <AuditPageRow key={p.id || p.url || i} page={p} auditId={auditId} />
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
