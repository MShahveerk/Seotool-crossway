"use client";

import { useEffect, useState } from "react";
import {
  FiSearch,
  FiTrendingUp,
  FiDollarSign,
  FiBarChart2,
  FiAlertCircle,
  FiDownload,
  FiCopy,
  FiZap,
  FiLayers,
  FiRefreshCw,
  FiGlobe,
  FiCheck,
} from "react-icons/fi";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import SeoPanelShell, { formatNum } from "./SeoPanelShell";

const GEO_OPTIONS = [
  { id: "us", label: "United States (2840)" },
  { id: "uk", label: "United Kingdom (2826)" },
  { id: "pk", label: "Pakistan (2364)" },
  { id: "ca", label: "Canada (2124)" },
  { id: "au", label: "Australia (2036)" },
];

function CompetitionBadge({ level, index }) {
  if (!level && index == null) return <span className="text-gray-400">—</span>;

  let colorClass = "bg-gray-100 text-gray-700 border-gray-200";
  if (level === "HIGH" || (index != null && index >= 70)) {
    colorClass = "bg-red-50 text-red-700 border-red-200";
  } else if (level === "MEDIUM" || (index != null && index >= 35)) {
    colorClass = "bg-amber-50 text-amber-700 border-amber-200";
  } else if (level === "LOW" || (index != null && index < 35)) {
    colorClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
  }

  return (
    <div className="flex flex-col gap-1">
      <span className={`inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${colorClass}`}>
        {level || (index >= 70 ? "HIGH" : index >= 35 ? "MEDIUM" : "LOW")}
      </span>
      {index != null && (
        <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full ${
              index >= 70 ? "bg-red-500" : index >= 35 ? "bg-amber-500" : "bg-emerald-500"
            }`}
            style={{ width: `${Math.min(100, Math.max(0, index))}%` }}
          />
        </div>
      )}
    </div>
  );
}

function TrendSparkline({ trend }) {
  const data = (trend || [])
    .filter((t) => t.searches != null)
    .slice(-12)
    .map((t) => ({
      searches: t.searches,
    }));

  if (data.length < 2) return <span className="text-gray-400 text-xs">—</span>;

  return (
    <div className="h-8 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="adsTrendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="searches" stroke="#10b981" strokeWidth={1.5} fill="url(#adsTrendGrad)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function GoogleAdsKeywordPlannerSection({ selectedSite }) {
  const [activeTab, setActiveTab] = useState("ideas"); // 'ideas' | 'metrics'
  const [seedInput, setSeedInput] = useState("seo software, digital marketing");
  const [bulkInput, setBulkInput] = useState("seo audit\nkeyword research\nlocal seo\ncontent strategy");
  const [geo, setGeo] = useState("us");
  const [useSiteUrl, setUseSiteUrl] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [configured, setConfigured] = useState(true);
  const [diagnostics, setDiagnostics] = useState(null);
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);

  // Filters
  const [searchFilter, setSearchFilter] = useState("");
  const [compFilter, setCompFilter] = useState("all");

  const checkStatus = async () => {
    try {
      const res = await fetch("/api/keywords/google-ads-planner");
      const json = await res.json();
      setConfigured(Boolean(json.configured));
      setDiagnostics(json.diagnostics || null);
    } catch {
      setConfigured(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const handleRunQuery = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const payload = {
        mode: activeTab,
        geo,
        siteUrl: useSiteUrl && selectedSite ? selectedSite : "",
      };

      if (activeTab === "ideas") {
        payload.query = seedInput;
      } else {
        payload.keywords = bulkInput.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
      }

      const res = await fetch("/api/keywords/google-ads-planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to query Google Ads Keyword Planner");
      }

      setData(json);
    } catch (err) {
      setError(err.message || "Query failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const rawItems = data?.items || [];
  const filteredItems = rawItems.filter((item) => {
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      if (!item.keyword.toLowerCase().includes(q)) return false;
    }
    if (compFilter !== "all") {
      if ((item.competition || "").toUpperCase() !== compFilter.toUpperCase()) return false;
    }
    return true;
  });

  // Calculate summary stats
  const totalVolume = rawItems.reduce((acc, curr) => acc + (curr.avgMonthlySearches || 0), 0);
  const avgVolume = rawItems.length ? Math.round(totalVolume / rawItems.length) : 0;
  const highCompCount = rawItems.filter((i) => i.competition === "HIGH" || (i.competitionIndex || 0) >= 70).length;

  const exportCSV = () => {
    if (!filteredItems.length) return;
    const headers = ["Keyword", "Avg Monthly Volume", "Competition", "Competition Index", "Low Top Bid", "High Top Bid"];
    const rows = filteredItems.map((i) => [
      `"${i.keyword.replace(/"/g, '""')}"`,
      i.avgMonthlySearches ?? 0,
      i.competition || "",
      i.competitionIndex ?? "",
      `"${i.lowTopOfPageBid || ""}"`,
      `"${i.highTopOfPageBid || ""}"`,
    ]);
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `google_ads_keywords_${activeTab}_${geo}.csv`;
    a.click();
  };

  const copyKeywords = () => {
    if (!filteredItems.length) return;
    const text = filteredItems.map((i) => i.keyword).join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <SeoPanelShell
      title="Google Ads Keyword Planner"
      description="Direct integration with Google Ads API (v24). Discover new search terms, examine historical monthly volumes, top-of-page CPC bid ranges, and competition metrics."
      selectedSite={selectedSite}
      loading={false}
      error={error}
    >
      {/* Configuration Status Diagnostic Banner */}
      {!configured && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5 text-amber-950 shadow-sm">
          <div className="flex items-start gap-3">
            <FiAlertCircle className="size-6 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-2 text-xs">
              <h4 className="font-bold text-sm text-amber-900">Google Ads API Requires Setup in `.env`</h4>
              <p>
                To query Google Ads Keyword Planner directly, set the following environment variables on your server:
              </p>
              <ul className="list-disc pl-4 space-y-1 font-mono text-[11px]">
                <li><strong className="font-semibold text-amber-900">GOOGLE_ADS_DEVELOPER_TOKEN</strong> = "your-dev-token"</li>
                <li><strong className="font-semibold text-amber-900">GOOGLE_ADS_CUSTOMER_ID</strong> = "xxx-xxx-xxxx"</li>
                <li><strong className="font-semibold text-amber-900">GOOGLE_ADS_CREDENTIALS_JSON</strong> = Service account JSON string or path (decoupled from Search Console)</li>
              </ul>
              {diagnostics?.error && (
                <div className="mt-2 rounded-lg bg-amber-100/70 p-2 font-mono text-[11px] text-amber-900">
                  Diagnostic Error: {diagnostics.error}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tabs & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div className="inline-flex rounded-xl bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("ideas")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ${
              activeTab === "ideas"
                ? "bg-white text-emerald-950 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <FiZap className="size-4 text-emerald-600" />
            Keyword Discovery &amp; Ideas
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("metrics")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ${
              activeTab === "metrics"
                ? "bg-white text-emerald-950 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <FiLayers className="size-4 text-emerald-600" />
            Bulk Keyword Metrics
          </button>
        </div>

        {/* Target Region Selector */}
        <div className="flex items-center gap-2">
          <FiGlobe className="size-4 text-gray-500" />
          <span className="text-xs font-semibold text-gray-500">Geo Target:</span>
          <select
            value={geo}
            onChange={(e) => setGeo(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 shadow-sm focus:border-emerald-500 focus:outline-none"
          >
            {GEO_OPTIONS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Form Input Container */}
      <form onSubmit={handleRunQuery} className="rounded-2xl border border-gray-200 bg-gray-50/50 p-4 sm:p-5 space-y-4">
        {activeTab === "ideas" ? (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                <FiSearch className="size-4 text-emerald-600" />
                Seed Keywords (comma-separated):
              </label>
              {selectedSite && (
                <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useSiteUrl}
                    onChange={(e) => setUseSiteUrl(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  Combine with current site URL ({selectedSite.replace(/^https?:\/\//, "").split("/")[0]})
                </label>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value)}
                placeholder="e.g. seo software, rank tracker, backlink checker"
                className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white shadow-md hover:bg-emerald-700 transition-all disabled:opacity-50"
              >
                {loading ? <FiRefreshCw className="size-4 animate-spin" /> : <FiZap className="size-4" />}
                Generate Ideas
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
              <FiLayers className="size-4 text-emerald-600" />
              Paste Exact Keywords (one per line or comma-separated):
            </label>
            <textarea
              rows={4}
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              placeholder="e.g. seo audit&#10;keyword research&#10;local seo"
              className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white shadow-md hover:bg-emerald-700 transition-all disabled:opacity-50"
              >
                {loading ? <FiRefreshCw className="size-4 animate-spin" /> : <FiSearch className="size-4" />}
                Fetch Historical Metrics
              </button>
            </div>
          </div>
        )}
      </form>

      {/* Summary KPI Cards */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500">Keywords Found</span>
              <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                <FiBarChart2 className="size-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-900">{formatNum(rawItems.length)}</p>
            <span className="text-[11px] text-gray-400">Total metrics retrieved</span>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500">Avg Monthly Volume</span>
              <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                <FiTrendingUp className="size-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-900">{formatNum(avgVolume)}</p>
            <span className="text-[11px] text-gray-400">Per keyword average</span>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500">Total Monthly Volume</span>
              <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                <FiZap className="size-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-900">{formatNum(totalVolume)}</p>
            <span className="text-[11px] text-gray-400">Aggregate search demand</span>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500">High Competition Ratio</span>
              <div className="rounded-lg bg-amber-50 p-2 text-amber-600">
                <FiDollarSign className="size-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {rawItems.length ? `${Math.round((highCompCount / rawItems.length) * 100)}%` : "0%"}
            </p>
            <span className="text-[11px] text-gray-400">{highCompCount} high-competition keywords</span>
          </div>
        </div>
      )}

      {/* Results Table Container */}
      {data && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden space-y-4 p-4">
          {/* Table Header Action Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-3 border-b border-gray-100">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <FiSearch className="absolute left-3 top-2.5 size-4 text-gray-400" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Filter keywords..."
                  className="w-full rounded-xl border border-gray-200 bg-gray-50/50 pl-9 pr-3 py-1.5 text-xs text-gray-900 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <select
                value={compFilter}
                onChange={(e) => setCompFilter(e.target.value)}
                className="rounded-xl border border-gray-200 bg-gray-50/50 px-3 py-1.5 text-xs text-gray-800 focus:border-emerald-500 focus:outline-none"
              >
                <option value="all">All Competition</option>
                <option value="LOW">Low Competition</option>
                <option value="MEDIUM">Medium Competition</option>
                <option value="HIGH">High Competition</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copyKeywords}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
              >
                {copied ? <FiCheck className="size-3.5 text-emerald-600" /> : <FiCopy className="size-3.5 text-gray-500" />}
                {copied ? "Copied!" : "Copy Keywords"}
              </button>

              <button
                type="button"
                onClick={exportCSV}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-sm hover:bg-emerald-100 transition-colors"
              >
                <FiDownload className="size-3.5" />
                Export CSV
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-600">
              <thead className="bg-gray-50/80 text-[11px] font-bold uppercase tracking-wider text-gray-500 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3">Keyword</th>
                  <th className="px-4 py-3 text-right">Avg Monthly Volume</th>
                  <th className="px-4 py-3 text-center">Competition</th>
                  <th className="px-4 py-3 text-right">Low Top Bid</th>
                  <th className="px-4 py-3 text-right">High Top Bid</th>
                  <th className="px-4 py-3 text-center">12-Mo Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-xs">
                      No matching keywords found. Try clearing your filters or running a new search.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-emerald-50/30 transition-colors">
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        {item.keyword}
                        {item.closeVariants?.length > 0 && (
                          <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 font-normal">
                            +{item.closeVariants.length} variants
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">
                        {item.avgMonthlySearches != null ? formatNum(item.avgMonthlySearches) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center w-36">
                        <CompetitionBadge level={item.competition} index={item.competitionIndex} />
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-700">
                        {item.lowTopOfPageBid || "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-700">
                        {item.highTopOfPageBid || "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <TrendSparkline trend={item.monthlyTrend} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </SeoPanelShell>
  );
}
