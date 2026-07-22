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

export default function KeywordResearchSection({ selectedSite = "" }) {
  const [tab, setTab] = useState("ranked");
  const [range, setRange] = useState("28d");
  const [geo, setGeo] = useState("us");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(
    async (force = false) => {
      if (!selectedSite) {
        setLoading(false);
        setData(null);
        return;
      }
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
    load(false);
  }, [load]);

  const filteredRows = useMemo(() => {
    const rows = data?.rows || [];
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
    const ideas = data?.ideas || [];
    const q = filter.trim().toLowerCase();
    if (!q) return ideas;
    return ideas.filter((i) => String(i.keyword).toLowerCase().includes(q));
  }, [data?.ideas, filter]);

  const geoLabel = GEO_OPTIONS.find((g) => g.id === geo)?.label || geo;

  return (
    <SeoPanelShell
      title="Keyword Research"
      description="Your Search Console queries enriched with Google Ads Keyword Planner volume, competition, and trends — prioritized by what is worth optimizing."
      selectedSite={selectedSite}
      range={range}
      onRangeChange={setRange}
      loading={loading}
      error={error}
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
            onClick={() => load(true)}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <FiRefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
            Refresh Planner
          </button>
          <ReportSectionActions section="keyword-research" siteUrl={selectedSite} />
        </div>
      }
    >
      {!loading && !error && data && !data.configured ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 mb-6">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <FiInfo className="shrink-0" aria-hidden />
            Google Ads Keyword Planner not connected
          </p>
          <ol className="mt-3 space-y-2 text-sm text-amber-900 list-decimal pl-5">
            <li>
              Get a developer token from{" "}
              <a
                href="https://ads.google.com/aw/apicenter"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#1d9c35] hover:underline inline-flex items-center gap-0.5"
              >
                Google Ads API Center <FiExternalLink className="h-3 w-3" aria-hidden />
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

      {!loading && !error && data ? (
        <>
          <div className="flex gap-2 mb-4 border-b border-gray-100 pb-1">
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
            <button
              type="button"
              onClick={() => setTab("discover")}
              disabled={!data.configured}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors disabled:opacity-40 ${
                tab === "discover"
                  ? "border-[#1d9c35] text-[#1d9c35]"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              <FiCompass className="h-4 w-4" aria-hidden />
              Discover topics
            </button>
          </div>

          {data.planner?.error ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Keyword Planner warning: {data.planner.error}
            </div>
          ) : null}

          <p className="mb-4 text-xs text-gray-500">
            Market: <span className="font-semibold text-gray-700">{geoLabel}</span>
            {data.planner?.fetchedAt
              ? ` · Planner data ${data.planner.fromCache ? "cached" : "refreshed"} ${new Date(data.planner.fetchedAt).toLocaleDateString()}`
              : !data.configured
                ? " · Search Console only until Planner is connected"
                : ""}
            {data.configured ? (
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
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Priority</th>
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
                    {filteredRows.map((row) => (
                      <tr key={row.query} className="border-b border-gray-50 last:border-0 align-top hover:bg-gray-50/50">
                        <td className="px-3 py-2.5 tabular-nums font-bold text-[#1d9c35]">{row.priority}</td>
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
          ) : !data.configured ? (
            <p className="text-sm text-gray-500 py-8 text-center">
              Connect Google Ads Keyword Planner to discover new topic ideas from your site URL.
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
