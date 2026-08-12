"use client";

import { useState } from "react";
import {
  FiSearch,
  FiZap,
  FiShield,
  FiExternalLink,
  FiRefreshCw,
  FiUser,
  FiAward,
  FiArrowUp,
  FiArrowDown,
  FiCheckCircle,
  FiAlertCircle,
  FiTarget,
  FiCode,
  FiMonitor,
  FiSmartphone,
  FiMapPin,
  FiHelpCircle,
  FiBarChart2,
  FiDollarSign,
  FiTrendingUp,
  FiChevronDown,
  FiChevronRight,
  FiList,
  FiFileText,
  FiLink,
} from "react-icons/fi";
import SeoPanelShell, { formatNum } from "./SeoPanelShell";

const GEO_OPTIONS = [
  { value: "us", label: "US" },
  { value: "uk", label: "UK" },
  { value: "ca", label: "CA" },
  { value: "au", label: "AU" },
  { value: "pk", label: "PK" },
];

function kdBand(kd) {
  if (kd == null) return { label: "—", cls: "bg-gray-100 text-gray-500" };
  if (kd < 30) return { label: "Easy", cls: "bg-emerald-100 text-emerald-800" };
  if (kd < 50) return { label: "Medium", cls: "bg-amber-100 text-amber-800" };
  if (kd < 70) return { label: "Hard", cls: "bg-orange-100 text-orange-800" };
  return { label: "Very Hard", cls: "bg-red-100 text-red-800" };
}

function KeywordMetricsBar({ metrics }) {
  if (!metrics?.available) {
    if (metrics && metrics.configured === false) return null; // SE Ranking not set up — stay quiet
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-4 text-xs text-gray-500">
        Keyword metrics unavailable{metrics?.error ? ` (${metrics.error})` : ""}.
      </div>
    );
  }
  const band = kdBand(metrics.difficulty);
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2"><FiBarChart2 className="size-4 text-emerald-600" /> Keyword Metrics</h3>
        <span className="text-[10px] text-gray-400 uppercase tracking-wider">SE Ranking · {String(metrics.source || "us").toUpperCase()}{metrics.fromCache ? " · cached" : ""}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl bg-gray-50 p-3 border border-gray-100">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block">Search Volume</span>
          <span className="font-bold text-gray-900 text-lg">{metrics.volume != null ? formatNum(metrics.volume) : "—"}</span>
          <span className="text-[10px] text-gray-400 block">searches / mo</span>
        </div>
        <div className="rounded-xl bg-gray-50 p-3 border border-gray-100">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block">Difficulty</span>
          <span className="font-bold text-gray-900 text-lg">{metrics.difficulty != null ? metrics.difficulty : "—"}{metrics.difficulty != null ? <span className="text-xs text-gray-400">/100</span> : null}</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${band.cls} inline-block`}>{band.label}</span>
        </div>
        <div className="rounded-xl bg-gray-50 p-3 border border-gray-100">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1"><FiDollarSign className="size-3" /> CPC</span>
          <span className="font-bold text-gray-900 text-lg">{metrics.cpcFormatted || (metrics.cpc != null ? `$${metrics.cpc}` : "—")}</span>
          <span className="text-[10px] text-gray-400 block">avg. cost per click</span>
        </div>
        <div className="rounded-xl bg-gray-50 p-3 border border-gray-100">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1"><FiTrendingUp className="size-3" /> Competition</span>
          <span className="font-bold text-gray-900 text-lg capitalize">{metrics.competitionLevel ? metrics.competitionLevel.toLowerCase() : "—"}</span>
          <span className="text-[10px] text-gray-400 block capitalize">trend: {metrics.trendDirection || "stable"}</span>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, sub }) {
  return (
    <div className="rounded-xl bg-gray-50 p-2.5 border border-gray-100">
      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block">{label}</span>
      <span className="font-bold text-gray-900 text-sm block">{value}</span>
      {sub ? <span className="text-[10px] text-gray-400 block">{sub}</span> : null}
    </div>
  );
}

function SchemaChips({ schemas }) {
  if (!schemas?.length) return <span className="text-gray-400 text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {schemas.map((s, i) => (
        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
          <FiCode className="size-3" />
          {s}
        </span>
      ))}
    </div>
  );
}

function KeywordProfile({ profile, domain }) {
  const [showAll, setShowAll] = useState(false);
  if (!profile) {
    return <p className="text-[11px] text-gray-400 italic">No keyword data available for {domain}.</p>;
  }
  if (!profile.keywords?.length) {
    return <p className="text-[11px] text-gray-400 italic">SE Ranking has no organic keywords indexed for {domain}.</p>;
  }
  const list = showAll ? profile.keywords : profile.keywords.slice(0, 8);
  const noneRelevant = profile.relevantCount === 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5">
          <FiList className="size-3.5 text-emerald-600" /> Keywords {domain} ranks for
        </span>
        <span className="text-[10px] text-gray-400">
          {profile.relevantCount != null ? `${formatNum(profile.relevantCount)} on-topic · ` : ""}{formatNum(profile.total)} total{profile.fromCache ? " · cached" : ""}
        </span>
      </div>
      {noneRelevant && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          ⚠ Ranks for none of your target terms — likely a broad publisher/directory that happens to appear, not a direct competitor.
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full text-left text-[11px]">
          <thead className="bg-gray-50 text-[10px] font-bold uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-2.5 py-1.5">Keyword</th>
              <th className="px-2.5 py-1.5 text-center">Rank</th>
              <th className="px-2.5 py-1.5 text-right">Volume</th>
              <th className="px-2.5 py-1.5 text-right">Traffic</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {list.map((k, i) => (
              <tr key={i} className={k.relevant ? "bg-emerald-50/60" : "hover:bg-gray-50"}>
                <td className="px-2.5 py-1.5 font-medium text-gray-800 max-w-[200px] truncate" title={k.keyword}>
                  {k.relevant && <span className="inline-block size-1.5 rounded-full bg-emerald-500 mr-1.5 align-middle" title="on-topic" />}
                  {k.keyword}
                </td>
                <td className="px-2.5 py-1.5 text-center">
                  <span className={`font-bold ${k.position <= 3 ? "text-emerald-700" : k.position <= 10 ? "text-amber-700" : "text-gray-500"}`}>#{k.position}</span>
                </td>
                <td className="px-2.5 py-1.5 text-right text-gray-600">{k.volume != null ? formatNum(k.volume) : "—"}</td>
                <td className="px-2.5 py-1.5 text-right text-gray-600">{k.traffic != null ? formatNum(k.traffic) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {profile.keywords.length > 8 && (
        <button type="button" onClick={() => setShowAll(!showAll)} className="text-[11px] font-semibold text-emerald-600 hover:underline">
          {showAll ? "Show less" : `Show all ${profile.keywords.length} shown keywords`}
        </button>
      )}
    </div>
  );
}

function HeadingOutline({ headings }) {
  if (!headings?.length) return <p className="text-[11px] text-gray-400 italic">No headings detected.</p>;
  return (
    <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
      {headings.map((h, i) => (
        <div key={i} className="flex items-center gap-2 text-[11px]">
          <span className={`font-mono font-bold text-[9px] uppercase px-1.5 rounded ${h.tag === "h1" ? "bg-purple-100 text-purple-700" : h.tag === "h2" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>{h.tag}</span>
          <span className="truncate text-gray-800">{h.text}</span>
        </div>
      ))}
    </div>
  );
}

function RankRow({ item, tone }) {
  const isYou = item.isYou;
  const [open, setOpen] = useState(false);
  const border = isYou
    ? "border-emerald-300 bg-emerald-50/40 ring-2 ring-emerald-500/20"
    : tone === "above"
    ? "border-red-100 bg-red-50/20"
    : tone === "below"
    ? "border-gray-200 bg-white"
    : "border-amber-200 bg-amber-50/20";

  return (
    <div className={`rounded-2xl border p-4 space-y-3 shadow-sm ${border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`inline-flex items-center justify-center rounded-xl font-bold text-sm size-10 shrink-0 ${
              isYou ? "bg-emerald-600 text-white" : tone === "leader" ? "bg-amber-500 text-white" : "bg-gray-900 text-white"
            }`}
          >
            #{item.position}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-sm text-gray-900 truncate">{item.title}</h4>
              {isYou && <span className="text-[10px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full shrink-0">YOU</span>}
              {!isYou && item.keywordProfile?.keywords?.length > 3 && item.keywordProfile.relevantCount === 0 && (
                <span className="text-[9px] font-bold bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full shrink-0" title="Ranks for none of your target terms — not a direct competitor">BROAD SITE</span>
              )}
            </div>
            <a href={item.link} target="_blank" rel="noreferrer" className="text-xs text-emerald-600 hover:underline inline-flex items-center gap-1 font-medium">
              {item.domain}
              <FiExternalLink className="size-3" />
            </a>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {item.speed?.score != null && (
            <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold ${
              item.speed.score >= 90 ? "bg-emerald-100 text-emerald-800" : item.speed.score >= 50 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"
            }`}>
              <FiZap className="size-3" />{item.speed.score}
            </span>
          )}
          {item.authority?.score != null && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200 px-2 py-1 text-[11px] font-bold">
              <FiShield className="size-3" />{item.authority.score}/10
            </span>
          )}
        </div>
      </div>

      {item.scanned ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <Metric label="Words" value={`${formatNum(item.wordCount)}`} sub={`~${item.readingTimeMinutes} min`} />
          <Metric label="Headings" value={`H1:${item.h1Count} H2:${item.h2Count}`} sub={`${item.headings.length} total`} />
          <Metric label="LCP" value={item.speed?.lcp || "—"} sub={`CLS ${item.speed?.cls || "—"}`} />
          <Metric label="Images" value={`${item.totalImages}`} sub={`${item.imagesWithAlt} w/ alt`} />
        </div>
      ) : (
        <p className="text-[11px] text-gray-400 italic">On-page scan blocked (page returned no readable HTML).</p>
      )}

      {item.schemas?.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-gray-500 uppercase">Schema</span>
          <SchemaChips schemas={item.schemas} />
        </div>
      )}

      {/* Expandable full detail */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white py-1.5 text-[11px] font-bold text-gray-600 hover:bg-gray-50 hover:text-emerald-700 transition-colors"
      >
        {open ? <FiChevronDown className="size-3.5" /> : <FiChevronRight className="size-3.5" />}
        {open ? "Hide details" : "View full details & ranking keywords"}
      </button>

      {open && (
        <div className="space-y-4 pt-2 border-t border-gray-100">
          {item.metaDescription && (
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1"><FiFileText className="size-3" /> Meta Description</span>
              <p className="text-[11px] text-gray-600 italic bg-gray-50 p-2 rounded-lg border border-gray-100">&ldquo;{item.metaDescription}&rdquo;</p>
            </div>
          )}
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-gray-500 uppercase">Heading Outline</span>
            <HeadingOutline headings={item.headings} />
          </div>
          <KeywordProfile profile={item.keywordProfile} domain={item.domain} />
        </div>
      )}
    </div>
  );
}

function DiffCard({ diff, mode }) {
  // mode "beat": rival above — show what THEY lead on.
  // mode "safe": rival below — show what WE lead on.
  const points = [];
  if (mode === "beat") {
    if (diff.wordDelta > 100) points.push({ txt: `+${formatNum(diff.wordDelta)} more words`, bad: true });
    if (diff.speedDelta != null && diff.speedDelta > 5) points.push({ txt: `${diff.speedDelta} pts faster`, bad: true });
    if (diff.authDelta != null && diff.authDelta > 0) points.push({ txt: `+${diff.authDelta} authority`, bad: true });
    if (diff.theirExtraSchemas.length) points.push({ txt: `${diff.theirExtraSchemas.join(", ")} schema`, bad: true });
  } else {
    if (diff.wordDelta < -100) points.push({ txt: `${formatNum(-diff.wordDelta)} more words`, bad: false });
    if (diff.speedDelta != null && diff.speedDelta < -5) points.push({ txt: `${-diff.speedDelta} pts faster`, bad: false });
    if (diff.authDelta != null && diff.authDelta < 0) points.push({ txt: `+${-diff.authDelta} authority`, bad: false });
    if (diff.yourExtraSchemas.length) points.push({ txt: `${diff.yourExtraSchemas.join(", ")} schema`, bad: false });
  }

  return (
    <div className={`rounded-xl border p-3 space-y-1.5 ${mode === "beat" ? "border-red-100 bg-red-50/30" : "border-emerald-100 bg-emerald-50/30"}`}>
      <div className="flex items-center justify-between">
        <span className="font-bold text-xs text-gray-900 truncate">#{diff.position} · {diff.domain}</span>
        <a href={diff.link} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-emerald-600"><FiExternalLink className="size-3.5" /></a>
      </div>
      {!diff.scanned ? (
        <span className="text-[11px] text-gray-400 italic">Page not scannable</span>
      ) : points.length ? (
        <ul className="space-y-1">
          {points.map((p, i) => (
            <li key={i} className={`text-[11px] font-medium inline-flex items-center gap-1.5 ${p.bad ? "text-red-700" : "text-emerald-700"}`}>
              {p.bad ? <FiAlertCircle className="size-3" /> : <FiCheckCircle className="size-3" />}
              {p.txt}
            </li>
          ))}
        </ul>
      ) : (
        <span className={`text-[11px] font-medium ${mode === "beat" ? "text-gray-600" : "text-emerald-700"}`}>
          {mode === "beat" ? "No on-page gap — win on intent & links" : "You lead on measured signals"}
        </span>
      )}
    </div>
  );
}

export default function SerpAnalysisSection({ selectedSite }) {
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("");
  const [device, setDevice] = useState("desktop");
  const [geo, setGeo] = useState("us");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const handleAnalyze = async (e, force = false) => {
    if (e) e.preventDefault();
    if (!keyword.trim()) {
      setError("Enter a keyword or phrase to analyze.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/seo/serp-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: keyword.trim(), siteUrl: selectedSite, location: location.trim(), device, geo, refresh: force }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to analyze SERP");
      setData(json.data);
    } catch (err) {
      setError(err.message || "SERP analysis failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const summary = data?.summary || {};

  return (
    <SeoPanelShell
      title="SERP Analysis"
      description="Enter a keyword to pull the live Google SERP, see exactly where you rank, size up the rivals directly above and below you, and get the empirical recipe the page-1 leaders used to get there."
      selectedSite={selectedSite}
      loading={false}
      error={error}
    >
      {/* Search form */}
      <form onSubmit={handleAnalyze} className="rounded-2xl border border-gray-200 bg-gray-50/50 p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
              <FiSearch className="size-4 text-emerald-600" /> Target Keyword or Phrase
            </label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="e.g. commercial hvac repair chicago"
              className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
              <FiMapPin className="size-4 text-emerald-600" /> Location <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. United States"
              className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
              <button type="button" onClick={() => setDevice("desktop")} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${device === "desktop" ? "bg-emerald-600 text-white" : "text-gray-600"}`}>
                <FiMonitor className="size-3.5" /> Desktop
              </button>
              <button type="button" onClick={() => setDevice("mobile")} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${device === "mobile" ? "bg-emerald-600 text-white" : "text-gray-600"}`}>
                <FiSmartphone className="size-3.5" /> Mobile
              </button>
            </div>
            <select
              value={geo}
              onChange={(e) => setGeo(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 focus:border-emerald-500 focus:outline-none"
              title="Region for SERP & keyword database"
            >
              {GEO_OPTIONS.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
            {selectedSite && (
              <span className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                <FiUser className="size-4 text-emerald-600" /> <strong className="text-gray-900">{selectedSite}</strong>
              </span>
            )}
          </div>
          <button type="submit" disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white shadow-md hover:bg-emerald-700 transition-all disabled:opacity-50">
            {loading ? <FiRefreshCw className="size-4 animate-spin" /> : <FiZap className="size-4" />}
            Analyze SERP
          </button>
        </div>
      </form>

      {loading && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          <FiRefreshCw className="size-6 animate-spin mx-auto mb-3 text-emerald-500" />
          Paging through the live SERP (up to 100 results) and auditing ranking pages… this can take 30–60s.
        </div>
      )}

      {data && !loading && (
        <>
          {/* Your position banner */}
          <div className={`rounded-2xl border p-5 ${data.found ? "border-emerald-300 bg-emerald-50/30" : "border-amber-300 bg-amber-50/30"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <FiTarget className={`size-6 ${data.found ? "text-emerald-600" : "text-amber-600"}`} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Your position for “{data.keyword}”</p>
                  {data.found ? (
                    <>
                      <p className="text-2xl font-bold text-gray-900">#{data.yourRank} <span className="text-sm font-medium text-gray-500">of {data.serpDepth} results scanned</span></p>
                      {data.yourUrl && (
                        <a href={data.yourUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:underline break-all">
                          <FiLink className="size-3.5 shrink-0" />
                          <span className="truncate max-w-md">{data.yourUrl}</span>
                        </a>
                      )}
                    </>
                  ) : (
                    <p className="text-lg font-bold text-amber-800">Not ranking in the top {data.serpDepth} results</p>
                  )}
                </div>
              </div>
              <div className="text-right text-xs text-gray-500 space-y-1">
                <p className="font-medium capitalize">{data.device} · {data.location || "default location"}</p>
                {data.totalResults ? <p>{formatNum(data.totalResults)} total Google results</p> : null}
                {data.serpPagesFetched ? <p className="text-gray-400">{data.serpPagesFetched} SERP page{data.serpPagesFetched > 1 ? "s" : ""} fetched</p> : null}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${data.cached ? "bg-gray-100 text-gray-600" : "bg-emerald-100 text-emerald-700"}`}>
                    {data.cached ? "Cached" : "Fresh"}{data.fetchedAt ? ` · ${new Date(data.fetchedAt).toLocaleDateString()}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleAnalyze(null, true)}
                    disabled={loading}
                    title="Bypass cache and re-fetch live data (uses API credits)"
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[10px] font-bold text-gray-600 hover:text-emerald-700 hover:border-emerald-300 disabled:opacity-50"
                  >
                    <FiRefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} /> Refresh
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Keyword metrics (SE Ranking) */}
          <KeywordMetricsBar metrics={data.keywordMetrics} />

          {/* Action plan */}
          {data.actions?.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3 shadow-sm">
              <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2"><FiTarget className="size-4 text-emerald-600" /> How To Move Up</h3>
              <div className="space-y-2">
                {data.actions.map((a, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <span className={`mt-0.5 inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${a.priority === "HIGH" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{a.priority}</span>
                    <div>
                      <h4 className="font-bold text-xs text-gray-900">{a.title}</h4>
                      <p className="text-xs text-gray-600 mt-0.5">{a.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Above / Below head-to-head */}
          {data.found && (data.vsAbove.length > 0 || data.vsBelow.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-red-200 bg-white p-5 space-y-3 shadow-sm">
                <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2"><FiArrowUp className="size-4 text-red-600" /> Rivals Above You — What They Lead On</h3>
                {data.vsAbove.length ? data.vsAbove.map((d, i) => <DiffCard key={i} diff={d} mode="beat" />) : <p className="text-xs text-gray-500">You&apos;re at the top of the analyzed window.</p>}
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-white p-5 space-y-3 shadow-sm">
                <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2"><FiArrowDown className="size-4 text-emerald-600" /> Rivals Below You — Where You Win</h3>
                {data.vsBelow.length ? data.vsBelow.map((d, i) => <DiffCard key={i} diff={d} mode="safe" />) : <p className="text-xs text-gray-500">No ranked rivals directly below you in-window.</p>}
              </div>
            </div>
          )}

          {/* Page-1 leader benchmark */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/20 p-5 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2"><FiAward className="size-4 text-amber-600" /> Page-1 Leader Benchmark</h3>
              <span className="text-[11px] text-gray-500">{summary.leadersScanned} of {data.leaders.length} pages scanned</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Metric label="Avg Words" value={formatNum(summary.avgWordCount)} />
              <Metric label="Avg H2s" value={summary.avgH2Count} />
              <Metric label="Avg Speed" value={summary.avgSpeedScore ? `${summary.avgSpeedScore}/100` : "—"} />
              <Metric label="Avg Authority" value={summary.avgAuthority ? `${summary.avgAuthority}/10` : "—"} />
            </div>
            {summary.commonSchemas?.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold text-gray-500 uppercase">Leader schemas</span>
                <SchemaChips schemas={summary.commonSchemas} />
              </div>
            )}
          </div>

          {/* Excluded listings note */}
          {data.excludedListings?.length > 0 && (
            <p className="text-[11px] text-gray-500 flex items-center gap-1.5 flex-wrap">
              <FiAlertCircle className="size-3.5 text-gray-400" />
              <span className="font-semibold">{data.excludedListings.length} directory/listing result{data.excludedListings.length > 1 ? "s" : ""} hidden</span>
              from the competitor set:
              <span className="text-gray-400">{[...new Set(data.excludedListings.map((e) => e.domain))].slice(0, 8).join(", ")}</span>
            </p>
          )}

          {/* SERP ladder */}
          <div className="space-y-4">
            {data.found && data.rivalsAbove.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-red-800 flex items-center gap-2"><FiArrowUp className="size-4" /> Ranks Above You</h3>
                {data.rivalsAbove.map((r, i) => <RankRow key={i} item={r} tone="above" />)}
              </div>
            )}
            {data.you && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-emerald-800 flex items-center gap-2"><FiUser className="size-4" /> Your Page</h3>
                <RankRow item={data.you} tone="you" />
              </div>
            )}
            {data.found && data.rivalsBelow.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2"><FiArrowDown className="size-4" /> Ranks Below You</h3>
                {data.rivalsBelow.map((r, i) => <RankRow key={i} item={r} tone="below" />)}
              </div>
            )}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-amber-800 flex items-center gap-2"><FiAward className="size-4" /> Top Ranking Competitors</h3>
              {data.leaders.map((r, i) => <RankRow key={i} item={r} tone="leader" />)}
            </div>
          </div>

          {/* Content gaps */}
          {(data.relatedQuestions?.length > 0 || data.relatedSearches?.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {data.relatedQuestions?.length > 0 && (
                <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-2 shadow-sm">
                  <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2"><FiHelpCircle className="size-4 text-purple-600" /> People Also Ask</h3>
                  <ul className="space-y-1.5">
                    {data.relatedQuestions.map((q, i) => <li key={i} className="text-xs text-gray-700 flex gap-2"><span className="text-purple-400">›</span>{q}</li>)}
                  </ul>
                </div>
              )}
              {data.relatedSearches?.length > 0 && (
                <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-2 shadow-sm">
                  <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2"><FiSearch className="size-4 text-emerald-600" /> Related Searches</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {data.relatedSearches.map((s, i) => <span key={i} className="text-[11px] px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 font-medium">{s}</span>)}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </SeoPanelShell>
  );
}
