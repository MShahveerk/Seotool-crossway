"use client";

import { useState } from "react";
import { 
  FiSearch, FiGlobe, FiImage, FiVideo, FiMapPin, FiBookOpen, 
  FiKey, FiChevronDown, FiChevronUp, FiCopy, FiExternalLink, 
  FiCpu, FiMap, FiAward, FiInfo, FiTrendingUp 
} from "react-icons/fi";
import { formatNum } from "./SeoPanelShell";

const GEO_OPTIONS = [
  { id: "us", label: "United States (US)" },
  { id: "uk", label: "United Kingdom (UK)" },
  { id: "ca", label: "Canada (CA)" },
  { id: "au", label: "Australia (AU)" },
  { id: "de", label: "Germany (DE)" },
  { id: "fr", label: "France (FR)" },
  { id: "in", label: "India (IN)" },
  { id: "pk", label: "Pakistan (PK)" },
];

const LANG_OPTIONS = [
  { id: "en", label: "English" },
  { id: "es", label: "Spanish" },
  { id: "fr", label: "French" },
  { id: "de", label: "German" },
  { id: "hi", label: "Hindi" },
];

export default function SerperExplorerSection() {
  const [activeTab, setActiveTab] = useState("web");
  const [query, setQuery] = useState("");
  const [geo, setGeo] = useState("us");
  const [lang, setLang] = useState("en");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [activePaaIndex, setActivePaaIndex] = useState(null);

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError("");
    setPayload(null);
    setActivePaaIndex(null);

    try {
      const res = await fetch("/api/serper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: query.trim(),
          endpoint: activeTab,
          gl: geo,
          hl: lang,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to query Serper.dev API");
      }
      setPayload(data);
    } catch (err) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const toScore100 = (score10) => {
    if (score10 == null) return null;
    const n = Number(score10);
    return Math.min(100, Math.round(n * 10));
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FiCpu className="w-6 h-6 text-emerald-600 animate-pulse" />
            Serper.dev Explorer
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Analyze live Google Search, Autocomplete suggestions, local business Maps, News, and Videos.
          </p>
        </div>
      </div>

      {/* Query Bar */}
      <form onSubmit={handleSearch} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search for a keyword or business (e.g. "best SEO tools", "pizza in New York")`}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none shadow-sm"
              required
            />
          </div>
          <div className="flex gap-2 shrink-0">
            <select
              value={geo}
              onChange={(e) => setGeo(e.target.value)}
              className="px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm outline-none bg-white focus:ring-2 focus:ring-emerald-500 shadow-sm"
            >
              {GEO_OPTIONS.map((g) => (
                <option key={g.id} value={g.id}>{g.label}</option>
              ))}
            </select>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm outline-none bg-white focus:ring-2 focus:ring-emerald-500 shadow-sm"
            >
              {LANG_OPTIONS.map((l) => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm"
            >
              <FiSearch className="w-4 h-4" />
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex flex-wrap gap-1 border-t border-gray-100 pt-3">
          {[
            { id: "web", label: "Web Search (SERP)", icon: FiGlobe },
            { id: "autocomplete", label: "Keywords (Autocomplete)", icon: FiKey },
            { id: "images", label: "Images", icon: FiImage },
            { id: "videos", label: "Videos", icon: FiVideo },
            { id: "news", label: "News", icon: FiBookOpen },
            { id: "maps", label: "Local Maps", icon: FiMapPin },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  if (payload) setPayload(null);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                  active
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700 font-bold"
                    : "bg-white border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </form>

      {/* Error & Message */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow-sm">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm">
          <div className="inline-block h-8 w-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          <p className="mt-3 text-sm text-gray-600 font-medium">Fetching real-time Google search indices...</p>
        </div>
      )}

      {/* Results View */}
      {payload && !loading && (
        <div className="space-y-6">
          {/* 1. WEB SEARCH / SERP ANALYZER TAB */}
          {activeTab === "web" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-5">
                {/* Answer Box */}
                {payload.answerBox && (
                  <div className="bg-gradient-to-r from-emerald-50/50 to-slate-50 border border-emerald-100 rounded-2xl p-5 shadow-sm">
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/60 rounded px-1.5 py-0.5 uppercase tracking-wide">
                      Featured Snippet
                    </span>
                    <h3 className="text-lg font-bold text-gray-900 mt-2">{payload.answerBox.title}</h3>
                    <p className="text-sm text-gray-700 mt-2 leading-relaxed font-medium">
                      {payload.answerBox.answer || payload.answerBox.snippet}
                    </p>
                  </div>
                )}

                {/* Organic Search Listings */}
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-bold text-gray-800">Organic Results</h3>
                    <span className="text-xs text-gray-500 font-medium">
                      Found {payload.organic?.length || 0} listings
                    </span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {payload.organic?.map((item, idx) => {
                      const daScore = toScore100(item.authority?.score);
                      return (
                        <div key={idx} className="p-5 flex gap-4 hover:bg-slate-50/50 transition-colors">
                          <span className="text-lg font-bold text-slate-300 w-6 text-right tabular-nums self-start pt-0.5">
                            {item.position || idx + 1}
                          </span>
                          <div className="flex-1 space-y-1.5 min-w-0">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <a
                                href={item.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[15px] font-bold text-blue-800 hover:underline leading-snug flex items-center gap-1 min-w-0"
                              >
                                <span className="truncate">{item.title}</span>
                                <FiExternalLink className="w-3.5 h-3.5 shrink-0 text-blue-500 opacity-60" />
                              </a>
                            </div>
                            <span className="block text-xs text-emerald-700 truncate font-semibold">
                              {item.link}
                            </span>
                            <p className="text-xs text-gray-600 leading-relaxed font-medium">
                              {item.snippet}
                            </p>

                            {/* Domain Authority Integration */}
                            {item.authority && (
                              <div className="flex items-center gap-4 pt-2">
                                <div className="flex items-center gap-1.5">
                                  <FiAward className="w-3.5 h-3.5 text-amber-500" />
                                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                    Domain Authority:
                                  </span>
                                  {daScore != null ? (
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-extrabold text-gray-900 tabular-nums">
                                        {daScore}/100
                                      </span>
                                      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                        <div 
                                          className={`h-full rounded-full ${
                                            daScore > 60 ? "bg-emerald-500" : daScore > 30 ? "bg-amber-500" : "bg-slate-400"
                                          }`} 
                                          style={{ width: `${daScore}%` }} 
                                        />
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-slate-400 font-semibold">—</span>
                                  )}
                                </div>

                                {item.authority.referringDomains != null && (
                                  <div className="text-xs font-medium text-gray-500">
                                    Referring Domains: <span className="font-bold text-gray-800 tabular-nums">{formatNum(item.authority.referringDomains)}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Sitelinks */}
                            {item.sitelinks && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 bg-slate-50/30 p-2.5 rounded-xl">
                                {item.sitelinks.map((sLink, sIdx) => (
                                  <div key={sIdx} className="space-y-0.5">
                                    <a
                                      href={sLink.link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs font-bold text-blue-700 hover:underline flex items-center gap-0.5"
                                    >
                                      {sLink.title}
                                      <FiExternalLink className="w-2.5 h-2.5 opacity-50" />
                                    </a>
                                    <p className="text-[10px] text-gray-500 truncate">{sLink.snippet}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Web Sidebar (Knowledge Graph & PAA) */}
              <div className="space-y-6">
                {/* Knowledge Graph Card */}
                {payload.knowledgeGraph && (
                  <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
                    <h3 className="font-bold text-gray-900 border-b border-gray-100 pb-2 flex items-center gap-1.5">
                      <FiInfo className="w-4 h-4 text-emerald-600" />
                      Knowledge Panel
                    </h3>
                    <div className="space-y-3">
                      {payload.knowledgeGraph.imageUrl && (
                        <img
                          src={payload.knowledgeGraph.imageUrl}
                          alt={payload.knowledgeGraph.title}
                          className="max-h-32 object-contain rounded-lg bg-slate-50 p-2"
                        />
                      )}
                      <div>
                        <h4 className="text-md font-bold text-gray-900">{payload.knowledgeGraph.title}</h4>
                        <p className="text-xs text-gray-500 font-semibold uppercase mt-0.5">{payload.knowledgeGraph.type}</p>
                      </div>
                      {payload.knowledgeGraph.description && (
                        <p className="text-xs text-gray-600 leading-relaxed font-medium border-t border-slate-100 pt-3">
                          {payload.knowledgeGraph.description}
                        </p>
                      )}
                      {payload.knowledgeGraph.attributes && (
                        <div className="space-y-1.5 text-xs border-t border-slate-100 pt-3 font-medium">
                          {Object.entries(payload.knowledgeGraph.attributes).map(([k, v]) => (
                            <p key={k} className="text-gray-700">
                              <span className="font-bold text-gray-800">{k}: </span>
                              {String(v)}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* People Also Ask Box */}
                {payload.peopleAlsoAsk && payload.peopleAlsoAsk.length > 0 && (
                  <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3">
                    <h3 className="font-bold text-gray-900 border-b border-gray-100 pb-2">People Also Ask</h3>
                    <div className="divide-y divide-gray-100">
                      {payload.peopleAlsoAsk.map((paa, idx) => {
                        const open = activePaaIndex === idx;
                        return (
                          <div key={idx} className="py-2.5 first:pt-0 last:pb-0">
                            <button
                              type="button"
                              onClick={() => setActivePaaIndex(open ? null : idx)}
                              className="w-full flex items-center justify-between text-left text-xs font-bold text-gray-800 hover:text-emerald-700 py-1"
                            >
                              <span>{paa.question}</span>
                              {open ? <FiChevronUp className="w-3.5 h-3.5 shrink-0" /> : <FiChevronDown className="w-3.5 h-3.5 shrink-0" />}
                            </button>
                            {open && (
                              <div className="mt-2 text-[11px] text-gray-600 leading-relaxed font-medium space-y-2 bg-slate-50 p-2.5 rounded-xl">
                                <p>{paa.snippet}</p>
                                {paa.link && (
                                  <a
                                    href={paa.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-700 hover:underline font-bold inline-flex items-center gap-0.5"
                                  >
                                    {paa.title || "Source"}
                                    <FiExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. AUTOCOMPLETE / KEYWORDS TAB */}
          {activeTab === "autocomplete" && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <h3 className="font-bold text-gray-800 flex items-center gap-1.5">
                  <FiKey className="w-4 h-4 text-emerald-600" />
                  Live Autocomplete Suggestions
                </h3>
                <span className="text-xs text-gray-500 font-semibold uppercase">
                  Google Autocomplete Index
                </span>
              </div>

              {payload.suggestions && payload.suggestions.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {payload.suggestions.map((keyword, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 border border-slate-100 rounded-xl hover:border-emerald-200 hover:bg-emerald-50/20 transition-all font-medium text-sm text-slate-800"
                    >
                      <span className="truncate">{keyword}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setQuery(keyword);
                            handleSearch();
                          }}
                          title="Search this keyword"
                          className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded-lg transition-colors"
                        >
                          <FiSearch className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(keyword, idx)}
                          title="Copy to clipboard"
                          className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded-lg transition-colors"
                        >
                          {copiedIndex === idx ? (
                            <span className="text-[10px] font-bold text-emerald-600">Copied!</span>
                          ) : (
                            <FiCopy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 font-medium py-6 text-center">No autocomplete suggestions found for this query.</p>
              )}
            </div>
          )}

          {/* 3. IMAGES TAB */}
          {activeTab === "images" && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <h3 className="font-bold text-gray-800 border-b border-gray-100 pb-3 mb-5">Google Image Grid</h3>
              {payload.images && payload.images.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {payload.images.map((img, idx) => (
                    <a
                      key={idx}
                      href={img.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex flex-col border border-slate-100 rounded-xl overflow-hidden hover:shadow-md transition-all bg-slate-50"
                    >
                      <div className="relative aspect-square overflow-hidden bg-slate-100 flex items-center justify-center">
                        <img
                          src={img.imageUrl}
                          alt={img.title}
                          className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                      <div className="p-2.5 space-y-1 bg-white flex-1 flex flex-col justify-between">
                        <p className="text-xs font-bold text-slate-800 line-clamp-2 leading-tight">
                          {img.title}
                        </p>
                        <div>
                          <p className="text-[10px] text-gray-400 truncate mt-1">
                            {img.domain}
                          </p>
                          <p className="text-[9px] font-semibold text-emerald-600 bg-emerald-50 rounded px-1 py-0.5 inline-block mt-1">
                            {img.width} × {img.height} px
                          </p>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 font-medium py-6 text-center">No images found for this query.</p>
              )}
            </div>
          )}

          {/* 4. VIDEOS TAB */}
          {activeTab === "videos" && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-5">
              <h3 className="font-bold text-gray-800 border-b border-gray-100 pb-3">Video Feed</h3>
              {payload.videos && payload.videos.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {payload.videos.map((vid, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col sm:flex-row gap-4 p-4 border border-slate-100 rounded-xl hover:shadow-sm transition-all"
                    >
                      <div className="relative w-full sm:w-44 aspect-video shrink-0 bg-slate-100 rounded-lg overflow-hidden flex items-center justify-center border border-slate-200/50">
                        {vid.imageUrl ? (
                          <img
                            src={vid.imageUrl}
                            alt={vid.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <FiVideo className="w-8 h-8 text-slate-300" />
                        )}
                      </div>
                      <div className="flex-1 space-y-2 min-w-0">
                        <a
                          href={vid.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-bold text-blue-800 hover:underline leading-snug block line-clamp-2"
                        >
                          {vid.title}
                        </a>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-400 font-semibold">
                          <span className="text-gray-600">{vid.channel || vid.publisher}</span>
                          <span>{vid.duration}</span>
                          <span>{vid.date}</span>
                        </div>
                        <p className="text-xs text-gray-600 line-clamp-2 font-medium">
                          {vid.snippet}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 font-medium py-6 text-center">No video listings found.</p>
              )}
            </div>
          )}

          {/* 5. NEWS TAB */}
          {activeTab === "news" && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-5">
              <h3 className="font-bold text-gray-800 border-b border-gray-100 pb-3">Google News Index</h3>
              {payload.news && payload.news.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {payload.news.map((item, idx) => (
                    <div key={idx} className="py-4 first:pt-0 last:pb-0 flex gap-4">
                      {item.imageUrl && (
                        <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 border border-slate-200/50 bg-slate-50 flex items-center justify-center">
                          <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="flex-1 space-y-1 min-w-0">
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[14px] font-bold text-blue-800 hover:underline leading-snug flex items-center gap-1 min-w-0"
                        >
                          <span className="truncate">{item.title}</span>
                          <FiExternalLink className="w-3 h-3 shrink-0 opacity-50" />
                        </a>
                        <div className="flex items-center gap-2 text-[10px] font-semibold text-gray-400">
                          <span className="text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded uppercase tracking-wide">
                            {item.source}
                          </span>
                          <span>•</span>
                          <span>{item.date}</span>
                        </div>
                        <p className="text-xs text-gray-600 font-medium line-clamp-2 leading-relaxed">
                          {item.snippet}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 font-medium py-6 text-center">No news articles found.</p>
              )}
            </div>
          )}

          {/* 6. LOCAL MAPS TAB */}
          {activeTab === "maps" && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-5">
              <h3 className="font-bold text-gray-800 border-b border-gray-100 pb-3 flex items-center gap-1.5">
                <FiMap className="w-4 h-4 text-emerald-600" />
                Local Business Maps Directory
              </h3>
              {payload.maps && payload.maps.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {payload.maps.map((biz, idx) => (
                    <div
                      key={idx}
                      className="border border-slate-100 rounded-xl p-4 flex flex-col justify-between hover:shadow-sm transition-all space-y-3 bg-slate-50/20"
                    >
                      <div className="space-y-2">
                        {biz.imageUrl && (
                          <div className="w-full h-32 rounded-lg overflow-hidden border border-slate-200/50 bg-slate-100 mb-2">
                            <img src={biz.imageUrl} alt={biz.title} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <h4 className="font-bold text-slate-900 leading-snug">{biz.title}</h4>
                        {biz.rating != null && (
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-extrabold text-amber-500">★ {biz.rating}</span>
                            <span className="text-[10px] text-gray-400 font-semibold">({biz.ratingCount || 0} reviews)</span>
                          </div>
                        )}
                        <p className="text-[11px] text-gray-500 font-semibold uppercase">{biz.category}</p>
                        <p className="text-xs text-gray-600 leading-relaxed font-medium">{biz.address}</p>
                        {biz.phoneNumber && (
                          <p className="text-xs text-slate-800 font-semibold">Tel: {biz.phoneNumber}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                        {biz.website && (
                          <a
                            href={biz.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold bg-white text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
                          >
                            <FiGlobe className="w-3.5 h-3.5" />
                            Website
                          </a>
                        )}
                        <a
                          href={`https://www.google.com/maps/place/?q=place_id:${biz.placeId || encodeURIComponent(biz.title + ' ' + biz.address)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm"
                        >
                          <FiMapPin className="w-3.5 h-3.5" />
                          Directions
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 font-medium py-6 text-center">No local map results found.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Landing Placeholder */}
      {!payload && !loading && (
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-16 text-center max-w-3xl mx-auto space-y-4">
          <div className="w-14 h-14 bg-emerald-100/60 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <FiSearch className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Enter a Search Query</h3>
            <p className="text-sm text-gray-600 mt-1 max-w-lg mx-auto">
              Type a term in the search bar above, pick your target country and language context, and click search to view real-time analysis.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
