"use client";

import { useState, useEffect } from "react";
import SeoPanelShell from "./SeoPanelShell";
import {
  FiSearch,
  FiTrendingUp,
  FiGlobe,
  FiDollarSign,
  FiLayers,
  FiExternalLink,
  FiBarChart2,
  FiLink2,
  FiAward,
  FiShield,
  FiRefreshCw,
  FiSparkles,
} from "react-icons/fi";

const LOCATIONS = [
  { code: 2840, name: "United States" },
  { code: 2826, name: "United Kingdom" },
  { code: 2124, name: "Canada" },
  { code: 2036, name: "Australia" },
  { code: 2356, name: "India" },
  { code: 2276, name: "Germany" },
];

function formatNum(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString();
}

function formatCpc(cpc) {
  if (cpc == null) return "$0.00";
  return `$${Number(cpc).toFixed(2)}`;
}

export default function DataForSeoExplorerSection({ selectedSite = "" }) {
  const [activeTab, setActiveTab] = useState("keywords"); // keywords | serp | backlinks
  const [query, setQuery] = useState("seo software");
  const [domainQuery, setDomainQuery] = useState("");
  const [locationCode, setLocationCode] = useState(2840);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  // Set default domain from selectedSite prop
  useEffect(() => {
    if (selectedSite) {
      const clean = String(selectedSite).replace(/^https?:\/\//, "").split("/")[0];
      if (clean && !domainQuery) setDomainQuery(clean);
    }
  }, [selectedSite]);

  const fetchData = async (overrideMode, overrideQuery, forceRefresh = false) => {
    const mode = overrideMode || activeTab;
    const q = overrideQuery || (mode === "backlinks" ? domainQuery || selectedSite : query);
    if (!q) {
      setError("Please enter a keyword or domain.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        mode,
        locationCode: String(locationCode),
      });

      if (forceRefresh) {
        params.set("forceRefresh", "1");
      }

      if (mode === "backlinks") {
        params.set("domain", q);
      } else {
        params.set("keyword", q);
      }

      const res = await fetch(`/api/dataforseo?${params.toString()}`);
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to fetch DataForSEO data");
      }

      setData(json.data);
    } catch (err) {
      setError(err.message || "DataForSEO query failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchData();
  };

  const kwItem = data?.keywords?.[0] || {};
  const monthlySearches = kwItem.monthly_searches || [];
  const maxMonthly = Math.max(...monthlySearches.map((m) => m.search_volume || 0), 1);

  return (
    <SeoPanelShell
      title="DataForSEO Intelligence Hub"
      description="Live search volumes, CPC, competition indexes, 12-month search trends, real-time Google SERP rankings, and domain backlink analysis powered by DataForSEO."
      selectedSite={selectedSite}
      loading={false}
      error={error}
    >
      {/* Sub Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div className="inline-flex rounded-xl bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("keywords")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ${
              activeTab === "keywords"
                ? "bg-white text-emerald-950 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <FiTrendingUp className="size-4" />
            Keyword Volume &amp; Trends
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("serp")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ${
              activeTab === "serp"
                ? "bg-white text-emerald-950 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <FiGlobe className="size-4" />
            Live SERP Analyzer
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("backlinks")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ${
              activeTab === "backlinks"
                ? "bg-white text-emerald-950 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <FiLink2 className="size-4" />
            Domain Backlinks Summary
          </button>
        </div>

        {/* Location Selector */}
        {activeTab !== "backlinks" && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500">Target Region:</span>
            <select
              value={locationCode}
              onChange={(e) => setLocationCode(Number(e.target.value))}
              className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 shadow-sm focus:border-emerald-500 focus:outline-none"
            >
              {LOCATIONS.map((loc) => (
                <option key={loc.code} value={loc.code}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Cache Status Bar */}
      {data?._cached && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-2.5 text-xs font-semibold text-emerald-950">
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            Cached DataForSEO Results (Saved on {new Date(data._cachedAt).toLocaleDateString()}). Stored for 7 days.
          </span>
          <button
            type="button"
            onClick={() => fetchData(null, null, true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-300 shadow-sm hover:bg-emerald-100 transition-colors"
          >
            <FiRefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh Live
          </button>
        </div>
      )}

      {/* Search Bar Input */}
      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
        {activeTab === "backlinks" ? (
          <div className="relative flex-1">
            <FiGlobe className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
            <input
              type="text"
              value={domainQuery}
              onChange={(e) => setDomainQuery(e.target.value)}
              placeholder="Enter domain (e.g. crosswayconsulting.com)..."
              className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-xs font-medium text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
        ) : (
          <div className="relative flex-1">
            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={activeTab === "serp" ? "Enter keyword to inspect Google SERP..." : "Enter keyword (e.g. seo software)..."}
              className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-xs font-medium text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? <FiRefreshCw className="size-4 animate-spin" /> : <FiSearch className="size-4" />}
          {loading ? "Fetching DataForSEO…" : "Analyze Now"}
        </button>
      </form>

      {/* Tab 1: Keyword Volume & Trends */}
      {activeTab === "keywords" && (
        <div className="space-y-6">
          {/* Key Metric Cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Monthly Volume</p>
              <p className="mt-2 text-2xl font-bold text-gray-900 tabular-nums">
                {formatNum(kwItem.search_volume)}
              </p>
              <p className="mt-1 text-[11px] text-gray-500">Average monthly searches</p>
            </div>

            <div className="rounded-2xl border border-sky-100 bg-sky-50/40 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-sky-800">Cost Per Click (CPC)</p>
              <p className="mt-2 text-2xl font-bold text-gray-900 tabular-nums">
                {formatCpc(kwItem.cpc)}
              </p>
              <p className="mt-1 text-[11px] text-gray-500">Suggested Google Ads bid</p>
            </div>

            <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Competition Index</p>
              <p className="mt-2 text-2xl font-bold text-gray-900 tabular-nums">
                {kwItem.competition_index != null ? `${kwItem.competition_index}/100` : "—"}
              </p>
              <p className="mt-1 text-[11px] text-gray-500">
                Level: <span className="font-semibold text-gray-800 uppercase">{kwItem.competition || "Normal"}</span>
              </p>
            </div>

            <div className="rounded-2xl border border-purple-100 bg-purple-50/40 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-purple-800">Keyword Difficulty</p>
              <p className="mt-2 text-2xl font-bold text-gray-900 tabular-nums">
                {kwItem.keyword_difficulty != null ? `${kwItem.keyword_difficulty}/100` : kwItem.competition_index != null ? `${kwItem.competition_index}/100` : "Moderate"}
              </p>
              <p className="mt-1 text-[11px] text-gray-500">SEO organic competition</p>
            </div>
          </div>

          {/* 12-Month Volume Trend Sparkline */}
          {monthlySearches.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-4">12-Month Search Volume History</h3>
              <div className="flex items-end gap-2 h-32 pt-4 border-b border-gray-100 pb-2">
                {monthlySearches.map((m, idx) => {
                  const heightPct = Math.round(((m.search_volume || 0) / maxMonthly) * 100);
                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative">
                      <div className="absolute -top-7 hidden group-hover:block rounded bg-gray-900 px-2 py-0.5 text-[10px] font-bold text-white z-10 shadow">
                        {formatNum(m.search_volume)}
                      </div>
                      <div
                        className="w-full bg-emerald-500 rounded-t transition-all group-hover:bg-emerald-600 min-h-[4px]"
                        style={{ height: `${Math.max(heightPct, 4)}%` }}
                      />
                      <span className="text-[9px] font-semibold text-gray-400 truncate w-full text-center">
                        {m.month}/{String(m.year).slice(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Related Suggestions Table */}
          {data?.suggestions?.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-4 flex items-center gap-2">
                <FiSparkles className="text-amber-500" />
                Related Keyword Opportunities
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/50 text-[10px] uppercase font-bold text-gray-500">
                      <th className="py-2.5 px-3">Keyword</th>
                      <th className="py-2.5 px-3 text-right">Search Volume</th>
                      <th className="py-2.5 px-3 text-right">CPC</th>
                      <th className="py-2.5 px-3 text-right">Competition Index</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium">
                    {data.suggestions.map((sug, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-semibold text-gray-900">{sug.keyword}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{formatNum(sug.search_volume)}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{formatCpc(sug.cpc)}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{sug.competition_index != null ? `${sug.competition_index}/100` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Live SERP Analyzer */}
      {activeTab === "serp" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600">
              Live Google Organic Rankings for &quot;{query}&quot;
            </h3>
            {data?.totalCount ? (
              <span className="text-xs font-semibold text-gray-500">
                Total SERP Results: {formatNum(data.totalCount)}
              </span>
            ) : null}
          </div>

          {data?.items?.length > 0 ? (
            <div className="space-y-3">
              {data.items.map((item, idx) => (
                <div key={idx} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-emerald-200 transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-xs font-bold text-emerald-900">
                          #{item.rank_group || item.rank_absolute || idx + 1}
                        </span>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate text-sm font-bold text-emerald-700 hover:underline inline-flex items-center gap-1"
                        >
                          {item.title || item.domain}
                          <FiExternalLink className="size-3 shrink-0" />
                        </a>
                      </div>
                      <p className="mt-1 truncate text-xs text-gray-400">{item.url}</p>
                      {item.snippet && (
                        <p className="mt-2 text-xs text-gray-600 leading-relaxed font-medium">
                          {item.snippet}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-xs text-gray-500 py-8 font-medium">
              No SERP items found for &quot;{query}&quot;. Try searching another keyword.
            </p>
          )}
        </div>
      )}

      {/* Tab 3: Domain Backlinks Summary */}
      {activeTab === "backlinks" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Total Backlinks</p>
              <p className="mt-2 text-2xl font-bold text-gray-900 tabular-nums">
                {formatNum(data?.backlinks)}
              </p>
              <p className="mt-1 text-[11px] text-gray-500">Inbound links count</p>
            </div>

            <div className="rounded-2xl border border-sky-100 bg-sky-50/40 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-sky-800">Referring Domains</p>
              <p className="mt-2 text-2xl font-bold text-gray-900 tabular-nums">
                {formatNum(data?.referringDomains)}
              </p>
              <p className="mt-1 text-[11px] text-gray-500">Unique linking domains</p>
            </div>

            <div className="rounded-2xl border border-purple-100 bg-purple-50/40 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-purple-800">Domain Rank</p>
              <p className="mt-2 text-2xl font-bold text-gray-900 tabular-nums">
                {data?.domainRank != null ? `${data.domainRank}/100` : "—"}
              </p>
              <p className="mt-1 text-[11px] text-gray-500">DataForSEO Domain Rating</p>
            </div>

            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-800">Dofollow Links</p>
              <p className="mt-2 text-2xl font-bold text-gray-900 tabular-nums">
                {formatNum(data?.dofollow)}
              </p>
              <p className="mt-1 text-[11px] text-gray-500">Passed SEO authority links</p>
            </div>
          </div>

          {data?.backlinks > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600">Link Quality &amp; Dofollow Ratio</h3>
              <div className="h-4 w-full rounded-full bg-gray-100 overflow-hidden flex">
                <div
                  className="bg-emerald-500 h-full"
                  style={{
                    width: `${Math.round(((data?.dofollow || 0) / (data?.backlinks || 1)) * 100)}%`,
                  }}
                  title={`Dofollow: ${formatNum(data?.dofollow)}`}
                />
                <div
                  className="bg-amber-400 h-full"
                  style={{
                    width: `${Math.round(((data?.nofollow || 0) / (data?.backlinks || 1)) * 100)}%`,
                  }}
                  title={`Nofollow: ${formatNum(data?.nofollow)}`}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500 font-semibold pt-1">
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-emerald-500 inline-block"/> Dofollow ({formatNum(data?.dofollow)})</span>
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-amber-400 inline-block"/> Nofollow ({formatNum(data?.nofollow)})</span>
              </div>
            </div>
          )}
        </div>
      )}
    </SeoPanelShell>
  );
}
