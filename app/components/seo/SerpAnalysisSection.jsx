"use client";

import { useState } from "react";
import {
  FiSearch,
  FiZap,
  FiShield,
  FiRefreshCw,
  FiUser,
  FiAward,
  FiArrowUp,
  FiArrowDown,
  FiTarget,
  FiCode,
  FiMonitor,
  FiSmartphone,
  FiMapPin,
  FiHelpCircle,
  FiBarChart2,
  FiDollarSign,
  FiTrendingUp,
  FiLink,
  FiList,
  FiFileText,
  FiChevronDown,
  FiChevronRight,
  FiImage,
  FiClock,
  FiGlobe,
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

/* ---------- small pieces ---------- */

function Tile({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3 border border-gray-100">
      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
        {Icon ? <Icon className="size-3" /> : null}
        {label}
      </span>
      <span className="font-bold text-gray-900 text-sm block mt-0.5">{value}</span>
      {sub ? <span className="text-[10px] text-gray-400 block">{sub}</span> : null}
    </div>
  );
}

function SchemaChips({ schemas }) {
  if (!schemas?.length) return <span className="text-gray-400 text-xs">None detected</span>;
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

function Backlinks({ backlinks }) {
  const [showAll, setShowAll] = useState(false);
  if (!backlinks) {
    return (
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
        <span className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1"><FiLink className="size-3" /> Backlink Profile</span>
        <p className="text-[11px] text-gray-400 italic mt-1">No backlink data (SE Ranking not configured or none indexed for this domain).</p>
      </div>
    );
  }
  const hosts = backlinks.refdomainList || [];
  const shown = showAll ? hosts : hosts.slice(0, 12);
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 space-y-2">
      <span className="text-[10px] font-bold text-blue-800 uppercase flex items-center gap-1"><FiLink className="size-3" /> Backlinks giving this rank</span>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <span className="font-bold text-gray-900 text-sm block">{backlinks.refdomains != null ? formatNum(backlinks.refdomains) : "—"}</span>
          <span className="text-[10px] text-gray-500">ref. domains</span>
        </div>
        <div>
          <span className="font-bold text-gray-900 text-sm block">{backlinks.backlinks != null ? formatNum(backlinks.backlinks) : "—"}</span>
          <span className="text-[10px] text-gray-500">backlinks</span>
        </div>
        <div>
          <span className="font-bold text-gray-900 text-sm block">{backlinks.domainTrust != null ? `${backlinks.domainTrust}/100` : "—"}</span>
          <span className="text-[10px] text-gray-500">domain trust</span>
        </div>
      </div>
      {hosts.length > 0 && (
        <div className="pt-1 border-t border-blue-100">
          <span className="text-[10px] font-bold text-blue-800 uppercase">Sites linking to them ({hosts.length}{backlinks.refdomains > hosts.length ? `+` : ""})</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {shown.map((h, i) => (
              <a key={i} href={`https://${h}`} target="_blank" rel="noreferrer" className="text-[10px] px-2 py-0.5 rounded bg-white border border-blue-200 text-blue-800 hover:bg-blue-100 truncate max-w-[180px]">{h}</a>
            ))}
          </div>
          {hosts.length > 12 && (
            <button type="button" onClick={() => setShowAll(!showAll)} className="text-[10px] font-semibold text-blue-700 hover:underline mt-1.5">
              {showAll ? "Show fewer" : `Show all ${hosts.length} linking sites`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ContentExcerpt({ paragraphs }) {
  const [open, setOpen] = useState(false);
  if (!paragraphs?.length) return null;
  const list = open ? paragraphs : paragraphs.slice(0, 3);
  return (
    <div>
      <span className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Page content</span>
      <div className="space-y-2 text-[11px] text-gray-600 leading-relaxed">
        {list.map((p, i) => <p key={i}>{p}</p>)}
      </div>
      {paragraphs.length > 3 && (
        <button type="button" onClick={() => setOpen(!open)} className="text-[11px] font-semibold text-emerald-600 hover:underline mt-1.5">
          {open ? "Show less content" : `Read all ${paragraphs.length} passages`}
        </button>
      )}
    </div>
  );
}

function HeadingOutline({ headings }) {
  const [open, setOpen] = useState(false);
  if (!headings?.length) return <p className="text-[11px] text-gray-400 italic">No headings detected on the page.</p>;
  const list = open ? headings : headings.slice(0, 6);
  return (
    <div className="space-y-1">
      <div className="space-y-1">
        {list.map((h, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px]">
            <span className={`font-mono font-bold text-[9px] uppercase px-1.5 rounded shrink-0 ${h.tag === "h1" ? "bg-purple-100 text-purple-700" : h.tag === "h2" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>{h.tag}</span>
            <span className="text-gray-800">{h.text}</span>
          </div>
        ))}
      </div>
      {headings.length > 6 && (
        <button type="button" onClick={() => setOpen(!open)} className="text-[11px] font-semibold text-emerald-600 hover:underline">
          {open ? "Show fewer headings" : `Show all ${headings.length} headings`}
        </button>
      )}
    </div>
  );
}

function KeywordTable({ profile }) {
  const [showAll, setShowAll] = useState(false);
  if (!profile) return <p className="text-[11px] text-gray-400 italic">No keyword data available.</p>;
  if (!profile.keywords?.length) return <p className="text-[11px] text-gray-400 italic">No organic keywords indexed.</p>;
  const list = showAll ? profile.keywords : profile.keywords.slice(0, 8);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-gray-600 uppercase flex items-center gap-1"><FiList className="size-3 text-emerald-600" /> Other keywords it ranks for</span>
        <span className="text-[10px] text-gray-400">
          {profile.relevantCount != null ? `${formatNum(profile.relevantCount)} on-topic · ` : ""}{formatNum(profile.total)} total
        </span>
      </div>
      {profile.relevantCount === 0 && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          ⚠ Ranks for none of your target terms — a broad publisher/directory, not a direct competitor.
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
                <td className="px-2.5 py-1.5 font-medium text-gray-800 max-w-[220px] truncate" title={k.keyword}>
                  {k.relevant && <span className="inline-block size-1.5 rounded-full bg-emerald-500 mr-1.5 align-middle" />}
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
          {showAll ? "Show fewer" : `Show all ${profile.keywords.length}`}
        </button>
      )}
    </div>
  );
}

/* ---------- the tabloid detail card ---------- */

function DetailCard({ item }) {
  const isYou = item.isYou;
  const relTag = item.relation === "above" ? { label: "Above you", cls: "bg-red-100 text-red-700", icon: FiArrowUp }
    : item.relation === "below" ? { label: "Below you", cls: "bg-emerald-100 text-emerald-700", icon: FiArrowDown }
    : null;
  const broad = !isYou && item.keywordProfile?.keywords?.length > 3 && item.keywordProfile.relevantCount === 0;

  const frame = isYou ? "border-emerald-300 bg-emerald-50/30 ring-2 ring-emerald-500/15" : "border-gray-200 bg-white";

  return (
    <div className={`rounded-2xl border p-5 space-y-4 shadow-sm ${frame}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-gray-100">
        <div className="flex items-start gap-3 min-w-0">
          <span className={`inline-flex items-center justify-center rounded-xl font-bold text-sm size-11 shrink-0 ${isYou ? "bg-emerald-600 text-white" : "bg-gray-900 text-white"}`}>
            #{item.position}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-bold text-sm text-gray-900">{item.title}</h4>
              {isYou && <span className="text-[10px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full">YOU</span>}
              {relTag && <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${relTag.cls}`}><relTag.icon className="size-2.5" />{relTag.label}</span>}
              {broad && <span className="text-[9px] font-bold bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full" title="Ranks for none of your target terms">BROAD SITE</span>}
            </div>
            <a href={item.link} target="_blank" rel="noreferrer" className="text-xs text-emerald-600 hover:underline inline-flex items-center gap-1 font-medium break-all">
              <FiLink className="size-3 shrink-0" /><span className="truncate max-w-md">{item.link}</span>
            </a>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {item.speed?.score != null && (
            <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold ${item.speed.score >= 90 ? "bg-emerald-100 text-emerald-800" : item.speed.score >= 50 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
              <FiZap className="size-3" />{item.speed.score}/100
            </span>
          )}
          {item.authority?.score != null && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200 px-2 py-1 text-[11px] font-bold">
              <FiShield className="size-3" />DA {item.authority.score}/10
            </span>
          )}
        </div>
      </div>

      {!item.scanned && <p className="text-[11px] text-amber-600 italic">On-page scan was blocked (page returned no readable HTML) — metrics below may be partial.</p>}

      {/* Content signals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Tile icon={FiFileText} label="Content" value={`${formatNum(item.wordCount)} words`} sub={`~${item.readingTimeMinutes} min read`} />
        <Tile icon={FiList} label="Structure" value={`H1:${item.h1Count} H2:${item.h2Count}`} sub={`${item.headings.length} headings`} />
        <Tile icon={FiClock} label="Core Vitals" value={`LCP ${item.speed?.lcp || "—"}`} sub={`CLS ${item.speed?.cls || "—"}`} />
        <Tile icon={FiImage} label="Images" value={`${item.totalImages}`} sub={`${item.imagesWithAlt} with alt`} />
      </div>

      {/* Backlinks */}
      <Backlinks backlinks={item.backlinks} />

      {/* Schema + meta + headings + keywords */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div>
            <span className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Schema markup</span>
            <SchemaChips schemas={item.schemas} />
          </div>
          {item.metaDescription && (
            <div>
              <span className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Meta description</span>
              <p className="text-[11px] text-gray-600 italic bg-gray-50 p-2 rounded-lg border border-gray-100">&ldquo;{item.metaDescription}&rdquo;</p>
            </div>
          )}
          <ContentExcerpt paragraphs={item.paragraphs} />
          <div>
            <span className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Page content outline (headings)</span>
            <HeadingOutline headings={item.headings} />
          </div>
        </div>
        <KeywordTable profile={item.keywordProfile} />
      </div>
    </div>
  );
}

/* ---------- keyword metrics + ladder ---------- */

function KeywordMetricsBar({ metrics }) {
  if (!metrics?.available) {
    if (metrics && metrics.configured === false) return null;
    return null;
  }
  const band = kdBand(metrics.difficulty);
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2"><FiBarChart2 className="size-4 text-emerald-600" /> Keyword Metrics</h3>
        <span className="text-[10px] text-gray-400 uppercase tracking-wider">SE Ranking · {String(metrics.source || "us").toUpperCase()}{metrics.fromCache ? " · cached" : ""}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile icon={FiSearch} label="Search Volume" value={metrics.volume != null ? formatNum(metrics.volume) : "—"} sub="searches / mo" />
        <div className="rounded-xl bg-gray-50 p-3 border border-gray-100">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block">Difficulty</span>
          <span className="font-bold text-gray-900 text-sm block mt-0.5">{metrics.difficulty != null ? `${metrics.difficulty}/100` : "—"}</span>
          <span className={`text-[10px] font-bold px-1.5 rounded ${band.cls} inline-block`}>{band.label}</span>
        </div>
        <Tile icon={FiDollarSign} label="CPC" value={metrics.cpcFormatted || (metrics.cpc != null ? `$${metrics.cpc}` : "—")} sub="cost per click" />
        <Tile icon={FiTrendingUp} label="Competition" value={metrics.competitionLevel ? metrics.competitionLevel.toLowerCase() : "—"} sub={`trend: ${metrics.trendDirection || "stable"}`} />
      </div>
    </div>
  );
}

function CompactLadder({ ladder, directoryCount }) {
  const [open, setOpen] = useState(false);
  if (!ladder?.length) return null;
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-4 hover:bg-gray-50">
        <span className="font-bold text-sm text-gray-900 flex items-center gap-2">
          {open ? <FiChevronDown className="size-4" /> : <FiChevronRight className="size-4" />}
          <FiGlobe className="size-4 text-gray-500" /> Full Google SERP ({ladder.length} results, matches Google order)
        </span>
        <span className="text-[11px] text-gray-400">{directoryCount} directories tagged, not removed</span>
      </button>
      {open && (
        <div className="border-t border-gray-100 divide-y divide-gray-50 max-h-[28rem] overflow-y-auto">
          {ladder.map((r, i) => (
            <div key={i} className={`flex items-center gap-3 px-4 py-2 text-xs ${r.tag === "you" ? "bg-emerald-50" : r.tag === "directory" ? "bg-gray-50/60" : ""}`}>
              <span className="font-bold text-gray-500 w-8 shrink-0">#{r.position}</span>
              <div className="min-w-0 flex-1">
                <span className={`truncate block ${r.tag === "directory" ? "text-gray-400" : "text-gray-800 font-medium"}`}>{r.title || r.domain}</span>
                <span className="text-[10px] text-gray-400">{r.domain}</span>
              </div>
              {r.tag === "you" && <span className="text-[9px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full shrink-0">YOU</span>}
              {r.tag === "directory" && <span className="text-[9px] font-bold bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full shrink-0">DIRECTORY</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- main ---------- */

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

  return (
    <SeoPanelShell
      title="SERP Analysis"
      description="Enter a keyword to pull the live Google SERP, see exactly where you rank, and get full side-by-side detail on your direct competitors and the page-1 leaders — content, keywords, and the backlinks behind their rank."
      selectedSite={selectedSite}
      loading={false}
      error={error}
    >
      {/* Search form */}
      <form onSubmit={handleAnalyze} className="rounded-2xl border border-gray-200 bg-gray-50/50 p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5"><FiSearch className="size-4 text-emerald-600" /> Target Keyword or Phrase</label>
            <input type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. dallas email marketing" className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5"><FiMapPin className="size-4 text-emerald-600" /> Location <span className="font-normal text-gray-400">(auto-detected from keyword — override here)</span></label>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Leave blank — we detect the city in your keyword" className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none" />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
              <button type="button" onClick={() => setDevice("desktop")} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${device === "desktop" ? "bg-emerald-600 text-white" : "text-gray-600"}`}><FiMonitor className="size-3.5" /> Desktop</button>
              <button type="button" onClick={() => setDevice("mobile")} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${device === "mobile" ? "bg-emerald-600 text-white" : "text-gray-600"}`}><FiSmartphone className="size-3.5" /> Mobile</button>
            </div>
            <select value={geo} onChange={(e) => setGeo(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 focus:border-emerald-500 focus:outline-none" title="Region for SERP & keyword database">
              {GEO_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
            {selectedSite && <span className="text-xs font-medium text-gray-600 flex items-center gap-1.5"><FiUser className="size-4 text-emerald-600" /> <strong className="text-gray-900">{selectedSite}</strong></span>}
          </div>
          <button type="submit" disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white shadow-md hover:bg-emerald-700 transition-all disabled:opacity-50">
            {loading ? <FiRefreshCw className="size-4 animate-spin" /> : <FiZap className="size-4" />} Analyze SERP
          </button>
        </div>
      </form>

      {loading && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          <FiRefreshCw className="size-6 animate-spin mx-auto mb-3 text-emerald-500" />
          Paging through the live SERP and auditing ranking pages (content, keywords, backlinks)… this can take 30–60s.
        </div>
      )}

      {data && !loading && (
        <>
          {/* Toolbar: status + refresh */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>“{data.keyword}” · {data.device} · {data.serpDepth} results ({data.serpPagesFetched} page{data.serpPagesFetched > 1 ? "s" : ""})</span>
              {data.location ? (
                <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                  <FiMapPin className="size-3" /> {data.location}
                  {data.locationSource === "auto" && <span className="text-gray-400 font-normal">· auto-detected from keyword</span>}
                </span>
              ) : (
                <span className="text-amber-600">no location — generic {String(data.geo).toUpperCase()} SERP (may differ from local Google)</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${data.cached ? "bg-gray-100 text-gray-600" : "bg-emerald-100 text-emerald-700"}`}>
                {data.cached ? "Cached" : "Fresh"}{data.fetchedAt ? ` · ${new Date(data.fetchedAt).toLocaleDateString()}` : ""}
              </span>
              <button type="button" onClick={() => handleAnalyze(null, true)} disabled={loading} title="Bypass cache and re-fetch live data (uses API credits)" className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[10px] font-bold text-gray-600 hover:text-emerald-700 hover:border-emerald-300 disabled:opacity-50">
                <FiRefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} /> Refresh
              </button>
            </div>
          </div>

          {/* 1. Keyword metrics — top */}
          <KeywordMetricsBar metrics={data.keywordMetrics} />

          {/* 2. Your position + your site card */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FiTarget className={`size-5 ${data.found ? "text-emerald-600" : "text-amber-600"}`} />
              <h3 className="font-bold text-base text-gray-900">
                {data.found ? <>Your position: <span className="text-emerald-700">#{data.yourRank}</span></> : <span className="text-amber-700">Not ranking in the top {data.serpDepth} results</span>}
              </h3>
            </div>
            {data.you ? (
              <DetailCard item={data.you} />
            ) : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 text-sm text-amber-800">
                {data.yourHost || "Your site"} wasn&apos;t found in the top {data.serpDepth} results for this keyword. Use the leader benchmark below as your target to break in.
              </div>
            )}
          </div>

          {/* 3. Action plan */}
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

          {/* 4. Direct competitors */}
          {data.directCompetitors?.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-bold text-base text-gray-900 flex items-center gap-2"><FiUser className="size-5 text-emerald-600" /> Your Direct Competitors <span className="text-xs font-normal text-gray-500">(nearest real rivals around you)</span></h3>
              <div className="space-y-4">{data.directCompetitors.map((c, i) => <DetailCard key={i} item={c} />)}</div>
            </div>
          )}

          {/* 5. Top rankers */}
          {data.topRankers?.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-bold text-base text-gray-900 flex items-center gap-2"><FiAward className="size-5 text-amber-500" /> Top Rankers <span className="text-xs font-normal text-gray-500">(strongest competitors on the SERP)</span></h3>
              <div className="space-y-4">{data.topRankers.map((c, i) => <DetailCard key={i} item={c} />)}</div>
            </div>
          )}

          {/* 6. Full Google-matching ladder */}
          <CompactLadder ladder={data.fullLadder} directoryCount={data.directoryCount} />

          {/* 7. Content gaps */}
          {(data.relatedQuestions?.length > 0 || data.relatedSearches?.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {data.relatedQuestions?.length > 0 && (
                <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-2 shadow-sm">
                  <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2"><FiHelpCircle className="size-4 text-purple-600" /> People Also Ask</h3>
                  <ul className="space-y-1.5">{data.relatedQuestions.map((q, i) => <li key={i} className="text-xs text-gray-700 flex gap-2"><span className="text-purple-400">›</span>{q}</li>)}</ul>
                </div>
              )}
              {data.relatedSearches?.length > 0 && (
                <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-2 shadow-sm">
                  <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2"><FiSearch className="size-4 text-emerald-600" /> Related Searches</h3>
                  <div className="flex flex-wrap gap-1.5">{data.relatedSearches.map((s, i) => <span key={i} className="text-[11px] px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 font-medium">{s}</span>)}</div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </SeoPanelShell>
  );
}
