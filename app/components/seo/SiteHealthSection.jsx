"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Activity,
  Award,
  ExternalLink,
  Globe,
  Link2,
  RefreshCw,
  Shield,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { isMetaPageId } from "@/lib/siteAccess";
import { toScore100 } from "@/lib/authorityScore";
import PageSpeedSection from "../PageSpeedSection";
import DomainAuthoritySection from "../DomainAuthoritySection";
import { formatNum } from "./SeoPanelShell";
import { useSiteExplorerFetch } from "./useSiteExplorerFetch";

function siteHost(url) {
  if (!url) return "";
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return String(url).replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || "";
  }
}

function scoreTone(score) {
  if (score == null) return { ring: "border-gray-200", text: "text-gray-400", bg: "bg-gray-50", label: "No data" };
  if (score >= 90) return { ring: "border-emerald-200", text: "text-emerald-700", bg: "bg-emerald-50", label: "Good" };
  if (score >= 50) return { ring: "border-amber-200", text: "text-amber-700", bg: "bg-amber-50", label: "Needs work" };
  return { ring: "border-red-200", text: "text-red-700", bg: "bg-red-50", label: "Poor" };
}

function authorityTone(score10) {
  const score = toScore100(score10);
  if (score == null) return { text: "text-gray-400", bg: "bg-gray-50", label: "No data" };
  if (score >= 60) return { text: "text-emerald-700", bg: "bg-emerald-50", label: "Strong" };
  if (score >= 40) return { text: "text-lime-700", bg: "bg-lime-50", label: "Established" };
  if (score >= 25) return { text: "text-amber-700", bg: "bg-amber-50", label: "Growing" };
  return { text: "text-red-700", bg: "bg-red-50", label: "Early stage" };
}

function KpiCard({ icon: Icon, label, value, sub, toneClass = "text-gray-900", accent = "emerald" }) {
  const accentMap = {
    emerald: "from-emerald-500/10 to-emerald-500/5 border-emerald-100",
    teal: "from-teal-500/10 to-teal-500/5 border-teal-100",
    amber: "from-amber-500/10 to-amber-500/5 border-amber-100",
    sky: "from-sky-500/10 to-sky-500/5 border-sky-100",
    violet: "from-violet-500/10 to-violet-500/5 border-violet-100",
  };
  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br p-4 shadow-[0_2px_12px_rgba(0,0,0,0.04)] ${accentMap[accent] || accentMap.emerald}`}
    >
      <div className="flex items-center gap-2">
        {Icon ? <Icon className="size-4 shrink-0 opacity-70" aria-hidden /> : null}
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-600">{label}</p>
      </div>
      <p className={`mt-2 text-2xl font-bold tabular-nums sm:text-3xl ${toneClass}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-gray-500">{sub}</p> : null}
    </div>
  );
}

export default function SiteHealthSection({ selectedSite = "" }) {
  const { data: session } = useSession();
  const hasGlobalAccess = session?.user?.role === "super_admin" || session?.user?.role === "smm";
  const userSiteLink = session?.user?.siteLink || "";
  const effectiveSite = hasGlobalAccess ? selectedSite || userSiteLink : userSiteLink;

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [refreshingAll, setRefreshingAll] = useState(false);

  const needsWebsite = useMemo(() => {
    if (!effectiveSite) return true;
    if (String(effectiveSite).startsWith("http") || String(effectiveSite).startsWith("sc-domain:")) return false;
    return isMetaPageId(effectiveSite);
  }, [effectiveSite]);

  const host = siteHost(effectiveSite);

  const { data: linkData, loading: linkLoading, refreshing: linkRefreshing, load: loadLink } = useSiteExplorerFetch({
    selectedSite: effectiveSite,
    view: "backlinks",
  });

  const loadSummary = useCallback(
    async (refresh = false) => {
      if (!effectiveSite || needsWebsite) {
        setSummary(null);
        setSummaryLoading(false);
        return;
      }
      if (refresh) setRefreshingAll(true);
      else setSummaryLoading(true);
      try {
        const q = new URLSearchParams({ url: effectiveSite, strategy: "mobile" });
        if (refresh) q.set("refresh", "1");
        const [psRes, authRes] = await Promise.all([
          fetch(`/api/pagespeed?${q.toString()}`),
          fetch(`/api/authority?${new URLSearchParams({ url: effectiveSite }).toString()}`),
        ]);
        const [psBody, authBody] = await Promise.all([psRes.json(), authRes.json()]);
        setSummary({
          pagespeed: psRes.ok ? psBody.pagespeed : null,
          pagespeedMeta: psRes.ok ? { fetchedAt: psBody.fetchedAt, stale: psBody.stale } : null,
          authority: authRes.ok ? authBody : null,
        });
        if (refresh) loadLink(true);
      } catch {
        setSummary(null);
      } finally {
        setSummaryLoading(false);
        setRefreshingAll(false);
      }
    },
    [effectiveSite, needsWebsite, loadLink]
  );

  useEffect(() => {
    loadSummary(false);
  }, [loadSummary]);

  const ps = summary?.pagespeed;
  const auth = summary?.authority;
  const linkAuth = linkData?.authority;
  const homepageUr =
    linkData?.homepageUr100 ?? linkAuth?.homepageUr100 ?? null;
  const authorityScore = auth?.score != null ? toScore100(auth.score) : linkAuth?.score100 ?? null;
  const referringDomains = auth?.referringDomains ?? linkAuth?.referringDomains ?? null;
  const authTone = authorityTone(auth?.score ?? linkAuth?.score);

  const perfScore = ps?.scores?.performance ?? ps?.categories?.performance?.score ?? null;
  const seoScore = ps?.scores?.seo ?? ps?.categories?.seo?.score ?? null;
  const a11yScore = ps?.scores?.accessibility ?? ps?.categories?.accessibility?.score ?? null;
  const bpScore = ps?.scores?.bestPractices ?? ps?.categories?.["best-practices"]?.score ?? null;

  if (needsWebsite) {
    return (
      <div className="flex min-h-[calc(100vh-2rem)] flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-8 text-center">
        <Globe className="mb-4 size-10 text-gray-300" aria-hidden />
        <p className="max-w-md text-sm text-gray-600">
          Select a website from the client dropdown to view Site Health. Meta-only pages need a linked website URL.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-2rem)] space-y-8 rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-900 via-gray-800 to-emerald-950 p-6 text-white shadow-[0_8px_32px_rgba(0,0,0,0.12)] sm:p-8">
        <div className="absolute -right-16 -top-16 size-64 rounded-full bg-emerald-500/10 blur-3xl" aria-hidden />
        <div className="absolute -bottom-20 -left-10 size-48 rounded-full bg-teal-400/10 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300/90">SEO Tools</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Site Health</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-300">
              Complete picture of your domain authority, link profile, and page performance — PageSpeed Insights,
              Open PageRank, and link metrics in one place.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <a
                href={effectiveSite.startsWith("http") ? effectiveSite : `https://${host}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-semibold text-emerald-300 hover:text-emerald-200"
              >
                {host}
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
              {summary?.pagespeedMeta?.fetchedAt ? (
                <span className="text-xs text-gray-400">
                  PageSpeed updated {new Date(summary.pagespeedMeta.fetchedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => loadSummary(true)}
            disabled={refreshingAll || summaryLoading}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white/10 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20 disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${refreshingAll ? "animate-spin" : ""}`} aria-hidden />
            {refreshingAll ? "Refreshing all…" : "Refresh all"}
          </button>
        </div>
      </header>

      {/* KPI overview */}
      <section>
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-500">At a glance</h2>
        {summaryLoading && !summary ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
            <KpiCard
              icon={Award}
              label="Authority"
              value={authorityScore != null ? `${Math.round(authorityScore)}/100` : "—"}
              sub={authTone.label}
              toneClass={authTone.text}
              accent="emerald"
            />
            <KpiCard
              icon={TrendingUp}
              label="Homepage UR"
              value={homepageUr != null ? `${homepageUr}/100` : "—"}
              sub="Depth-adjusted estimate"
              accent="teal"
            />
            <KpiCard
              icon={Link2}
              label="Ref. domains"
              value={referringDomains != null ? formatNum(referringDomains) : "—"}
              sub="Open PageRank"
              accent="amber"
            />
            <KpiCard
              icon={Globe}
              label="Global rank"
              value={auth?.globalRank ? `#${auth.globalRank.toLocaleString()}` : "—"}
              sub="Worldwide position"
              accent="violet"
            />
            <KpiCard
              icon={Zap}
              label="Performance"
              value={perfScore ?? "—"}
              sub={scoreTone(perfScore).label}
              toneClass={scoreTone(perfScore).text}
              accent="sky"
            />
            <KpiCard
              icon={Sparkles}
              label="SEO score"
              value={seoScore ?? "—"}
              sub={scoreTone(seoScore).label}
              toneClass={scoreTone(seoScore).text}
              accent="emerald"
            />
            <KpiCard
              icon={Shield}
              label="Accessibility"
              value={a11yScore ?? "—"}
              sub={scoreTone(a11yScore).label}
              toneClass={scoreTone(a11yScore).text}
              accent="teal"
            />
            <KpiCard
              icon={Activity}
              label="Best practices"
              value={bpScore ?? "—"}
              sub={scoreTone(bpScore).label}
              toneClass={scoreTone(bpScore).text}
              accent="amber"
            />
          </div>
        )}
      </section>

      {/* Authority & Link Profile */}
      <section id="authority" className="scroll-mt-24">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-gray-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Authority &amp; Link Profile</h2>
            <p className="mt-1 text-sm text-gray-500">
              Domain authority, trend history, competitor benchmarks, and link metrics from Open PageRank.
            </p>
          </div>
          {(linkLoading || linkRefreshing) && (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
              <RefreshCw className="size-3.5 animate-spin" aria-hidden />
              Updating link metrics…
            </span>
          )}
        </div>

        {linkData && (
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Authority (DR-like)</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">
                {linkAuth?.score100 != null ? `${linkAuth.score100}/100` : authorityScore != null ? `${Math.round(authorityScore)}/100` : "—"}
              </p>
              <p className="mt-1 text-xs text-gray-600">Open PageRank · live</p>
            </div>
            <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-teal-900">Homepage UR</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">
                {homepageUr != null ? `${homepageUr}/100` : "—"}
              </p>
              <p className="mt-1 text-xs text-gray-600">Estimated from DR (depth-adjusted)</p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-900">Referring domains</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">
                {referringDomains != null ? formatNum(referringDomains) : "—"}
              </p>
              <p className="mt-1 text-xs text-gray-600">
                {linkAuth?.configured === false ? "Set OPENPAGERANK_API_KEY" : "Open PageRank · live"}
              </p>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-4 sm:p-5">
          <DomainAuthoritySection selectedSite={effectiveSite} embedded />
        </div>

        <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-5 py-4 text-sm text-gray-600">
          <p className="font-semibold text-gray-800">About link data</p>
          <p className="mt-1 leading-relaxed">
            Per-page backlink rows from Common Crawl are hidden — they are not reliable backlinks. Use referring
            domains above for link profile strength, or open <strong>Site Explorer</strong> for indexed pages and per-URL UR
            estimates.
          </p>
        </div>
      </section>

      {/* PageSpeed */}
      <section id="pagespeed" className="scroll-mt-24">
        <div className="mb-5 border-b border-gray-100 pb-4">
          <h2 className="text-lg font-bold text-gray-900">PageSpeed &amp; Core Web Vitals</h2>
          <p className="mt-1 text-sm text-gray-500">
            Real-user Chrome UX Report data, Lighthouse lab scores, and every audit with fix guidance.
          </p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-4 sm:p-5">
          <PageSpeedSection selectedSite={effectiveSite} embedded />
        </div>
      </section>
    </div>
  );
}
