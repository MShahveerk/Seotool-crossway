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
            <h3 key={idx} className="text-md font-bold text-[var(--cw-ink)] mt-6 mb-3">
              {line.replace("###", "").trim()}
            </h3>
          );
        }

        // Ordered list numbers
        if (/^\d+\./.test(line)) {
          const items = line.split(/\n(?=\d+\.)/);
          return (
            <ol key={idx} className="list-decimal pl-5 space-y-2 text-sm text-[var(--cw-ink-dim)] my-4 font-medium">
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
            <ul key={idx} className="list-disc pl-5 space-y-2 text-sm text-[var(--cw-ink-dim)] my-4 font-medium">
              {items.map((it, i) => (
                <li key={i}>{it.replace(/^-\s*/, "").trim()}</li>
              ))}
            </ul>
          );
        }

        // Code blocks `code`
        if (line.startsWith("`") || line.includes("`code`")) {
          return (
            <pre key={idx} className="rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] p-4 font-mono text-xs text-[var(--cw-ink-dim)] my-4 overflow-x-auto shadow-inner">
              <code>{line.replace(/`/g, "")}</code>
            </pre>
          );
        }

        return (
          <p key={idx} className="text-sm text-[var(--cw-ink-muted)] leading-relaxed font-medium mb-3">
            {line}
          </p>
        );
      });
  };

  return (
    <div className="min-h-[calc(100vh-2rem)] space-y-8 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-5 sm:p-6 shadow-sm">
      {/* Header Banner */}
      <header className="relative overflow-hidden rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-canvas)] p-6 text-[var(--cw-ink)] shadow-[0_8px_32px_rgba(0,0,0,0.12)] sm:p-8">
        <div className="absolute -right-16 -top-16 size-64 rounded-full bg-[color-mix(in_srgb,var(--cw-neon)_10%,transparent)] blur-3xl" aria-hidden />
        <div className="absolute -bottom-20 -left-10 size-48 rounded-full bg-[color-mix(in_srgb,var(--cw-info)_10%,transparent)] blur-3xl" aria-hidden />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--cw-neon)]">Support Center</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Crossway Knowledge Hub</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--cw-ink-dim)]">
              Your local repository for performance recommendations, SEO guidelines, and Core Web Vitals tutorials.
            </p>
          </div>
          {onBack && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--cw-raised)] hover:bg-[var(--cw-overlay)] text-[var(--cw-ink)] text-xs font-semibold backdrop-blur-sm transition-colors shadow-sm self-start sm:self-center"
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
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--cw-ink-faint)] w-4 h-4" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search help articles..."
              className="w-full pl-9 pr-4 py-2 border border-[var(--cw-hairline)] rounded-xl text-xs focus:ring-2 focus:ring-[color-mix(in_srgb,var(--cw-neon)_28%,transparent)] focus:border-[var(--cw-neon)] outline-none bg-[var(--cw-raised)] text-[var(--cw-ink)] placeholder:text-[var(--cw-ink-faint)]"
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
                        ? "bg-[color-mix(in_srgb,var(--cw-neon)_9%,var(--cw-surface))] border-[color-mix(in_srgb,var(--cw-neon)_35%,var(--cw-hairline))] text-[var(--cw-ink)] font-semibold"
                        : "bg-[var(--cw-surface)] border-[var(--cw-hairline)] hover:border-[var(--cw-hairline-strong)] hover:bg-[var(--cw-overlay)] text-[var(--cw-ink-dim)]"
                    }`}
                  >
                    <FiBookOpen className={`w-4 h-4 mt-0.5 shrink-0 ${active ? "text-[var(--cw-neon)]" : "text-[var(--cw-ink-faint)]"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[9px] font-extrabold uppercase px-1 rounded ${active ? "bg-[color-mix(in_srgb,var(--cw-neon)_18%,var(--cw-surface))] text-[var(--cw-neon)]" : "bg-[var(--cw-raised)] text-[var(--cw-ink-muted)]"}`}>
                          {article.category}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-[var(--cw-ink)] mt-1 line-clamp-1 leading-snug">{article.title}</p>
                      <p className="text-[10px] text-[var(--cw-ink-muted)] line-clamp-2 mt-0.5 leading-normal font-medium">{article.description}</p>
                    </div>
                    <FiChevronRight className="w-3.5 h-3.5 self-center text-[var(--cw-ink-faint)] shrink-0" />
                  </button>
                );
              })
            ) : (
              <p className="text-center text-xs text-[var(--cw-ink-muted)] py-8 font-medium">No articles match your search.</p>
            )}
          </div>
        </div>

        {/* Right Side: Active Article Content */}
        <div className="lg:col-span-2 bg-[var(--cw-surface)] border border-[var(--cw-hairline)] rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col h-full max-h-[75vh] overflow-hidden">
          <div id="help-content-scroll" className="overflow-y-auto flex-1 space-y-4 pr-1">
            {/* Meta header */}
            <div className="border-b border-[var(--cw-hairline)] pb-4 space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase bg-[color-mix(in_srgb,var(--cw-neon)_9%,var(--cw-surface))] text-[var(--cw-neon)] border border-[color-mix(in_srgb,var(--cw-neon)_35%,var(--cw-hairline))] px-2 py-0.5 rounded-full">
                  <FiTag className="w-3 h-3" />
                  {activeArticle.category}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--cw-ink-muted)]">
                  <FiClock className="w-3 h-3" />
                  {activeArticle.readTime}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-extrabold text-[var(--cw-ink)] tracking-tight leading-snug">
                {activeArticle.title}
              </h2>
              <p className="text-xs text-[var(--cw-ink-muted)] font-semibold leading-relaxed">
                {activeArticle.description}
              </p>
            </div>

            {/* Rich Text Body */}
            <div className="prose prose-sm prose-invert max-w-none prose-headings:text-[var(--cw-ink)] prose-p:text-[var(--cw-ink-dim)] prose-li:text-[var(--cw-ink-dim)] prose-strong:text-[var(--cw-ink)] prose-a:text-[var(--cw-neon)] prose-img:rounded-lg prose-hr:border-[var(--cw-hairline)] prose-blockquote:border-l-[var(--cw-neon)] prose-blockquote:text-[var(--cw-ink-muted)]">
              {formatBody(activeArticle.content)}
            </div>

            {/* Premium CTA Box */}
            <div className="rounded-xl border border-[color-mix(in_srgb,var(--cw-neon)_35%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-neon)_9%,var(--cw-surface))] p-4 mt-6">
              <h4 className="text-xs font-bold text-[var(--cw-ink)] uppercase tracking-wide flex items-center gap-1.5">
                <FiCheck className="w-4 h-4 text-[var(--cw-neon)]" />
                Crossway Recommendation
              </h4>
              <p className="text-[11px] text-[var(--cw-ink-dim)] font-semibold leading-relaxed mt-1">
                Applying these internal optimization techniques directly raises your site's Lighthouse scores. For support implementing these fixes, contact your system administrator or file a development request inside the Client Settings panel.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
