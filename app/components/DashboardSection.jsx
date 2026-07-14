"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { FiRefreshCw } from "react-icons/fi";
import { SiFacebook, SiInstagram, SiYoutube, SiTiktok } from "react-icons/si";

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

function BigStatCard({ label, value, sub, accentClass = "border-gray-100", barClass = "bg-emerald-400" }) {
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border bg-white p-5 sm:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)] transition-all duration-300 hover:shadow-[0_12px_28px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 ${accentClass} flex flex-col justify-between min-h-[140px]`}
    >
      <div className={`absolute left-0 top-0 h-full w-1 ${barClass} opacity-90`} aria-hidden />
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 pl-2">{label}</p>
      <p className="text-4xl sm:text-5xl font-bold text-gray-900 tabular-nums leading-none mt-3 pl-2 tracking-tight">
        {value}
      </p>
      {sub ? <p className="text-xs text-gray-500 mt-3 pl-2 leading-relaxed">{sub}</p> : null}
    </div>
  );
}

export default function DashboardSection({ selectedSite = "", onNavigate }) {
  const { data: session } = useSession();
  const hasGlobalAccess = session?.user?.role === "super_admin" || session?.user?.role === "smm";
  const userSiteLink = session?.user?.siteLink || "";
  const effectiveSite = hasGlobalAccess ? (selectedSite || userSiteLink) : userSiteLink;

  const [loading, setLoading] = useState(true);
  const [gscPayload, setGscPayload] = useState(null);
  const [gscError, setGscError] = useState("");
  const [baselineRows, setBaselineRows] = useState([]);
  const [baselineError, setBaselineError] = useState("");
  const [baselineEmptyHint, setBaselineEmptyHint] = useState("");

  const go = (sectionId) => {
    if (typeof onNavigate === "function") onNavigate(sectionId);
  };

  const loadSnapshot = useCallback(async () => {
    if (!effectiveSite) {
      setGscPayload(null);
      setBaselineRows([]);
      setBaselineEmptyHint("");
      setGscError("No site selected. Choose a site from the header.");
      setBaselineError("");
      setLoading(false);
      return;
    }

    setLoading(true);
    setGscError("");
    setBaselineError("");
    setBaselineEmptyHint("");
    setBaselineRows([]);

    const gq = new URLSearchParams({ range: "28d", page: "1", pageSize: "5" });
    if (hasGlobalAccess) gq.set("url", effectiveSite);

    const bq = new URLSearchParams();
    if (hasGlobalAccess) bq.set("url", effectiveSite);

    try {
      const [gscRes, baseRes] = await Promise.all([
        fetch(`/api/searchconsole/performance?${gq.toString()}`, { cache: "no-store" }),
        fetch(`/api/smm/baseline?${bq.toString()}`, { cache: "no-store" }),
      ]);

      const gscData = await gscRes.json();
      if (!gscRes.ok) {
        setGscPayload(null);
        setGscError(gscData.userMessage || gscData.error || "Search Console could not be loaded.");
      } else {
        setGscPayload(gscData);
        setGscError("");
      }

      const baseData = await baseRes.json();
      if (!baseRes.ok) {
        setBaselineRows([]);
        setBaselineError(baseData.error || "SMM baseline could not be loaded.");
      } else {
        setBaselineRows(Array.isArray(baseData.baselines) ? baseData.baselines : []);
        setBaselineError("");
        setBaselineEmptyHint(
          typeof baseData.message === "string" && !(baseData.baselines || []).length ? baseData.message : ""
        );
      }
    } catch {
      setGscPayload(null);
      setBaselineRows([]);
      setBaselineEmptyHint("");
      setGscError("Network error loading Search Console.");
      setBaselineError("Network error loading SMM baseline.");
    } finally {
      setLoading(false);
    }
  }, [effectiveSite, isSuperAdmin]);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  const totals = gscPayload?.totals;

  const orderedBaseline = useMemo(() => {
    const order = ["facebook", "instagram", "youtube", "tiktok"];
    return [...baselineRows].sort((a, b) => {
      const ai = order.indexOf(String(a.platform || "").toLowerCase());
      const bi = order.indexOf(String(b.platform || "").toLowerCase());
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }, [baselineRows]);

  const baselineTotalFollowers = useMemo(
    () => orderedBaseline.reduce((sum, row) => sum + Number(row.followers || 0), 0),
    [orderedBaseline]
  );

  const baselineLatestDate = useMemo(() => {
    const dates = baselineRows.map((b) => b.statDate).filter(Boolean).sort();
    return dates.length ? dates[dates.length - 1] : null;
  }, [baselineRows]);

  const host = siteHost(effectiveSite);

  const linkPill =
    "inline-flex items-center gap-1.5 rounded-full border border-emerald-200/90 bg-emerald-50/80 px-4 py-2 text-sm font-semibold text-emerald-900 shadow-sm transition-all hover:bg-emerald-100 hover:border-emerald-300 hover:shadow-md active:scale-[0.98]";

  return (
    <div className="relative min-h-[calc(100vh-1rem)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 max-w-6xl mx-auto bg-emerald-100/25 blur-3xl rounded-full opacity-70"
        aria-hidden
      />
      <div className="relative max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8 sm:space-y-10">
        {/* Welcome */}
        <div className="relative overflow-hidden rounded-3xl border border-gray-100 bg-white p-6 sm:p-8 shadow-[0_8px_40px_rgba(0,0,0,0.06)] ring-1 ring-gray-100/80">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-200/30 blur-2xl" aria-hidden />
          <div className="absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-sky-100/40 blur-2xl" aria-hidden />
          <div className="relative flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700/90 mb-2">Overview</p>
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight text-balance">
                Your performance at a glance
              </h1>
              <p className="text-gray-600 mt-3 text-base leading-relaxed">
                Search traffic and social followers in one calm view. Open a{" "}
                <span className="font-semibold text-gray-800">full report</span> anytime from the links below or the
                sidebar.
              </p>
              {host ? (
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50/90 px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" aria-hidden />
                    {host}
                  </span>
                  <span className="text-xs sm:text-sm text-gray-500 leading-snug">
                    Search: last 28 days · Social: SMM baseline
                  </span>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={loadSnapshot}
              disabled={loading || !effectiveSite}
              className="inline-flex items-center justify-center gap-2 self-start rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-gray-900/20 transition hover:bg-gray-800 hover:shadow-xl disabled:opacity-45 disabled:shadow-none"
            >
              <FiRefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
              {loading ? "Updating…" : "Refresh data"}
            </button>
          </div>
        </div>

        {/* Search Console */}
        <section
          aria-labelledby="dash-gsc-heading"
          className="rounded-3xl border border-gray-100 bg-white p-5 sm:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.04)] ring-1 ring-gray-50"
        >
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
            <div>
              <h2 id="dash-gsc-heading" className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
                Search Console
              </h2>
              <p className="text-sm text-gray-500 mt-1">How people find you on Google — last 28 days.</p>
            </div>
            <button type="button" onClick={() => go("website-statistics")} className={linkPill}>
              Open full report
              <span aria-hidden>→</span>
            </button>
          </div>
          {gscError ? (
            <p className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3.5 text-sm text-amber-950 leading-relaxed shadow-sm">
              {gscError}
            </p>
          ) : loading && !gscPayload ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-36 sm:h-40 rounded-2xl bg-gray-100/90 animate-pulse border border-gray-100"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <BigStatCard
                label="Clicks"
                value={formatNum(totals?.clicks)}
                accentClass="border-sky-100/90 bg-sky-50/40"
                barClass="bg-sky-500"
              />
              <BigStatCard
                label="Impressions"
                value={formatCompact(totals?.impressions)}
                accentClass="border-violet-100/90 bg-violet-50/40"
                barClass="bg-violet-500"
              />
              <BigStatCard
                label="Avg. CTR"
                value={formatPct(totals?.averageCtr)}
                accentClass="border-amber-100/90 bg-amber-50/35"
                barClass="bg-amber-500"
              />
              <BigStatCard
                label="Avg. position"
                value={formatPos(totals?.averagePosition)}
                sub="Lower is better in Search"
                accentClass="border-slate-200/90 bg-slate-50/50"
                barClass="bg-slate-500"
              />
            </div>
          )}
        </section>

        {/* SMM baseline */}
        <section
          aria-labelledby="dash-smm-heading"
          className="rounded-3xl border border-emerald-100/80 bg-white p-5 sm:p-8 shadow-[0_4px_28px_rgba(16,185,129,0.08)] ring-1 ring-emerald-50"
        >
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
            <div>
              <h2 id="dash-smm-heading" className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
                Social (SMM)
              </h2>
              <p className="text-sm text-gray-600 mt-1 max-w-xl leading-relaxed">
                Follower counts from your <span className="font-semibold text-gray-800">SMM baseline</span> — the same
                numbers you maintain in User Management, kept fresh per platform.
              </p>
            </div>
            <button type="button" onClick={() => go("smm-statistics")} className={linkPill}>
              Open full report
              <span aria-hidden>→</span>
            </button>
          </div>
          {baselineError ? (
            <p className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3.5 text-sm text-amber-950 leading-relaxed shadow-sm">
              {baselineError}
            </p>
          ) : loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-40 rounded-2xl bg-emerald-50/60 animate-pulse border border-emerald-100/60"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-4 relative overflow-hidden rounded-2xl border border-emerald-200/70 bg-emerald-50/50 p-6 sm:p-7 shadow-md flex flex-col justify-center min-h-[200px]">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-200/20 rounded-full blur-2xl -translate-y-1/2 translate-x-1/3" aria-hidden />
                <p className="relative text-[11px] font-bold uppercase tracking-wider text-emerald-800/90">
                  Total followers (baseline)
                </p>
                <p className="relative text-5xl sm:text-6xl font-bold text-gray-900 tabular-nums mt-3 leading-none tracking-tight">
                  {formatNum(baselineTotalFollowers)}
                </p>
                {baselineLatestDate ? (
                  <p className="relative text-sm text-emerald-900/80 mt-4 font-medium">
                    Latest baseline: <span className="tabular-nums">{baselineLatestDate}</span>
                  </p>
                ) : (
                  <p className="relative text-sm text-gray-600 mt-4 leading-relaxed">
                    {baselineEmptyHint || "No baseline rows yet for this site — add them in User Management when you are ready."}
                  </p>
                )}
              </div>
              <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {["facebook", "instagram", "youtube", "tiktok"].map((key) => {
                  const row = orderedBaseline.find((c) => String(c.platform || "").toLowerCase() === key);
                  const followers = row ? Number(row.followers || 0) : 0;
                  const label = platformLabel(key);
                  return (
                    <div
                      key={key}
                      className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)] flex flex-col items-center text-center justify-center min-h-[128px] transition-all duration-300 hover:border-emerald-200/80 hover:shadow-lg hover:-translate-y-0.5"
                    >
                      <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-50 text-gray-800 ring-1 ring-gray-100 mb-3">
                        <PlatformIcon platform={key} className="w-6 h-6" />
                      </span>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
                      <p className="text-2xl sm:text-3xl font-bold text-gray-900 tabular-nums mt-1.5">{formatNum(followers)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
