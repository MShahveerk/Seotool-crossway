"use client";

import { useState, useMemo, useEffect } from "react";
import { HELP_ARTICLES } from "../../../lib/helpArticles";
import { FiBookOpen, FiSearch, FiArrowLeft, FiClock, FiTag, FiChevronRight, FiCheck } from "react-icons/fi";

export default function HelpCenterSection({
  selectedArticle = "general-seo",
  onSelectArticle,
  onBack,
}) {
  const [search, setSearch] = useState("");

  const articles = useMemo(() => {
    return Object.entries(HELP_ARTICLES).map(([id, data]) => ({
      id,
      ...data,
    }));
  }, []);

  const filteredArticles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.content.toLowerCase().includes(q)
    );
  }, [articles, search]);

  const activeArticle = HELP_ARTICLES[selectedArticle] || HELP_ARTICLES["general-seo"];

  // Scroll to top of content when article changes
  useEffect(() => {
    const container = document.getElementById("help-content-scroll");
    if (container) container.scrollTop = 0;
  }, [selectedArticle]);

  // Clean Markdown formatter helper for the simple subset we use
  const formatBody = (text) => {
    return String(text || "")
      .split("\n\n")
      .map((block, idx) => {
        const line = block.trim();
        if (!line) return null;

        // Subheaders ###
        if (line.startsWith("###")) {
          return (
            <h3 key={idx} className="text-md font-bold text-gray-900 mt-6 mb-3">
              {line.replace("###", "").trim()}
            </h3>
          );
        }

        // Ordered list numbers
        if (/^\d+\./.test(line)) {
          const items = line.split(/\n(?=\d+\.)/);
          return (
            <ol key={idx} className="list-decimal pl-5 space-y-2 text-sm text-gray-700 my-4 font-medium">
              {items.map((it, i) => (
                <li key={i}>{it.replace(/^\d+\.\s*/, "").trim()}</li>
              ))}
            </ol>
          );
        }

        // Bullet lists -
        if (line.startsWith("-")) {
          const items = line.split(/\n-\s*/);
          return (
            <ul key={idx} className="list-disc pl-5 space-y-2 text-sm text-gray-700 my-4 font-medium">
              {items.map((it, i) => (
                <li key={i}>{it.replace(/^-\s*/, "").trim()}</li>
              ))}
            </ul>
          );
        }

        // Code blocks `code`
        if (line.startsWith("`") || line.includes("`code`")) {
          return (
            <pre key={idx} className="rounded-xl border border-slate-100 bg-slate-50 p-4 font-mono text-xs text-slate-800 my-4 overflow-x-auto shadow-inner">
              <code>{line.replace(/`/g, "")}</code>
            </pre>
          );
        }

        return (
          <p key={idx} className="text-sm text-gray-600 leading-relaxed font-medium mb-3">
            {line}
          </p>
        );
      });
  };

  return (
    <div className="min-h-[calc(100vh-2rem)] space-y-8 rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
      {/* Header Banner */}
      <header className="relative overflow-hidden rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-900 via-gray-800 to-emerald-950 p-6 text-white shadow-[0_8px_32px_rgba(0,0,0,0.12)] sm:p-8">
        <div className="absolute -right-16 -top-16 size-64 rounded-full bg-emerald-500/10 blur-3xl" aria-hidden />
        <div className="absolute -bottom-20 -left-10 size-48 rounded-full bg-teal-400/10 blur-3xl" aria-hidden />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300/90">Support Center</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Crossway Knowledge Hub</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-300">
              Your local repository for performance recommendations, SEO guidelines, and Core Web Vitals tutorials.
            </p>
          </div>
          {onBack && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold backdrop-blur-sm transition-colors shadow-sm self-start sm:self-center"
            >
              <FiArrowLeft className="w-3.5 h-3.5" />
              Back to tools
            </button>
          )}
        </div>
      </header>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side: Article List & Search */}
        <div className="lg:col-span-1 space-y-4">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search help articles..."
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none bg-slate-50/50"
            />
          </div>

          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
            {filteredArticles.length > 0 ? (
              filteredArticles.map((article) => {
                const active = selectedArticle === article.id;
                return (
                  <button
                    key={article.id}
                    onClick={() => onSelectArticle(article.id)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-start gap-3 ${
                      active
                        ? "bg-emerald-50/40 border-emerald-200 text-emerald-950 font-semibold"
                        : "bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <FiBookOpen className={`w-4 h-4 mt-0.5 shrink-0 ${active ? "text-emerald-600" : "text-slate-400"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[9px] font-extrabold uppercase px-1 rounded ${active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
                          {article.category}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-gray-900 mt-1 line-clamp-1 leading-snug">{article.title}</p>
                      <p className="text-[10px] text-gray-500 line-clamp-2 mt-0.5 leading-normal font-medium">{article.description}</p>
                    </div>
                    <FiChevronRight className="w-3.5 h-3.5 self-center text-slate-400 shrink-0" />
                  </button>
                );
              })
            ) : (
              <p className="text-center text-xs text-gray-500 py-8 font-medium">No articles match your search.</p>
            )}
          </div>
        </div>

        {/* Right Side: Active Article Content */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col h-full max-h-[75vh] overflow-hidden">
          <div id="help-content-scroll" className="overflow-y-auto flex-1 space-y-4 pr-1">
            {/* Meta header */}
            <div className="border-b border-gray-100 pb-4 space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full">
                  <FiTag className="w-3 h-3" />
                  {activeArticle.category}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-500">
                  <FiClock className="w-3 h-3" />
                  {activeArticle.readTime}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 tracking-tight leading-snug">
                {activeArticle.title}
              </h2>
              <p className="text-xs text-gray-600 font-semibold leading-relaxed">
                {activeArticle.description}
              </p>
            </div>

            {/* Rich Text Body */}
            <div className="prose prose-sm max-w-none prose-emerald">
              {formatBody(activeArticle.content)}
            </div>

            {/* Premium CTA Box */}
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/20 p-4 mt-6">
              <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wide flex items-center gap-1.5">
                <FiCheck className="w-4 h-4 text-emerald-600" />
                Crossway Recommendation
              </h4>
              <p className="text-[11px] text-emerald-900 font-semibold leading-relaxed mt-1">
                Applying these internal optimization techniques directly raises your site's Lighthouse scores. For support implementing these fixes, contact your system administrator or file a development request inside the Client Settings panel.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
