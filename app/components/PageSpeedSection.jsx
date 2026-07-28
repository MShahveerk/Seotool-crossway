"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  FiRefreshCw,
  FiSmartphone,
  FiMonitor,
  FiClock,
  FiInfo,
  FiExternalLink,
  FiChevronDown,
  FiChevronRight,
  FiCheckCircle,
  FiAlertTriangle,
  FiAlertOctagon,
  FiTool,
  FiZap,
} from "react-icons/fi";
import { isMetaPageId } from "../../lib/siteAccess";
import { getActionSteps } from "../../lib/pagespeedActionGuides";

/* ---------------------------------- utils ---------------------------------- */

function siteHost(url) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return String(url).replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || "";
  }
}

function scoreTone(score) {
  if (score == null) return { ring: "#d1d5db", text: "text-gray-400", bg: "bg-gray-50", label: "No data" };
  if (score >= 90) return { ring: "#1d9c35", text: "text-emerald-700", bg: "bg-emerald-50", label: "Good" };
  if (score >= 50) return { ring: "#f59e0b", text: "text-amber-700", bg: "bg-amber-50", label: "Needs work" };
  return { ring: "#ef4444", text: "text-red-700", bg: "bg-red-50", label: "Poor" };
}

function formatFetchTime(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function formatAgo(value) {
  if (!value) return "";
  const diffMs = Date.now() - new Date(value).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n)) return "—";
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${Math.round(n)} B`;
}

function formatMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(2)} s`;
  return `${Math.round(n)} ms`;
}

/** Render Lighthouse markdown: `[text](url)` links and `` `code` `` spans. */
function MarkdownText({ text, className = "" }) {
  const nodes = useMemo(() => {
    const out = [];
    const src = String(text || "");
    const re = /\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`/g;
    let last = 0;
    let m;
    let i = 0;
    while ((m = re.exec(src)) !== null) {
      if (m.index > last) out.push(<span key={i++}>{src.slice(last, m.index)}</span>);
      if (m[1] && m[2]) {
        out.push(
          <a
            key={i++}
            href={m[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#1d9c35] hover:underline font-medium"
          >
            {m[1]}
          </a>
        );
      } else if (m[3]) {
        out.push(
          <code key={i++} className="rounded bg-gray-100 px-1 py-0.5 text-[12px] font-mono text-gray-800">
            {m[3]}
          </code>
        );
      }
      last = re.lastIndex;
    }
    if (last < src.length) out.push(<span key={i++}>{src.slice(last)}</span>);
    return out;
  }, [text]);

  return <span className={className}>{nodes}</span>;
}

/* ------------------------------- field data -------------------------------- */

const FIELD_METRICS = [
  { id: "LARGEST_CONTENTFUL_PAINT_MS", label: "Largest Contentful Paint (LCP)", unit: "s", core: true },
  { id: "INTERACTION_TO_NEXT_PAINT", label: "Interaction to Next Paint (INP)", unit: "ms", core: true },
  { id: "CUMULATIVE_LAYOUT_SHIFT_SCORE", label: "Cumulative Layout Shift (CLS)", unit: "cls", core: true },
  { id: "FIRST_CONTENTFUL_PAINT_MS", label: "First Contentful Paint (FCP)", unit: "s", core: false },
  { id: "EXPERIMENTAL_TIME_TO_FIRST_BYTE", label: "Time to First Byte (TTFB)", unit: "s", core: false },
  { id: "FIRST_INPUT_DELAY_MS", label: "First Input Delay (FID)", unit: "ms", core: false },
];

function fieldValue(unit, percentile) {
  if (percentile == null) return "—";
  if (unit === "s") return `${(percentile / 1000).toFixed(1)} s`;
  if (unit === "ms") return `${Math.round(percentile)} ms`;
  if (unit === "cls") return (percentile / 100).toFixed(2);
  return String(percentile);
}

const FIELD_CATEGORY = {
  FAST: { label: "Good", text: "text-emerald-700", dot: "bg-emerald-500" },
  AVERAGE: { label: "Needs improvement", text: "text-amber-700", dot: "bg-amber-500" },
  SLOW: { label: "Poor", text: "text-red-700", dot: "bg-red-500" },
};

function DistributionBar({ distributions = [] }) {
  if (!distributions.length) return null;
  const colors = ["bg-emerald-500", "bg-amber-400", "bg-red-500"];
  return (
    <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
      {distributions.map((d, idx) => (
        <div
          key={idx}
          className={colors[idx] || "bg-gray-300"}
          style={{ width: `${Math.max(0, (d.proportion || 0) * 100)}%` }}
          title={`${Math.round((d.proportion || 0) * 100)}%`}
        />
      ))}
    </div>
  );
}

function FieldDataCard({ def, metric }) {
  const cat = FIELD_CATEGORY[metric?.category] || null;
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 leading-relaxed">
          {def.label}
          {def.core ? (
            <span className="ml-1.5 rounded-full bg-gray-900 px-1.5 py-0.5 text-[9px] font-bold text-white align-middle">
              CWV
            </span>
          ) : null}
        </p>
        {cat ? <span className={`h-2.5 w-2.5 shrink-0 rounded-full mt-0.5 ${cat.dot}`} aria-hidden /> : null}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-gray-900">{fieldValue(def.unit, metric?.percentile)}</p>
      {cat ? <p className={`mt-0.5 text-xs font-semibold ${cat.text}`}>{cat.label}</p> : null}
      <DistributionBar distributions={metric?.distributions} />
      {metric?.distributions?.length === 3 ? (
        <div className="mt-1.5 flex justify-between text-[10px] text-gray-400 tabular-nums">
          <span>{Math.round((metric.distributions[0]?.proportion || 0) * 100)}% good</span>
          <span>{Math.round((metric.distributions[2]?.proportion || 0) * 100)}% poor</span>
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------- score ring ------------------------------- */

function ScoreRing({ score, label, onClick }) {
  const value = typeof score === "number" ? Math.max(0, Math.min(100, score)) : null;
  const radius = 44;
  const stroke = 8;
  const normalizedRadius = radius - stroke / 2;
  const circumference = 2 * Math.PI * normalizedRadius;
  const offset = value == null ? circumference : circumference - (value / 100) * circumference;
  const tone = scoreTone(value);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)] transition-all duration-300 hover:shadow-[0_12px_28px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 cursor-pointer"
    >
      <div className="relative h-[96px] w-[96px]">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 96 96" aria-hidden>
          <circle cx="48" cy="48" r={normalizedRadius} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
          <circle
            cx="48"
            cy="48"
            r={normalizedRadius}
            fill="none"
            stroke={tone.ring}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-2xl font-bold tabular-nums ${tone.text}`}>{value == null ? "—" : value}</span>
        </div>
      </div>
      <p className="mt-3 text-sm font-bold text-gray-900 group-hover:text-[#1d9c35] transition-colors">{label}</p>
      <span
        className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone.bg} ${tone.text}`}
      >
        {tone.label}
      </span>
    </button>
  );
}

/* ------------------------------ audit details ------------------------------ */

function DetailCell({ value, valueType }) {
  if (value == null || value === "") return <span className="text-gray-300">—</span>;

  if (typeof value === "object") {
    if (value.type === "node") {
      return (
        <div className="min-w-0">
          {value.nodeLabel ? <p className="text-gray-900 truncate">{value.nodeLabel}</p> : null}
          {value.selector ? (
            <code className="block truncate text-[11px] font-mono text-gray-500">{value.selector}</code>
          ) : null}
          {value.snippet ? (
            <code className="block truncate text-[11px] font-mono text-violet-700">{value.snippet}</code>
          ) : null}
        </div>
      );
    }
    if (value.type === "url" || value.type === "link") {
      return (
        <a
          href={value.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block max-w-[320px] truncate text-[#1d9c35] hover:underline"
          title={value.url}
        >
          {value.text || value.url}
        </a>
      );
    }
    if (value.type === "source-location") {
      return (
        <span className="block max-w-[320px] truncate font-mono text-[11px]" title={value.url}>
          {value.url}
          {value.line != null ? `:${value.line}` : ""}
        </span>
      );
    }
    if (value.type === "code") {
      return <code className="block max-w-[320px] truncate font-mono text-[11px] text-gray-700">{value.value}</code>;
    }
    if (value.value != null) {
      return <DetailCell value={value.value} valueType={value.type} />;
    }
    return <span className="text-gray-400">{JSON.stringify(value).slice(0, 60)}</span>;
  }

  if (typeof value === "number") {
    if (valueType === "bytes") return <span className="tabular-nums">{formatBytes(value)}</span>;
    if (valueType === "ms" || valueType === "timespanMs") return <span className="tabular-nums">{formatMs(value)}</span>;
    return <span className="tabular-nums">{Math.round(value * 100) / 100}</span>;
  }

  if (typeof value === "string" && /^https?:\/\//.test(value)) {
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        className="block max-w-[320px] truncate text-[#1d9c35] hover:underline"
        title={value}
      >
        {value}
      </a>
    );
  }

  return <span className="break-words">{String(value)}</span>;
}

function AuditDetailsTable({ details }) {
  if (!details?.items?.length) return null;
  const headings = details.headings?.length
    ? details.headings
    : Object.keys(details.items[0] || {}).map((k) => ({ key: k, label: k, valueType: "text" }));

  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-gray-100">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            {headings.map((h) => (
              <th key={h.key} className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap">
                {h.label || h.key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {details.items.map((item, idx) => (
            <tr key={idx} className="border-b border-gray-50 last:border-0 align-top">
              {headings.map((h) => (
                <td key={h.key} className="px-3 py-2 text-gray-700">
                  <DetailCell value={item[h.key]} valueType={h.valueType} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {details.totalItems > details.items.length ? (
        <p className="px-3 py-2 text-[11px] text-gray-400 bg-gray-50/50">
          Showing {details.items.length} of {details.totalItems} items.
        </p>
      ) : null}
    </div>
  );
}

function AuditStatusIcon({ audit }) {
  const mode = audit.scoreDisplayMode;
  if (mode === "informative" || mode === "manual" || mode === "notApplicable") {
    return <FiInfo className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />;
  }
  if (audit.score != null && audit.score >= 0.9) {
    return <FiCheckCircle className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />;
  }
  if (audit.score != null && audit.score >= 0.5) {
    return <FiAlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />;
  }
  return <FiAlertOctagon className="h-4 w-4 shrink-0 text-red-500" aria-hidden />;
}

function AuditRow({ audit, expanded, onToggle }) {
  const steps = getActionSteps(audit.id);
  const hasBody = Boolean(audit.description || steps || audit.details?.items?.length);

  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        type="button"
        onClick={hasBody ? onToggle : undefined}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left ${hasBody ? "hover:bg-gray-50" : "cursor-default"}`}
      >
        <AuditStatusIcon audit={audit} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-gray-900">{audit.title}</span>
        </span>
        {audit.displayValue ? (
          <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-gray-700">
            {audit.displayValue}
          </span>
        ) : null}
        {audit.savingsMs ? (
          <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold tabular-nums text-red-700">
            −{formatMs(audit.savingsMs)}
          </span>
        ) : null}
        {audit.savingsBytes ? (
          <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold tabular-nums text-amber-700">
            −{formatBytes(audit.savingsBytes)}
          </span>
        ) : null}
        {hasBody ? (
          expanded ? (
            <FiChevronDown className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
          ) : (
            <FiChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
          )
        ) : null}
      </button>

      {expanded && hasBody ? (
        <div className="px-4 pb-4 pl-11">
          {audit.description ? (
            <p className="text-sm text-gray-600 leading-relaxed">
              <MarkdownText text={audit.description} />
            </p>
          ) : null}

          {steps ? (
            <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-800">
                <FiTool className="h-3.5 w-3.5" aria-hidden />
                How to fix
              </p>
              <ul className="mt-2 space-y-1.5">
                {steps.map((step, idx) => (
                  <li key={idx} className="flex gap-2 text-sm text-emerald-900 leading-relaxed">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                    {step}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <AuditDetailsTable details={audit.details} />
        </div>
      ) : null}
    </div>
  );
}

function AuditGroup({ title, subtitle, auditIds, audits, expandedSet, onToggle, tone = "default", defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!auditIds?.length) return null;

  const toneBadge =
    tone === "danger"
      ? "bg-red-50 text-red-700"
      : tone === "success"
        ? "bg-emerald-50 text-emerald-700"
        : "bg-gray-100 text-gray-600";

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-gray-900">{title}</span>
          {subtitle ? <span className="block text-xs text-gray-500 mt-0.5">{subtitle}</span> : null}
        </span>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${toneBadge}`}>
          {auditIds.length}
        </span>
        {open ? (
          <FiChevronDown className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
        ) : (
          <FiChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
        )}
      </button>
      {open ? (
        <div className="border-t border-gray-100">
          {auditIds.map((id) =>
            audits[id] ? (
              <AuditRow key={id} audit={audits[id]} expanded={expandedSet.has(id)} onToggle={() => onToggle(id)} />
            ) : null
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------ category block ----------------------------- */

const CATEGORY_ORDER = ["performance", "accessibility", "best-practices", "seo"];

function CategorySection({ category, audits, expandedSet, onToggle, sectionRef }) {
  if (!category) return null;
  const tone = scoreTone(category.score);
  const failedCount = (category.opportunities?.length || 0) + (category.diagnostics?.length || 0);

  return (
    <section ref={sectionRef} className="scroll-mt-24">
      <div className="mb-4 flex items-center gap-3">
        <span
          className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-base font-bold tabular-nums ${tone.bg} ${tone.text}`}
        >
          {category.score ?? "—"}
        </span>
        <div>
          <h3 className="text-lg font-bold text-gray-900">{category.title}</h3>
          <p className="text-xs text-gray-500">
            {failedCount ? `${failedCount} item${failedCount === 1 ? "" : "s"} to review` : "Everything looks good"}
            {category.passed?.length ? ` · ${category.passed.length} passed` : ""}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {category.opportunities?.length ? (
          <AuditGroup
            title="Opportunities"
            subtitle="Fixes with estimated load-time savings — start here"
            auditIds={category.opportunities}
            audits={audits}
            expandedSet={expandedSet}
            onToggle={onToggle}
            tone="danger"
          />
        ) : null}
        {category.diagnostics?.length ? (
          <AuditGroup
            title={category.id === "performance" ? "Diagnostics" : "Issues to fix"}
            subtitle={
              category.id === "performance"
                ? "More context on performance behavior"
                : "Failed checks with details and fixes"
            }
            auditIds={category.diagnostics}
            audits={audits}
            expandedSet={expandedSet}
            onToggle={onToggle}
            tone="danger"
          />
        ) : null}
        {category.manual?.length ? (
          <AuditGroup
            title="Manual checks"
            subtitle="Can't be verified automatically — review by hand"
            auditIds={category.manual}
            audits={audits}
            expandedSet={expandedSet}
            onToggle={onToggle}
            defaultOpen={false}
          />
        ) : null}
        {category.passed?.length ? (
          <AuditGroup
            title="Passed audits"
            subtitle="Checks this page already gets right"
            auditIds={category.passed}
            audits={audits}
            expandedSet={expandedSet}
            onToggle={onToggle}
            tone="success"
            defaultOpen={false}
          />
        ) : null}
        {category.notApplicable?.length ? (
          <AuditGroup
            title="Not applicable"
            auditIds={category.notApplicable}
            audits={audits}
            expandedSet={expandedSet}
            onToggle={onToggle}
            defaultOpen={false}
          />
        ) : null}
      </div>
    </section>
  );
}

/* --------------------------------- main ------------------------------------ */

const SCORE_LABELS = {
  performance: "Performance",
  accessibility: "Accessibility",
  "best-practices": "Best Practices",
  seo: "SEO",
};

export default function PageSpeedSection({ selectedSite = "", embedded = false }) {
  const { data: session } = useSession();
  const hasGlobalAccess = session?.user?.role === "super_admin" || session?.user?.role === "smm";
  const userSiteLink = session?.user?.siteLink || "";
  const effectiveSite = hasGlobalAccess ? selectedSite || userSiteLink : userSiteLink;

  const [strategy, setStrategy] = useState("mobile");
  const [payload, setPayload] = useState(null);
  const [meta, setMeta] = useState(null); // { fetchedAt, stale, lastError }
  const [loading, setLoading] = useState(true); // no data yet at all
  const [refreshing, setRefreshing] = useState(false); // keep old data on screen
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());
  const [fieldScope, setFieldScope] = useState("page");
  const sectionRefs = useRef({});

  const needsWebsite = useMemo(() => {
    if (!effectiveSite) return true;
    if (String(effectiveSite).startsWith("http") || String(effectiveSite).startsWith("sc-domain:")) return false;
    return isMetaPageId(effectiveSite);
  }, [effectiveSite]);

  const load = useCallback(
    async ({ refresh = false } = {}) => {
      if (!effectiveSite || needsWebsite) {
        setLoading(false);
        setPayload(null);
        return;
      }

      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError("");

      try {
        const q = new URLSearchParams({ url: effectiveSite, strategy });
        if (refresh) q.set("refresh", "1");
        const res = await fetch(`/api/pagespeed?${q.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load PageSpeed data");
        setPayload(data.pagespeed || null);
        setMeta({ fetchedAt: data.fetchedAt, stale: data.stale, lastError: data.lastError });
      } catch (err) {
        setError(err.message || "Failed to load PageSpeed data");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [effectiveSite, needsWebsite, strategy]
  );

  useEffect(() => {
    setPayload(null);
    setMeta(null);
    setExpanded(new Set());
    load();
  }, [load]);

  const toggleAudit = useCallback((id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const scrollToCategory = (catId) => {
    sectionRefs.current[catId]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const analyzedUrl = payload?.finalUrl || payload?.analyzedUrl || effectiveSite;
  const host = siteHost(analyzedUrl);
  const fieldData = payload?.fieldData?.[fieldScope] || null;
  const hasPageField = Boolean(payload?.fieldData?.page);
  const hasOriginField = Boolean(payload?.fieldData?.origin);

  useEffect(() => {
    if (!hasPageField && hasOriginField) setFieldScope("origin");
    else setFieldScope("page");
  }, [hasPageField, hasOriginField, payload]);

  if (needsWebsite) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center min-h-[calc(100vh-2rem)] flex flex-col items-center justify-center">
        <FiSmartphone className="w-10 h-10 text-gray-300 mb-4" aria-hidden />
        <p className="text-sm text-gray-600 max-w-md">
          Select a website from the client dropdown to view PageSpeed Insights. Meta-only pages need a linked website
          URL.
        </p>
      </div>
    );
  }

  return (
    <div className={embedded ? "" : "rounded-xl border border-gray-200 bg-[#ffffff] p-5 min-h-[calc(100vh-2rem)]"}>
      {!embedded ? (
      <>
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h2 className="text-[26px] font-semibold text-gray-900">PageSpeed Insights</h2>
          <p className="text-sm text-gray-600 mt-1.5 max-w-2xl">
            Full Lighthouse report with real-user Core Web Vitals, every audit, and steps to act on each insight.
            Snapshots refresh automatically every 2 hours.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-gray-600">
            <a
              href={analyzedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#1d9c35] hover:underline font-medium"
            >
              {host || analyzedUrl}
              <FiExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden />
            </a>
            {meta?.fetchedAt ? (
              <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                <FiClock className="w-3.5 h-3.5" aria-hidden />
                Analyzed {formatAgo(meta.fetchedAt)} ({formatFetchTime(meta.fetchedAt)})
              </span>
            ) : null}
            {meta?.stale ? (
              <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                Next auto-refresh soon
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-0.5">
            {[
              { id: "mobile", label: "Mobile", icon: FiSmartphone },
              { id: "desktop", label: "Desktop", icon: FiMonitor },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStrategy(s.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
                  strategy === s.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
                }`}
              >
                <s.icon className="w-3.5 h-3.5" aria-hidden />
                {s.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => load({ refresh: true })}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            <FiRefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
            {refreshing ? "Analyzing…" : "Analyze now"}
          </button>
        </div>
      </div>
      </>
      ) : (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-gray-600">
            <a
              href={analyzedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#1d9c35] hover:underline font-medium"
            >
              {host || analyzedUrl}
              <FiExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden />
            </a>
            {meta?.fetchedAt ? (
              <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                <FiClock className="w-3.5 h-3.5" aria-hidden />
                Analyzed {formatAgo(meta.fetchedAt)}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-0.5">
              {[
                { id: "mobile", label: "Mobile", icon: FiSmartphone },
                { id: "desktop", label: "Desktop", icon: FiMonitor },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStrategy(s.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
                    strategy === s.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  <s.icon className="w-3.5 h-3.5" aria-hidden />
                  {s.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => load({ refresh: true })}
              disabled={loading || refreshing}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              <FiRefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
              {refreshing ? "Analyzing…" : "Analyze now"}
            </button>
          </div>
        </div>
      )}

      {/* Refresh-in-progress banner (old data stays visible below) */}
      {refreshing && payload ? (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          <FiRefreshCw className="w-4 h-4 animate-spin shrink-0" aria-hidden />
          Running a fresh Lighthouse analysis — showing the previous results until it finishes (up to a minute).
        </div>
      ) : null}

      {error ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <FiInfo className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}
      {meta?.lastError && !error ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          Last background refresh failed ({meta.lastError}) — showing the most recent successful analysis.
        </div>
      ) : null}

      {loading && !payload ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-gray-300 border-t-[#1d9c35]" />
          <p className="text-sm text-gray-500">
            No cached snapshot yet for this site — running the first Lighthouse analysis (up to a minute)…
          </p>
        </div>
      ) : payload ? (
        <div className={`space-y-10 ${refreshing ? "opacity-70 transition-opacity" : ""}`}>
          {/* Field data (CrUX) */}
          {fieldData ? (
            <section>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500">
                    Real-user experience (Chrome UX Report)
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    What actual visitors experienced over the last 28 days
                    {fieldData.overallCategory
                      ? ` — overall: ${FIELD_CATEGORY[fieldData.overallCategory]?.label || fieldData.overallCategory}`
                      : ""}
                  </p>
                </div>
                {hasPageField && hasOriginField ? (
                  <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                    {[
                      { id: "page", label: "This page" },
                      { id: "origin", label: "Whole site" },
                    ].map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setFieldScope(s.id)}
                        className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                          fieldScope === s.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {FIELD_METRICS.filter((def) => fieldData.metrics?.[def.id]).map((def) => (
                  <FieldDataCard key={def.id} def={def} metric={fieldData.metrics[def.id]} />
                ))}
              </div>
            </section>
          ) : null}

          {/* Category scores */}
          <section>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500">Lab scores</h3>
              <p className="text-xs text-gray-400">Click a score to jump to its audits</p>
            </div>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              {CATEGORY_ORDER.map((catId) => (
                <ScoreRing
                  key={catId}
                  score={payload.categories?.[catId]?.score ?? payload.scores?.[catId === "best-practices" ? "bestPractices" : catId]}
                  label={SCORE_LABELS[catId]}
                  onClick={() => scrollToCategory(catId)}
                />
              ))}
            </div>
          </section>

          {/* Lab metrics strip */}
          {payload.labMetrics?.length ? (
            <section>
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4">Lab metrics</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                {payload.labMetrics.map((m) => {
                  const tone = scoreTone(m.score);
                  return (
                    <div key={m.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 leading-tight min-h-[26px]">
                        {m.title}
                      </p>
                      <p className={`mt-1.5 text-xl font-bold tabular-nums ${tone.text}`}>{m.displayValue || "—"}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* Per-category audits */}
          <div className="space-y-12">
            {CATEGORY_ORDER.map((catId) => (
              <CategorySection
                key={catId}
                category={payload.categories?.[catId]}
                audits={payload.audits || {}}
                expandedSet={expanded}
                onToggle={toggleAudit}
                sectionRef={(el) => {
                  sectionRefs.current[catId] = el;
                }}
              />
            ))}
          </div>

          {/* Run info footer */}
          <section className="rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50 to-white p-5">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Analyzed URL</p>
                <p className="mt-1 font-medium text-gray-900 break-all">{analyzedUrl}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Strategy</p>
                <p className="mt-1 font-medium text-gray-900 capitalize">{payload.strategy || strategy}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Last analyzed</p>
                <p className="mt-1 font-medium text-gray-900">{formatFetchTime(meta?.fetchedAt || payload.fetchTime)}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Lighthouse</p>
                <p className="mt-1 font-medium text-gray-900">
                  {payload.lighthouseVersion ? `v${payload.lighthouseVersion}` : "—"}
                </p>
              </div>
            </div>
            <p className="mt-4 text-xs text-gray-500 leading-relaxed border-t border-gray-100 pt-4 flex items-start gap-1.5">
              <FiZap className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gray-400" aria-hidden />
              Lab scores come from a single simulated run; the real-user section reflects 28 days of Chrome UX Report
              data. Snapshots auto-refresh every 2 hours in the background, so this page always loads instantly from
              the latest cached run.
            </p>
          </section>
        </div>
      ) : !error ? (
        <div className="py-20 text-center text-sm text-gray-500">No PageSpeed data available for this site.</div>
      ) : null}
    </div>
  );
}
