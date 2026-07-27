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
import SeoPanelShell, { formatNum } from "./SeoPanelShell";
import ReportSectionActions from "../ReportSectionActions";

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

const PROVIDER_LABELS = {
  openrouter: "OpenRouter",
  openai: "OpenAI",
  anthropic: "Claude",
};

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

function TrendSparkline({ trend, large = false }) {
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
            <linearGradient id="aiKwTrend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          {large && (
            <>
              <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(v) => [formatNum(v), "Searches"]}
              />
            </>
          )}
          <Area type="monotone" dataKey="searches" stroke="#6366f1" strokeWidth={2} fill="url(#aiKwTrend)" dot={false} />
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
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700">
        Google Ads
      </span>
    );
  }
  if (source === "ai_estimate") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-violet-50 text-violet-700">
        AI est.
      </span>
    );
  }
  return <span className="text-gray-400 text-xs">—</span>;
}

export default function AiKeywordResearchSection({
  selectedSite = "",
  embedded = false,
  geo: geoProp,
  onGeoChange,
}) {
  const [seedInput, setSeedInput] = useState("");
  const [geoInternal, setGeoInternal] = useState("us");
  const geo = embedded && geoProp != null ? geoProp : geoInternal;
  const setGeo = embedded && onGeoChange ? onGeoChange : setGeoInternal;
  const [filter, setFilter] = useState("all");
  const [sortKey, setSortKey] = useState("opportunityScore");
  const [sortDir, setSortDir] = useState("desc");
  const [data, setData] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadStatus = useCallback(async () => {
    try {
      const qs = selectedSite ? `?url=${encodeURIComponent(selectedSite)}` : "";
      const res = await fetch(`/api/keywords/ai-research${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load status");
      setStatus(json);
    } catch (e) {
      setStatus(null);
    }
  }, [selectedSite]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const runResearch = useCallback(async () => {
    const seed = seedInput.trim();
    if (!seed) {
      setError("Enter a seed keyword to analyze.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const qs = selectedSite ? `?url=${encodeURIComponent(selectedSite)}` : "";
      const res = await fetch(`/api/keywords/ai-research${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed, geo, url: selectedSite || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Research failed");
      setData(json);
    } catch (e) {
      setError(e.message || "Research failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [seedInput, geo, selectedSite]);

  const filteredRows = useMemo(() => {
    if (!data?.keywords) return [];
    let rows = data.keywords;
    if (filter === "question") rows = rows.filter((r) => r.type === "question");
    else if (filter === "commercial") {
      rows = rows.filter(
        (r) => r.type === "commercial" || r.intent === "commercial" || r.intent === "transactional"
      );
    } else if (filter === "long_tail") rows = rows.filter((r) => r.type === "long_tail");
    else if (filter === "easy") {
      rows = rows.filter((r) => r.keywordDifficulty <= 35 && (r.avgMonthlySearches ?? 0) >= 50);
    }

    return [...rows].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [data, filter, sortKey, sortDir]);

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

  const aiLabel = data?.ai?.provider
    ? PROVIDER_LABELS[data.ai.provider] || data.ai.provider
    : status?.ai?.active
      ? PROVIDER_LABELS[status.ai.active] || status.ai.active
      : null;

  const panel = (
    <>
      {/* Hero search */}
      <div className="mb-6 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 via-white to-violet-50/60 p-5 sm:p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white">
            <Sparkles size={12} />
            AI-powered
          </span>
          {aiLabel ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-white border border-gray-200 px-2.5 py-1 text-xs text-gray-600">
              <FiCpu size={12} />
              {aiLabel}
              {data?.ai?.model ? ` · ${data.ai.model.split("/").pop()}` : ""}
            </span>
          ) : null}
          {status?.planner?.configured ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs text-emerald-700 font-medium">
              Google Ads metrics live
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs text-amber-700">
              AI estimates only — connect Google Ads for real volume
            </span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={seedInput}
              onChange={(e) => setSeedInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runResearch()}
              placeholder="Enter seed keyword — e.g. dental implants, best crm software"
              className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <select
            value={geo}
            onChange={(e) => setGeo(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm shadow-sm focus:border-indigo-400 focus:outline-none"
          >
            {GEO_OPTIONS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={runResearch}
            disabled={loading || !seedInput.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? <FiRefreshCw className="animate-spin" size={16} /> : <FiZap size={16} />}
            Analyze
          </button>
        </div>

        {!status?.ai?.configured && !loading ? (
          <p className="mt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg p-3 border border-amber-100">
            <FiInfo className="shrink-0 mt-0.5" size={14} />
            Add <code className="font-mono text-[11px]">OPENROUTER_API_KEY</code>,{" "}
            <code className="font-mono text-[11px]">ANTHROPIC_API_KEY</code>, or{" "}
            <code className="font-mono text-[11px]">OPENAI_API_KEY</code> to <code className="font-mono">.env</code>.
            Set <code className="font-mono">AI_KEYWORD_PROVIDER</code> to pick which one to use.
          </p>
        ) : status?.ai?.available?.length ? (
          <p className="mt-3 text-xs text-gray-500">
            Model:{" "}
            <code className="font-mono text-[11px] bg-white/80 px-1 rounded">
              {status.ai.available.find((p) => p.id === status.ai.active)?.model || "—"}
            </code>
            {" · "}
            Uses <code className="font-mono text-[11px]">OPENROUTER_MODEL_KEYWORD</code>, or falls back to{" "}
            <code className="font-mono text-[11px]">OPENROUTER_MODEL_PROMPT</code> / blog / caption vars, then{" "}
            <code className="font-mono text-[11px]">openrouter/free</code>.
          </p>
        ) : null}
      </div>

      {data?.seed ? (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
            <MetricTile label="Keywords found" value={formatNum(data.summary?.total)} sub="AI-generated ideas" icon={FiTarget} />
            <MetricTile
              label="With volume"
              value={formatNum(data.summary?.withVolume)}
              sub={data.planner?.configured ? "Google Ads data" : "AI estimates"}
              icon={FiBarChart2}
              accent="text-indigo-700"
            />
            <MetricTile label="Easy wins" value={formatNum(data.summary?.easyWins)} sub="KD ≤ 35 · vol 50+" icon={FiZap} accent="text-emerald-700" />
            <MetricTile label="Questions" value={formatNum(data.summary?.questions)} sub="People also ask style" icon={FiSearch} accent="text-sky-700" />
            <MetricTile label="Avg. difficulty" value={data.summary?.avgDifficulty ?? "—"} sub="0 = easy · 100 = hard" icon={FiTrendingUp} />
          </div>

          {/* Seed keyword hero card */}
          <div className="mb-6 rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
            <div className="border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Seed keyword</p>
                  <h3 className="mt-1 text-xl sm:text-2xl font-bold text-gray-900">{data.seed.keyword}</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${INTENT_STYLES[data.seed.intent] || "bg-gray-100 text-gray-600"}`}>
                      {data.seed.intent || "unknown"} intent
                    </span>
                    <SourceBadge source={data.seed.metricsSource} />
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <TrendIcon direction={data.seed.trendDirection} />
                      {data.seed.trendDirection} trend
                    </span>
                  </div>
                </div>
                <div className="text-right text-xs text-gray-400">
                  {data.geo?.label} · {new Date(data.generatedAt).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
              <div className="p-5 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase text-gray-500">Volume / mo</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">
                    {data.seed.avgMonthlySearches != null ? formatNum(data.seed.avgMonthlySearches) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase text-gray-500">Keyword difficulty</p>
                  <div className="mt-2">
                    <DifficultyBar value={data.seed.keywordDifficulty} />
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase text-gray-500">CPC range</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">
                    {data.seed.lowTopOfPageBid && data.seed.highTopOfPageBid
                      ? `${data.seed.lowTopOfPageBid} – ${data.seed.highTopOfPageBid}`
                      : data.seed.cpcEstimate != null
                        ? `$${Number(data.seed.cpcEstimate).toFixed(2)} est.`
                        : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase text-gray-500">Competition</p>
                  <p className="mt-1">
                    {data.seed.competition ? (
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${COMP_STYLES[data.seed.competition] || "bg-gray-100"}`}>
                        {data.seed.competition}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="p-5 lg:col-span-1">
                <p className="text-[11px] font-bold uppercase text-gray-500 mb-2">12-month trend</p>
                <TrendSparkline trend={data.seed.monthlyTrend} large />
              </div>

              <div className="p-5 lg:col-span-1 bg-indigo-50/30">
                <p className="text-[11px] font-bold uppercase text-indigo-600 mb-2 flex items-center gap-1">
                  <Sparkles size={12} /> AI insight
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">{data.seed.summary || "No summary generated."}</p>
                {data.seed.contentAngles?.length ? (
                  <ul className="mt-3 space-y-1">
                    {data.seed.contentAngles.slice(0, 4).map((a) => (
                      <li key={a} className="text-xs text-gray-600 flex items-start gap-1.5">
                        <span className="text-indigo-400 mt-0.5">→</span> {a}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </div>

          {/* Filter tabs + table */}
          <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 bg-gray-50/80">
              <div className="flex flex-wrap gap-1">
                {FILTER_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setFilter(t.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                      filter === t.id
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-gray-600 hover:bg-white hover:text-gray-900"
                    }`}
                  >
                    {t.label}
                    {t.id === "all" ? ` (${data.keywords?.length || 0})` : ""}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500">{filteredRows.length} shown</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <SortTh label="#" field="opportunityScore" className="w-10" />
                    <SortTh label="Keyword" field="keyword" />
                    <SortTh label="Volume/mo" field="avgMonthlySearches" />
                    <SortTh label="KD" field="keywordDifficulty" />
                    <SortTh label="Opportunity" field="opportunityScore" />
                    <th className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">CPC</th>
                    <th className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">Competition</th>
                    <th className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">Intent</th>
                    <th className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">Trend</th>
                    <th className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredRows.map((row, i) => (
                    <tr key={row.keyword} className="hover:bg-indigo-50/30 transition-colors">
                      <td className="px-3 py-3 text-gray-400 text-xs tabular-nums">{i + 1}</td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-gray-900">{row.keyword}</p>
                        {row.type !== "related" ? (
                          <span className="text-[10px] uppercase font-bold text-gray-400">{row.type?.replace("_", " ")}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 tabular-nums font-semibold text-gray-900">
                        {row.avgMonthlySearches != null ? formatNum(row.avgMonthlySearches) : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <DifficultyBar value={row.keywordDifficulty} />
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center justify-center min-w-[2rem] rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700 tabular-nums">
                          {row.opportunityScore}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-600 tabular-nums">
                        {row.lowTopOfPageBid && row.highTopOfPageBid
                          ? `${row.lowTopOfPageBid}–${row.highTopOfPageBid}`
                          : "—"}
                      </td>
                      <td className="px-3 py-3">
                        {row.competition ? (
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${COMP_STYLES[row.competition] || ""}`}>
                            {row.competition}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold capitalize ${INTENT_STYLES[row.intent] || "bg-gray-100 text-gray-600"}`}>
                          {row.intent}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <TrendIcon direction={row.trendDirection} />
                          <TrendSparkline trend={row.monthlyTrend} />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <SourceBadge source={row.metricsSource} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filteredRows.length ? (
                <p className="p-8 text-center text-sm text-gray-500">No keywords match this filter.</p>
              ) : null}
            </div>
          </div>
        </>
      ) : !loading && !error ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
            <FiDollarSign size={24} />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Research any keyword</h3>
          <p className="mt-2 max-w-md mx-auto text-sm text-gray-500 leading-relaxed">
            Enter a seed keyword above. AI expands it into 30+ related terms with intent and difficulty, then Google Ads
            fills in real search volume and CPC when connected.
          </p>
        </div>
      ) : null}
    </>
  );

  if (embedded) {
    return (
      <div>
        {error ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        ) : null}
        {loading ? (
          <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
            <FiRefreshCw className="animate-spin" size={16} /> Analyzing keywords…
          </div>
        ) : null}
        {panel}
      </div>
    );
  }

  return (
    <SeoPanelShell
      title="AI Keyword Research"
      description="Ahrefs-style keyword intelligence — AI expands your seed keyword, then Google Ads fills in real volume, CPC, and competition when configured."
      selectedSite={selectedSite}
      loading={loading}
      error={error}
      action={
        data ? (
          <ReportSectionActions section="ai-keyword-research" activeSite={selectedSite} />
        ) : null
      }
    >
      {panel}
    </SeoPanelShell>
  );
}
