"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiRefreshCw,
  FiSearch,
  FiTrendingUp,
  FiTarget,
  FiCompass,
  FiInfo,
  FiExternalLink,
  FiZap,
} from "react-icons/fi";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import SeoPanelShell, { formatNum, formatPct, formatPos } from "./SeoPanelShell";
import ReportSectionActions from "../ReportSectionActions";
import { TAG_META } from "../../../lib/keywordResearchHelpers";

const GEO_OPTIONS = [
  { id: "us", label: "United States" },
  { id: "uk", label: "United Kingdom" },
  { id: "pk", label: "Pakistan" },
  { id: "ca", label: "Canada" },
  { id: "au", label: "Australia" },
];

/** Highest priority/score first */
function sortByPriorityDesc(items, { scoreKey = "priority", tieKey = "relevance", labelKey = "keyword" } = {}) {
  return [...items].sort((a, b) => {
    const scoreA = Number(a[scoreKey]) || 0;
    const scoreB = Number(b[scoreKey]) || 0;
    if (scoreB !== scoreA) return scoreB - scoreA;
    const tieA = Number(a[tieKey]) || Number(a.impressions) || 0;
    const tieB = Number(b[tieKey]) || Number(b.impressions) || 0;
    if (tieB !== tieA) return tieB - tieA;
    const labelA = String(a[labelKey] || a.query || "");
    const labelB = String(b[labelKey] || b.query || "");
    return labelA.localeCompare(labelB);
  });
}

function TrendSparkline({ trend }) {
  const data = (trend || [])
    .filter((t) => t.searches != null)
    .slice(-12)
    .map((t) => ({
      label: `${t.month?.slice?.(0, 3) || t.month || ""} ${String(t.year || "").slice(-2)}`,
      searches: t.searches,
    }));
  if (data.length < 2) return <span className="text-gray-400 text-xs">—</span>;

  return (
    <div className="h-8 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="kwTrendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1d9c35" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#1d9c35" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="searches" stroke="#1d9c35" strokeWidth={1.5} fill="url(#kwTrendGrad)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function TagChips({ tags }) {
  if (!tags?.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {tags.map((t) => {
        const meta = TAG_META[t] || { label: t, chip: "bg-gray-100 text-gray-600" };
        return (
          <span key={t} className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${meta.chip}`}>
            {meta.label}
          </span>
        );
      })}
    </div>
  );
}

function SourceBadges({ sources }) {
  if (!sources?.length) return <span className="text-gray-400">—</span>;
  const colors = { google: "bg-blue-50 text-blue-700", bing: "bg-teal-50 text-teal-700", youtube: "bg-red-50 text-red-700" };
  return (
    <div className="flex flex-wrap gap-1">
      {sources.map((s) => (
        <span key={s} className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${colors[s] || "bg-gray-100 text-gray-600"}`}>
          {s}
        </span>
      ))}
    </div>
  );
}

function SuggestSummaryCards({ summary }) {
  if (!summary) return null;
  const cards = [
    { label: "Suggestions", value: summary.total, sub: "From autocomplete APIs" },
    { label: "New topics", value: summary.newTopics, sub: "Not in Search Console", tone: "text-emerald-700" },
    { label: "Multi-engine", value: summary.multiSource, sub: "Google + Bing + YouTube", tone: "text-violet-700" },
    { label: "Commercial intent", value: summary.commercial, sub: "Buy / cost / best signals", tone: "text-amber-700" },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-gray-100 bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{c.label}</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${c.tone || "text-gray-900"}`}>{formatNum(c.value)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

function SummaryCards({ summary, planner }) {
  if (!summary) return null;
  const cards = [
    { label: "Queries analyzed", value: summary.total, sub: planner?.configured ? `${summary.withPlannerData} with volume data` : "GSC only" },
    { label: "Worth fighting for", value: summary.worthFighting, sub: "Pos 8–15 · volume 100+", tone: "text-emerald-700" },
    { label: "Hidden gems", value: summary.hiddenGems, sub: "High volume · not top 15", tone: "text-sky-700" },
    { label: "Fix CTR", value: summary.ctrFixes, sub: "Good rank · low clicks", tone: "text-amber-700" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-gray-100 bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{c.label}</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${c.tone || "text-gray-900"}`}>{formatNum(c.value)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

export default function KeywordResearchSection({ selectedSite = "", embedded = false, excludeTabs = [] }) {
  const hiddenTabs = useMemo(() => new Set(excludeTabs), [excludeTabs]);
  const visibleTabs = useMemo(
    () => ["ranked", "discover", "suggest"].filter((t) => !hiddenTabs.has(t)),
    [hiddenTabs]
  );
  const defaultTab = visibleTabs.includes("ranked") ? "ranked" : visibleTabs[0] || "discover";
  const [tab, setTab] = useState(defaultTab);
  const [range, setRange] = useState("28d");
  const [geo, setGeo] = useState("us");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("");
  const [seedInput, setSeedInput] = useState("");

  useEffect(() => {
    if (!visibleTabs.includes(tab)) setTab(defaultTab);
  }, [tab, visibleTabs, defaultTab]);

  const load = useCallback(
    async (force = false, seedOverride) => {
      if (!selectedSite) {
        setLoading(false);
        setData(null);
        return;
      }
      const seed = String(seedOverride ?? "").trim();
      if (tab === "suggest" && !seed) return;

      if (force) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const q = new URLSearchParams({
          url: selectedSite,
          view: tab,
          range,
          geo,
        });
        if (tab === "suggest") q.set("seed", seed);
        if (force) q.set("refresh", "1");
        const res = await fetch(`/api/keywords/research?${q.toString()}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Failed to load keyword research");
        setData(body);
      } catch (e) {
        setError(e.message || "Failed to load keyword research");
        setData(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedSite, tab, range, geo]
  );

  useEffect(() => {
    if (tab === "suggest") {
      setLoading(false);
      return;
    }
    load(false);
  }, [load, tab]);

  const filteredRows = useMemo(() => {
    const rows = sortByPriorityDesc(data?.rows || [], { labelKey: "query" });
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        String(r.query).toLowerCase().includes(q) ||
        String(r.page || "").toLowerCase().includes(q) ||
        r.tags?.some((t) => t.includes(q))
    );
  }, [data?.rows, filter]);

  const filteredIdeas = useMemo(() => {
    const ideas = sortByPriorityDesc(data?.ideas || [], {
      scoreKey: "priority",
      tieKey: "avgMonthlySearches",
    });
    const q = filter.trim().toLowerCase();
    if (!q) return ideas;
    return ideas.filter((i) => String(i.keyword).toLowerCase().includes(q));
  }, [data?.ideas, filter]);

  const filteredSuggestions = useMemo(() => {
    const keywords = sortByPriorityDesc(data?.keywords || []);
    const q = filter.trim().toLowerCase();
    if (!q) return keywords;
    return keywords.filter(
      (k) =>
        String(k.keyword).toLowerCase().includes(q) ||
        k.tags?.some((t) => t.includes(q)) ||
        k.sources?.some((s) => s.includes(q))
    );
  }, [data?.keywords, filter]);

  const isAutocompleteDiscover = tab === "discover" && data?.planner?.method === "autocomplete";
  const refreshLabel = tab === "suggest" || isAutocompleteDiscover ? "Refresh suggestions" : "Refresh Planner";

  const geoLabel = GEO_OPTIONS.find((g) => g.id === geo)?.label || geo;

  return (
    <SeoPanelShell
      title="Keyword Research"
      description="Search Console rankings, free autocomplete suggestions (Google, Bing, YouTube), and optional Google Ads volume data — prioritized by opportunity."
      selectedSite={selectedSite}
      range={range}
      onRangeChange={setRange}
      loading={loading}
      error={error}
      embedded={embedded}
      eyebrow={embedded ? "" : undefined}
      action={
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={geo}
            onChange={(e) => setGeo(e.target.value)}
            className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-semibold text-gray-700 focus:border-[#1d9c35] focus:outline-none"
            aria-label="Market country"
          >
            {GEO_OPTIONS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => load(true, tab === "suggest" ? seedInput : undefined)}
            disabled={refreshing || loading || (tab === "suggest" && !seedInput.trim())}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <FiRefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
            {refreshLabel}
          </button>
          <ReportSectionActions section="keyword-research" siteUrl={selectedSite} />
        </div>
      }
    >
      {!loading && !error && data && !data.configured && tab !== "suggest" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 mb-6">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <FiInfo className="shrink-0" aria-hidden />
            Google Ads Keyword Planner not connected
          </p>
          <p className="mt-2 text-sm text-amber-900">
            Search Console rankings and the <strong>Suggest keywords</strong> tab still work — they pull free autocomplete
            data from Google, Bing, and YouTube with no API keys.
          </p>
          <ol className="mt-3 space-y-2 text-sm text-amber-900 list-decimal pl-5">
            <li>
              Get a developer token from{" "}
              <a
                href="#help-google-ads-api"
                onClick={(e) => {
                  e.preventDefault();
                  window.dispatchEvent(new CustomEvent("navigate-section", {
                    detail: { section: "help", article: "google-ads-api" }
                  }));
                }}
                className="text-[#1d9c35] hover:underline inline-flex items-center gap-0.5"
              >
                our developer guide
              </a>
            </li>
            <li>
              Add env vars: <code className="bg-white px-1 rounded text-xs">GOOGLE_ADS_DEVELOPER_TOKEN</code>,{" "}
              <code className="bg-white px-1 rounded text-xs">GOOGLE_ADS_CUSTOMER_ID</code>, optional{" "}
              <code className="bg-white px-1 rounded text-xs">GOOGLE_ADS_LOGIN_CUSTOMER_ID</code>
            </li>
            <li>Add your Search Console service account email as an Admin user on the Google Ads MCC</li>
            <li>Restart the app — GSC query data still works; Planner adds volume and trends</li>
          </ol>
        </div>
      ) : null}

      {!loading && !error && (data || tab === "suggest") ? (
        <>
          <div className="flex gap-2 mb-4 border-b border-gray-100 pb-1">
            {visibleTabs.includes("ranked") ? (
            <button
              type="button"
              onClick={() => setTab("ranked")}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
                tab === "ranked"
                  ? "border-[#1d9c35] text-[#1d9c35]"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              <FiTarget className="h-4 w-4" aria-hidden />
              Your rankings + market
            </button>
            ) : null}
            {visibleTabs.includes("discover") ? (
            <button
              type="button"
              onClick={() => setTab("discover")}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
                tab === "discover"
                  ? "border-[#1d9c35] text-[#1d9c35]"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              <FiCompass className="h-4 w-4" aria-hidden />
              Discover topics
            </button>
            ) : null}
            {visibleTabs.includes("suggest") ? (
            <button
              type="button"
              onClick={() => setTab("suggest")}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
                tab === "suggest"
                  ? "border-[#1d9c35] text-[#1d9c35]"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              <FiZap className="h-4 w-4" aria-hidden />
              Suggest keywords
            </button>
            ) : null}
          </div>

          {tab === "suggest" ? (
            <div className="mb-4 flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && seedInput.trim()) load(true, seedInput);
                }}
                placeholder="Topic seed — e.g. dental implants, local seo (required)"
                className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-[#1d9c35] focus:bg-white focus:outline-none"
              />
              <button
                type="button"
                onClick={() => load(true, seedInput)}
                disabled={refreshing || loading || !seedInput.trim()}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#1d9c35] px-4 py-2 text-sm font-semibold text-white hover:bg-[#178a2c] disabled:opacity-50"
              >
                <FiSearch className="h-4 w-4" aria-hidden />
                Find keywords
              </button>
            </div>
          ) : null}

          {data?.planner?.error ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Keyword Planner warning: {data.planner.error}
            </div>
          ) : null}

          <p className="mb-4 text-xs text-gray-500">
            Market: <span className="font-semibold text-gray-700">{geoLabel}</span>
            {tab === "suggest" || isAutocompleteDiscover
              ? " · Free autocomplete (Google, Bing, YouTube) — no volume data"
              : data?.planner?.fetchedAt
                ? ` · Planner data ${data.planner.fromCache ? "cached" : "refreshed"} ${new Date(data.planner.fetchedAt).toLocaleDateString()}`
                : !data?.configured
                  ? " · Search Console only until Planner is connected"
                  : ""}
            {data?.configured && tab === "ranked" ? (
              <span className="text-gray-400"> · Volume is a Google Ads estimate, not exact search count</span>
            ) : null}
          </p>

          <div className="relative mb-4 max-w-md">
            <FiSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter keywords…"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm focus:border-[#1d9c35] focus:bg-white focus:outline-none"
            />
          </div>

          {tab === "ranked" ? (
            <>
              <SummaryCards summary={data.summary} planner={data.planner} />
              <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
                <table className="w-full text-left text-xs min-w-[960px]">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Rank</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Score</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Query</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Volume/mo</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Trend</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Competition</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Bid range</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Pos</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Clicks</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Impr</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row, index) => (
                      <tr key={row.query} className="border-b border-gray-50 last:border-0 align-top hover:bg-gray-50/50">
                        <td className="px-3 py-2.5 tabular-nums font-bold text-gray-900">{index + 1}</td>
                        <td className="px-3 py-2.5 tabular-nums font-semibold text-[#1d9c35]">{row.priority}</td>
                        <td className="px-3 py-2.5 max-w-[220px]">
                          <span className="font-semibold text-gray-900 block">{row.query}</span>
                          <TagChips tags={row.tags} />
                          {row.page ? (
                            <a
                              href={row.page}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-gray-400 hover:text-[#1d9c35] truncate block mt-1 max-w-[200px]"
                              title={row.page}
                            >
                              {row.page.replace(/^https?:\/\/[^/]+/, "")}
                            </a>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-gray-800">
                          {row.avgMonthlySearches != null ? formatNum(row.avgMonthlySearches) : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <TrendSparkline trend={row.monthlyTrend} />
                        </td>
                        <td className="px-3 py-2.5">
                          {row.competition ? (
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                row.competition === "LOW"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : row.competition === "HIGH"
                                    ? "bg-red-50 text-red-700"
                                    : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              {row.competition}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                          {row.lowTopOfPageBid && row.highTopOfPageBid
                            ? `${row.lowTopOfPageBid} – ${row.highTopOfPageBid}`
                            : "—"}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">{formatPos(row.position)}</td>
                        <td className="px-3 py-2.5 tabular-nums">{formatNum(row.clicks)}</td>
                        <td className="px-3 py-2.5 tabular-nums">{formatNum(row.impressions)}</td>
                        <td className="px-3 py-2.5 tabular-nums">{formatPct(row.ctr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filteredRows.length ? (
                  <p className="px-4 py-8 text-center text-sm text-gray-400">No keywords match this filter.</p>
                ) : null}
              </div>
            </>
          ) : tab === "suggest" ? (
            !seedInput.trim() && !loading ? (
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-6 py-10 text-center">
                <p className="text-sm font-semibold text-gray-700">Enter a topic seed to get started</p>
                <p className="mt-2 text-xs text-gray-500 max-w-md mx-auto">
                  Use a service, product, or niche phrase — not your brand name. Example:{" "}
                  <span className="font-medium text-gray-700">&quot;teeth whitening&quot;</span> or{" "}
                  <span className="font-medium text-gray-700">&quot;roof repair&quot;</span>.
                </p>
              </div>
            ) : (
            <>
              <div className="mb-4 rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3 text-sm text-violet-900">
                <p className="font-semibold flex items-center gap-1.5">
                  <FiZap className="h-4 w-4" aria-hidden />
                  Free autocomplete discovery
                </p>
                <p className="mt-1 text-xs text-violet-800">
                  Enter a topic seed above (e.g. your service or niche). Results are filtered to phrases that share
                  words with your seed — pulled from Google, Bing, and YouTube autocomplete for your selected market.
                </p>
                {data?.seedKeywords?.length ? (
                  <p className="mt-2 text-[11px] text-violet-700">Seeds: {data.seedKeywords.join(" · ")}</p>
                ) : null}
              </div>
              <SuggestSummaryCards summary={data?.summary} />
              <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
                <table className="w-full text-left text-xs min-w-[720px]">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Rank</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Score</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Keyword</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Sources</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">GSC status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSuggestions.map((kw, index) => (
                      <tr key={kw.keyword} className="border-b border-gray-50 last:border-0 align-top hover:bg-gray-50/50">
                        <td className="px-3 py-2.5 tabular-nums font-bold text-gray-900">{index + 1}</td>
                        <td className="px-3 py-2.5 tabular-nums font-semibold text-[#1d9c35]">{kw.priority}</td>
                        <td className="px-3 py-2.5 max-w-[280px]">
                          <span className="font-semibold text-gray-900 block">{kw.keyword}</span>
                          <TagChips tags={kw.tags} />
                        </td>
                        <td className="px-3 py-2.5">
                          <SourceBadges sources={kw.sources} />
                        </td>
                        <td className="px-3 py-2.5">
                          {kw.isNewTopic ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                              New topic
                            </span>
                          ) : (
                            <span className="text-gray-500">Pos {formatPos(kw.existingPosition)}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filteredSuggestions.length ? (
                  <p className="px-4 py-8 text-center text-sm text-gray-400">
                    No on-topic suggestions found — try a broader or different seed phrase.
                  </p>
                ) : null}
              </div>
            </>
            )
          ) : isAutocompleteDiscover ? (
            <>
              <div className="mb-4 rounded-xl border border-sky-100 bg-sky-50/60 px-4 py-3 text-sm text-sky-900">
                <p className="font-semibold flex items-center gap-1.5">
                  <FiTrendingUp className="h-4 w-4" aria-hidden />
                  {data.summary?.newTopics ?? 0} topic ideas via autocomplete
                </p>
                <p className="mt-1 text-xs text-sky-800">
                  Keyword Planner unavailable — using free Google, Bing, and YouTube autocomplete instead. Topics you
                  already rank top 20 for are filtered out.
                </p>
                {data.seedKeywords?.length ? (
                  <p className="mt-2 text-[11px] text-sky-700">Seeds: {data.seedKeywords.join(" · ")}</p>
                ) : null}
              </div>
              <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
                <table className="w-full text-left text-xs min-w-[720px]">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Rank</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Score</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Keyword idea</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Sources</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIdeas.map((idea, index) => (
                      <tr key={idea.keyword} className="border-b border-gray-50 last:border-0 align-top hover:bg-gray-50/50">
                        <td className="px-3 py-2.5 tabular-nums font-bold text-gray-900">{index + 1}</td>
                        <td className="px-3 py-2.5 tabular-nums font-semibold text-[#1d9c35]">{idea.priority ?? "—"}</td>
                        <td className="px-3 py-2.5 max-w-[280px]">
                          <span className="font-semibold text-gray-900 block">{idea.keyword}</span>
                          <TagChips tags={idea.tags} />
                        </td>
                        <td className="px-3 py-2.5">
                          <SourceBadges sources={idea.sources} />
                        </td>
                        <td className="px-3 py-2.5">
                          {idea.isNewTopic ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                              New topic
                            </span>
                          ) : (
                            <span className="text-gray-500">Pos {formatPos(idea.existingPosition)}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filteredIdeas.length ? (
                  <p className="px-4 py-8 text-center text-sm text-gray-400">No discovery ideas yet — try Refresh suggestions.</p>
                ) : null}
              </div>
            </>
          ) : !data?.configured ? (
            <p className="text-sm text-gray-500 py-8 text-center">
              No topic ideas found. Try the <strong>Suggest keywords</strong> tab for free autocomplete discovery.
            </p>
          ) : (
            <>
              <div className="mb-4 rounded-xl border border-sky-100 bg-sky-50/60 px-4 py-3 text-sm text-sky-900">
                <p className="font-semibold flex items-center gap-1.5">
                  <FiTrendingUp className="h-4 w-4" aria-hidden />
                  {data.summary?.newTopics ?? 0} new topic ideas
                </p>
                <p className="mt-1 text-xs text-sky-800">
                  From Google Keyword Planner using your homepage + top GSC queries as seeds. Topics you already rank
                  top 20 for are filtered out.
                </p>
                {data.seedKeywords?.length ? (
                  <p className="mt-2 text-[11px] text-sky-700">
                    Seeds: {data.seedKeywords.join(" · ")}
                  </p>
                ) : null}
              </div>
              <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
                <table className="w-full text-left text-xs min-w-[720px]">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Keyword idea</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Volume/mo</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Trend</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Competition</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Bid range</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIdeas.map((idea) => (
                      <tr key={idea.keyword} className="border-b border-gray-50 last:border-0 align-top hover:bg-gray-50/50">
                        <td className="px-3 py-2.5 font-semibold text-gray-900">{idea.keyword}</td>
                        <td className="px-3 py-2.5 tabular-nums">
                          {idea.avgMonthlySearches != null ? formatNum(idea.avgMonthlySearches) : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <TrendSparkline trend={idea.monthlyTrend} />
                        </td>
                        <td className="px-3 py-2.5">{idea.competition || "—"}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {idea.lowTopOfPageBid && idea.highTopOfPageBid
                            ? `${idea.lowTopOfPageBid} – ${idea.highTopOfPageBid}`
                            : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          {idea.isNewTopic ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                              New topic
                            </span>
                          ) : (
                            <span className="text-gray-500">Pos {formatPos(idea.existingPosition)}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filteredIdeas.length ? (
                  <p className="px-4 py-8 text-center text-sm text-gray-400">No discovery ideas yet — try Refresh Planner.</p>
                ) : null}
              </div>
            </>
          )}
        </>
      ) : null}
    </SeoPanelShell>
  );
}
