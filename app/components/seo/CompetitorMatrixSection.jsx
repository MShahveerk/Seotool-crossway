"use client";

import { useEffect, useState } from "react";
import {
  FiSearch,
  FiAward,
  FiZap,
  FiLayers,
  FiList,
  FiCode,
  FiBarChart2,
  FiAlertCircle,
  FiCheckCircle,
  FiExternalLink,
  FiRefreshCw,
  FiGlobe,
  FiTrendingUp,
  FiShield,
  FiChevronDown,
  FiChevronRight,
} from "react-icons/fi";
import SeoPanelShell, { formatNum } from "./SeoPanelShell";

function HeadingTree({ headings }) {
  const [expanded, setExpanded] = useState(false);
  if (!headings?.length) return <span className="text-gray-400 text-xs font-normal">No headings detected</span>;

  const displayList = expanded ? headings : headings.slice(0, 5);

  return (
    <div className="space-y-1 text-xs">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 font-bold text-gray-700 hover:text-emerald-600 transition-colors"
      >
        {expanded ? <FiChevronDown className="size-3.5" /> : <FiChevronRight className="size-3.5" />}
        <span>Heading Tree ({headings.length} headings)</span>
      </button>

      <div className="pl-2 border-l-2 border-emerald-100 space-y-1 my-1">
        {displayList.map((h, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px]">
            <span
              className={`font-mono font-bold text-[9px] uppercase px-1.5 py-0.2 rounded ${
                h.tag === "h1"
                  ? "bg-purple-100 text-purple-700"
                  : h.tag === "h2"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {h.tag}
            </span>
            <span className="truncate text-gray-800 max-w-xs">{h.text}</span>
          </div>
        ))}
      </div>
      {!expanded && headings.length > 5 && (
        <span className="text-[10px] text-gray-400 italic pl-2">+{headings.length - 5} more headings</span>
      )}
    </div>
  );
}

function SchemaChips({ schemas }) {
  if (!schemas?.length) return <span className="text-gray-400 text-xs">—</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {schemas.map((s, idx) => (
        <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
          <FiCode className="size-3" />
          {s}
        </span>
      ))}
    </div>
  );
}

function CompetitorCard({ item, rankLabel, isLeader }) {
  return (
    <div className={`rounded-2xl border p-5 space-y-4 transition-all shadow-sm ${
      isLeader ? "border-amber-200 bg-amber-50/20" : "border-gray-200 bg-white"
    }`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center justify-center rounded-xl font-bold text-xs px-3 py-1 ${
            isLeader ? "bg-amber-500 text-white shadow-sm" : "bg-emerald-100 text-emerald-800"
          }`}>
            Rank #{item.rank}
          </span>
          <div>
            <h4 className="font-bold text-sm text-gray-900 line-clamp-1">{item.title}</h4>
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-emerald-600 hover:underline inline-flex items-center gap-1 font-medium"
            >
              {item.domain}
              <FiExternalLink className="size-3" />
            </a>
          </div>
        </div>

        {/* Speed & Domain Rank Badges */}
        <div className="flex items-center gap-2">
          {item.speed?.score != null && (
            <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold ${
              item.speed.score >= 90
                ? "bg-emerald-100 text-emerald-800"
                : item.speed.score >= 50
                ? "bg-amber-100 text-amber-800"
                : "bg-red-100 text-red-800"
            }`}>
              <FiZap className="size-3" />
              Speed: {item.speed.score}/100
            </span>
          )}
          {item.authority?.pageRank != null && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200 px-2.5 py-1 text-xs font-bold">
              <FiShield className="size-3" />
              Authority: {item.authority.pageRank}/10
            </span>
          )}
        </div>
      </div>

      {/* Meta Description */}
      {item.metaDescription && (
        <p className="text-xs text-gray-600 italic bg-gray-50 p-2.5 rounded-xl border border-gray-100">
          "{item.metaDescription}"
        </p>
      )}

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="rounded-xl bg-gray-50 p-2.5 border border-gray-100">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block">Word Count</span>
          <span className="font-bold text-gray-900 text-sm">{formatNum(item.wordCount)} words</span>
          <span className="text-[10px] text-gray-400 block">~{item.readingTimeMinutes} min read</span>
        </div>

        <div className="rounded-xl bg-gray-50 p-2.5 border border-gray-100">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block">Headings Breakdown</span>
          <span className="font-bold text-gray-900 text-xs">
            H1: {item.h1Count} | H2: {item.h2Count} | H3: {item.h3Count}
          </span>
          <span className="text-[10px] text-gray-400 block">{item.headings.length} total headings</span>
        </div>

        <div className="rounded-xl bg-gray-50 p-2.5 border border-gray-100">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block">Core Web Vitals</span>
          <span className="font-bold text-gray-900 text-xs">
            LCP: {item.speed?.lcp || "N/A"}
          </span>
          <span className="text-[10px] text-gray-400 block">CLS: {item.speed?.cls || "N/A"}</span>
        </div>

        <div className="rounded-xl bg-gray-50 p-2.5 border border-gray-100">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block">Images &amp; Alt Tags</span>
          <span className="font-bold text-gray-900 text-xs">
            {item.totalImages} images
          </span>
          <span className="text-[10px] text-gray-400 block">{item.imagesWithAlt} with alt tags</span>
        </div>
      </div>

      {/* Schema Microdata */}
      <div className="space-y-1">
        <span className="text-[11px] font-bold text-gray-600 block">Detected Schema.org Markup:</span>
        <SchemaChips schemas={item.schemas} />
      </div>

      {/* Expandable Heading Tree */}
      <HeadingTree headings={item.headings} />
    </div>
  );
}

export default function CompetitorMatrixSection({ selectedSite }) {
  const [keyword, setKeyword] = useState("seo audit tool");
  const [urlsInput, setUrlsInput] = useState(
    "https://ahrefs.com/seo-checker\nhttps://semrush.com/features/site-audit/\nhttps://moz.com/free-seo-tools"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const handleAnalyze = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const urls = urlsInput.split(/[\n,]/).map((s) => s.trim()).filter((s) => s.startsWith("http"));
      if (!urls.length) {
        throw new Error("Please enter at least one valid competitor HTTP/HTTPS URL to analyze.");
      }

      const res = await fetch("/api/seo/competitor-matrix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword,
          siteUrl: selectedSite,
          competitorUrls: urls.map((url, i) => ({ url, rank: i + 1 })),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to analyze competitors");
      }

      setData(json.data);
    } catch (err) {
      setError(err.message || "Competitor analysis failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const topLeaders = data?.topLeaders || [];
  const closeCompetitors = data?.closeCompetitors || [];
  const lowerPages = data?.lowerPages || [];
  const summary = data?.summary || {};

  return (
    <SeoPanelShell
      title="Empirical Competitor Matrix"
      description="Side-by-side competitor benchmarking powered by real-time HTML heading extraction, Google PageSpeed Insights, Open PageRank authority, and Schema.org microdata parsing. Zero AI hallucinations."
      selectedSite={selectedSite}
      loading={false}
      error={error}
    >
      {/* Search Input Form */}
      <form onSubmit={handleAnalyze} className="rounded-2xl border border-gray-200 bg-gray-50/50 p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5 md:col-span-1">
            <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
              <FiSearch className="size-4 text-emerald-600" />
              Target Keyword / Topic:
            </label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="e.g. seo audit tool"
              className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
              <FiGlobe className="size-4 text-emerald-600" />
              Competitor URLs to Benchmark (one per line):
            </label>
            <textarea
              rows={3}
              value={urlsInput}
              onChange={(e) => setUrlsInput(e.target.value)}
              placeholder="https://competitor.com/page1&#10;https://competitor2.com/page2"
              className="w-full rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none font-mono"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white shadow-md hover:bg-emerald-700 transition-all disabled:opacity-50"
          >
            {loading ? <FiRefreshCw className="size-4 animate-spin" /> : <FiLayers className="size-4" />}
            Analyze Competitors
          </button>
        </div>
      </form>

      {/* Summary KPI Cards */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-900">Leader Avg Word Count</span>
              <FiAward className="size-5 text-amber-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-amber-950">{formatNum(summary.avgLeaderWordCount)} words</p>
            <span className="text-[11px] text-amber-800">Target depth for Top 3 rankings</span>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-900">Common Leader Schema</span>
              <FiCode className="size-5 text-emerald-600" />
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {summary.commonLeaderSchemas?.length ? (
                summary.commonLeaderSchemas.map((s, i) => (
                  <span key={i} className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    {s}
                  </span>
                ))
              ) : (
                <span className="text-xs text-gray-500">None detected</span>
              )}
            </div>
            <span className="text-[11px] text-emerald-800 mt-1 block">Structured data used by leaders</span>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-900">Competitors Audited</span>
              <FiGlobe className="size-5 text-blue-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-blue-950">{summary.competitorsAudited} pages</p>
            <span className="text-[11px] text-blue-800">HTML &amp; Speed empirical checks</span>
          </div>
        </div>
      )}

      {/* Competitors List by Tiers */}
      {data && (
        <div className="space-y-6">
          {/* Top Leaders Tier */}
          {topLeaders.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-amber-900 flex items-center gap-2">
                <FiAward className="size-4 text-amber-600" />
                🥇 Top Leaders (Ranks #1 – #3)
              </h3>
              <div className="space-y-4">
                {topLeaders.map((c, i) => (
                  <CompetitorCard key={i} item={c} isLeader />
                ))}
              </div>
            </div>
          )}

          {/* Close Competitors Tier */}
          {closeCompetitors.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <FiTrendingUp className="size-4 text-emerald-600" />
                ⚔️ Close Competitors (Ranks #4 – #6)
              </h3>
              <div className="space-y-4">
                {closeCompetitors.map((c, i) => (
                  <CompetitorCard key={i} item={c} isLeader={false} />
                ))}
              </div>
            </div>
          )}

          {/* Lower Pages Tier */}
          {lowerPages.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-gray-600 flex items-center gap-2">
                <FiList className="size-4 text-gray-500" />
                📉 Lower Pages (Ranks #7+)
              </h3>
              <div className="space-y-4">
                {lowerPages.map((c, i) => (
                  <CompetitorCard key={i} item={c} isLeader={false} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </SeoPanelShell>
  );
}
