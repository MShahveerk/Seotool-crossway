"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiSearch,
  FiZap,
  FiTrendingUp,
  FiTrendingDown,
  FiMinus,
  FiCpu,
  FiTarget,
  FiBarChart2,
  FiDollarSign,
  FiRefreshCw,
  FiInfo,
  FiChevronDown,
} from "react-icons/fi";
import { Sparkles } from "lucide-react";
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

const FILTER_TABS = [
  { id: "all", label: "All keywords" },
  { id: "question", label: "Questions" },
  { id: "commercial", label: "Commercial" },
  { id: "long_tail", label: "Long-tail" },
  { id: "easy", label: "Easy wins" },
];

const PROVIDER_LABELS = { openrouter: "OpenRouter", openai: "OpenAI", anthropic: "Claude" };

const INTENT_STYLES = {
  informational: "bg-sky-100 text-sky-800",
  commercial: "bg-amber-100 text-amber-800",
  transactional: "bg-emerald-100 text-emerald-800",
  navigational: "bg-violet-100 text-violet-800",
};

const COMP_STYLES = {
  LOW: "bg-emerald-100 text-emerald-800",
  MEDIUM: "bg-amber-100 text-amber-800",
  HIGH: "bg-red-100 text-red-800",
};

function sortByPriority(rows) {
  return [...rows].sort((a, b) => (b.priority || 0) - (a.priority || 0) || (b.impressions || 0) - (a.impressions || 0));
}

function TrendSparkline({ trend, large = false, id = "aiKwTrend" }) {
  const data = (trend || [])
    .filter((t) => t.searches != null)
    .slice(-12)
    .map((t) => ({
      label: `${t.month?.slice?.(0, 3) || t.month || ""} ${String(t.year || "").slice(-2)}`,
      searches: t.searches,
    }));
  if (data.length < 2) return <span className="text-gray-400 text-xs">No trend data</span>;
  const h = large ? "h-28" : "h-8";
  const w = large ? "w-full" : "w-24";
  return (
    <div className={`${h} ${w}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          {large && (
            <>
              <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v) => [formatNum(v), "Searches"]} />
            </>
          )}
          <Area type="monotone" dataKey="searches" stroke="#6366f1" strokeWidth={2} fill={`url(#${id})`} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function TrendIcon({ direction }) {
  if (direction === "rising") return <FiTrendingUp className="text-emerald-600" size={14} />;
  if (direction === "declining") return <FiTrendingDown className="text-red-500" size={14} />;
  return <FiMinus className="text-gray-400" size={14} />;
}

function DifficultyBar({ value }) {
  const v = Math.min(100, Math.max(0, Number(value) || 0));
  const color = v <= 30 ? "bg-emerald-500" : v <= 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${v}%` }} />
      </div>
      <span className="text-xs font-semibold tabular-nums text-gray-700 w-7">{v}</span>
    </div>
  );
}

function MetricTile({ label, value, sub, icon: Icon, accent = "text-gray-900" }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-2">
        {Icon ? <Icon className="text-indigo-500" size={14} /> : null}
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
      </div>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${accent}`}>{value}</p>
      {sub ? <p className="mt-1 text-[11px] text-gray-400">{sub}</p> : null}
    </div>
  );
}

function SourceBadge({ source }) {
  if (source === "google_ads") {
    return <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700">Google Ads</span>;
  }
  if (source === "se_ranking") {
    return <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-sky-50 text-sky-700">SE Ranking</span>;
  }
  if (source === "ai_estimate") {
    return <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-violet-50 text-violet-700">AI est.</span>;
  }
  return <span className="text-gray-400 text-xs">—</span>;
}

function metricsSourceLabel(source) {
  if (source === "google_ads") return "Google Ads";
  if (source === "se_ranking") return "SE Ranking";
  if (source === "ai_estimate") return "AI estimate";
  return "No data";
}

function SeedMetricsPanel({ seed, geoLabel, planner, seranking, metrics }) {
  const hasMetrics =
    seed.avgMonthlySearches != null ||
    seed.monthlyTrend?.length > 1 ||
    (seed.lowTopOfPageBid && seed.highTopOfPageBid) ||
    seed.estimatedMonthlyClicks != null;

  const source = seed.metricsSource || metrics?.seedSource || "unknown";

  return (
    <div className="p-5 grid sm:grid-cols-2 lg:grid-cols-5 gap-4 border-t border-gray-100 bg-gray-50/40">
      <div>
        <p className="text-[11px] font-bold uppercase text-gray-500">Volume / mo</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">
          {seed.avgMonthlySearches != null ? formatNum(seed.avgMonthlySearches) : "—"}
        </p>
        <p className="mt-0.5 text-[10px] text-gray-400">
          {metricsSourceLabel(source)} · {geoLabel || "market"}
        </p>
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase text-gray-500">Difficulty</p>
        <DifficultyBar value={seed.keywordDifficulty} />
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase text-gray-500">CPC</p>
        <p className="mt-1 font-semibold">
          {seed.lowTopOfPageBid && seed.highTopOfPageBid
            ? `${seed.lowTopOfPageBid} – ${seed.highTopOfPageBid}`
            : "—"}
        </p>
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase text-gray-500">Est. clicks/mo</p>
        <p className="mt-1 text-xl font-bold tabular-nums text-emerald-700">
          {seed.estimatedMonthlyClicks != null ? formatNum(seed.estimatedMonthlyClicks) : "—"}
        </p>
        <p className="mt-0.5 text-[10px] text-gray-400">At realistic target rank</p>
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase text-gray-500">Trend</p>
        <TrendSparkline trend={seed.monthlyTrend} large id="seedTrend" />
      </div>
      {!hasMetrics && planner?.error ? (
        <p className="sm:col-span-5 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          Google Ads fetch failed: {planner.error}. AI estimates and SE Ranking fallback were attempted.
        </p>
      ) : null}
      {!hasMetrics && !planner?.error && !planner?.configured && !seranking?.configured ? (
        <p className="sm:col-span-5 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Connect Google Ads or SE Ranking for live volume/CPC, or ensure an AI provider is configured for estimates.
        </p>
      ) : null}
      {source === "ai_estimate" && hasMetrics ? (
        <p className="sm:col-span-5 text-xs text-violet-800 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
          Metrics are AI estimates — connect Google Ads for official Keyword Planner data.
          {seranking?.configured ? " SE Ranking was also checked as fallback." : ""}
        </p>
      ) : null}
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

function AiSiteBriefPanel({ brief, loading, error, onGenerate, hasData }) {
  if (!brief && !loading && !error) {
    return (
      <div className="mb-6 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-indigo-900">
              <Sparkles size={16} /> AI keyword strategy
            </p>
            <p className="mt-1 text-xs text-indigo-800/80 max-w-xl">
              AI reads your Search Console keywords and Planner volume — priorities, clusters, gaps, and quick wins.
            </p>
          </div>
          <button
            type="button"
            onClick={onGenerate}
            disabled={loading || !hasData}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? <FiRefreshCw className="animate-spin" size={14} /> : <Sparkles size={14} />}
            Generate AI insights
          </button>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        AI brief failed: {error}
        <button type="button" onClick={onGenerate} className="ml-3 underline font-semibold">Retry</button>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="mb-6 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-6 flex items-center gap-3 text-sm text-indigo-800">
        <FiRefreshCw className="animate-spin shrink-0" size={18} />
        AI is analyzing your keyword portfolio…
      </div>
    );
  }
  if (!brief) return null;
  const impactStyle = { high: "bg-red-100 text-red-800", medium: "bg-amber-100 text-amber-800", low: "bg-gray-100 text-gray-600" };
  return (
    <div className="mb-6 rounded-2xl border border-indigo-100 bg-white overflow-hidden shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-50 bg-indigo-50/50 px-5 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-indigo-900"><Sparkles size={16} /> AI keyword strategy</p>
        <button type="button" onClick={onGenerate} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">Refresh insights</button>
      </div>
      <div className="p-5 space-y-5">
        <p className="text-sm text-gray-700 leading-relaxed">{brief.overview}</p>
        {brief.quickWins?.length ? (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Quick wins</p>
            <ul className="grid sm:grid-cols-3 gap-2">
              {brief.quickWins.slice(0, 3).map((w) => (
                <li key={w} className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs text-emerald-900">{w}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {brief.topPriorities?.length ? (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Top priorities</p>
            <ul className="space-y-2">
              {brief.topPriorities.slice(0, 6).map((p) => (
                <li key={`${p.query}-${p.action}`} className="rounded-lg border border-gray-100 px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900">{p.query}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${impactStyle[p.impact] || impactStyle.medium}`}>{p.impact || "medium"} impact</span>
                    {p.effort ? (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-600">{p.effort} effort</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-gray-600"><span className="font-medium text-indigo-700">{p.action}</span>{p.reason ? ` — ${p.reason}` : ""}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="grid md:grid-cols-2 gap-4">
          {brief.contentClusters?.length ? (
            <div className="rounded-xl border border-gray-100 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Content clusters</p>
              <ul className="space-y-2">
                {brief.contentClusters.slice(0, 4).map((c) => (
                  <li key={c.theme} className="text-xs">
                    <p className="font-semibold text-gray-900">{c.theme}</p>
                    <p className="text-gray-500 mt-0.5">{c.recommendation}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {brief.gaps?.length ? (
            <div className="rounded-xl border border-gray-100 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Topic gaps to explore</p>
              <ul className="space-y-2">
                {brief.gaps.slice(0, 4).map((g) => (
                  <li key={g.topic} className="text-xs">
                    <p className="font-semibold text-gray-900">{g.topic}</p>
                    <p className="text-gray-500 mt-0.5">{g.reason}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function AiKeywordResearchSection({ selectedSite = "", initialTab = "yours", embedded = false }) {
  const [tab, setTab] = useState(initialTab === "explore" ? "explore" : "yours");
  const [geo, setGeo] = useState("us");
  const [range, setRange] = useState("28d");
  const [status, setStatus] = useState(null);

  const [rankedData, setRankedData] = useState(null);
  const [rankedLoading, setRankedLoading] = useState(true);
  const [rankedError, setRankedError] = useState("");
  const [aiBrief, setAiBrief] = useState(null);
  const [aiBriefLoading, setAiBriefLoading] = useState(false);
  const [aiBriefError, setAiBriefError] = useState("");
  const [rankedFilter, setRankedFilter] = useState("");

  const [seedInput, setSeedInput] = useState("");
  const [exploreData, setExploreData] = useState(null);
  const [exploreLoading, setExploreLoading] = useState(false);
  const [exploreStage, setExploreStage] = useState("");
  const [exploreError, setExploreError] = useState("");
  const [filter, setFilter] = useState("all");
  const [sortKey, setSortKey] = useState("opportunityScore");
  const [sortDir, setSortDir] = useState("desc");

  const loadStatus = useCallback(async () => {
    try {
      const qs = selectedSite ? `?url=${encodeURIComponent(selectedSite)}` : "";
      const res = await fetch(`/api/keywords/ai-research${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load status");
      setStatus(json);
    } catch {
      setStatus(null);
    }
  }, [selectedSite]);

  const loadRanked = useCallback(async () => {
    if (!selectedSite) {
      setRankedLoading(false);
      setRankedData(null);
      return;
    }
    setRankedLoading(true);
    setRankedError("");
    try {
      const q = new URLSearchParams({ url: selectedSite, view: "ranked", range, geo });
      const res = await fetch(`/api/keywords/research?${q.toString()}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to load keywords");
      setRankedData(body);
    } catch (e) {
      setRankedError(e.message || "Failed to load keywords");
      setRankedData(null);
    } finally {
      setRankedLoading(false);
    }
  }, [selectedSite, range, geo]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (tab === "yours") loadRanked();
  }, [tab, loadRanked]);

  const runAiBrief = useCallback(async () => {
    if (!selectedSite) return;
    setAiBriefLoading(true);
    setAiBriefError("");
    try {
      const qs = `?url=${encodeURIComponent(selectedSite)}`;
      const res = await fetch(`/api/keywords/ai-research${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "site-brief",
          geo,
          range,
          ranked: rankedData?.rows?.length
            ? {
                rows: rankedData.rows.slice(0, 200),
                summary: rankedData.summary,
                geo: rankedData.geo,
                strikingDistance: rankedData.strikingDistance,
              }
            : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "AI brief failed");
      setAiBrief(body.brief);
    } catch (e) {
      setAiBriefError(e.message || "AI brief failed");
      setAiBrief(null);
    } finally {
      setAiBriefLoading(false);
    }
  }, [selectedSite, geo, range, rankedData]);

  const runExplore = useCallback(async () => {
    const seed = seedInput.trim();
    if (!seed) {
      setExploreError("Enter a seed keyword to analyze.");
      return;
    }
    setExploreLoading(true);
    setExploreError("");
    setExploreStage("Fetching live autocomplete suggestions…");
    const stageTimer = setTimeout(() => {
      setExploreStage("Enriching with AI metrics + Google Ads / SE Ranking…");
    }, 2500);
    try {
      const qs = selectedSite ? `?url=${encodeURIComponent(selectedSite)}` : "";
      const res = await fetch(`/api/keywords/ai-research${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed, geo }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Research failed");
      setExploreData(json);
    } catch (e) {
      setExploreError(e.message || "Research failed");
      setExploreData(null);
    } finally {
      clearTimeout(stageTimer);
      setExploreStage("");
      setExploreLoading(false);
    }
  }, [seedInput, geo, selectedSite]);

  const rankedRows = useMemo(() => {
    const rows = sortByPriority(rankedData?.rows || []);
    const q = rankedFilter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        String(r.query).toLowerCase().includes(q) ||
        String(r.page || "").toLowerCase().includes(q) ||
        r.tags?.some((t) => t.includes(q))
    );
  }, [rankedData?.rows, rankedFilter]);

  const exploreRows = useMemo(() => {
    if (!exploreData?.keywords) return [];
    let rows = exploreData.keywords;
    if (filter === "question") rows = rows.filter((r) => r.type === "question");
    else if (filter === "commercial") rows = rows.filter((r) => r.type === "commercial" || r.intent === "commercial" || r.intent === "transactional");
    else if (filter === "long_tail") rows = rows.filter((r) => r.type === "long_tail");
    else if (filter === "easy") rows = rows.filter((r) => r.keywordDifficulty <= 35 && (r.avgMonthlySearches ?? 0) >= 50);
    return [...rows].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [exploreData, filter, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const SortTh = ({ label, field, className = "" }) => (
    <th
      className={`px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 cursor-pointer hover:text-gray-800 select-none ${className}`}
      onClick={() => toggleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === field ? <FiChevronDown size={12} className={sortDir === "asc" ? "rotate-180" : ""} /> : null}
      </span>
    </th>
  );

  const aiLabel = exploreData?.ai?.provider
    ? PROVIDER_LABELS[exploreData.ai.provider] || exploreData.ai.provider
    : status?.ai?.active
      ? PROVIDER_LABELS[status.ai.active] || status.ai.active
      : null;

  const shellLoading = tab === "yours" ? rankedLoading : exploreLoading;
  const shellError = tab === "yours" ? rankedError : exploreError;
  const geoLabel = GEO_OPTIONS.find((g) => g.id === geo)?.label || geo;

  return (
    <SeoPanelShell
      title="AI Keyword Research"
      description="Ahrefs-style AI keyword hub — analyze keywords your site already ranks for, then explore any seed topic with AI + Google Ads metrics."
      selectedSite={selectedSite}
      range={tab === "yours" ? range : undefined}
      onRangeChange={tab === "yours" ? setRange : undefined}
      loading={shellLoading}
      error={shellError}
      embedded={embedded}
      eyebrow={embedded ? "" : undefined}
      action={
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={geo}
            onChange={(e) => setGeo(e.target.value)}
            className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-semibold text-gray-700"
            aria-label="Market country"
          >
            {GEO_OPTIONS.map((g) => (
              <option key={g.id} value={g.id}>{g.label}</option>
            ))}
          </select>
          <ReportSectionActions section="ai-keyword-research" activeSite={selectedSite} />
        </div>
      }
    >
      <div className="flex gap-2 mb-6 border-b border-gray-100 pb-1">
        <button
          type="button"
          onClick={() => setTab("yours")}
          className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
            tab === "yours" ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-800"
          }`}
        >
          <FiTarget size={16} /> Your keywords
        </button>
        <button
          type="button"
          onClick={() => setTab("explore")}
          className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
            tab === "explore" ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-800"
          }`}
        >
          <Sparkles size={16} /> Explore seed
        </button>
      </div>

      {tab === "yours" ? (
        <>
          <AiSiteBriefPanel
            brief={aiBrief}
            loading={aiBriefLoading}
            error={aiBriefError}
            onGenerate={runAiBrief}
            hasData={Boolean(rankedData?.rows?.length)}
          />
          {rankedData?.summary ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <MetricTile label="Queries tracked" value={formatNum(rankedData.summary.total)} sub={rankedData.planner?.configured ? `${rankedData.summary.withPlannerData} with volume` : "GSC data"} icon={FiTarget} />
              <MetricTile label="Worth fighting for" value={formatNum(rankedData.summary.worthFighting)} sub="Pos 8–15 · vol 100+" icon={FiZap} accent="text-emerald-700" />
              <MetricTile label="Hidden gems" value={formatNum(rankedData.summary.hiddenGems)} sub="High volume · not top 15" icon={FiBarChart2} accent="text-sky-700" />
              <MetricTile label="Fix CTR" value={formatNum(rankedData.summary.ctrFixes)} sub="Good rank · low clicks" icon={FiTrendingUp} accent="text-amber-700" />
            </div>
          ) : null}
          <p className="mb-4 text-xs text-gray-500">
            Market: <span className="font-semibold text-gray-700">{geoLabel}</span> · Search Console + Google Ads
          </p>
          <div className="relative mb-4 max-w-md">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              value={rankedFilter}
              onChange={(e) => setRankedFilter(e.target.value)}
              placeholder="Filter your keywords…"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm focus:border-indigo-400 focus:bg-white focus:outline-none"
            />
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
            <table className="w-full text-left text-xs min-w-[960px]">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-3 py-2.5 font-semibold text-gray-600">#</th>
                  <th className="px-3 py-2.5 font-semibold text-gray-600">Score</th>
                  <th className="px-3 py-2.5 font-semibold text-gray-600">Query</th>
                  <th className="px-3 py-2.5 font-semibold text-gray-600">Volume/mo</th>
                  <th className="px-3 py-2.5 font-semibold text-gray-600">Trend</th>
                  <th className="px-3 py-2.5 font-semibold text-gray-600">Competition</th>
                  <th className="px-3 py-2.5 font-semibold text-gray-600">Pos</th>
                  <th className="px-3 py-2.5 font-semibold text-gray-600">Clicks</th>
                  <th className="px-3 py-2.5 font-semibold text-gray-600">Impr</th>
                  <th className="px-3 py-2.5 font-semibold text-gray-600">CTR</th>
                </tr>
              </thead>
              <tbody>
                {rankedRows.map((row, index) => (
                  <tr key={row.query} className="border-b border-gray-50 last:border-0 align-top hover:bg-indigo-50/20">
                    <td className="px-3 py-2.5 tabular-nums font-bold">{index + 1}</td>
                    <td className="px-3 py-2.5 tabular-nums font-semibold text-indigo-600">{row.priority}</td>
                    <td className="px-3 py-2.5 max-w-[220px]">
                      <span className="font-semibold text-gray-900 block">{row.query}</span>
                      <TagChips tags={row.tags} />
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{row.avgMonthlySearches != null ? formatNum(row.avgMonthlySearches) : "—"}</td>
                    <td className="px-3 py-2.5"><TrendSparkline trend={row.monthlyTrend} id="rankedTrend" /></td>
                    <td className="px-3 py-2.5">{row.competition || "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums">{formatPos(row.position)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{formatNum(row.clicks)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{formatNum(row.impressions)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{formatPct(row.ctr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rankedRows.length && !rankedLoading ? (
              <p className="px-4 py-8 text-center text-sm text-gray-400">No keywords found for this site and date range.</p>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div className="mb-6 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 via-white to-violet-50/60 p-5 sm:p-6 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white">
                <Sparkles size={12} /> AI-powered
              </span>
              {aiLabel ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-white border border-gray-200 px-2.5 py-1 text-xs text-gray-600">
                  <FiCpu size={12} /> {aiLabel}
                </span>
              ) : null}
              {status?.planner?.configured ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs text-emerald-700 font-medium">Google Ads + AI metrics</span>
              ) : status?.ai?.configured ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 border border-violet-200 px-2.5 py-1 text-xs text-violet-700 font-medium">AI estimates + autocomplete</span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs text-amber-700">Connect AI + Google Ads</span>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  value={seedInput}
                  onChange={(e) => setSeedInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runExplore()}
                  placeholder="Enter seed keyword — e.g. dental implants, best crm software"
                  className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <button
                type="button"
                onClick={runExplore}
                disabled={exploreLoading || !seedInput.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {exploreLoading ? <FiRefreshCw className="animate-spin" size={16} /> : <FiZap size={16} />}
                Analyze
              </button>
            </div>
            {!status?.ai?.configured ? (
              <p className="mt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg p-3 border border-amber-100">
                <FiInfo className="shrink-0 mt-0.5" size={14} />
                Add OPENROUTER_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY to enable AI.
              </p>
            ) : null}
          </div>

          {exploreError ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{exploreError}</div>
          ) : null}

          {exploreLoading ? (
            <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/50 px-4 py-3 text-sm text-indigo-900 flex items-center gap-2">
              <FiRefreshCw className="animate-spin shrink-0" size={16} />
              {exploreStage || "Researching keywords…"}
            </div>
          ) : null}

          {exploreData?.seed ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <MetricTile label="Keywords found" value={formatNum(exploreData.summary?.total)} sub="Autocomplete + AI curated" icon={FiTarget} />
                <MetricTile label="With volume" value={formatNum(exploreData.summary?.withVolume)} sub={exploreData.planner?.configured ? "Google Ads" : "Connect Planner"} icon={FiBarChart2} accent="text-indigo-700" />
                <MetricTile label="Easy wins" value={formatNum(exploreData.summary?.easyWins)} sub="KD ≤ 35 · vol 50+" icon={FiZap} accent="text-emerald-700" />
                <MetricTile label="Already ranking" value={formatNum(exploreData.summary?.alreadyRanking)} sub="Pos ≤ 20 in GSC" icon={FiTrendingUp} accent="text-sky-700" />
              </div>
              <div className="mb-6 rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                <div className="border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white px-5 py-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Seed keyword</p>
                  <h3 className="mt-1 text-2xl font-bold text-gray-900">{exploreData.seed.keyword}</h3>
                  <p className="mt-2 text-sm text-gray-700">{exploreData.seed.summary}</p>
                  {exploreData.seed.contentAngles?.length ? (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {exploreData.seed.contentAngles.slice(0, 4).map((a) => (
                        <li key={a} className="rounded-lg bg-indigo-50 border border-indigo-100 px-2.5 py-1 text-xs text-indigo-900">{a}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <SeedMetricsPanel
                  seed={exploreData.seed}
                  geoLabel={exploreData.geo?.label}
                  planner={exploreData.planner}
                  seranking={exploreData.seranking}
                  metrics={exploreData.metrics}
                />
              </div>
              {exploreData.clusters?.length ? (
                <div className="mb-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {exploreData.clusters.slice(0, 6).map((c) => (
                    <div key={c.name || c.theme} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{c.contentType || "Cluster"} · {c.priority || "medium"}</p>
                      <p className="mt-1 font-semibold text-gray-900">{c.name || c.theme}</p>
                      <p className="mt-2 text-xs text-gray-600 leading-relaxed">{c.recommendation}</p>
                      {c.keywords?.length ? (
                        <p className="mt-2 text-[11px] text-gray-400 truncate">{c.keywords.slice(0, 4).join(" · ")}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                <div className="flex flex-wrap gap-1 border-b border-gray-100 px-4 py-3 bg-gray-50/80">
                  {FILTER_TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setFilter(t.id)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${filter === t.id ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-white"}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px] text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <SortTh label="#" field="opportunityScore" />
                        <SortTh label="Keyword" field="keyword" />
                        <SortTh label="Volume/mo" field="avgMonthlySearches" />
                        <SortTh label="KD" field="keywordDifficulty" />
                        <SortTh label="Opportunity" field="opportunityScore" />
                        <th className="px-3 py-3 text-left text-[11px] font-bold uppercase text-gray-500">Intent</th>
                        <th className="px-3 py-3 text-left text-[11px] font-bold uppercase text-gray-500 min-w-[200px]">SEO action</th>
                        <th className="px-3 py-3 text-left text-[11px] font-bold uppercase text-gray-500">Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {exploreRows.map((row, i) => (
                        <tr key={row.keyword} className="hover:bg-indigo-50/30 align-top">
                          <td className="px-3 py-3 text-gray-400 text-xs">{i + 1}</td>
                          <td className="px-3 py-3 font-medium text-gray-900 max-w-[200px]">
                            {row.keyword}
                            {row.existingPosition != null ? (
                              <span className="mt-1 block text-[10px] font-semibold text-sky-700">GSC ~#{Math.round(row.existingPosition)}</span>
                            ) : row.isNewTopic ? (
                              <span className="mt-1 block text-[10px] font-semibold text-emerald-700">New topic</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 tabular-nums font-semibold">{row.avgMonthlySearches != null ? formatNum(row.avgMonthlySearches) : "—"}</td>
                          <td className="px-3 py-3"><DifficultyBar value={row.keywordDifficulty} /></td>
                          <td className="px-3 py-3"><span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700">{row.opportunityScore}</span></td>
                          <td className="px-3 py-3"><span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold capitalize ${INTENT_STYLES[row.intent] || "bg-gray-100"}`}>{row.intent}</span></td>
                          <td className="px-3 py-3 text-xs text-gray-600 leading-relaxed max-w-xs">{row.recommendation || row.contentAngle || "—"}</td>
                          <td className="px-3 py-3"><SourceBadge source={row.metricsSource} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : !exploreLoading ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-12 text-center">
              <FiDollarSign size={32} className="mx-auto text-indigo-400 mb-3" />
              <h3 className="text-lg font-semibold text-gray-900">Research any keyword</h3>
              <p className="mt-2 max-w-md mx-auto text-sm text-gray-500">Enter a seed above. Autocomplete finds related terms, AI estimates volume/KD/CPC/trend, and Google Ads or SE Ranking fills in live data when configured.</p>
            </div>
          ) : null}
        </>
      )}
    </SeoPanelShell>
  );
}
