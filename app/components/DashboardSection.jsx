"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { FiRefreshCw, FiArrowRight, FiAlertCircle } from "react-icons/fi";
import { SiFacebook, SiInstagram, SiYoutube, SiTiktok } from "react-icons/si";
import {
  Activity,
  BarChart3,
  Globe,
  Search,
  Shield,
  Sparkles,
  Zap,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { FadeIn, StaggerItem } from "./ui-shared/Motion";
import Btn from "./ui-shared/Btn";
import CHART from "./ui-shared/chartTheme";
import { getClientAccountFaviconUrl } from "@/lib/clientAccountList";
import { deltaBadgeClass, formatPositionDelta } from "@/lib/ui/deltaTone";

function siteHost(url) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return String(url).replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || "";
  }
}

function formatNum(value) {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(Number(value) || 0)));
}

function formatCompact(value) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    Math.max(0, Math.round(Number(value) || 0))
  );
}

function formatPct(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return "0.0%";
  return `${(v * 100).toFixed(1)}%`;
}

function formatPos(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(1);
}

function formatDeltaPct(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

function PlatformIcon({ platform, className = "w-5 h-5" }) {
  const key = String(platform || "").toLowerCase();
  const cn = `shrink-0 ${className}`;
  if (key === "facebook") return <SiFacebook className={cn} aria-hidden />;
  if (key === "instagram") return <SiInstagram className={cn} aria-hidden />;
  if (key === "youtube") return <SiYoutube className={cn} aria-hidden />;
  if (key === "tiktok" || key === "x") return <SiTiktok className={cn} aria-hidden />;
  return null;
}

function platformLabel(platform) {
  const key = String(platform || "").toLowerCase();
  if (key === "youtube") return "YouTube";
  if (key === "tiktok" || key === "x") return "TikTok";
  if (key === "facebook") return "Facebook";
  if (key === "instagram") return "Instagram";
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : "Platform";
}

function DeltaBadge({ value, invert = false, suffix = "%", label = "vs prior period" }) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const n = Number(value);
  const cls = deltaBadgeClass(n, { invert });
  const display =
    suffix === "pp"
      ? `${n > 0 ? "+" : ""}${n.toFixed(1)} pp`
      : suffix === "pos"
        ? formatPositionDelta(n)
        : formatDeltaPct(n);

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold tabular-nums ${cls}`}
      title={label}
    >
      {display}
    </span>
  );
}

function ClickSparkline({ data }) {
  const series = (data || []).filter((d) => d.date);
  if (series.length < 2) {
    return (
      <div
        className="h-16 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)]"
        aria-hidden
      />
    );
  }
  return (
    <div className="h-16 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="dashClickGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.primary} stopOpacity={0.28} />
              <stop offset="100%" stopColor={CHART.primary} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="clicks"
            stroke={CHART.primary}
            strokeWidth={2}
            fill="url(#dashClickGrad)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function BigStatCard({
  label,
  value,
  sub,
  delta,
  deltaInvert = false,
  deltaSuffix = "%",
  accentClass = "",
  barClass = "bg-[var(--cw-neon)]",
  index = 0,
  guideId,
}) {
  return (
    <StaggerItem index={index}>
      <div
        data-guide={guideId}
        className={`group cw-lit hover-lift relative flex min-h-[140px] flex-col justify-between overflow-hidden rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-5 sm:p-6 ${accentClass}`}
      >
        {/* A lit edge on the leading side — the card's only decoration. */}
        <div
          className={`absolute top-0 left-0 h-full w-0.5 ${barClass} opacity-80`}
          aria-hidden
        />
        <div className="flex items-start justify-between gap-2 pl-2">
          <p className="text-[10px] font-bold tracking-[0.12em] text-[var(--cw-ink-faint)] uppercase">
            {label}
          </p>
          {delta != null ? (
            <DeltaBadge value={delta} invert={deltaInvert} suffix={deltaSuffix} />
          ) : null}
        </div>
        <p className="font-heading mt-3 pl-2 text-4xl leading-none font-semibold tracking-tight tabular-nums text-[var(--cw-ink)] sm:text-5xl">
          {value}
        </p>
        {sub ? (
          <p className="mt-3 pl-2 text-xs leading-relaxed text-[var(--cw-ink-muted)]">{sub}</p>
        ) : null}
      </div>
    </StaggerItem>
  );
}

function HealthTile({ icon: Icon, label, value, sub, tone = "gray", onClick }) {
  // Tone tints the label and the fill only — the number stays plain ink so a
  // row of tiles reads as one set of figures, not six competing colours.
  const tones = {
    emerald: "text-[var(--cw-neon)] bg-[color-mix(in_srgb,var(--cw-neon)_8%,var(--cw-surface))]",
    amber: "text-[var(--cw-caution)] bg-[color-mix(in_srgb,var(--cw-caution)_8%,var(--cw-surface))]",
    red: "text-[var(--cw-danger)] bg-[color-mix(in_srgb,var(--cw-danger)_8%,var(--cw-surface))]",
    gray: "text-[var(--cw-ink-muted)] bg-[var(--cw-surface)]",
    sky: "text-[var(--cw-info)] bg-[color-mix(in_srgb,var(--cw-info)_8%,var(--cw-surface))]",
    violet: "text-[#b184ff] bg-[color-mix(in_srgb,#b184ff_8%,var(--cw-surface))]",
  };
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`transition-smooth rounded-xl border border-[var(--cw-hairline)] p-4 text-left ${tones[tone] || tones.gray} ${
        onClick
          ? "hover-lift cursor-pointer hover:border-[var(--cw-hairline-strong)]"
          : ""
      }`}
    >
      <div className="flex items-center gap-2">
        {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden /> : null}
        <p className="text-[10px] font-bold tracking-[0.12em] uppercase">{label}</p>
      </div>
      <p className="font-heading mt-2 text-2xl font-semibold tabular-nums text-[var(--cw-ink)]">
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-[var(--cw-ink-muted)]">{sub}</p> : null}
    </Tag>
  );
}

function QuickNavCard({ icon: Icon, title, desc, sectionId, onNavigate }) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(sectionId)}
      className="group cw-lit hover-lift rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-4 text-left"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="transition-smooth inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] text-[var(--cw-ink-dim)] group-hover:border-[color-mix(in_srgb,var(--cw-neon)_35%,transparent)] group-hover:text-[var(--cw-neon)]">
          <Icon className="size-5" aria-hidden />
        </span>
        <FiArrowRight
          className="transition-smooth mt-1 size-4 shrink-0 text-[var(--cw-ink-faint)] group-hover:translate-x-0.5 group-hover:text-[var(--cw-neon)]"
          aria-hidden
        />
      </div>
      <p className="font-heading mt-3 font-semibold text-[var(--cw-ink)]">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--cw-ink-muted)]">{desc}</p>
    </button>
  );
}

function severityTone(severity) {
  if (severity === "high") return "border-red-200 bg-red-50 text-red-800";
  if (severity === "low") return "border-gray-200 bg-gray-50 text-gray-600";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function auditTone(score) {
  if (score == null) return "gray";
  if (score >= 80) return "emerald";
  if (score >= 60) return "amber";
  return "red";
}

function pageSpeedTone(score) {
  if (score == null) return "gray";
  if (score >= 90) return "emerald";
  if (score >= 50) return "amber";
  return "red";
}

function authorityTone(score100) {
  if (score100 == null) return "gray";
  if (score100 >= 60) return "emerald";
  if (score100 >= 40) return "sky";
  if (score100 >= 25) return "amber";
  return "red";
}

export default function DashboardSection({ selectedSite = "", onNavigate }) {
  const { data: session } = useSession();
  const hasGlobalAccess = session?.user?.role === "super_admin" || session?.user?.role === "smm";
  const userSiteLink = session?.user?.siteLink || "";
  const effectiveSite = hasGlobalAccess ? selectedSite || userSiteLink : userSiteLink;

  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");

  const go = (sectionId) => {
    if (typeof onNavigate === "function") onNavigate(sectionId);
  };

  const loadSnapshot = useCallback(async () => {
    if (!effectiveSite) {
      setSnapshot(null);
      setError("No site selected. Choose a site from the header.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const q = new URLSearchParams();
    if (hasGlobalAccess) q.set("url", effectiveSite);

    try {
      const res = await fetch(`/api/dashboard/snapshot?${q.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setSnapshot(null);
        setError(data.error || "Dashboard could not be loaded.");
      } else {
        setSnapshot(data);
        setError("");
      }
    } catch {
      setSnapshot(null);
      setError("Network error loading dashboard.");
    } finally {
      setLoading(false);
    }
  }, [effectiveSite, hasGlobalAccess]);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  const gsc = snapshot?.gsc;
  const health = snapshot?.health;
  const totals = gsc?.available ? gsc.totals : null;
  const deltas = gsc?.deltas;

  const orderedBaseline = useMemo(() => {
    const rows = snapshot?.social?.baselines || [];
    const order = ["facebook", "instagram", "youtube", "tiktok"];
    return [...rows].sort((a, b) => {
      const ai = order.indexOf(String(a.platform || "").toLowerCase());
      const bi = order.indexOf(String(b.platform || "").toLowerCase());
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }, [snapshot?.social?.baselines]);

  const host = snapshot?.host || siteHost(effectiveSite);
  const favicon = getClientAccountFaviconUrl(effectiveSite);

  const linkPill =
    "transition-smooth inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--cw-neon)_32%,transparent)] bg-[color-mix(in_srgb,var(--cw-neon)_8%,transparent)] px-4 py-2 text-sm font-semibold text-[var(--cw-neon)] hover:bg-[color-mix(in_srgb,var(--cw-neon)_16%,transparent)] active:translate-y-px";

  const showGscBlock = gsc?.available || loading;
  const gscErr = gsc?.available === false ? gsc.error : "";

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)]">
      <div className="relative mx-auto max-w-[1360px] space-y-8 py-1 sm:space-y-10">
        <FadeIn>
          <header className="flex items-center justify-between gap-4 border-b border-[var(--cw-hairline)] pb-5">
            <div className="flex min-w-0 items-center gap-3.5">
              <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)]">
                {favicon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={favicon}
                    alt=""
                    width={26}
                    height={26}
                    className="rounded object-contain"
                  />
                ) : (
                  <Globe className="size-6 text-[var(--cw-ink-muted)]" aria-hidden />
                )}
              </span>
              <h1 className="font-heading min-w-0 truncate text-2xl font-bold tracking-tight text-[var(--cw-ink)] sm:text-3xl">
                {host || "Dashboard"}
              </h1>
            </div>
            <Btn
              variant="secondary"
              icon={FiRefreshCw}
              loading={loading}
              onClick={loadSnapshot}
              disabled={loading || !effectiveSite}
            >
              {loading ? "Updating…" : "Refresh"}
            </Btn>
          </header>
        </FadeIn>

        {error ? (
          <FadeIn delay={40}>
            <p className="rounded-2xl border border-[color-mix(in_srgb,var(--cw-caution)_32%,transparent)] bg-[color-mix(in_srgb,var(--cw-caution)_8%,transparent)] px-4 py-3.5 text-sm leading-relaxed text-[var(--cw-caution)]">
              {error}
            </p>
          </FadeIn>
        ) : null}

        {health ? (
          <FadeIn delay={80}>
            <section
              aria-labelledby="dash-health-heading"
              className="rounded-3xl border border-gray-100 bg-white p-5 sm:p-6 shadow-[0_4px_24px_rgba(0,0,0,0.04)] ring-1 ring-gray-50"
            >
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
                <div>
                  <h2 id="dash-health-heading" className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">
                    Site health scorecard
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">Latest cached snapshots — tap a tile to drill in.</p>
                </div>
                <button type="button" onClick={() => go("site-health")} className={linkPill}>
                  Open Site Health
                  <span aria-hidden>→</span>
                </button>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <HealthTile
                  icon={Shield}
                  label="Site audit"
                  value={
                    health.audit?.score != null && Number.isFinite(Number(health.audit.score))
                      ? `${Math.round(Number(health.audit.score))}`
                      : "—"
                  }
                  sub={
                    health.audit?.running
                      ? "Audit running…"
                      : health.audit?.score != null && health.audit?.critical != null
                        ? `${health.audit.critical} critical · ${health.audit.warning ?? 0} warnings`
                        : health.audit?.score != null
                          ? "Latest audit score"
                          : "No audit yet"
                  }
                  tone={auditTone(health.audit?.score)}
                  onClick={() => go("site-audit")}
                />
                <HealthTile
                  icon={Sparkles}
                  label="Authority"
                  value={health.authority?.score100 != null ? `${health.authority.score100}` : "—"}
                  sub={
                    health.authority?.globalRank
                      ? `Global rank #${formatCompact(health.authority.globalRank)}`
                      : "Open PageRank"
                  }
                  tone={authorityTone(health.authority?.score100)}
                  onClick={() => go("site-health")}
                />
                <HealthTile
                  icon={Zap}
                  label="PageSpeed mobile"
                  value={health.pageSpeed?.mobile != null ? `${health.pageSpeed.mobile}` : "—"}
                  sub={health.pageSpeed?.stale ? "Cache may be stale" : "Lighthouse performance"}
                  tone={pageSpeedTone(health.pageSpeed?.mobile)}
                  onClick={() => go("site-health")}
                />
                <HealthTile
                  icon={Activity}
                  label="Indexed/Sitemap URLs"
                  value={
                    Number(health.indexedUrls) > 0 ? formatCompact(health.indexedUrls) : "—"
                  }
                  sub={Number(health.indexedUrls) > 0 ? "Sitemap or inspection coverage" : "No indexed count yet"}
                  tone={Number(health.indexedUrls) > 0 ? "sky" : "gray"}
                  onClick={() => go("site-explorer")}
                />
                <HealthTile
                  icon={BarChart3}
                  label="Referring domains"
                  value={health.referringDomains != null ? formatCompact(health.referringDomains) : "—"}
                  sub="Backlink footprint"
                  tone={health.referringDomains != null ? "violet" : "gray"}
                  onClick={() => go("site-explorer")}
                />
              </div>
            </section>
          </FadeIn>
        ) : null}

        {showGscBlock ? (
          <FadeIn delay={100}>
            <section
              aria-labelledby="dash-gsc-heading"
              className="rounded-3xl border border-gray-100 bg-white p-5 sm:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.04)] ring-1 ring-gray-50"
            >
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
                <div>
                  <h2 id="dash-gsc-heading" className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
                    Search performance
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">Google Search Console — last 28 days with period comparison.</p>
                </div>
                <button type="button" onClick={() => go("website-statistics")} className={linkPill}>
                  Open full report
                  <span aria-hidden>→</span>
                </button>
              </div>

              {gscErr ? (
                <p className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3.5 text-sm text-amber-950 leading-relaxed shadow-sm mb-4">
                  {gscErr}
                </p>
              ) : null}

              {!gscErr && (loading && !totals ? (
                <div className="space-y-4">
                  <div className="h-16 rounded-xl bg-gray-100 animate-pulse" />
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="h-36 sm:h-40 rounded-2xl bg-gray-100/90 animate-pulse border border-gray-100" />
                    ))}
                  </div>
                </div>
              ) : totals ? (
                <>
                  <div className="mb-5 rounded-2xl border border-sky-100 bg-sky-50/40 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-sky-800/80 mb-2">
                      Daily clicks (28 days)
                    </p>
                    <ClickSparkline data={gsc.timeSeries} />
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    <BigStatCard
                      index={0}
                      guideId="dashboard-clicks"
                      label="Clicks"
                      value={formatNum(totals.clicks)}
                      delta={deltas?.clicksPct}
                      accentClass="border-sky-100/90 bg-sky-50/40"
                      barClass="bg-sky-500"
                    />
                    <BigStatCard
                      index={1}
                      guideId="dashboard-impressions"
                      label="Impressions"
                      value={formatCompact(totals.impressions)}
                      delta={deltas?.impressionsPct}
                      accentClass="border-violet-100/90 bg-violet-50/40"
                      barClass="bg-violet-500"
                    />
                    <BigStatCard
                      index={2}
                      guideId="dashboard-ctr"
                      label="Avg. CTR"
                      value={formatPct(totals.averageCtr)}
                      delta={deltas?.ctrPts}
                      deltaSuffix="pp"
                      accentClass="border-amber-100/90 bg-amber-50/35"
                      barClass="bg-amber-500"
                    />
                    <BigStatCard
                      index={3}
                      guideId="dashboard-position"
                      label="Avg. position"
                      value={formatPos(totals.averagePosition)}
                      delta={deltas?.positionDelta}
                      deltaInvert
                      deltaSuffix="pos"
                      sub="Lower is better in Search"
                      accentClass="border-slate-200/90 bg-slate-50/50"
                      barClass="bg-slate-500"
                    />
                  </div>

                  {(gsc.topQueries?.length || gsc.topPages?.length) ? (
                    <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4" data-guide="dashboard-queries">
                      {gsc.topQueries?.length ? (
                        <div className="rounded-2xl border border-gray-100 overflow-hidden">
                          <div className="px-4 py-3 bg-gray-50/80 border-b border-gray-100 flex items-center justify-between">
                            <p className="text-sm font-bold text-gray-900">Top queries</p>
                            <button
                              type="button"
                              onClick={() => go("website-statistics")}
                              className="text-xs font-semibold text-emerald-700 hover:underline"
                            >
                              View all
                            </button>
                          </div>
                          <ul className="divide-y divide-gray-50">
                            {gsc.topQueries.map((q, i) => (
                              <li key={q.query || i} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                                <span className="truncate font-medium text-gray-900" title={q.query}>
                                  {q.query}
                                </span>
                                <span className="shrink-0 tabular-nums text-gray-600">
                                  {formatNum(q.clicks)} clicks
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {gsc.topPages?.length ? (
                        <div className="rounded-2xl border border-gray-100 overflow-hidden">
                          <div className="px-4 py-3 bg-gray-50/80 border-b border-gray-100 flex items-center justify-between">
                            <p className="text-sm font-bold text-gray-900">Top pages</p>
                            <button
                              type="button"
                              onClick={() => go("website-statistics")}
                              className="text-xs font-semibold text-emerald-700 hover:underline"
                            >
                              View all
                            </button>
                          </div>
                          <ul className="divide-y divide-gray-50">
                            {gsc.topPages.map((p, i) => {
                              let path = p.page || "";
                              try {
                                path = new URL(p.page).pathname || p.page;
                              } catch {
                                /* keep raw */
                              }
                              return (
                                <li key={p.page || i} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                                  <span className="truncate font-medium text-gray-900" title={p.page}>
                                    {path}
                                  </span>
                                  <span className="shrink-0 tabular-nums text-gray-600">
                                    {formatNum(p.clicks)} clicks
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : null)}
            </section>
          </FadeIn>
        ) : null}

        <FadeIn delay={110}>
          <section aria-label="Quick navigation">
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--cw-ink-faint)]">
              Jump to a tool
            </h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <QuickNavCard
                icon={Globe}
                title="Website Statistics"
                desc="Traffic, queries, sitemaps"
                sectionId="website-statistics"
                onNavigate={go}
              />
              <QuickNavCard
                icon={Zap}
                title="Site Health"
                desc="Speed, authority, links"
                sectionId="site-health"
                onNavigate={go}
              />
              <QuickNavCard
                icon={Search}
                title="Keyword Research"
                desc="Discover & rank opportunities"
                sectionId="keyword-research"
                onNavigate={go}
              />
              <QuickNavCard
                icon={Shield}
                title="Site Audit"
                desc="Crawl issues & fixes"
                sectionId="site-audit"
                onNavigate={go}
              />
            </div>
          </section>
        </FadeIn>

        {snapshot?.actions?.length ? (
          <FadeIn delay={120}>
            <section
              aria-labelledby="dash-actions-heading"
              className="rounded-3xl border border-amber-100/80 bg-white p-5 sm:p-6 shadow-[0_4px_24px_rgba(0,0,0,0.04)] ring-1 ring-amber-50"
            >
              <div className="flex items-center gap-2 mb-4">
                <FiAlertCircle className="size-5 text-amber-600 shrink-0" aria-hidden />
                <div>
                  <h2 id="dash-actions-heading" className="text-lg font-bold text-gray-900 tracking-tight">
                    Priority actions
                  </h2>
                  <p className="text-sm text-gray-500">SEO opportunities and pending reviews for this site.</p>
                </div>
              </div>
              <ul className="space-y-2">
                {snapshot.actions.map((action) => (
                  <li key={action.id}>
                    <button
                      type="button"
                      onClick={() => go(action.navigateTo)}
                      className="w-full rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-3 text-left flex items-start gap-3 hover:bg-white hover:border-gray-200 hover:shadow-sm transition"
                    >
                      <span
                        className={`shrink-0 mt-0.5 inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${severityTone(action.severity)}`}
                      >
                        {action.severity}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-gray-900">{action.label}</span>
                        <span className="block text-xs text-gray-500 mt-0.5">{action.group}</span>
                      </span>
                      <FiArrowRight className="size-4 text-gray-400 shrink-0 mt-1" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </FadeIn>
        ) : null}

        <FadeIn delay={140}>
          <section
            aria-labelledby="dash-smm-heading"
            className="rounded-3xl border border-emerald-100/80 bg-white p-5 sm:p-8 shadow-[0_4px_28px_rgba(16,185,129,0.08)] ring-1 ring-emerald-50"
          >
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
              <div>
                <h2 id="dash-smm-heading" className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
                  Social Media Marketing Stats
                </h2>
                <p className="text-sm text-gray-600 mt-1 max-w-xl leading-relaxed">
                  Follower counts from your SMM baseline — the same numbers maintained in User Management.
                </p>
              </div>
              <button type="button" onClick={() => go("smm-statistics")} className={linkPill}>
                Open full report
                <span aria-hidden>→</span>
              </button>
            </div>
            {snapshot?.social?.message && !orderedBaseline.length ? (
              <p className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-700 leading-relaxed">
                {snapshot.social.message}
              </p>
            ) : loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-40 rounded-2xl bg-emerald-50/60 animate-pulse border border-emerald-100/60" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-4 relative overflow-hidden rounded-2xl border border-emerald-200/70 bg-emerald-50/50 p-6 sm:p-7 shadow-md flex flex-col justify-center min-h-[200px]">
                  <div
                    className="absolute top-0 right-0 w-32 h-32 bg-emerald-200/20 rounded-full blur-2xl -translate-y-1/2 translate-x-1/3"
                    aria-hidden
                  />
                  <p className="relative text-[11px] font-bold uppercase tracking-wider text-emerald-800/90">
                    Total followers (baseline)
                  </p>
                  <p className="relative text-5xl sm:text-6xl font-bold text-gray-900 tabular-nums mt-3 leading-none tracking-tight">
                    {formatNum(snapshot?.social?.totalFollowers || 0)}
                  </p>
                  {snapshot?.social?.latestDate ? (
                    <p className="relative text-sm text-emerald-900/80 mt-4 font-medium">
                      Latest baseline:{" "}
                      <span className="tabular-nums">{snapshot.social.latestDate}</span>
                    </p>
                  ) : (
                    <p className="relative text-sm text-gray-600 mt-4 leading-relaxed">
                      No baseline rows yet for this site.
                    </p>
                  )}
                </div>
                <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {["facebook", "instagram", "youtube", "tiktok"].map((key, i) => {
                    const row = orderedBaseline.find((c) => String(c.platform || "").toLowerCase() === key);
                    const hasFollowers = row && Number(row.followers) > 0;
                    const followers = hasFollowers ? Number(row.followers) : null;
                    const label = platformLabel(key);
                    return (
                      <StaggerItem key={key} index={i + 1}>
                        <div className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)] flex flex-col items-center text-center justify-center min-h-[128px] hover-lift">
                          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-50 text-gray-800 ring-1 ring-gray-100 mb-3">
                            <PlatformIcon platform={key} className="w-6 h-6" />
                          </span>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
                          <p className="text-2xl sm:text-3xl font-bold text-gray-900 tabular-nums mt-1.5">
                            {followers != null ? formatNum(followers) : "—"}
                          </p>
                        </div>
                      </StaggerItem>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </FadeIn>
      </div>
    </div>
  );
}
