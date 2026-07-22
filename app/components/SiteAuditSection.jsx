"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  FiShield,
  FiRefreshCw,
  FiClock,
  FiExternalLink,
  FiChevronDown,
  FiChevronRight,
  FiCheckCircle,
  FiAlertTriangle,
  FiAlertOctagon,
  FiInfo,
  FiTool,
  FiSearch,
  FiAward,
  FiGlobe,
  FiLayers,
  FiZap,
} from "react-icons/fi";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { isMetaPageId } from "../../lib/siteAccess";

/* ---------------------------------- utils ---------------------------------- */

function siteHost(url) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return String(url).replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || "";
  }
}

function pathOf(url) {
  try {
    const u = new URL(url);
    return u.pathname + u.search || "/";
  } catch {
    return url;
  }
}

/** Host + path so "/" becomes "example.com/" instead of a bare slash. */
function displayUrl(url, maxLen = 72) {
  if (!url) return "";
  try {
    const u = new URL(url);
    const label = u.hostname.replace(/^www\./, "") + (u.pathname + u.search || "/");
    return label.length > maxLen ? `${label.slice(0, maxLen - 1)}…` : label;
  } catch {
    return String(url).slice(0, maxLen);
  }
}

function formatDateTime(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function formatAgo(value) {
  if (!value) return "";
  const mins = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function healthTone(score) {
  if (score == null) return { ring: "#d1d5db", text: "text-gray-400", bg: "bg-gray-50", label: "No data" };
  if (score >= 90) return { ring: "#1d9c35", text: "text-emerald-700", bg: "bg-emerald-50", label: "Excellent" };
  if (score >= 70) return { ring: "#84cc16", text: "text-lime-700", bg: "bg-lime-50", label: "Good" };
  if (score >= 50) return { ring: "#f59e0b", text: "text-amber-700", bg: "bg-amber-50", label: "Needs work" };
  return { ring: "#ef4444", text: "text-red-700", bg: "bg-red-50", label: "Poor" };
}

const SEVERITY_META = {
  critical: {
    label: "Critical",
    icon: FiAlertOctagon,
    text: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    chip: "bg-red-100 text-red-700",
    dot: "bg-red-500",
    blurb: "Errors that actively hurt rankings or break pages — fix these first.",
  },
  warning: {
    label: "Warnings",
    icon: FiAlertTriangle,
    text: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    chip: "bg-amber-100 text-amber-700",
    dot: "bg-amber-500",
    blurb: "Problems that limit performance or click-through — fix after criticals.",
  },
  notice: {
    label: "Notices",
    icon: FiInfo,
    text: "text-sky-700",
    bg: "bg-sky-50",
    border: "border-sky-200",
    chip: "bg-sky-100 text-sky-700",
    dot: "bg-sky-400",
    blurb: "Polish and best-practice improvements — nice wins when time allows.",
  },
};

/* ------------------------------- health ring ------------------------------- */

function HealthRing({ score, label = "Health Score", sublabel }) {
  const value = typeof score === "number" ? Math.max(0, Math.min(100, score)) : null;
  const radius = 62;
  const stroke = 11;
  const r = radius - stroke / 2;
  const circumference = 2 * Math.PI * r;
  const offset = value == null ? circumference : circumference - (value / 100) * circumference;
  const tone = healthTone(value);

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[132px] w-[132px]">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 132 132" aria-hidden>
          <circle cx="66" cy="66" r={r} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
          <circle
            cx="66"
            cy="66"
            r={r}
            fill="none"
            stroke={tone.ring}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-4xl font-bold tabular-nums ${tone.text}`}>
            {value == null ? "N/A" : value}
          </span>
          {value != null ? (
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">/ 100</span>
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">incomplete</span>
          )}
        </div>
      </div>
      <p className="mt-2 text-sm font-bold text-gray-900">{label}</p>
      {sublabel ? <p className="text-[10px] text-gray-500 mt-0.5 text-center max-w-[140px]">{sublabel}</p> : null}
      <span className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone.bg} ${tone.text}`}>
        {tone.label}
      </span>
    </div>
  );
}

/* -------------------------------- issue card ------------------------------- */

function IssueCard({ issue, expanded, onToggle }) {
  const sev = SEVERITY_META[issue.severity] || SEVERITY_META.notice;
  const Icon = sev.icon;

  return (
    <div className={`rounded-2xl border bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden ${expanded ? sev.border : "border-gray-100"}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50/70 transition-colors"
      >
        <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${sev.bg}`}>
          <Icon className={`h-4 w-4 ${sev.text}`} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-gray-900">{issue.title}</span>
          <span className="block text-xs text-gray-500 mt-0.5 line-clamp-1">{issue.description}</span>
        </span>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${sev.chip}`}>
          {issue.count}{" "}
          {issue.source === "pagespeed" || issue.source === "gsc"
            ? issue.count === 1
              ? "finding"
              : "findings"
            : issue.count === 1
              ? "page"
              : "pages"}
        </span>
        {expanded ? (
          <FiChevronDown className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
        ) : (
          <FiChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
        )}
      </button>

      {expanded ? (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3">
          <p className="text-sm text-gray-600 leading-relaxed">{issue.description}</p>

          {issue.fixSteps?.length ? (
            <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-800">
                <FiTool className="h-3.5 w-3.5" aria-hidden />
                How to fix — step by step
              </p>
              <ol className="mt-2.5 space-y-2">
                {issue.fixSteps.map((step, idx) => (
                  <li key={idx} className="flex gap-2.5 text-sm text-emerald-900 leading-relaxed">
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white">
                      {idx + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {issue.pages?.length ? (
            <div className="mt-4 overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-3 py-2 font-semibold text-gray-600">Affected page</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {issue.pages.map((pg, idx) => (
                    <tr key={idx} className="border-b border-gray-50 last:border-0 align-top">
                      <td className="px-3 py-2">
                        <a
                          href={pg.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block max-w-[420px] truncate text-[#1d9c35] hover:underline"
                          title={pg.url}
                        >
                          {displayUrl(pg.url)}
                        </a>
                      </td>
                      <td className="px-3 py-2 text-gray-600 break-words max-w-[380px]">{pg.detail || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {issue.count > issue.pages.length ? (
                <p className="px-3 py-2 text-[11px] text-gray-400 bg-gray-50/50">
                  Showing {issue.pages.length} of {issue.count} affected pages.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SeverityGroup({ severity, issues, expandedSet, onToggle }) {
  const sev = SEVERITY_META[severity];
  const list = issues.filter((i) => i.severity === severity);
  const totalPages = list.reduce((acc, i) => acc + i.count, 0);
  const Icon = sev.icon;

  return (
    <section>
      <div className="mb-3 flex items-center gap-2.5">
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${sev.bg}`}>
          <Icon className={`h-4.5 w-4.5 ${sev.text}`} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-gray-900">
            {sev.label}
            <span className={`ml-2 align-middle rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${sev.chip}`}>
              {list.length} {list.length === 1 ? "issue" : "issues"} · {totalPages} {totalPages === 1 ? "page" : "pages"}
            </span>
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">{sev.blurb}</p>
        </div>
      </div>
      {list.length ? (
        <div className="space-y-3">
          {list.map((issue) => (
            <IssueCard key={issue.id} issue={issue} expanded={expandedSet.has(issue.id)} onToggle={() => onToggle(issue.id)} />
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-2xl border border-gray-100 bg-white px-4 py-4 text-sm text-gray-500 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
          <FiCheckCircle className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden />
          No {sev.label.toLowerCase()} found — great job.
        </div>
      )}
    </section>
  );
}

/* -------------------------------- pages table ------------------------------ */

function statusChip(status) {
  if (status === 200) return "bg-emerald-50 text-emerald-700";
  if (status >= 500 || status === 0) return "bg-red-100 text-red-700";
  if (status >= 400) return "bg-red-50 text-red-700";
  if (status >= 300) return "bg-amber-50 text-amber-700";
  return "bg-gray-100 text-gray-600";
}

function PagesTable({ pages }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter((p) => p.url.toLowerCase().includes(q) || (p.title || "").toLowerCase().includes(q));
  }, [pages, filter]);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50"
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
          <FiLayers className="h-4 w-4 text-gray-600" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-gray-900">Crawled pages inventory</span>
          <span className="block text-xs text-gray-500 mt-0.5">Every URL the crawler visited, with on-page stats</span>
        </span>
        <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold tabular-nums text-gray-700">
          {pages.length}
        </span>
        {open ? (
          <FiChevronDown className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
        ) : (
          <FiChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
        )}
      </button>

      {open ? (
        <div className="border-t border-gray-100">
          <div className="p-3">
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by URL or title…"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#1d9c35] focus:bg-white focus:outline-none"
              />
            </div>
          </div>
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="border-b border-gray-100">
                  <th className="px-3 py-2 font-semibold text-gray-600">URL</th>
                  <th className="px-3 py-2 font-semibold text-gray-600">Status</th>
                  <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap">Depth</th>
                  <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap">Response</th>
                  <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap">Title len</th>
                  <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap">Words</th>
                  <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap">H1s</th>
                  <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap">Indexable</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, idx) => (
                  <tr key={idx} className="border-b border-gray-50 last:border-0">
                    <td className="px-3 py-2">
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block max-w-[360px] truncate text-[#1d9c35] hover:underline"
                        title={p.url}
                      >
                        {pathOf(p.url)}
                      </a>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${statusChip(p.status)}`}>
                        {p.status === 0 ? "ERR" : p.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-gray-600">{p.depth}</td>
                    <td className="px-3 py-2 tabular-nums text-gray-600">
                      {p.responseMs != null ? `${(p.responseMs / 1000).toFixed(1)} s` : "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-gray-600">{p.titleLength || "—"}</td>
                    <td className="px-3 py-2 tabular-nums text-gray-600">{p.wordCount ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums text-gray-600">{p.h1Count ?? "—"}</td>
                    <td className="px-3 py-2">
                      {p.status === 200 && !p.noindex ? (
                        <FiCheckCircle className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                      ) : (
                        <span className="text-[11px] font-semibold text-gray-400">{p.noindex ? "noindex" : "no"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length ? <p className="px-4 py-6 text-center text-sm text-gray-400">No pages match the filter.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------- trend chart ------------------------------ */

function TrendChart({ trend }) {
  const data = (trend || [])
    .filter((t) => t.healthScore != null)
    .map((t) => ({
      date: new Date(t.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      score: t.healthScore,
    }));
  if (data.length < 2) return null;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-3">Health score trend</p>
      <div className="h-[160px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -22 }}>
            <defs>
              <linearGradient id="auditHealthGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1d9c35" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#1d9c35" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
              formatter={(v) => [`${v} / 100`, "Health"]}
            />
            <Area type="monotone" dataKey="score" stroke="#1d9c35" strokeWidth={2.5} fill="url(#auditHealthGrad)" dot={{ r: 3 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ----------------------------------- main ----------------------------------- */

export default function SiteAuditSection({ selectedSite = "", onNavigateSection }) {
  const { data: session } = useSession();
  const hasGlobalAccess = session?.user?.role === "super_admin" || session?.user?.role === "smm";
  const userSiteLink = session?.user?.siteLink || "";
  const effectiveSite = hasGlobalAccess ? selectedSite || userSiteLink : userSiteLink;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());
  const pollRef = useRef(null);

  const needsWebsite = useMemo(() => {
    if (!effectiveSite) return true;
    if (String(effectiveSite).startsWith("http") || String(effectiveSite).startsWith("sc-domain:")) return false;
    return isMetaPageId(effectiveSite);
  }, [effectiveSite]);

  const load = useCallback(async () => {
    if (!effectiveSite || needsWebsite) {
      setLoading(false);
      setData(null);
      return null;
    }
    try {
      const q = new URLSearchParams({ url: effectiveSite });
      const res = await fetch(`/api/site-audit?${q.toString()}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to load site audit");
      setData(body);
      setError("");
      return body;
    } catch (err) {
      setError(err.message || "Failed to load site audit");
      return null;
    } finally {
      setLoading(false);
    }
  }, [effectiveSite, needsWebsite]);

  const runAudit = useCallback(async () => {
    if (!effectiveSite || needsWebsite || auditing) return;
    setAuditing(true);
    setError("");
    try {
      const q = new URLSearchParams({ url: effectiveSite, refresh: "1" });
      const res = await fetch(`/api/site-audit?${q.toString()}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Audit failed");
      setData(body);
    } catch (err) {
      // The crawl may still be running server-side even if this request timed out
      await load();
      if (!err.message?.includes("Failed to fetch")) setError(err.message || "Audit failed");
    } finally {
      setAuditing(false);
    }
  }, [effectiveSite, needsWebsite, auditing, load]);

  useEffect(() => {
    setData(null);
    setLoading(true);
    setExpanded(new Set());
    load();
  }, [load]);

  // Poll while a crawl started by cron / another session is in flight
  useEffect(() => {
    if (data?.running && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        const fresh = await load();
        if (fresh && !fresh.running) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }, 12000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [data?.running, load]);

  const toggleIssue = useCallback((id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const snapshot = data?.snapshot || null;
  const host = siteHost(data?.siteUrl || effectiveSite);
  const supplemental = data?.supplemental;
  const useSupplemental = data?.auditMode === "supplemental" && supplemental?.available;
  const supplementalFailed = Boolean(supplemental && !supplemental.available);
  const displayIssues = useSupplemental ? supplemental?.issues || [] : snapshot?.issues || [];
  const displayCounts = useSupplemental ? supplemental?.counts : snapshot?.counts;
  const showMainContent = Boolean(snapshot || useSupplemental);
  const crawlQuality = snapshot?.stats?.crawlQuality || "complete";
  const crawlMessage = snapshot?.stats?.crawlMessage;
  const lowCoverage =
    !useSupplemental &&
    (crawlQuality !== "complete" ||
      (snapshot?.totalPages != null && snapshot.totalPages <= 1 && (snapshot?.stats?.sitemapUrls || 0) > 3));

  if (needsWebsite) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center min-h-[calc(100vh-2rem)] flex flex-col items-center justify-center">
        <FiShield className="w-10 h-10 text-gray-300 mb-4" aria-hidden />
        <p className="text-sm text-gray-600 max-w-md">
          Select a website from the client dropdown to view its Site Audit. Meta-only pages need a linked website URL.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 min-h-[calc(100vh-2rem)]">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h2 className="text-[26px] font-semibold text-gray-900">Site Audit</h2>
          <p className="text-sm text-gray-600 mt-1.5 max-w-2xl">
            {useSupplemental
              ? "External crawl was blocked or incomplete. Showing a supplemental audit from Google PageSpeed (homepage) and Search Console — not a full sitewide HTML crawl."
              : "A full technical SEO crawl of the website — health score, every issue found, and exact steps to fix each one. Audits run automatically every night for all websites."}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-gray-600">
            <a
              href={data?.siteUrl || effectiveSite}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#1d9c35] hover:underline font-medium"
            >
              {host}
              <FiExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden />
            </a>
            {snapshot?.finishedAt ? (
              <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                <FiClock className="w-3.5 h-3.5" aria-hidden />
                Last crawled {formatAgo(snapshot.finishedAt)} ({formatDateTime(snapshot.finishedAt)})
              </span>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={runAudit}
          disabled={loading || auditing || data?.running}
          className="inline-flex shrink-0 items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <FiRefreshCw className={`w-4 h-4 ${auditing || data?.running ? "animate-spin" : ""}`} aria-hidden />
          {auditing || data?.running ? "Crawling…" : "Run audit now"}
        </button>
      </div>

      {/* Banners */}
      {(auditing || data?.running) && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          <FiRefreshCw className="w-4 h-4 animate-spin shrink-0" aria-hidden />
          Crawling {host} page by page — this can take a few minutes depending on site size.
          {snapshot ? " Showing the previous audit until it finishes." : ""}
        </div>
      )}
      {error ? (
        <div className="mb-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <FiInfo className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}
      {data?.lastError && !snapshot && !error ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          The last audit attempt failed ({data.lastError}). Try running it again.
        </div>
      ) : null}
      {snapshot && lowCoverage ? (
        <div className="mb-6 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <FiAlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <div>
            <p className="font-semibold">
              {crawlQuality === "blocked"
                ? data?.auditMode === "supplemental"
                  ? "External crawl blocked — showing supplemental audit below"
                  : "External crawl blocked — full HTML crawl unavailable from this server"
                : data?.auditMode === "supplemental"
                  ? "Incomplete crawl — supplemental data added below"
                  : "Incomplete crawl — results may not cover the full site"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-amber-800">
              {crawlMessage ||
                `Only ${snapshot.totalPages} page(s) were crawled${
                  snapshot.stats?.sitemapUrls ? ` (sitemap has ${snapshot.stats.sitemapUrls} URLs)` : ""
                }. Full sitewide HTML checks require server access or the WordPress plugin.`}
            </p>
          </div>
        </div>
      ) : null}
      {useSupplemental ? (
        <div className="mb-6 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <FiInfo className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <div>
            <p className="font-semibold">{supplemental.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-sky-800">{supplemental.description}</p>
            {supplemental.errors?.length ? (
              <ul className="mt-2 text-xs text-sky-700 list-disc pl-4 space-y-0.5">
                {supplemental.errors.map((e, i) => (
                  <li key={i}>
                    {e.source}: {e.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-gray-300 border-t-[#1d9c35]" />
          <p className="text-sm text-gray-500">Loading site audit…</p>
        </div>
      ) : showMainContent ? (
        <div className={`space-y-10 ${auditing ? "opacity-70 transition-opacity" : ""}`}>
          {/* Overview */}
          <section className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-5 items-stretch">
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)] flex items-center justify-center lg:min-w-[220px]">
              {useSupplemental ? (
                <HealthRing
                  score={supplemental.healthScore}
                  label="Supplemental Score"
                  sublabel={
                    supplemental.pagespeed?.lighthouseSeoScore != null
                      ? `From ${displayCounts?.critical ?? 0} critical · ${displayCounts?.warning ?? 0} warning · Lighthouse SEO ${supplemental.pagespeed.lighthouseSeoScore}/100`
                      : "Weighted from PageSpeed + Search Console findings"
                  }
                />
              ) : (
                <HealthRing score={snapshot?.healthScore} />
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {["critical", "warning", "notice"].map((sevId) => {
                const sev = SEVERITY_META[sevId];
                const Icon = sev.icon;
                return (
                  <div key={sevId} className={`rounded-2xl border ${sev.border} ${sev.bg} p-4`}>
                    <p className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${sev.text}`}>
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                      {sev.label}
                    </p>
                    <p className={`mt-2 text-3xl font-bold tabular-nums ${sev.text}`}>
                      {displayCounts?.[sevId] ?? 0}
                    </p>
                    <p className={`text-[11px] mt-0.5 ${sev.text} opacity-70`}>
                      {useSupplemental ? "findings" : "affected pages"}
                    </p>
                  </div>
                );
              })}

              {useSupplemental && supplemental.gsc?.inspection ? (
                <>
                  <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      <FiSearch className="h-3.5 w-3.5" aria-hidden />
                      GSC indexed
                    </p>
                    <p className="mt-2 text-3xl font-bold tabular-nums text-emerald-700">
                      {supplemental.gsc.inspection.indexedCount}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      of {supplemental.gsc.inspection.totalUrls} inspected URLs
                    </p>
                  </div>
                  <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      <FiSearch className="h-3.5 w-3.5" aria-hidden />
                      Not indexed
                    </p>
                    <p className="mt-2 text-3xl font-bold tabular-nums text-red-700">
                      {supplemental.gsc.inspection.notIndexedCount}
                    </p>
                    <button
                      type="button"
                      onClick={() => onNavigateSection?.("url-inspection")}
                      className="text-[11px] text-[#1d9c35] hover:underline mt-0.5"
                    >
                      Open URL Inspection →
                    </button>
                  </div>
                </>
              ) : null}

              {!useSupplemental ? (
                <>
                  <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      <FiGlobe className="h-3.5 w-3.5" aria-hidden />
                      Pages crawled
                    </p>
                    <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">{snapshot.totalPages}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {snapshot.stats?.indexablePages ?? "—"} indexable
                      {snapshot.stats?.sitemapUrls ? ` · ${snapshot.stats.sitemapUrls} in sitemap` : ""}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      <FiZap className="h-3.5 w-3.5" aria-hidden />
                      Avg response
                    </p>
                    <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">
                      {snapshot.stats?.avgResponseMs != null ? `${(snapshot.stats.avgResponseMs / 1000).toFixed(1)}s` : "—"}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">max depth {snapshot.stats?.maxDepth ?? "—"}</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      <FiGlobe className="h-3.5 w-3.5" aria-hidden />
                      GSC sitemaps
                    </p>
                    <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">
                      {supplemental.gsc?.sitemaps?.length ?? 0}
                    </p>
                    <button
                      type="button"
                      onClick={() => onNavigateSection?.("sitemap-health")}
                      className="text-[11px] text-[#1d9c35] hover:underline mt-0.5"
                    >
                      Sitemap Health →
                    </button>
                  </div>
                  <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      <FiZap className="h-3.5 w-3.5" aria-hidden />
                      PageSpeed
                    </p>
                    <p className="mt-2 text-sm font-semibold text-gray-900 truncate">
                      {supplemental.pagespeed?.finalUrl ? displayUrl(supplemental.pagespeed.finalUrl, 28) : host}
                    </p>
                    <button
                      type="button"
                      onClick={() => onNavigateSection?.("pagespeed-insights")}
                      className="text-[11px] text-[#1d9c35] hover:underline mt-0.5"
                    >
                      Full PageSpeed report →
                    </button>
                  </div>
                </>
              )}

              <button
                type="button"
                onClick={() => onNavigateSection?.("domain-authority")}
                className="rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.07)] hover:-translate-y-0.5 transition-all"
              >
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  <FiAward className="h-3.5 w-3.5" aria-hidden />
                  Authority
                </p>
                <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">
                  {data?.authority?.score != null ? data.authority.score.toFixed(1) : "—"}
                  <span className="text-sm font-semibold text-gray-400"> / 10</span>
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {data?.authority?.globalRank
                    ? `global rank #${data.authority.globalRank.toLocaleString()}`
                    : data?.authorityConfigured
                      ? "Open PageRank"
                      : "API key not set"}
                </p>
              </button>
            </div>
          </section>

          {!useSupplemental ? <TrendChart trend={data?.trend} /> : null}

          {/* Issues by severity */}
          {displayIssues.length ? (
            <div className="space-y-8">
              {useSupplemental ? (
                <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">
                  Findings from Google PageSpeed (homepage) & Search Console
                </p>
              ) : null}
              <SeverityGroup severity="critical" issues={displayIssues} expandedSet={expanded} onToggle={toggleIssue} />
              <SeverityGroup severity="warning" issues={displayIssues} expandedSet={expanded} onToggle={toggleIssue} />
              <SeverityGroup severity="notice" issues={displayIssues} expandedSet={expanded} onToggle={toggleIssue} />
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-8 text-center">
              <FiCheckCircle className="mx-auto h-10 w-10 text-emerald-600" aria-hidden />
              <p className="mt-3 text-sm font-semibold text-emerald-900">
                {useSupplemental
                  ? "No supplemental issues flagged from PageSpeed or Search Console."
                  : `No issues found across ${snapshot?.totalPages ?? 0} crawled pages.`}
              </p>
            </div>
          )}

          {/* Pages inventory — full crawl only */}
          {!useSupplemental && snapshot?.pages?.length ? <PagesTable pages={snapshot.pages} /> : null}

          {/* Footer */}
          <section className="rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50 to-white p-5">
            {useSupplemental ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">PageSpeed analyzed</p>
                    <p className="mt-1 font-medium text-gray-900 break-all">
                      {supplemental.pagespeed?.finalUrl || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Lighthouse SEO</p>
                    <p className="mt-1 font-medium text-gray-900 tabular-nums">
                      {supplemental.pagespeed?.lighthouseSeoScore != null
                        ? `${supplemental.pagespeed.lighthouseSeoScore} / 100`
                        : "—"}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Homepage only · separate from supplemental score</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">GSC inspection batch</p>
                    <p className="mt-1 font-medium text-gray-900">
                      {supplemental.gsc?.inspection?.runDate
                        ? formatDateTime(supplemental.gsc.inspection.runDate)
                        : "No daily inspection snapshot yet"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Generated</p>
                    <p className="mt-1 font-medium text-gray-900">{formatDateTime(supplemental.generatedAt)}</p>
                  </div>
                </div>
                <p className="mt-4 flex items-start gap-1.5 border-t border-gray-100 pt-4 text-xs text-gray-500 leading-relaxed">
                  <FiInfo className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gray-400" aria-hidden />
                  Supplemental mode does not replace a full crawl — it shows homepage Lighthouse SEO checks (via Google)
                  and indexing/sitemap signals from Search Console. Enable SEO_URL_INSPECT_DAILY for richer GSC URL
                  samples.
                </p>
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Sitemap URLs found</p>
                    <p className="mt-1 font-medium text-gray-900 tabular-nums">{snapshot.stats?.sitemapUrls ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">External links checked</p>
                    <p className="mt-1 font-medium text-gray-900 tabular-nums">
                      {snapshot.stats?.externalChecked ?? "—"}
                      {snapshot.stats?.brokenExternal ? ` (${snapshot.stats.brokenExternal} broken)` : ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Crawl started</p>
                    <p className="mt-1 font-medium text-gray-900">{formatDateTime(snapshot.startedAt)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Crawl finished</p>
                    <p className="mt-1 font-medium text-gray-900">{formatDateTime(snapshot.finishedAt)}</p>
                  </div>
                </div>
                <p className="mt-4 flex items-start gap-1.5 border-t border-gray-100 pt-4 text-xs text-gray-500 leading-relaxed">
                  <FiInfo className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gray-400" aria-hidden />
                  The crawler visits same-domain pages (seeded from your sitemap, respecting robots.txt) and checks each
                  one against 25+ technical SEO rules. The health score reflects the share of pages free of critical
                  problems. Every website in the system is re-audited automatically each night at 3:30 AM.
                </p>
              </>
            )}
          </section>
        </div>
      ) : !error && !auditing && !data?.running ? (
        supplementalFailed ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center max-w-lg mx-auto">
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50">
              <FiAlertTriangle className="h-8 w-8 text-amber-600" aria-hidden />
            </span>
            <div>
              <p className="text-base font-bold text-gray-900">Crawl blocked — supplemental data unavailable</p>
              <p className="mt-1 text-sm text-gray-500">
                The external crawler could not reach {host}. We tried PageSpeed and Search Console as a fallback, but
                neither returned usable data yet.
              </p>
              {supplemental.errors?.length ? (
                <ul className="mt-3 text-left text-xs text-amber-800 list-disc pl-5 space-y-1">
                  {supplemental.errors.map((e, i) => (
                    <li key={i}>
                      {e.source}: {e.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <button
              type="button"
              onClick={runAudit}
              className="inline-flex items-center gap-2 rounded-xl bg-[#1d9c35] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#178a2c]"
            >
              <FiRefreshCw className="w-4 h-4" aria-hidden />
              Retry audit
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50">
              <FiShield className="h-8 w-8 text-[#1d9c35]" aria-hidden />
            </span>
            <div>
              <p className="text-base font-bold text-gray-900">No audit yet for {host}</p>
              <p className="mt-1 text-sm text-gray-500 max-w-md">
                Run the first crawl now — it takes a few minutes and will then refresh automatically every night.
              </p>
            </div>
            <button
              type="button"
              onClick={runAudit}
              className="inline-flex items-center gap-2 rounded-xl bg-[#1d9c35] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#178a2c]"
            >
              <FiRefreshCw className="w-4 h-4" aria-hidden />
              Run first audit
            </button>
          </div>
        )
      ) : null}
    </div>
  );
}
