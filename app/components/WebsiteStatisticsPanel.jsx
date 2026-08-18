"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  FiCheckSquare,
  FiSquare,
  FiRefreshCw,
  FiTrendingDown,
  FiTrendingUp,
  FiGlobe,
  FiSearch,
  FiChevronDown,
  FiArrowRight,
  FiInfo,
  FiClipboard,
  FiSliders,
} from "react-icons/fi";
import ApprovalsUserPanel from "./ApprovalsUserPanel";
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Legend } from "recharts";
import { mergeCompareTimeSeries } from "../../lib/searchConsoleDateRanges";
import WebsiteStatisticsDateRangeModal, {
  formatDisplayRange,
} from "./WebsiteStatisticsDateRangeModal";
import ReportSectionActions from "./ReportSectionActions";
import WorldAudienceHeatMap from "./website-stats/WorldAudienceHeatMap";
import { countryDisplayName } from "@/lib/geo/isoCountries";

const RANGE_OPTIONS = [
  { id: "7d", label: "7 days" },
  { id: "28d", label: "28 days" },
  { id: "3m", label: "3 months" },
];

const EXT_PRESET_BADGE = {
  "6m": "6 mo",
  "12m": "12 mo",
  "16m": "16 mo",
};

function timeSelectionLabel(t) {
  if (!t) return "Date range";
  if (t.type === "preset") {
    const o = RANGE_OPTIONS.find((r) => r.id === t.range);
    if (o) return o.label;
    if (EXT_PRESET_BADGE[t.range]) return `Last ${EXT_PRESET_BADGE[t.range]}`;
  }
  if (t.type === "custom" && t.startDate && t.endDate) {
    return formatDisplayRange(t.startDate, t.endDate);
  }
  if (t.type === "compare" && t.startDate && t.endDate) {
    return `Compare · ${formatDisplayRange(t.startDate, t.endDate)}`;
  }
  return "Date range";
}

function tableFooterLabel(t, payload) {
  const dr = payload?.dateRange;
  if (t?.type === "compare" && t.startDate && t.endDate) {
    return `Primary: ${formatDisplayRange(t.startDate, t.endDate)}`;
  }
  if (dr?.startDate && dr?.endDate) {
    if (dr.range && dr.range !== "custom" && !["7d", "28d", "3m"].includes(dr.range)) {
      if (dr.range === "6m") return "Last 6 months";
      if (dr.range === "12m") return "Last 12 months";
      if (dr.range === "16m") return "Last 16 months";
    }
    return formatDisplayRange(dr.startDate, dr.endDate);
  }
  if (t?.type === "preset" && t.range) {
    const o = RANGE_OPTIONS.find((r) => r.id === t.range);
    if (o) return o.label;
  }
  return "Last 7 days";
}

/** Short primary-period caption for metric cards (Search Console style). */
function getPrimaryPeriodCaption(t, dr) {
  if (t?.type === "preset" && t.range) {
    const o = RANGE_OPTIONS.find((r) => r.id === t.range);
    if (o) {
      if (o.id === "7d") return "Last 7 days";
      if (o.id === "28d") return "Last 28 days";
      if (o.id === "3m") return "Last 3 months";
    }
    if (t.range === "6m") return "Last 6 months";
    if (t.range === "12m") return "Last 12 months";
    if (t.range === "16m") return "Last 16 months";
  }
  if (t?.type === "custom" && t.startDate && t.endDate) {
    return formatDisplayRange(t.startDate, t.endDate);
  }
  if (t?.type === "compare") {
    const pr = t.comparePreset;
    if (pr && pr !== "custom") {
      if (pr.startsWith("c7d_")) return "Last 7 days";
      if (pr.startsWith("c28d_")) return "Last 28 days";
      if (pr.startsWith("c3m_")) return "Last 3 months";
      if (pr.startsWith("c6m_")) return "Last 6 months";
      if (pr.startsWith("c16m_")) return "Last 16 months";
    }
    if (t.startDate && t.endDate) return formatDisplayRange(t.startDate, t.endDate);
  }
  if (dr?.startDate && dr?.endDate) {
    if (dr.range && dr.range !== "custom") {
      const o = RANGE_OPTIONS.find((r) => r.id === dr.range);
      if (o) {
        if (o.id === "7d") return "Last 7 days";
        if (o.id === "28d") return "Last 28 days";
        if (o.id === "3m") return "Last 3 months";
      }
      if (dr.range === "6m") return "Last 6 months";
      if (dr.range === "12m") return "Last 12 months";
      if (dr.range === "16m") return "Last 16 months";
    }
    return formatDisplayRange(dr.startDate, dr.endDate);
  }
  return "Selected range";
}

/** Second line under the compare value (e.g. “Same period last year”). */
function getComparePeriodCaption(comparePreset) {
  if (!comparePreset || comparePreset === "custom") {
    return "Compare range";
  }
  if (comparePreset.endsWith("_yoy")) return "Same period last year";
  if (comparePreset.endsWith("_prev")) return "Previous period";
  return "Compare range";
}

function formatNum(value) {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(value || 0)));
}

function formatCompact(value) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    Math.max(0, Math.round(value || 0))
  );
}

function formatPct(value) {
  return `${((value || 0) * 100).toFixed(1)}%`;
}

function formatPos(value) {
  return (value || 0).toFixed(1);
}

function shortLabel(urlOrText) {
  if (!urlOrText) return "-";
  return urlOrText.length > 26 ? `${urlOrText.slice(0, 26)}...` : urlOrText;
}

function pctChangeFromCtr(ctr) {
  const pct = ((ctr || 0) * 100).toFixed(1);
  return `${pct}%`;
}

function getTimeAgo(value) {
  if (!value) return "-";
  const then = new Date(value).getTime();
  const now = Date.now();
  const diffHrs = Math.max(0, Math.floor((now - then) / (1000 * 60 * 60)));
  if (diffHrs < 1) return "less than 1 hour ago";
  if (diffHrs === 1) return "1 hour ago";
  return `${diffHrs} hours ago`;
}

export default function WebsiteStatisticsPanel({ selectedSite = "", title = "Website Statistics", embedded = false }) {
  const { data: session } = useSession();
  const isSuperAdmin = session?.user?.role === "super_admin";
  const userSiteLink = session?.user?.siteLink || "";

  const [timeSelection, setTimeSelection] = useState({ type: "preset", range: "3m" });
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);
  const [activeDetailView, setActiveDetailView] = useState(null);
  const [activeMetrics, setActiveMetrics] = useState({
    clicks: true,
    impressions: true,
    ctr: false,
    position: false,
  });
  const [mainTab, setMainTab] = useState("overview");
  const [graphMode, setGraphMode] = useState("separate");
  const [approvalOpenCount, setApprovalOpenCount] = useState(0);
  const [approvalCountNonce, setApprovalCountNonce] = useState(0);
  const showApprovalsTab = !isSuperAdmin;

  const effectiveSite = isSuperAdmin ? (selectedSite || userSiteLink) : userSiteLink;

  useEffect(() => {
    if (!showApprovalsTab) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/approvals");
        const data = await res.json();
        if (!res.ok || cancelled) return;
        const list = data.approvals || [];
        const n = list.filter((a) => a.status === "pending" || a.status === "edited").length;
        setApprovalOpenCount(n);
      } catch {
        if (!cancelled) setApprovalOpenCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showApprovalsTab, mainTab, approvalCountNonce]);

  useEffect(() => {
    const bump = () => setApprovalCountNonce((n) => n + 1);
    if (typeof window === "undefined") return undefined;
    window.addEventListener("approvals:user-updated", bump);
    return () => window.removeEventListener("approvals:user-updated", bump);
  }, []);

  const fetchData = useCallback(async () => {
    if (!effectiveSite) {
      setPayload(null);
      setError("No website selected. Please choose a site.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ page: "1", pageSize: "10" });
      if (timeSelection.type === "preset") {
        qs.set("range", timeSelection.range);
      } else if (timeSelection.type === "custom") {
        qs.set("startDate", timeSelection.startDate);
        qs.set("endDate", timeSelection.endDate);
      } else if (timeSelection.type === "compare") {
        qs.set("startDate", timeSelection.startDate);
        qs.set("endDate", timeSelection.endDate);
        qs.set("compareStart", timeSelection.compareStart);
        qs.set("compareEnd", timeSelection.compareEnd);
      } else {
        qs.set("range", "28d");
      }
      if (isSuperAdmin) {
        qs.set("url", effectiveSite);
      }
      const res = await fetch(`/api/searchconsole/performance?${qs.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.userMessage || data.error || "Failed to fetch statistics");
      }
      setPayload(data);
    } catch (err) {
      setError(err.message || "Unable to load website statistics");
    } finally {
      setLoading(false);
    }
  }, [effectiveSite, isSuperAdmin, timeSelection]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const chartData = useMemo(() => {
    if (!payload?.timeSeries?.length) return [];
    const showCompare =
      timeSelection.type === "compare" && (payload.compareTimeSeries?.length ?? 0) > 0;
    if (showCompare) {
      const merged = mergeCompareTimeSeries(payload.timeSeries, payload.compareTimeSeries);
      return merged.map((item) => ({
        date: item.dateLabel,
        fullDate: item.date,
        clicks: item.clicks || 0,
        impressions: item.impressions || 0,
        ctr: (item.ctr || 0) * 100,
        position: item.position || 0,
        compareClicks: item.compareClicks || 0,
        compareImpressions: item.compareImpressions || 0,
        compareCtr: (item.compareCtr || 0) * 100,
        comparePosition: item.comparePosition || 0,
      }));
    }
    return (payload.timeSeries || []).map((item) => ({
      date: item.date.slice(5),
      fullDate: item.date,
      clicks: item.clicks || 0,
      impressions: item.impressions || 0,
      ctr: (item.ctr || 0) * 100,
      position: item.position || 0,
    }));
  }, [payload, timeSelection.type]);

  const clicksChange = useMemo(() => {
    if (!payload?.totals?.clicks || !payload?.compareTotals?.clicks) return 0;
    return ((payload.totals.clicks - payload.compareTotals.clicks) / payload.compareTotals.clicks) * 100;
  }, [payload]);

  const impressionsChange = useMemo(() => {
    if (!payload?.totals?.impressions || !payload?.compareTotals?.impressions) return 0;
    return ((payload.totals.impressions - payload.compareTotals.impressions) / payload.compareTotals.impressions) * 100;
  }, [payload]);

  const ctrChange = useMemo(() => {
    if (!payload?.totals?.averageCtr || !payload?.compareTotals?.averageCtr) return 0;
    return ((payload.totals.averageCtr - payload.compareTotals.averageCtr) / payload.compareTotals.averageCtr) * 100;
  }, [payload]);

  const positionChange = useMemo(() => {
    if (!payload?.totals?.averagePosition || !payload?.compareTotals?.averagePosition) return 0;
    return ((payload.totals.averagePosition - payload.compareTotals.averagePosition) / payload.compareTotals.averagePosition) * 100;
  }, [payload]);

  const maxCountryClicks = useMemo(() => {
    const values = (payload?.topCountries?.countries || []).map((c) => c.clicks || 0);
    return Math.max(1, ...values);
  }, [payload]);

  const hasCompare =
    timeSelection.type === "compare" && Boolean(payload?.compareTimeSeries?.length);
  const footerText = useMemo(
    () => tableFooterLabel(timeSelection, payload),
    [timeSelection, payload]
  );
  const primaryPeriodCaption = useMemo(
    () => getPrimaryPeriodCaption(timeSelection, payload?.dateRange),
    [timeSelection, payload?.dateRange]
  );
  const comparePeriodCaption = useMemo(
    () =>
      timeSelection.type === "compare"
        ? getComparePeriodCaption(timeSelection.comparePreset)
        : "",
    [timeSelection]
  );

  const onDateRangeApply = useCallback((p) => {
    if (p.kind === "filter") {
      if (p.filterPreset === "custom") {
        setTimeSelection({ type: "custom", startDate: p.startDate, endDate: p.endDate });
      } else {
        setTimeSelection({ type: "preset", range: p.filterPreset });
      }
    } else {
      setTimeSelection({
        type: "compare",
        startDate: p.startDate,
        endDate: p.endDate,
        compareStart: p.compareStart,
        compareEnd: p.compareEnd,
        comparePreset: p.compareLabel || "custom",
      });
    }
  }, []);

  const dateModalInitial = useMemo(() => {
    if (timeSelection.type === "custom") {
      return {
        filterPreset: "custom",
        customStart: timeSelection.startDate,
        customEnd: timeSelection.endDate,
      };
    }
    if (timeSelection.type === "compare") {
      return {
        filterPreset: "6m",
        comparePreset: timeSelection.comparePreset === "custom" || !timeSelection.comparePreset
          ? "custom"
          : timeSelection.comparePreset,
        pStart: timeSelection.startDate,
        pEnd: timeSelection.endDate,
        cStart: timeSelection.compareStart,
        cEnd: timeSelection.compareEnd,
      };
    }
    const allFilterIds = ["7d", "28d", "3m", "6m", "12m", "16m"];
    return {
      filterPreset: allFilterIds.includes(timeSelection.range) ? timeSelection.range : "28d",
      comparePreset: "c3m_prev",
    };
  }, [timeSelection]);

  const toggleMetric = (key) => {
    setActiveMetrics((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const pagesData = payload?.topPages?.pages || [];
  const countriesData = payload?.topCountries?.countries || [];
  const keywordsData = payload?.topQueries?.queries || [];

  if (activeDetailView) {
    const detailTitle = activeDetailView === "pages"
      ? "Pages and Screens"
      : activeDetailView === "countries"
        ? "Where your audience is"
        : "Keywords";

    return (
      <div className="rounded-xl border border-gray-200 bg-[#ffffff] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[26px] font-semibold text-gray-900">{detailTitle}</h2>
          <button
            type="button"
            onClick={() => setActiveDetailView(null)}
            className="text-sm px-3 py-1.5 border border-gray-300 rounded bg-white text-gray-700 hover:bg-gray-50"
          >
            Back
          </button>
        </div>

        {activeDetailView === "pages" && (
          <div className="border border-gray-200 rounded-md overflow-hidden">
            <div className="grid grid-cols-[1fr_90px_110px_90px_90px] gap-2 bg-gray-50 px-4 py-2 text-[11px] font-semibold text-gray-600 uppercase">
              <span>Page</span>
              <span className="text-right">Clicks</span>
              <span className="text-right">Impressions</span>
              <span className="text-right">CTR</span>
              <span className="text-right">Position</span>
            </div>
            <div className="max-h-[520px] overflow-y-auto">
              {pagesData.map((row) => (
                <div key={row.page} className="grid grid-cols-[1fr_90px_110px_90px_90px] gap-2 px-4 py-2.5 text-sm border-t border-gray-100">
                  <span className="truncate text-gray-800">{row.page}</span>
                  <span className="text-right text-gray-800">{formatNum(row.clicks)}</span>
                  <span className="text-right text-gray-800">{formatNum(row.impressions)}</span>
                  <span className="text-right text-gray-800">{formatPct(row.ctr)}</span>
                  <span className="text-right text-gray-800">{formatPos(row.position)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeDetailView === "countries" && (
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <WorldAudienceHeatMap
              countries={countriesData}
              variant="detail"
              metricLabel="Clicks"
              showHeading={false}
            />
            {countriesData.length > 12 ? (
              <div className="mt-4 border-t border-gray-100 pt-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  All countries
                </p>
                <div className="max-h-[280px] overflow-y-auto rounded-md border border-gray-100">
                  {countriesData.map((row) => {
                    const pct = maxCountryClicks ? ((row.clicks || 0) / maxCountryClicks) * 100 : 0;
                    return (
                      <div key={row.country} className="px-3 py-2 text-sm border-t border-gray-100 first:border-t-0">
                        <div className="mb-1 grid grid-cols-[1fr_90px] gap-2">
                          <span className="text-gray-800">{countryDisplayName(row.country)}</span>
                          <span className="text-right text-gray-800">{formatNum(row.clicks)}</span>
                        </div>
                        <div className="h-1.5 rounded bg-gray-100">
                          <div className="h-1.5 rounded bg-[#31c655]" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {activeDetailView === "keywords" && (
          <div className="border border-gray-200 rounded-md overflow-hidden">
            <div className="grid grid-cols-[1fr_90px_110px_90px_90px] gap-2 bg-gray-50 px-4 py-2 text-[11px] font-semibold text-gray-600 uppercase">
              <span>Keyword</span>
              <span className="text-right">Clicks</span>
              <span className="text-right">Impressions</span>
              <span className="text-right">CTR</span>
              <span className="text-right">Position</span>
            </div>
            <div className="max-h-[520px] overflow-y-auto">
              {keywordsData.map((row) => (
                <div key={row.query} className="grid grid-cols-[1fr_90px_110px_90px_90px] gap-2 px-4 py-2.5 text-sm border-t border-gray-100">
                  <span className="truncate text-gray-800">{row.query}</span>
                  <span className="text-right text-gray-800">{formatNum(row.clicks)}</span>
                  <span className="text-right text-gray-800">{formatNum(row.impressions)}</span>
                  <span className="text-right text-gray-800">{formatPct(row.ctr)}</span>
                  <span className="text-right text-gray-800">{formatPos(row.position)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={embedded ? "" : "rounded-xl border border-gray-200 bg-[#ffffff] p-5"}>
      {!embedded ? (
        <>
      <h2 className="text-[28px] font-semibold text-gray-900 mb-3">{title}</h2>
      <div className="border-t border-gray-200 mb-4" />
        </>
      ) : null}

      {showApprovalsTab && (
        <div className="flex gap-2 mb-5">
          <button
            type="button"
            onClick={() => setMainTab("overview")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border ${
              mainTab === "overview"
                ? "bg-[#dff7de] border-[#b6ddb1] text-gray-900"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <FiGlobe className="w-4 h-4" />
            Overview
          </button>
          <button
            type="button"
            onClick={() => setMainTab("approvals")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border relative ${
              mainTab === "approvals"
                ? "bg-[#dff7de] border-[#b6ddb1] text-gray-900"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <FiClipboard className="w-4 h-4" />
            SMM Post Approvals
            {approvalOpenCount > 0 && (
              <span className="ml-1 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center">
                {approvalOpenCount > 9 ? "9+" : approvalOpenCount}
              </span>
            )}
          </button>
        </div>
      )}

      {showApprovalsTab && mainTab === "approvals" ? (
        <ApprovalsUserPanel />
      ) : (
        <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <ReportSectionActions
          section="website"
          activeSite={selectedSite}
          onRefresh={fetchData}
          loading={loading}
          month={new Date().toISOString().slice(0, 7)}
        />
        {RANGE_OPTIONS.map((option) => {
          const active =
            timeSelection.type === "preset" && timeSelection.range === option.id;
          return (
            <button
              key={option.id}
              onClick={() =>
                setTimeSelection({ type: "preset", range: option.id })
              }
              className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-smooth ${
                active
                  ? "border-[color-mix(in_srgb,var(--cw-neon)_45%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-neon)_16%,var(--cw-surface))] text-[var(--cw-ink)]"
                  : "border-[var(--cw-hairline)] bg-[var(--cw-raised)] text-[var(--cw-ink-muted)] hover:border-[var(--cw-hairline-strong)] hover:text-[var(--cw-ink)]"
              }`}
            >
              {active && <FiCheckSquare className="h-3 w-3 text-[var(--cw-neon)]" />}
              {option.label}
            </button>
          );
        })}
        {(() => {
          // The active selection lives in this trigger whenever it isn't one of
          // the quick buttons above (e.g. the 3-month default). Highlight it so
          // the chosen range is always visible instead of reading as plain text.
          const triggerHoldsSelection = !(
            timeSelection.type === "preset" &&
            RANGE_OPTIONS.some((o) => o.id === timeSelection.range)
          );
          return (
            <button
              type="button"
              onClick={() => setDateModalOpen(true)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-smooth ${
                triggerHoldsSelection
                  ? "border-[color-mix(in_srgb,var(--cw-neon)_45%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-neon)_16%,var(--cw-surface))] text-[var(--cw-ink)]"
                  : "border-[var(--cw-hairline)] bg-[var(--cw-raised)] text-[var(--cw-ink-dim)] hover:border-[var(--cw-hairline-strong)] hover:text-[var(--cw-ink)]"
              }`}
              title="Date range and comparison"
            >
              <FiSliders className="h-3.5 w-3.5 shrink-0 opacity-80" />
              <span className="max-w-[10rem] truncate text-left sm:max-w-[16rem]">
                {timeSelectionLabel(timeSelection)}
              </span>
              <FiChevronDown className="h-3 w-3 shrink-0 opacity-70" />
            </button>
          );
        })()}
        <WebsiteStatisticsDateRangeModal
          open={dateModalOpen}
          onClose={() => setDateModalOpen(false)}
          onApply={onDateRangeApply}
          defaultTab={timeSelection.type === "compare" ? "compare" : "filter"}
          initial={dateModalInitial}
        />
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 border border-gray-200 rounded overflow-hidden bg-white mb-4">
        <MetricCard
          metric="clicks"
          label="Total clicks"
          value={formatNum(payload?.totals?.clicks)}
          hasCompare={hasCompare}
          primaryValue={formatNum(payload?.totals?.clicks)}
          compareValue={formatNum(payload?.compareTotals?.clicks)}
          primaryPeriodCaption={primaryPeriodCaption}
          comparePeriodCaption={comparePeriodCaption}
          checked={activeMetrics.clicks}
          color="text-sky-600"
          onToggle={() => toggleMetric("clicks")}
        />
        <MetricCard
          metric="impressions"
          label="Total Impressions"
          value={formatCompact(payload?.totals?.impressions)}
          hasCompare={hasCompare}
          primaryValue={formatCompact(payload?.totals?.impressions)}
          compareValue={formatCompact(payload?.compareTotals?.impressions)}
          primaryPeriodCaption={primaryPeriodCaption}
          comparePeriodCaption={comparePeriodCaption}
          checked={activeMetrics.impressions}
          color="text-violet-600"
          onToggle={() => toggleMetric("impressions")}
        />
        <MetricCard
          metric="ctr"
          label="Average CTR"
          value={formatPct(payload?.totals?.averageCtr)}
          hasCompare={hasCompare}
          primaryValue={formatPct(payload?.totals?.averageCtr)}
          compareValue={formatPct(payload?.compareTotals?.averageCtr)}
          primaryPeriodCaption={primaryPeriodCaption}
          comparePeriodCaption={comparePeriodCaption}
          checked={activeMetrics.ctr}
          color="text-amber-700"
          onToggle={() => toggleMetric("ctr")}
        />
        <MetricCard
          metric="position"
          label="Average Position"
          value={formatPos(payload?.totals?.averagePosition)}
          hasCompare={hasCompare}
          primaryValue={formatPos(payload?.totals?.averagePosition)}
          compareValue={formatPos(payload?.compareTotals?.averagePosition)}
          primaryPeriodCaption={primaryPeriodCaption}
          comparePeriodCaption={comparePeriodCaption}
          checked={activeMetrics.position}
          color="text-slate-600"
          onToggle={() => toggleMetric("position")}
        />
      </div>

      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="text-xs text-gray-500 space-y-0.5">
            <p className="font-medium text-gray-600">Last Updated: {getTimeAgo(payload?.lastUpdated)}</p>
            <p className="text-[10px] text-gray-400 leading-snug max-w-xl">
              Search Console usually finishes a calendar day after a ~2–3 day delay. Date ranges here end on the latest complete day.
            </p>
          </div>
          <div className="flex items-center gap-1 bg-slate-100/80 border border-slate-200/50 rounded-xl p-1 self-start sm:self-auto shadow-inner">
            <button
              type="button"
              onClick={() => setGraphMode("combined")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                graphMode === "combined"
                  ? "bg-white text-gray-900 shadow-sm border border-slate-200/20"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Combined Chart
            </button>
            <button
              type="button"
              onClick={() => setGraphMode("separate")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                graphMode === "separate"
                  ? "bg-white text-gray-900 shadow-sm border border-slate-200/20"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Separate Graphs
            </button>
          </div>
        </div>

        {graphMode === "combined" ? (
          <div className="h-[320px] bg-slate-50/30 border border-slate-100 rounded-2xl p-4 sm:p-5">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 5, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#6D757E" }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 9, fill: "#6D757E" }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: "#6D757E" }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip activeMetrics={activeMetrics} hasCompare={hasCompare} />} />
                {hasCompare && (
                  <Legend
                    wrapperStyle={{ fontSize: 11, paddingTop: 10 }}
                    formatter={(value) => <span className="text-gray-500 font-medium">{value}</span>}
                  />
                )}
                {activeMetrics.clicks && (
                  <Line
                    yAxisId="left"
                    name={hasCompare ? "Clicks" : undefined}
                    type="monotone"
                    dataKey="clicks"
                    stroke="#0EFF2A"
                    strokeWidth={2}
                    dot={false}
                  />
                )}
                {activeMetrics.clicks && hasCompare && (
                  <Line
                    yAxisId="left"
                    name="Clicks (compare)"
                    type="monotone"
                    dataKey="compareClicks"
                    stroke="#0EFF2A"
                    strokeWidth={2}
                    strokeOpacity={0.4}
                    strokeDasharray="5 4"
                    dot={false}
                  />
                )}
                {activeMetrics.impressions && (
                  <Line
                    yAxisId="right"
                    name={hasCompare ? "Impressions" : undefined}
                    type="monotone"
                    dataKey="impressions"
                    stroke="#38E1FF"
                    strokeWidth={2}
                    dot={false}
                  />
                )}
                {activeMetrics.impressions && hasCompare && (
                  <Line
                    yAxisId="right"
                    name="Impr. (compare)"
                    type="monotone"
                    dataKey="compareImpressions"
                    stroke="#38E1FF"
                    strokeWidth={2}
                    strokeOpacity={0.4}
                    strokeDasharray="5 4"
                    dot={false}
                  />
                )}
                {activeMetrics.ctr && (
                  <Line
                    yAxisId="left"
                    name={hasCompare ? "CTR" : undefined}
                    type="monotone"
                    dataKey="ctr"
                    stroke="#FFB020"
                    strokeWidth={2}
                    dot={false}
                  />
                )}
                {activeMetrics.ctr && hasCompare && (
                  <Line
                    yAxisId="left"
                    name="CTR (compare)"
                    type="monotone"
                    dataKey="compareCtr"
                    stroke="#FFB020"
                    strokeWidth={2}
                    strokeOpacity={0.4}
                    strokeDasharray="5 4"
                    dot={false}
                  />
                )}
                {activeMetrics.position && (
                  <Line
                    yAxisId="left"
                    name={hasCompare ? "Position" : undefined}
                    type="monotone"
                    dataKey="position"
                    stroke="#949CA5"
                    strokeWidth={2}
                    dot={false}
                  />
                )}
                {activeMetrics.position && hasCompare && (
                  <Line
                    yAxisId="left"
                    name="Pos. (compare)"
                    type="monotone"
                    dataKey="comparePosition"
                    stroke="#949CA5"
                    strokeWidth={2}
                    strokeOpacity={0.4}
                    strokeDasharray="5 4"
                    dot={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Area Chart 1: Clicks */}
            <div className="bg-white border border-slate-100 rounded-2xl p-4 sm:p-5 flex flex-col shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Clicks</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-bold text-slate-900 tabular-nums">
                      {formatNum(payload?.totals?.clicks)}
                    </span>
                    {hasCompare && (
                      <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        clicksChange >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                      }`}>
                        {clicksChange >= 0 ? <FiTrendingUp className="w-3 h-3" /> : <FiTrendingDown className="w-3 h-3" />}
                        {Math.abs(clicksChange).toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
                <span className="w-2.5 h-2.5 rounded-full bg-[#0EFF2A] shadow-[0_0_8px_rgba(52,168,83,0.3)]" />
              </div>
              <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0EFF2A" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#0EFF2A" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#6D757E" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: "#6D757E" }} tickLine={false} axisLine={false} />
                    <Tooltip content={<SeparateTooltip type="clicks" />} />
                    <Area type="monotone" dataKey="clicks" stroke="#0EFF2A" strokeWidth={2} fillOpacity={1} fill="url(#colorClicks)" />
                    {hasCompare && (
                      <Area type="monotone" dataKey="compareClicks" stroke="#0EFF2A" strokeWidth={1.5} strokeDasharray="4 3" strokeOpacity={0.5} fill="none" />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Area Chart 2: Impressions */}
            <div className="bg-white border border-slate-100 rounded-2xl p-4 sm:p-5 flex flex-col shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Impressions</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-bold text-slate-900 tabular-nums">
                      {formatNum(payload?.totals?.impressions)}
                    </span>
                    {hasCompare && (
                      <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        impressionsChange >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                      }`}>
                        {impressionsChange >= 0 ? <FiTrendingUp className="w-3 h-3" /> : <FiTrendingDown className="w-3 h-3" />}
                        {Math.abs(impressionsChange).toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
                <span className="w-2.5 h-2.5 rounded-full bg-[#38E1FF] shadow-[0_0_8px_rgba(124,122,188,0.3)]" />
              </div>
              <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorImpressions" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#38E1FF" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#38E1FF" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#6D757E" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: "#6D757E" }} tickLine={false} axisLine={false} />
                    <Tooltip content={<SeparateTooltip type="impressions" />} />
                    <Area type="monotone" dataKey="impressions" stroke="#38E1FF" strokeWidth={2} fillOpacity={1} fill="url(#colorImpressions)" />
                    {hasCompare && (
                      <Area type="monotone" dataKey="compareImpressions" stroke="#38E1FF" strokeWidth={1.5} strokeDasharray="4 3" strokeOpacity={0.5} fill="none" />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Area Chart 3: Average CTR */}
            <div className="bg-white border border-slate-100 rounded-2xl p-4 sm:p-5 flex flex-col shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Average CTR</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-bold text-slate-900 tabular-nums">
                      {formatPct(payload?.totals?.averageCtr)}
                    </span>
                    {hasCompare && (
                      <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        ctrChange >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                      }`}>
                        {ctrChange >= 0 ? <FiTrendingUp className="w-3 h-3" /> : <FiTrendingDown className="w-3 h-3" />}
                        {Math.abs(ctrChange).toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
                <span className="w-2.5 h-2.5 rounded-full bg-[#FFB020] shadow-[0_0_8px_rgba(245,158,11,0.3)]" />
              </div>
              <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCtr" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#FFB020" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#FFB020" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#6D757E" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: "#6D757E" }} tickLine={false} axisLine={false} />
                    <Tooltip content={<SeparateTooltip type="ctr" />} />
                    <Area type="monotone" dataKey="ctr" stroke="#FFB020" strokeWidth={2} fillOpacity={1} fill="url(#colorCtr)" />
                    {hasCompare && (
                      <Area type="monotone" dataKey="compareCtr" stroke="#FFB020" strokeWidth={1.5} strokeDasharray="4 3" strokeOpacity={0.5} fill="none" />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Area Chart 4: Average Position */}
            <div className="bg-white border border-slate-100 rounded-2xl p-4 sm:p-5 flex flex-col shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Average Position</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-bold text-slate-900 tabular-nums">
                      {formatPos(payload?.totals?.averagePosition)}
                    </span>
                    {hasCompare && (
                      <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        positionChange <= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                      }`}>
                        {positionChange <= 0 ? <FiTrendingUp className="w-3 h-3" /> : <FiTrendingDown className="w-3 h-3" />}
                        {Math.abs(positionChange).toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
                <span className="w-2.5 h-2.5 rounded-full bg-[#949CA5] shadow-[0_0_8px_rgba(107,114,128,0.3)]" />
              </div>
              <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorPosition" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#949CA5" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#949CA5" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#6D757E" }} tickLine={false} axisLine={false} />
                    <YAxis reversed={true} tick={{ fontSize: 9, fill: "#6D757E" }} tickLine={false} axisLine={false} />
                    <Tooltip content={<SeparateTooltip type="position" />} />
                    <Area type="monotone" dataKey="position" stroke="#949CA5" strokeWidth={2} fillOpacity={1} fill="url(#colorPosition)" />
                    {hasCompare && (
                      <Area type="monotone" dataKey="comparePosition" stroke="#949CA5" strokeWidth={1.5} strokeDasharray="4 3" strokeOpacity={0.5} fill="none" />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-md p-3">
          <div className="flex items-center justify-between text-[13px] font-medium text-gray-700 mb-3">
            <span>Views by page title and screens</span>
            <FiChevronDown className="w-3.5 h-3.5 text-gray-500" />
          </div>
          <div className="grid grid-cols-[1fr_56px_58px] gap-2 text-[10px] font-semibold text-gray-500 uppercase border-b border-gray-200 pb-1.5 mb-1.5">
            <span>Page Title And Screens</span>
            <span className="text-right">Views</span>
            <span className="text-right">Trend</span>
          </div>
          <div className="space-y-1">
            {(payload?.topPages?.pages || []).slice(0, 7).map((row) => (
              <div key={row.page} className="grid grid-cols-[1fr_56px_58px] gap-2 items-center text-xs border-b border-gray-100 pb-1.5">
                <span className="text-gray-800">{shortLabel(row.page)}</span>
                <span className="text-right text-gray-800">{formatNum(row.clicks)}</span>
                <span className={`inline-flex justify-end items-center gap-0.5 ${row.ctr >= 0.05 ? "text-[#2fb54a]" : "text-red-500"}`}>
                  {row.ctr >= 0.05 ? <FiTrendingUp className="w-3 h-3" /> : <FiTrendingDown className="w-3 h-3" />}
                  {pctChangeFromCtr(row.ctr)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-3 text-[11px]">
            <span className="text-gray-500">{footerText}</span>
            <button
              type="button"
              onClick={() => setActiveDetailView("pages")}
              className="text-[#2fb54a] font-medium inline-flex items-center gap-1"
            >
              View pages and screens
              <FiArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-md p-3">
          <WorldAudienceHeatMap
            countries={payload?.topCountries?.countries || []}
            variant="compact"
            metricLabel="Clicks"
          />
          <div className="flex items-center justify-between pt-3 text-[11px]">
            <span className="text-gray-500">{footerText}</span>
            <button
              type="button"
              onClick={() => setActiveDetailView("countries")}
              className="text-[#2fb54a] font-medium inline-flex items-center gap-1"
            >
              Explore full map
              <FiArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-md p-3">
          <div className="flex items-center justify-between text-[13px] font-medium text-gray-700 mb-3">
            <span>Keywords</span>
            <span className="inline-flex items-center gap-1 text-gray-600 text-[12px]">
              By Ranking
              <FiChevronDown className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="grid grid-cols-[1fr_64px_58px] gap-2 text-[10px] font-semibold text-gray-500 uppercase border-b border-gray-200 pb-1.5 mb-1.5">
            <span>Keywords</span>
            <span className="text-right">Sessions</span>
            <span className="text-right">Trend</span>
          </div>
          <div className="space-y-1">
            {(payload?.topQueries?.queries || []).slice(0, 7).map((row) => (
              <div key={row.query} className="grid grid-cols-[1fr_64px_58px] gap-2 items-center text-xs border-b border-gray-100 pb-1.5">
                <span className="inline-flex items-center gap-1 text-gray-800">
                  <FiSearch className="text-gray-400 w-3 h-3" />
                  {shortLabel(row.query)}
                </span>
                <span className="text-right text-gray-800">{formatNum(row.clicks)}</span>
                <span className={`inline-flex justify-end items-center gap-0.5 ${row.ctr >= 0.05 ? "text-[#2fb54a]" : "text-red-500"}`}>
                  {row.ctr >= 0.05 ? <FiTrendingUp className="w-3 h-3" /> : <FiTrendingDown className="w-3 h-3" />}
                  {pctChangeFromCtr(row.ctr)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-3 text-[11px]">
            <span className="text-gray-500">{footerText}</span>
            <button
              type="button"
              onClick={() => setActiveDetailView("keywords")}
              className="text-[#2fb54a] font-medium inline-flex items-center gap-1"
            >
              View more keywords
              <FiArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
}

const METRIC_LINE = {
  clicks: "#0EFF2A",
  impressions: "#38E1FF",
  ctr: "#FFB020",
  position: "#949CA5",
};

/** Each metric's selected tint matches its line colour in the chart. */
const METRIC_ACTIVE_BG = {
  clicks: "bg-emerald-50/90",
  impressions: "bg-sky-50/90",
  ctr: "bg-amber-50/90",
  position: "bg-slate-50/90",
};

function LineSwatch({ solid, color }) {
  if (solid) {
    return (
      <span className="inline-block w-7 mt-0.5" aria-hidden>
        <span className="block h-0.5 w-full rounded-full" style={{ backgroundColor: color }} />
      </span>
    );
  }
  return (
    <span className="inline-block w-7 mt-0.5" aria-hidden>
      <svg width="28" height="4" viewBox="0 0 28 4" className="block">
        <line
          x1="0"
          y1="2"
          x2="28"
          y2="2"
          stroke={color}
          strokeWidth="2"
          strokeDasharray="4 3"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

function MetricCard({
  metric,
  label,
  value,
  hasCompare,
  primaryValue,
  compareValue,
  primaryPeriodCaption,
  comparePeriodCaption,
  checked,
  color,
  onToggle,
}) {
  const line = METRIC_LINE[metric] || "#949CA5";
  const activeBg = METRIC_ACTIVE_BG[metric] || "bg-white";
  const surface = checked ? activeBg : "bg-white";

  if (hasCompare) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className={`relative text-left pl-3 pr-3 pt-2.5 pb-9 min-h-[168px] border-r border-gray-200 last:border-r-0 ${surface} w-full transition-colors hover:brightness-[0.99]`}
      >
        <div className="flex items-center gap-2 text-xs pr-5">
          {checked ? <FiCheckSquare className={color} /> : <FiSquare className="text-gray-400" />}
          <span className={`${checked ? "text-gray-900" : "text-gray-600"} font-medium`}>{label}</span>
        </div>
        <div className="mt-2 pr-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[32px] leading-[1.1] font-medium text-gray-900 tabular-nums">{primaryValue}</p>
              <p className="text-xs text-gray-600 mt-0.5 leading-tight">{primaryPeriodCaption || "—"}</p>
            </div>
            <LineSwatch solid color={line} />
          </div>
        </div>
        <div className="mt-2.5 pt-2.5 border-t border-gray-200/80">
          <div className="flex items-start justify-between gap-2 pr-1">
            <div className="min-w-0">
              <p className="text-2xl font-medium text-gray-800 tabular-nums">{compareValue}</p>
              <p className="text-xs text-gray-600 mt-0.5 leading-tight">{comparePeriodCaption || "—"}</p>
            </div>
            <LineSwatch solid={false} color={line} />
          </div>
        </div>
        <FiInfo className="w-3.5 h-3.5 text-gray-400 absolute bottom-2.5 right-2.5" title="" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative text-left pl-3 pr-3 py-3 min-h-[108px] border-r border-gray-200 last:border-r-0 ${
        checked ? activeBg : "bg-white"
      } w-full transition-colors hover:brightness-[0.99]`}
    >
      <div className="flex items-center gap-2 text-xs pr-5">
        {checked ? <FiCheckSquare className={color} /> : <FiSquare className="text-gray-400" />}
        <span className={`${checked ? "text-gray-900" : "text-gray-600"} font-medium`}>{label}</span>
      </div>
      <div className="flex items-end justify-between mt-1 gap-2 pr-8">
        <p className="text-[34px] leading-none font-medium text-gray-900 tabular-nums">{value}</p>
      </div>
      <FiInfo className="w-3.5 h-3.5 text-gray-400 absolute bottom-2.5 right-2.5" />
    </button>
  );
}

function CustomTooltip({ active, payload, label, activeMetrics, hasCompare }) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  
  const getFormat = (val, type) => {
    if (type === "clicks") return formatNum(val);
    if (type === "impressions") return formatNum(val);
    if (type === "ctr") return `${Number(val ?? 0).toFixed(1)}%`;
    if (type === "position") return Number(val ?? 0).toFixed(1);
    return val;
  };

  const getMetricLabel = (type) => {
    if (type === "clicks") return "Clicks";
    if (type === "impressions") return "Impressions";
    if (type === "ctr") return "CTR";
    if (type === "position") return "Position";
    return type;
  };

  const getColor = (type) => {
    if (type === "clicks") return "text-[#0EFF2A]";
    if (type === "impressions") return "text-[#38E1FF]";
    if (type === "ctr") return "text-[#FFB020]";
    if (type === "position") return "text-[#949CA5]";
    return "text-gray-800";
  };

  return (
    <div className="bg-white/95 backdrop-blur-md border border-slate-100 rounded-xl shadow-xl p-3 text-xs min-w-[160px] transition-all">
      <p className="text-slate-400 font-semibold mb-2">{data.fullDate || label}</p>
      <div className="space-y-1.5">
        {payload.map((item, idx) => {
          const isCompare = item.dataKey.startsWith("compare") || item.name?.includes("compare") || item.name?.includes("compare");
          const rawKey = item.dataKey.toLowerCase();
          const type = rawKey.includes("click") ? "clicks" : rawKey.includes("impress") ? "impressions" : rawKey.includes("ctr") ? "ctr" : "position";
          
          if (!isCompare && !activeMetrics[type]) return null;
          
          return (
            <div key={idx} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-slate-600 font-medium">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.stroke || item.fill }} />
                {getMetricLabel(type)}{isCompare ? " (Compare)" : ""}
              </span>
              <span className={`font-bold tabular-nums ${getColor(type)}`}>
                {getFormat(item.value, type)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SeparateTooltip({ active, payload, label, type }) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  const val = payload[0].value;
  
  const getFormat = (val, type) => {
    if (type === "clicks") return formatNum(val);
    if (type === "impressions") return formatNum(val);
    if (type === "ctr") return `${Number(val ?? 0).toFixed(1)}%`;
    if (type === "position") return Number(val ?? 0).toFixed(1);
    return val;
  };

  const getColor = (type) => {
    if (type === "clicks") return "text-[#0EFF2A]";
    if (type === "impressions") return "text-[#38E1FF]";
    if (type === "ctr") return "text-[#FFB020]";
    if (type === "position") return "text-[#949CA5]";
    return "text-gray-800";
  };

  return (
    <div className="bg-white/95 backdrop-blur-md border border-slate-100 rounded-xl shadow-xl p-2.5 text-xs min-w-[140px] transition-all">
      <p className="text-slate-400 font-semibold mb-1.5">{data.fullDate || label}</p>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-slate-600 font-medium">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: payload[0].stroke || payload[0].fill }} />
          {type === "clicks" ? "Clicks" : type === "impressions" ? "Impressions" : type === "ctr" ? "CTR" : "Position"}
        </span>
        <span className={`font-bold tabular-nums ${getColor(type)}`}>
          {getFormat(val, type)}
        </span>
      </div>
      {payload[1] && (
        <div className="flex items-center justify-between gap-3 mt-1 pt-1 border-t border-slate-100">
          <span className="flex items-center gap-1.5 text-slate-400 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-200" style={{ backgroundColor: payload[1].stroke || payload[1].fill, opacity: 0.5 }} />
            Compare
          </span>
          <span className="font-semibold tabular-nums text-slate-400">
            {getFormat(payload[1].value, type)}
          </span>
        </div>
      )}
    </div>
  );
}

