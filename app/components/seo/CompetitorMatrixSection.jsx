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
  FiTarget,
  FiCheckSquare,
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
        <span>Heading Outline ({headings.length} headings)</span>
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

function BlueprintTable({ yourPage, topLeaders, summary }) {
  const leaderAvgWords = summary.avgLeaderWordCount || 0;
  const leaderAvgH2 = summary.avgLeaderH2Count || 0;
  const leaderAvgSpeed = summary.avgLeaderSpeedScore || 0;
  const leaderSchemas = summary.commonLeaderSchemas || [];

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/20 p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FiTarget className="size-5 text-emerald-600" />
          <h3 className="font-bold text-base text-gray-900">SERP Winner Blueprint &amp; Gap Recipe</h3>
        </div>
        <span className="text-xs font-semibold text-emerald-800 bg-emerald-100 px-3 py-1 rounded-full">
          100% Empirical &amp; Verifiable Data
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-gray-700">
          <thead className="bg-white/80 text-[11px] font-bold uppercase tracking-wider text-gray-500 border-b border-emerald-100">
            <tr>
              <th className="px-4 py-3">Metric</th>
              <th className="px-4 py-3 text-center">Your Page</th>
              <th className="px-4 py-3 text-center">Top 3 Winners Avg</th>
              <th className="px-4 py-3">Gap &amp; Required Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-100 bg-white/60 font-medium">
            <tr>
              <td className="px-4 py-3 font-semibold text-gray-900">Content Depth (Words)</td>
              <td className="px-4 py-3 text-center font-bold text-gray-900">
                {yourPage ? `${formatNum(yourPage.wordCount)} w` : "Targeting"}
              </td>
              <td className="px-4 py-3 text-center font-bold text-amber-900">
                {formatNum(leaderAvgWords)} words
              </td>
              <td className="px-4 py-3">
                {yourPage ? (
                  yourPage.wordCount >= leaderAvgWords * 0.9 ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                      <FiCheckCircle className="size-3.5" /> Optimal Depth Matched
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-red-700 font-bold">
                      <FiAlertCircle className="size-3.5" /> -{formatNum(leaderAvgWords - yourPage.wordCount)} words deficit
                    </span>
                  )
                ) : (
                  <span className="text-gray-600">Aim for at least {formatNum(leaderAvgWords)} words</span>
                )}
              </td>
            </tr>

            <tr>
              <td className="px-4 py-3 font-semibold text-gray-900">H2 Sub-Sections</td>
              <td className="px-4 py-3 text-center font-bold text-gray-900">
                {yourPage ? `${yourPage.h2Count} H2s` : "Targeting"}
              </td>
              <td className="px-4 py-3 text-center font-bold text-amber-900">
                {leaderAvgH2} H2 sub-sections
              </td>
              <td className="px-4 py-3">
                {yourPage ? (
                  yourPage.h2Count >= leaderAvgH2 ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                      <FiCheckCircle className="size-3.5" /> Heading Structure Matched
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-700 font-bold">
                      <FiAlertCircle className="size-3.5" /> Add +{leaderAvgH2 - yourPage.h2Count} H2 sub-sections
                    </span>
                  )
                ) : (
                  <span className="text-gray-600">Structure page with ~{leaderAvgH2} H2 sub-topics</span>
                )}
              </td>
            </tr>

            <tr>
              <td className="px-4 py-3 font-semibold text-gray-900">Schema.org Microdata</td>
              <td className="px-4 py-3 text-center">
                {yourPage?.schemas?.length ? (
                  <SchemaChips schemas={yourPage.schemas} />
                ) : (
                  <span className="text-gray-400">None</span>
                )}
              </td>
              <td className="px-4 py-3 text-center">
                <SchemaChips schemas={leaderSchemas} />
              </td>
              <td className="px-4 py-3">
                {leaderSchemas.length > 0 ? (
                  <span className="text-amber-800 font-bold">
                    Implement {leaderSchemas.join(", ")} JSON-LD
                  </span>
                ) : (
                  <span className="text-gray-500">No schema required</span>
                )}
              </td>
            </tr>

            <tr>
              <td className="px-4 py-3 font-semibold text-gray-900">PageSpeed Performance</td>
              <td className="px-4 py-3 text-center font-bold text-gray-900">
                {yourPage?.speed?.score != null ? `${yourPage.speed.score}/100` : "—"}
              </td>
              <td className="px-4 py-3 text-center font-bold text-amber-900">
                {leaderAvgSpeed > 0 ? `${leaderAvgSpeed}/100` : "N/A"}
              </td>
              <td className="px-4 py-3">
                {yourPage?.speed?.score != null && leaderAvgSpeed > 0 ? (
                  yourPage.speed.score >= leaderAvgSpeed ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                      <FiCheckCircle className="size-3.5" /> Fast Performance Matched
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-red-700 font-bold">
                      <FiAlertCircle className="size-3.5" /> -{leaderAvgSpeed - yourPage.speed.score} pts behind leaders
                    </span>
                  )
                ) : (
                  <span className="text-gray-600">Aim for PageSpeed score &gt; 85/100</span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ActionChecklist({ items }) {
  if (!items?.length) return null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3 shadow-sm">
      <div className="flex items-center gap-2">
        <FiCheckSquare className="size-5 text-emerald-600" />
        <h3 className="font-bold text-sm text-gray-900">Deterministic Action Plan to Outrank #1</h3>
      </div>
      <div className="space-y-2">
        {items.map((action, idx) => (
          <div key={idx} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
            <span
              className={`mt-0.5 inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                action.priority === "HIGH" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
              }`}
            >
              {action.priority}
            </span>
            <div>
              <h4 className="font-bold text-xs text-gray-900">{action.title}</h4>
              <p className="text-xs text-gray-600 mt-0.5">{action.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SideBySideInspector({ leaders }) {
  if (!leaders?.length) return null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2">
          <FiLayers className="size-5 text-purple-600" />
          <h3 className="font-bold text-sm text-gray-900">Side-by-Side Content Outline Inspector</h3>
        </div>
        <span className="text-xs text-gray-500 font-medium">Compare H1 / H2 / H3 heading trees</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 overflow-x-auto">
        {leaders.slice(0, 3).map((item, idx) => (
          <div key={idx} className="rounded-xl border border-gray-200 bg-gray-50/50 p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between border-b border-gray-200 pb-2">
              <span className="font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded text-[10px]">
                Rank #{item.rank}
              </span>
              <span className="font-semibold text-gray-600 truncate max-w-[140px]">{item.domain}</span>
            </div>
            <p className="font-bold text-gray-900 text-xs line-clamp-1">{item.title}</p>
            <HeadingTree headings={item.headings} />
          </div>
        ))}
      </div>
    </div>
  );
}

function CompetitorCard({ item, isLeader }) {
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

  const yourPage = data?.yourPage || null;
  const topLeaders = data?.topLeaders || [];
  const closeCompetitors = data?.closeCompetitors || [];
  const lowerPages = data?.lowerPages || [];
  const summary = data?.summary || {};
  const actionChecklist = data?.actionChecklist || [];

  return (
    <SeoPanelShell
      title="Empirical Competitor Intelligence Matrix"
      description="Groundbreaking side-by-side competitor benchmarking. Inspect heading outlines, Schema microdata, word counts, and Core Web Vitals across top ranking pages. 100% empirical & verifiable."
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

      {/* 1. SERP Winner Blueprint Table */}
      {data && (
        <BlueprintTable yourPage={yourPage} topLeaders={topLeaders} summary={summary} />
      )}

      {/* 2. Action Plan Checklist */}
      {data && actionChecklist.length > 0 && (
        <ActionChecklist items={actionChecklist} />
      )}

      {/* 3. Side-by-Side Outline Inspector */}
      {data && topLeaders.length > 0 && (
        <SideBySideInspector leaders={topLeaders} />
      )}

      {/* 4. Competitors List by Tiers */}
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
