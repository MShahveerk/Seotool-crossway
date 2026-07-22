"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  FiRefreshCw,
  FiSmartphone,
  FiClock,
  FiInfo,
  FiExternalLink,
} from "react-icons/fi";
import { isMetaPageId } from "../../lib/siteAccess";

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
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function ScoreRing({ score, label, hint }) {
  const value = typeof score === "number" ? Math.max(0, Math.min(100, score)) : null;
  const radius = 52;
  const stroke = 10;
  const normalizedRadius = radius - stroke / 2;
  const circumference = 2 * Math.PI * normalizedRadius;
  const offset = value == null ? circumference : circumference - (value / 100) * circumference;
  const tone = scoreTone(value);

  return (
    <div className="group relative flex flex-col items-center rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)] transition-all duration-300 hover:shadow-[0_12px_28px_rgba(0,0,0,0.08)] hover:-translate-y-0.5">
      <div className="relative h-[120px] w-[120px]">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120" aria-hidden>
          <circle cx="60" cy="60" r={normalizedRadius} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
          <circle
            cx="60"
            cy="60"
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
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-bold tabular-nums ${tone.text}`}>
            {value == null ? "—" : value}
          </span>
        </div>
      </div>
      <p className="mt-4 text-sm font-bold text-gray-900">{label}</p>
      <span className={`mt-1.5 inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${tone.bg} ${tone.text}`}>
        {tone.label}
      </span>
      {hint ? <p className="mt-3 text-center text-xs text-gray-500 leading-relaxed">{hint}</p> : null}
    </div>
  );
}

function MetricCard({ metric, accentClass = "border-gray-100" }) {
  if (!metric) {
    return (
      <div className={`rounded-2xl border bg-white p-5 ${accentClass}`}>
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Metric unavailable</p>
        <p className="mt-3 text-sm text-gray-400">No data returned from Lighthouse.</p>
      </div>
    );
  }

  const tone = scoreTone(metric.score);
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)] transition-all duration-300 hover:shadow-[0_12px_28px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 ${accentClass}`}
    >
      <div className="absolute left-0 top-0 h-full w-1 opacity-90" style={{ backgroundColor: tone.ring }} aria-hidden />
      <div className="flex items-start justify-between gap-3 pl-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{metric.title || "Metric"}</p>
          <p className="mt-2 text-2xl font-bold text-gray-900 tabular-nums">{metric.displayValue || "—"}</p>
        </div>
        {metric.score != null ? (
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${tone.bg} ${tone.text}`}>
            {metric.score}
          </span>
        ) : null}
      </div>
    </div>
  );
}

const SCORE_CATEGORIES = [
  {
    key: "performanceScore",
    label: "Performance",
    hint: "How fast your page loads and responds on mobile.",
  },
  {
    key: "seoScore",
    label: "SEO",
    hint: "Basics that help search engines understand your page.",
  },
  {
    key: "accessibilityScore",
    label: "Accessibility",
    hint: "How usable the page is for people with diverse needs.",
  },
  {
    key: "bestPracticesScore",
    label: "Best Practices",
    hint: "Modern web standards and security hygiene.",
  },
];

const CORE_METRICS = [
  { key: "LCP", label: "Largest Contentful Paint", accentClass: "border-emerald-100" },
  { key: "FCP", label: "First Contentful Paint", accentClass: "border-sky-100" },
  { key: "CLS", label: "Cumulative Layout Shift", accentClass: "border-violet-100" },
  { key: "TBT", label: "Total Blocking Time", accentClass: "border-amber-100" },
];

export default function PageSpeedSection({ selectedSite = "" }) {
  const { data: session } = useSession();
  const hasGlobalAccess = session?.user?.role === "super_admin" || session?.user?.role === "smm";
  const userSiteLink = session?.user?.siteLink || "";
  const effectiveSite = hasGlobalAccess ? selectedSite || userSiteLink : userSiteLink;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

  const needsWebsite = useMemo(() => {
    if (!effectiveSite) return true;
    if (String(effectiveSite).startsWith("http") || String(effectiveSite).startsWith("sc-domain:")) {
      return false;
    }
    return isMetaPageId(effectiveSite);
  }, [effectiveSite]);

  const load = useCallback(async () => {
    if (!effectiveSite || needsWebsite) {
      setLoading(false);
      setPayload(null);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/pagespeed?url=${encodeURIComponent(effectiveSite)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load PageSpeed data");
      setPayload(data);
    } catch (err) {
      setError(err.message || "Failed to load PageSpeed data");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [effectiveSite, needsWebsite]);

  useEffect(() => {
    load();
  }, [load]);

  const pagespeed = payload?.pagespeed;
  const analyzedUrl = payload?.siteUrl || effectiveSite;
  const host = siteHost(analyzedUrl);

  if (needsWebsite) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center min-h-[calc(100vh-2rem)] flex flex-col items-center justify-center">
        <FiSmartphone className="w-10 h-10 text-gray-300 mb-4" aria-hidden />
        <p className="text-sm text-gray-600 max-w-md">
          Select a website from the client dropdown to run PageSpeed Insights. Meta-only pages need a linked website URL.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-[#ffffff] p-5 min-h-[calc(100vh-2rem)]">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h2 className="text-[26px] font-semibold text-gray-900">PageSpeed Insights</h2>
          <p className="text-sm text-gray-600 mt-1.5 max-w-2xl">
            Mobile Lighthouse scores and Core Web Vitals for the selected property — powered by Google PageSpeed Insights.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-gray-600">
            <span className="font-medium text-gray-800">Site:</span>
            <a
              href={analyzedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#1d9c35] hover:underline font-medium truncate max-w-full"
            >
              {host || analyzedUrl}
              <FiExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden />
            </a>
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
              <FiSmartphone className="w-3 h-3" aria-hidden />
              Mobile
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            <FiRefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
            {loading ? "Analyzing…" : "Run again"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <FiInfo className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-gray-300 border-t-[#1d9c35]" />
          <p className="text-sm text-gray-500">Running Lighthouse analysis — this can take up to a minute…</p>
        </div>
      ) : pagespeed ? (
        <div className="space-y-8">
          <section>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500">Category scores</h3>
              <p className="text-xs text-gray-400">Scores are out of 100</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {SCORE_CATEGORIES.map((cat) => (
                <ScoreRing
                  key={cat.key}
                  score={pagespeed[cat.key]}
                  label={cat.label}
                  hint={cat.hint}
                />
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500">Core Web Vitals & metrics</h3>
              <p className="text-xs text-gray-400">Key lab metrics from this run</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {CORE_METRICS.map((item) => (
                <MetricCard
                  key={item.key}
                  metric={pagespeed.metrics?.[item.key]}
                  accentClass={item.accentClass}
                />
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50 to-white p-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Analyzed URL</p>
                <p className="mt-1 font-medium text-gray-900 break-all">{analyzedUrl}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1">
                  <FiClock className="w-3.5 h-3.5" aria-hidden />
                  Last analyzed
                </p>
                <p className="mt-1 font-medium text-gray-900">{formatFetchTime(pagespeed.fetchTime)}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Lighthouse</p>
                <p className="mt-1 font-medium text-gray-900">
                  {pagespeed.lighthouseVersion ? `v${pagespeed.lighthouseVersion}` : "—"}
                </p>
              </div>
            </div>
            <p className="mt-4 text-xs text-gray-500 leading-relaxed border-t border-gray-100 pt-4">
              Results reflect a single mobile lab run via the PageSpeed Insights API. Real-user Core Web Vitals in Search
              Console may differ. Re-run after deploying performance fixes to track improvements.
            </p>
          </section>
        </div>
      ) : !error ? (
        <div className="py-20 text-center text-sm text-gray-500">No PageSpeed data available for this site.</div>
      ) : null}
    </div>
  );
}
