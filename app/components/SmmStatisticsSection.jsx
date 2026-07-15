"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Area, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FiDownload, FiRefreshCw } from "react-icons/fi";
import { SiFacebook, SiInstagram, SiYoutube, SiTiktok } from "react-icons/si";
import { isSmmRole } from "../../lib/rbac";
import SmmApprovalCardsGrid from "./SmmApprovalCardsGrid";
import SmmDownloadReportModal from "./SmmDownloadReportModal";
import { formatYearMonth } from "../../lib/smmReportMonthRange";

/** Fixed window for `/api/smm/stats` (range controls removed from UI). */
const SMM_STATS_RANGE = "3m";

const PLATFORM_OPTIONS = [
  { id: "all", label: "All platforms" },
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "youtube", label: "YouTube" },
  { id: "tiktok", label: "TikTok" },
];

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function formatCompact(value) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    Number(value || 0)
  );
}

function platformLabel(platform) {
  const key = String(platform || "").toLowerCase();
  if (key === "youtube") return "YouTube";
  if (key === "tiktok" || key === "x") return "TikTok";
  if (key === "facebook") return "Facebook";
  if (key === "instagram") return "Instagram";
  return key || "Platform";
}

function PlatformIcon({ platform, className = "w-4 h-4" }) {
  const key = String(platform || "").toLowerCase();
  const cn = `shrink-0 ${className}`;
  if (key === "facebook") return <SiFacebook className={cn} aria-hidden />;
  if (key === "instagram") return <SiInstagram className={cn} aria-hidden />;
  if (key === "youtube") return <SiYoutube className={cn} aria-hidden />;
  if (key === "tiktok" || key === "x") return <SiTiktok className={cn} aria-hidden />;
  return null;
}

function metricLabel(platform) {
  return "Followers";
}

function platformMark(platform) {
  const key = String(platform || "").toLowerCase();
  if (key === "facebook") return "f";
  if (key === "instagram") return "ig";
  if (key === "youtube") return "▶";
  if (key === "tiktok" || key === "x") return "♪";
  return "•";
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function buildMonthlySeries(timeSeries = []) {
  const base = MONTH_LABELS.map((month) => ({ month, reels: 0, posts: 0 }));
  for (const row of timeSeries) {
    const value = String(row.date || "");
    let monthIndex = -1;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      monthIndex = Number(value.slice(5, 7)) - 1;
    } else if (/^\d{2}-\d{2}$/.test(value)) {
      monthIndex = Number(value.slice(0, 2)) - 1;
    }
    if (monthIndex < 0 || monthIndex > 11) continue;
    base[monthIndex].reels += Number(row.reach || 0);
    base[monthIndex].posts += Number(row.engagements || 0);
  }
  return base;
}

function AnalyticsTooltip({ active, payload, label, chartYear }) {
  if (!active || !payload || payload.length === 0) return null;
  const reels = Number(payload.find((p) => p.dataKey === "reels")?.value || 0);
  const posts = Number(payload.find((p) => p.dataKey === "posts")?.value || 0);
  const yr = chartYear || new Date().getFullYear();
  return (
    <div className="rounded-md border border-gray-200 bg-white/95 shadow-sm px-3 py-2 text-xs">
      <p className="font-semibold text-gray-800 mb-1">
        {label}, {yr}
      </p>
      <div className="flex items-center justify-between gap-5 text-gray-600">
        <span>Reach</span>
        <span className="font-medium text-gray-800">{formatNumber(reels)} ↑</span>
      </div>
      <div className="flex items-center justify-between gap-5 text-gray-600 mt-1">
        <span>Engagements</span>
        <span className="font-medium text-gray-800">{formatNumber(posts)} ↑</span>
      </div>
    </div>
  );
}

export default function SmmStatisticsSection({ selectedSite = "" }) {
  const { data: session } = useSession();
  const isSuperAdmin = session?.user?.role === "super_admin";
  const hasGlobalAccess = session?.user?.role === "super_admin" || session?.user?.role === "smm";
  const ownSite =
    session?.user?.siteLink ||
    (Array.isArray(session?.user?.accessibleSites) && session?.user?.accessibleSites[0]) ||
    "";
  const showSmmChartOnly = isSmmRole(session?.user?.role);

  const [range, setRange] = useState("3m");
  const [platform, setPlatform] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

  const maxCalendarMonth = formatYearMonth(new Date());
  const [viewMonth, setViewMonth] = useState(() => formatYearMonth(new Date()));
  const [reportModalOpen, setReportModalOpen] = useState(false);

  const activeSite = hasGlobalAccess ? (selectedSite || ownSite) : ownSite;

  const fetchStats = useCallback(async (forceRefresh = false) => {
    if (!activeSite) {
      setPayload(null);
      setError("No site selected. Please integrate a site first.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({
        range: SMM_STATS_RANGE,
        platform,
        ...(hasGlobalAccess ? { url: activeSite } : {}),
        ...(forceRefresh ? { refresh: "true" } : {}),
      });
      const res = await fetch(`/api/smm/stats?${query.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load SMM statistics");
      }
      setPayload(data);
    } catch (err) {
      setError(err.message || "Failed to load SMM statistics");
    } finally {
      setLoading(false);
    }
  }, [activeSite, hasGlobalAccess, platform]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const cards = payload?.platformCards || [];
  const timeSeries = payload?.timeSeries || [];
  const setup = payload?.setup || null;

  const chartYearFromSeries = useMemo(() => {
    const d = timeSeries[0]?.date;
    if (d && /^\d{4}/.test(String(d))) return Number(String(d).slice(0, 4));
    return new Date().getFullYear();
  }, [timeSeries]);

  const totalFollowers = useMemo(
    () => cards.reduce((sum, card) => sum + Number(card.followers || 0), 0),
    [cards]
  );
  const monthlyChartData = useMemo(() => buildMonthlySeries(timeSeries), [timeSeries]);
  const topCards = useMemo(() => {
    const order = ["facebook", "instagram", "youtube", "tiktok"];
    return [...cards].sort((a, b) => {
      const ai = order.indexOf(String(a.platform || "").toLowerCase());
      const bi = order.indexOf(String(b.platform || "").toLowerCase());
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }, [cards]);

  return (
    <div className="rounded-xl border border-gray-200 bg-[#ffffff] p-5 min-h-[calc(100vh-2rem)]">
      <SmmDownloadReportModal
        open={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        activeSite={activeSite}
        isSuperAdmin={isSuperAdmin}
        platform={platform}
        initialMonth={viewMonth}
      />

      <div className="flex flex-col gap-4">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[26px] font-semibold text-gray-900">Social Media Marketing Statistics</h2>
            <p className="text-sm text-gray-600 mt-1.5">
              SMM website statistics — performance for your linked property.
            </p>
            <p className="text-sm text-gray-600 mt-1">
              <span className="font-medium text-gray-800">Site:</span> {activeSite || "—"}
              {/* {setup?.gtmContainerId ? (
                <span className="text-gray-500">
                  {" "}
                  · <span className="font-medium text-gray-800">GTM:</span> {setup.gtmContainerId}
                </span>
              ) : null} */}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 shrink-0">
            <div>
              <label
                htmlFor="smm-view-month"
                className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1"
              >
                Report month
              </label>
              <input
                id="smm-view-month"
                type="month"
                value={viewMonth}
                max={maxCalendarMonth}
                onChange={(e) => setViewMonth(e.target.value || maxCalendarMonth)}
                className="block w-full sm:w-auto min-w-[11rem] px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-900 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#0EFF2A]/25 focus:border-[#0EFF2A]"
              />
            </div>
            <button
              type="button"
              onClick={() => setReportModalOpen(true)}
              disabled={!activeSite}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold shadow-sm hover:bg-gray-800 disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <FiDownload className="w-4 h-4 shrink-0" aria-hidden />
              Download reports
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="px-3 py-1.5 rounded-md border border-gray-200 text-sm bg-white"
          >
            {PLATFORM_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => fetchStats(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-gray-200 text-sm text-gray-700 bg-white"
          >
            <FiRefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}

      {loading ? (
        <div className="h-72 flex items-center justify-center text-sm text-gray-500">Loading SMM stats...</div>
      ) : (
        <>
          <div className="mt-4">
            {topCards.length > 0 ? (
              <>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Platforms</span>
                  <span className="text-[11px] font-semibold text-green-600">Platforms +</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-gray-200 bg-[#f9f9f9] rounded-sm overflow-hidden">
                  {topCards.map((card) => {
                    const cardIcon = PlatformIcon({ platform: card.platform });
                    return (
                    <div
                      key={`${card.platform}-${card.accountName}`}
                      className="px-3 py-2.5 border-r border-gray-200 last:border-r-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[13px] font-semibold text-gray-700 flex items-center gap-1.5 min-w-0">
                          {cardIcon ? (
                            <span className="inline-flex shrink-0 text-gray-700">{cardIcon}</span>
                          ) : (
                            <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-gray-300 text-[9px] text-gray-600 font-semibold">
                              {platformMark(card.platform)}
                            </span>
                          )}
                          <span className="truncate">{platformLabel(card.platform)}</span>
                        </p>
                        <span
                          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            card.deltaFollowers >= 0
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {card.deltaFollowers >= 0 ? "↑" : "↓"} {Math.abs(Number(card.deltaFollowers || 0)).toFixed(1)}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5 truncate">{card.accountHandle || "@account"}</p>
                      <p className="text-[34px] leading-none font-semibold text-gray-900 mt-2">
                        {formatCompact(card.followers)}
                      </p>
                      <p className="text-[12px] text-gray-500 mt-1">{metricLabel(card.platform)}</p>
                    </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-500">
                {setup?.message || "No platform data yet. Send stats via GTM to `/api/smm/collect`."}
              </div>
            )}
          </div>

          {/* SMM Performance Trends */}
          <div className="mt-5 rounded-xl border border-gray-200 p-5 bg-white">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-base font-bold text-gray-900">SMM Performance Trends (Reels & Posts)</p>
                <p className="text-xs text-gray-500 mt-0.5">Reach and engagements comparison over the last 3 months</p>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-600 font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#33d56a]" />
                  Reach
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#7a79d8]" />
                  Engagements
                </span>
              </div>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyChartData}>
                  <defs>
                    <linearGradient id="reelsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#39d86e" stopOpacity={0.32} />
                      <stop offset="95%" stopColor="#39d86e" stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id="postsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7a79d8" stopOpacity={0.24} />
                      <stop offset="95%" stopColor="#7a79d8" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    content={(tipProps) => <AnalyticsTooltip {...tipProps} chartYear={chartYearFromSeries} />}
                    cursor={{ stroke: "#bfc3ca", strokeWidth: 1 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="reels"
                    stroke="#33d56a"
                    strokeWidth={3}
                    dot={{ r: 2 }}
                    activeDot={{ r: 5, fill: "#33d56a" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="posts"
                    stroke="#7a79d8"
                    strokeWidth={2.5}
                    dot={{ r: 2 }}
                    activeDot={{ r: 5, fill: "#7a79d8" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-3 text-xs text-gray-500 font-medium">Total Followers Across Platforms: {formatNumber(totalFollowers)}</p>
          </div>

          {/* SMM Approvals Section */}
          {(isSuperAdmin || session?.user?.role === "smm" || session?.user?.role === "approver") && (
            <div className="mt-6 rounded-xl border border-gray-200 p-5 bg-white">
              <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
                <div>
                  <p className="text-base font-bold text-gray-900">SMM Content Approvals</p>
                  <p className="text-xs text-gray-500 mt-0.5">Review, approve, or edit scheduled Facebook and Instagram draft posts</p>
                </div>
                <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-1 text-xs font-semibold text-green-700">
                  Approved Items Only
                </span>
              </div>
              <SmmApprovalCardsGrid isSuperAdmin={isSuperAdmin} activeSite={activeSite} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

