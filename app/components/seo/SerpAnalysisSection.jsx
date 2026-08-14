"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
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
  FiCheckCircle,
  FiEdit3,
  FiDownload,
  FiX,
  FiLayers,
} from "react-icons/fi";
import SeoPanelShell, { formatNum } from "./SeoPanelShell";
import { downloadSerpReportPdf } from "./serpAnalysisReport";
import SideTabs from "../ui-shared/SideTabs";
import TabRail from "../ui-shared/TabRail";
import Btn from "../ui-shared/Btn";

const SERP_INPUT =
  "w-full rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3.5 py-2.5 text-sm text-[var(--cw-ink)] transition-smooth placeholder:text-[var(--cw-ink-faint)] focus:border-[var(--cw-neon)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--cw-neon)_25%,transparent)]";

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
    <div className="rounded-2xl bg-gray-50/80 p-4 border border-gray-100">
      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
        {Icon ? <Icon className="size-3.5 text-gray-400" /> : null}
        {label}
      </span>
      <span className="font-bold text-gray-900 text-lg block mt-1 leading-tight">{value}</span>
      {sub ? <span className="text-xs text-gray-400 block mt-0.5">{sub}</span> : null}
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

function ContentExcerpt({ paragraphs }) {
  const [open, setOpen] = useState(false);
  if (!paragraphs?.length) return null;
  const list = open ? paragraphs : paragraphs.slice(0, 3);
  return (
    <div>
      <span className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Page content</span>
      <div className="space-y-2.5 text-sm text-gray-600 leading-relaxed">
        {list.map((p, i) => <p key={i}>{p}</p>)}
      </div>
      {paragraphs.length > 3 && (
        <button type="button" onClick={() => setOpen(!open)} className="text-sm font-semibold text-emerald-600 hover:underline mt-2">
          {open ? "Show less content" : `Read all ${paragraphs.length} passages`}
        </button>
      )}
    </div>
  );
}

function HeadingOutline({ headings }) {
  const [open, setOpen] = useState(false);
  if (!headings?.length) return <p className="text-sm text-gray-400 italic">No headings detected on the page.</p>;
  const list = open ? headings : headings.slice(0, 6);
  return (
    <div className="space-y-1.5">
      <div className="space-y-1.5">
        {list.map((h, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className={`font-mono font-bold text-[10px] uppercase px-1.5 py-0.5 rounded shrink-0 ${h.tag === "h1" ? "bg-purple-100 text-purple-700" : h.tag === "h2" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>{h.tag}</span>
            <span className="text-gray-800">{h.text}</span>
          </div>
        ))}
      </div>
      {headings.length > 6 && (
        <button type="button" onClick={() => setOpen(!open)} className="text-sm font-semibold text-emerald-600 hover:underline">
          {open ? "Show fewer headings" : `Show all ${headings.length} headings`}
        </button>
      )}
    </div>
  );
}

function KeywordTable({ profile }) {
  const [showAll, setShowAll] = useState(false);
  const [sortBy, setSortBy] = useState("rank");
  if (!profile) return <p className="text-sm text-gray-400 italic">No keyword data available.</p>;
  if (!profile.keywords?.length) return <p className="text-sm text-gray-400 italic">No organic keywords indexed.</p>;
  const sorted = [...profile.keywords].sort((a, b) =>
    sortBy === "rank"
      ? (a.position ?? 9999) - (b.position ?? 9999) || (b.traffic ?? 0) - (a.traffic ?? 0)
      : (b.traffic ?? 0) - (a.traffic ?? 0) || (a.position ?? 9999) - (b.position ?? 9999)
  );
  const capped = sorted.slice(0, 15);
  const list = showAll ? capped : capped.slice(0, 8);
  const tab = (id, label) => (
    <button type="button" onClick={() => setSortBy(id)} className={`rounded-md px-3 py-1 text-xs font-bold transition-colors ${sortBy === id ? "bg-emerald-600 text-white" : "text-gray-600 hover:text-gray-900"}`}>{label}</button>
  );
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <span className="text-base font-extrabold text-gray-900 flex items-center gap-2"><FiList className="size-5 text-emerald-600" /> Top 15 keywords it ranks for</span>
          <span className="text-xs text-gray-400">{profile.relevantCount != null ? `${formatNum(profile.relevantCount)} on-topic · ` : ""}{formatNum(profile.total)} total indexed</span>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">{tab("rank", "Highest rank")}{tab("traffic", "Most traffic")}</div>
      </div>
      {profile.relevantCount === 0 && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          ⚠ Ranks for none of your target terms — a broad publisher/directory, not a direct competitor.
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3.5 py-2.5">Keyword</th>
              <th className="px-3.5 py-2.5 text-center">Rank</th>
              <th className="px-3.5 py-2.5 text-right">Volume</th>
              <th className="px-3.5 py-2.5 text-right">Traffic</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {list.map((k, i) => (
              <tr key={i} className={k.relevant ? "bg-emerald-50/60" : "hover:bg-gray-50"}>
                <td className="px-3.5 py-2.5 font-medium text-gray-800 max-w-[280px] truncate" title={k.keyword}>
                  {k.relevant && <span className="inline-block size-1.5 rounded-full bg-emerald-500 mr-2 align-middle" />}
                  {k.keyword}
                </td>
                <td className="px-3.5 py-2.5 text-center">
                  <span className={`font-bold ${k.position <= 3 ? "text-emerald-700" : k.position <= 10 ? "text-amber-700" : "text-gray-500"}`}>#{k.position}</span>
                </td>
                <td className="px-3.5 py-2.5 text-right text-gray-600">{k.volume != null ? formatNum(k.volume) : "—"}</td>
                <td className="px-3.5 py-2.5 text-right text-gray-600">{k.traffic != null ? formatNum(k.traffic) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {capped.length > 8 && (
        <button type="button" onClick={() => setShowAll(!showAll)} className="text-sm font-semibold text-emerald-600 hover:underline">
          {showAll ? "Show fewer" : `Show top ${capped.length}`}
        </button>
      )}
    </div>
  );
}

/* ---------- deep-dive modal (additional; lazy-loads more backlinks) ---------- */

function CompetitorModal({ item, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [q, setQ] = useState("");
  const [section, setSection] = useState("overview");

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setDetail(null);
    (async () => {
      try {
        const res = await fetch("/api/seo/competitor-backlinks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: item.domain }),
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success) throw new Error(json.error || "Failed to load backlink detail");
        setDetail(json.data);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load backlink detail");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [item]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // Lock background scroll while the modal is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (!item) return null;
  const refs = detail?.refdomains || [];
  const links = detail?.links || [];
  const query = q.trim().toLowerCase();
  const filteredRefs = query ? refs.filter((r) => r.domain.includes(query)) : refs;
  const filteredLinks = query ? links.filter((l) => `${l.sourceUrl} ${l.anchor}`.toLowerCase().includes(query)) : links;

  const headingCount = (item.headings || []).length;
  const anchorCount = item.backlinks?.topAnchors?.length || 0;
  const keywordCount = item.keywordProfile?.keywords?.length || 0;

  // One sidebar entry per thing you'd actually want to compare — no scrolling
  // past four sections to reach the linking pages.
  const sections = [
    { id: "overview", label: "Overview", icon: FiShield },
    { id: "content", label: "Content", icon: FiFileText },
    { id: "outline", label: "Outline", icon: FiList, count: headingCount || undefined, disabled: !headingCount },
    { id: "keywords", label: "Keywords", icon: FiSearch, count: keywordCount || undefined },
    { id: "backlinks", label: "Backlinks", icon: FiLink, count: filteredRefs.length || undefined },
    { id: "pages", label: "Linking pages", icon: FiFileText, count: filteredLinks.length || undefined },
  ];

  const showFilter = section === "backlinks" || section === "pages";

  const statBlock = (
    <div className="grid grid-cols-3 gap-3 rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-5 py-4">
      {[
        {
          v: detail?.summary?.refdomains != null ? detail.summary.refdomains : item.backlinks?.refdomains,
          l: "referring domains",
        },
        {
          v: detail?.summary?.backlinks != null ? detail.summary.backlinks : item.backlinks?.backlinks,
          l: "total backlinks",
        },
        {
          v: detail?.summary?.domainTrust ?? item.backlinks?.domainTrust,
          l: "domain trust",
          suffix: "/100",
        },
      ].map((s) => (
        <div key={s.l}>
          <span className="font-heading block text-3xl leading-none font-semibold tabular-nums text-[var(--cw-ink)]">
            {s.v != null ? formatNum(s.v) : "—"}
            {s.suffix && s.v != null ? (
              <span className="text-base text-[var(--cw-ink-faint)]">{s.suffix}</span>
            ) : null}
          </span>
          <span className="mt-1.5 block text-xs text-[var(--cw-ink-muted)]">{s.l}</span>
        </div>
      ))}
    </div>
  );

  const overlay = (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className="cw-lit my-4 flex max-h-[92vh] w-full max-w-5xl flex-col rounded-3xl border border-[var(--cw-hairline-strong)] bg-[var(--cw-surface)] shadow-[var(--cw-shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--cw-hairline)] p-6">
          <div className="flex min-w-0 items-start gap-4">
            <span
              className={`font-heading inline-flex size-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold tabular-nums ${
                item.isYou
                  ? "bg-[var(--cw-neon)] text-[var(--cw-neon-ink)]"
                  : "border border-[var(--cw-hairline-strong)] bg-[var(--cw-raised)] text-[var(--cw-ink)]"
              }`}
            >
              #{item.position}
            </span>
            <div className="min-w-0">
              <h3 className="font-heading text-xl leading-snug font-semibold text-[var(--cw-ink)]">
                {item.title}
              </h3>
              <a
                href={item.link}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1.5 font-mono text-sm break-all text-[var(--cw-neon)] hover:underline"
              >
                <FiLink className="size-4 shrink-0" />
                {item.domain}
              </a>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl p-2 text-[var(--cw-ink-faint)] transition-smooth hover:bg-[var(--cw-raised)] hover:text-[var(--cw-ink)]"
          >
            <FiX className="size-6" />
          </button>
        </div>

        {/* Body: sidebar nav + section */}
        <div className="flex min-h-0 flex-1 flex-col gap-0 md:flex-row">
          <div className="shrink-0 border-b border-[var(--cw-hairline)] p-3 md:border-r md:border-b-0">
            <SideTabs items={sections} value={section} onChange={setSection} ariaLabel="Competitor profile" />
          </div>

          <div className="min-w-0 flex-1 overflow-y-auto p-6 text-[15px] leading-relaxed text-[var(--cw-ink-dim)]">
            {showFilter ? (
              <div className="sticky -top-6 z-10 -mx-6 mb-5 flex items-center gap-2 border-b border-[var(--cw-hairline)] bg-[var(--cw-surface)] px-6 pt-1 pb-3">
                <FiSearch className="size-4 shrink-0 text-[var(--cw-ink-faint)]" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Filter domains, pages, anchors…"
                  className="w-full rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-4 py-2.5 text-sm text-[var(--cw-ink)] transition-smooth focus:border-[var(--cw-neon)] focus:outline-none"
                />
              </div>
            ) : null}

            {section === "overview" ? (
              <div className="animate-soft-rise space-y-6">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Tile icon={FiFileText} label="Content" value={`${formatNum(item.wordCount)} words`} sub={`~${item.readingTimeMinutes || 1} min`} />
                  <Tile icon={FiList} label="Structure" value={`H1:${item.h1Count} H2:${item.h2Count}`} sub={`${headingCount} headings`} />
                  <Tile icon={FiZap} label="Speed" value={item.speed?.score != null ? `${item.speed.score}/100` : "—"} sub={`LCP ${item.speed?.lcp || "—"}`} />
                  <Tile icon={FiShield} label="Authority" value={item.authority?.score != null ? `${item.authority.score}/10` : "—"} />
                </div>
                {statBlock}
                {item.schemas?.length > 0 && (
                  <div>
                    <span className="mb-1.5 block text-[10px] font-bold tracking-[0.12em] text-[var(--cw-ink-faint)] uppercase">Schema markup</span>
                    <SchemaChips schemas={item.schemas} />
                  </div>
                )}
                {item.metaDescription && (
                  <div>
                    <span className="mb-1.5 block text-[10px] font-bold tracking-[0.12em] text-[var(--cw-ink-faint)] uppercase">Meta description</span>
                    <p className="rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] p-3 text-sm leading-relaxed text-[var(--cw-ink-muted)] italic">
                      &ldquo;{item.metaDescription}&rdquo;
                    </p>
                  </div>
                )}
              </div>
            ) : null}

            {section === "content" ? (
              <div className="animate-soft-rise">
                <ContentExcerpt paragraphs={item.paragraphs} />
              </div>
            ) : null}

            {section === "outline" ? (
              <div className="animate-soft-rise">
                <HeadingOutline headings={item.headings} />
              </div>
            ) : null}

            {section === "keywords" ? (
              <div className="animate-soft-rise">
                <KeywordTable profile={item.keywordProfile} />
              </div>
            ) : null}

            {loading && (section === "backlinks" || section === "pages") ? (
              <p className="py-8 text-center text-base text-[var(--cw-ink-muted)]">
                <FiRefreshCw className="mr-2 inline size-5 animate-spin" />
                Loading full link profile…
              </p>
            ) : null}

            {error && (section === "backlinks" || section === "pages") ? (
              <p className="rounded-xl border border-[color-mix(in_srgb,var(--cw-caution)_35%,transparent)] bg-[color-mix(in_srgb,var(--cw-caution)_9%,transparent)] px-4 py-3 text-sm text-[var(--cw-caution)]">
                Couldn&rsquo;t load deeper backlinks: {error}
              </p>
            ) : null}

            {section === "backlinks" && !loading ? (
              <div className="animate-soft-rise space-y-6">
                <div>
                  <h4 className="font-heading flex items-center justify-between gap-2 text-base font-semibold text-[var(--cw-ink)]">
                    <span className="flex items-center gap-2">
                      <FiLink className="size-5 text-[var(--cw-info)]" /> Referring domains
                    </span>
                    <span className="font-mono text-xs font-normal text-[var(--cw-ink-faint)]">
                      {formatNum(filteredRefs.length)}
                      {detail?.summary?.refdomains ? ` of ${formatNum(detail.summary.refdomains)}` : ""}
                    </span>
                  </h4>
                  {filteredRefs.length ? (
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {filteredRefs.map((r, i) => (
                        <a
                          key={i}
                          href={`https://${r.domain}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between gap-2 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3.5 py-2.5 text-sm transition-smooth hover:border-[color-mix(in_srgb,var(--cw-neon)_35%,transparent)]"
                        >
                          <span className="truncate font-medium text-[var(--cw-ink-dim)]">{r.domain}</span>
                          {r.inlinkRank != null && (
                            <span className="shrink-0 font-mono text-xs font-bold text-[var(--cw-info)]" title="Domain authority">
                              {r.inlinkRank}/100
                            </span>
                          )}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-[var(--cw-ink-faint)]">
                      No referring domains {query ? "match your filter" : "indexed"}.
                    </p>
                  )}
                </div>

                {anchorCount > 0 && (
                  <div>
                    <h4 className="font-heading flex items-center gap-2 text-base font-semibold text-[var(--cw-ink)]">
                      <FiLink className="size-5 text-[var(--cw-info)]" /> Top anchor texts
                    </h4>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.backlinks.topAnchors.map((a, i) => (
                        <span
                          key={i}
                          className="rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-1.5 text-sm text-[var(--cw-ink-dim)]"
                        >
                          {a.anchor}
                          {a.count != null ? (
                            <span className="font-mono text-[var(--cw-ink-faint)]"> ·{formatNum(a.count)}</span>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {section === "pages" && !loading ? (
              <div className="animate-soft-rise">
                <h4 className="font-heading flex items-center gap-2 text-base font-semibold text-[var(--cw-ink)]">
                  <FiFileText className="size-5 text-[var(--cw-info)]" /> Exact linking pages ({formatNum(filteredLinks.length)})
                </h4>
                <p className="mt-0.5 text-sm text-[var(--cw-ink-faint)]">
                  The specific page each backlink comes from — and which page it points to.
                </p>
                {filteredLinks.length ? (
                  <div className="mt-3 space-y-2.5">
                    {filteredLinks.map((l, i) => (
                      <div key={i} className="rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] p-3.5">
                        <a
                          href={l.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-sm font-semibold break-all text-[var(--cw-info)] hover:underline"
                        >
                          {l.sourceUrl}
                        </a>
                        <div className="mt-1.5 flex flex-col gap-x-4 gap-y-1 text-sm text-[var(--cw-ink-muted)] sm:flex-row sm:flex-wrap sm:items-center">
                          {l.anchor && (
                            <span>
                              anchor: <span className="font-medium text-[var(--cw-ink)]">&ldquo;{l.anchor}&rdquo;</span>
                            </span>
                          )}
                          {l.targetUrl && (
                            <span className="inline-flex items-center gap-1 break-all">
                              → links to{" "}
                              <a href={l.targetUrl} target="_blank" rel="noreferrer" className="text-[var(--cw-neon)] hover:underline">
                                {l.targetUrl}
                              </a>
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-[var(--cw-ink-faint)]">
                    No linking pages {query ? "match your filter" : "returned for this domain"}.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(overlay, document.body) : overlay;
}

/* ---------- clean summary card (full depth lives in the modal) ---------- */

function BacklinkSummary({ b }) {
  if (!b) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><FiLink className="size-3.5" /> Backlinks</span>
        <p className="text-xs text-gray-400 italic mt-1">No backlink data indexed for this domain.</p>
      </div>
    );
  }
  const refs = (b.refdomainList || []).slice(0, 6);
  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4 space-y-3">
      <div className="grid grid-cols-3 gap-3 text-center sm:text-left">
        <div><span className="block text-2xl font-bold text-gray-900 leading-none">{b.refdomains != null ? formatNum(b.refdomains) : "—"}</span><span className="text-[11px] text-gray-500">referring domains</span></div>
        <div><span className="block text-2xl font-bold text-gray-900 leading-none">{b.backlinks != null ? formatNum(b.backlinks) : "—"}</span><span className="text-[11px] text-gray-500">backlinks</span></div>
        <div><span className="block text-2xl font-bold text-gray-900 leading-none">{b.domainTrust != null ? b.domainTrust : "—"}<span className="text-sm text-gray-400">/100</span></span><span className="text-[11px] text-gray-500">domain trust</span></div>
      </div>
      {refs.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-blue-100">
          {refs.map((r, i) => (
            <span key={i} className="text-[11px] px-2 py-0.5 rounded-md bg-white border border-blue-200 text-blue-800">{r.domain}{r.inlinkRank != null && <span className="text-blue-400 font-bold ml-1">{r.inlinkRank}</span>}</span>
          ))}
          <span className="text-[11px] text-gray-400 self-center">…more in full profile</span>
        </div>
      ) : b.refError ? (
        <p className="text-[11px] text-amber-700 pt-1 border-t border-blue-100">{b.refError}</p>
      ) : null}
    </div>
  );
}

function DetailCard({ item, onDetails }) {
  const isYou = item.isYou;
  const relTag = item.relation === "above" ? { label: "Above you", cls: "bg-red-100 text-red-700", icon: FiArrowUp }
    : item.relation === "below" ? { label: "Below you", cls: "bg-emerald-100 text-emerald-700", icon: FiArrowDown }
    : null;
  const broad = !isYou && item.keywordProfile?.keywords?.length > 3 && item.keywordProfile.relevantCount === 0;
  const frame = isYou ? "border-emerald-300 bg-emerald-50/40 ring-1 ring-emerald-500/20" : "border-gray-200 bg-white";
  const topKw = (item.keywordProfile?.keywords || []).slice(0, 4);

  return (
    <div className={`rounded-3xl border p-6 space-y-5 shadow-sm ${frame}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-gray-100">
        <div className="flex items-start gap-4 min-w-0">
          <span className={`inline-flex items-center justify-center rounded-2xl font-bold text-base size-12 shrink-0 ${isYou ? "bg-emerald-600 text-white" : "bg-gray-900 text-white"}`}>
            #{item.position}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {isYou && <span className="text-[10px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full">YOU</span>}
              {relTag && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${relTag.cls}`}><relTag.icon className="size-3" />{relTag.label}</span>}
              {broad && <span className="text-[10px] font-bold bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full" title="Ranks for none of your target terms">BROAD SITE</span>}
            </div>
            <h4 className="font-bold text-base text-gray-900 leading-snug">{item.title}</h4>
            <a href={item.link} target="_blank" rel="noreferrer" className="text-sm text-emerald-600 hover:underline inline-flex items-center gap-1.5 font-medium mt-1">
              <FiLink className="size-3.5 shrink-0" /><span className="truncate max-w-xs sm:max-w-md">{item.domain}</span>
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

      {!item.scanned && <p className="text-xs text-amber-600 italic">On-page scan was blocked — metrics may be partial.</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile icon={FiFileText} label="Content" value={`${formatNum(item.wordCount)} words`} sub={`~${item.readingTimeMinutes} min read`} />
        <Tile icon={FiList} label="Structure" value={`H1:${item.h1Count} H2:${item.h2Count}`} sub={`${item.headings.length} headings`} />
        <Tile icon={FiClock} label="Core Vitals" value={`LCP ${item.speed?.lcp || "—"}`} sub={`CLS ${item.speed?.cls || "—"}`} />
        <Tile icon={FiImage} label="Images" value={`${item.totalImages}`} sub={`${item.imagesWithAlt} with alt`} />
      </div>

      <BacklinkSummary b={item.backlinks} />

      {item.metaDescription && (
        <p className="text-sm text-gray-600 italic border-l-2 border-gray-200 pl-3 leading-relaxed">&ldquo;{item.metaDescription}&rdquo;</p>
      )}

      {topKw.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Also ranks for</span>
          {topKw.map((k, i) => (
            <span key={i} className={`text-xs px-2.5 py-1 rounded-lg border ${k.relevant ? "bg-emerald-50 text-emerald-800 border-emerald-100" : "bg-gray-50 text-gray-600 border-gray-100"}`}>{k.keyword} <span className="text-gray-400 font-semibold">#{k.position}</span></span>
          ))}
        </div>
      )}

      {onDetails && (
        <button
          type="button"
          onClick={() => onDetails(item)}
          className="w-full flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 py-3 text-sm font-bold text-emerald-700 hover:bg-emerald-100 transition-colors"
        >
          <FiLayers className="size-4" /> View full profile — content, all keywords{item.backlinks?.refdomains ? ` & ${formatNum(item.backlinks.refdomains)} referring domains` : ""}
        </button>
      )}
    </div>
  );
}

/* ---------- competitor grid card ----------
   The scannable unit: one rival, its rank, and the six numbers you'd actually
   compare across a row of them. Depth lives in the modal — the whole card is
   the button that opens it. */

function CardStat({ label, value, sub, tone }) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-2.5 py-2">
      <span className="block truncate text-[9px] font-bold tracking-[0.1em] text-[var(--cw-ink-faint)] uppercase">
        {label}
      </span>
      <span
        className={`font-heading mt-0.5 block truncate text-[15px] leading-none font-semibold tabular-nums ${
          tone || "text-[var(--cw-ink)]"
        }`}
      >
        {value}
      </span>
      {sub ? (
        <span className="mt-0.5 block truncate text-[10px] text-[var(--cw-ink-faint)]">{sub}</span>
      ) : null}
    </div>
  );
}

function CompetitorCard({ item, onDetails }) {
  const isYou = item.isYou;
  const speed = item.speed?.score;
  const speedTone =
    speed == null
      ? undefined
      : speed >= 90
        ? "text-[var(--cw-neon)]"
        : speed >= 50
          ? "text-[var(--cw-caution)]"
          : "text-[var(--cw-danger)]";
  const broad =
    !isYou && item.keywordProfile?.keywords?.length > 3 && item.keywordProfile.relevantCount === 0;
  const topKw = (item.keywordProfile?.keywords || []).slice(0, 3);

  return (
    <button
      type="button"
      onClick={() => onDetails?.(item)}
      className={`group cw-lit hover-lift flex h-full flex-col rounded-2xl border p-4 text-left transition-smooth ${
        isYou
          ? "border-[color-mix(in_srgb,var(--cw-neon)_45%,transparent)] bg-[color-mix(in_srgb,var(--cw-neon)_7%,var(--cw-surface))]"
          : "border-[var(--cw-hairline)] bg-[var(--cw-surface)]"
      }`}
    >
      {/* Rank + identity */}
      <div className="flex items-start gap-3">
        <span
          className={`font-heading inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold tabular-nums ${
            isYou
              ? "bg-[var(--cw-neon)] text-[var(--cw-neon-ink)]"
              : "border border-[var(--cw-hairline-strong)] bg-[var(--cw-raised)] text-[var(--cw-ink)]"
          }`}
        >
          #{item.position}
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            {isYou ? (
              <span className="rounded-full bg-[var(--cw-neon)] px-2 py-0.5 text-[9px] font-bold text-[var(--cw-neon-ink)]">
                YOU
              </span>
            ) : null}
            {broad ? (
              <span
                className="rounded-full bg-[var(--cw-raised)] px-2 py-0.5 text-[9px] font-bold text-[var(--cw-ink-muted)]"
                title="Ranks for none of your target terms"
              >
                BROAD SITE
              </span>
            ) : null}
            {!item.scanned ? (
              <span
                className="rounded-full bg-[color-mix(in_srgb,var(--cw-caution)_15%,transparent)] px-2 py-0.5 text-[9px] font-bold text-[var(--cw-caution)]"
                title="On-page scan was blocked — metrics may be partial"
              >
                PARTIAL SCAN
              </span>
            ) : null}
          </div>
          <h4 className="line-clamp-2 text-[13px] leading-snug font-semibold text-[var(--cw-ink)]">
            {item.title}
          </h4>
          <span className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-[var(--cw-neon)]">
            <FiLink className="size-3 shrink-0" />
            <span className="truncate">{item.domain}</span>
          </span>
        </div>
      </div>

      {/* The six numbers */}
      <div className="mt-3.5 grid grid-cols-3 gap-1.5">
        <CardStat label="Words" value={formatNum(item.wordCount)} sub={`~${item.readingTimeMinutes || 1} min`} />
        <CardStat label="Headings" value={item.headings?.length ?? 0} sub={`H1:${item.h1Count} H2:${item.h2Count}`} />
        <CardStat label="Speed" value={speed != null ? speed : "—"} sub={`LCP ${item.speed?.lcp || "—"}`} tone={speedTone} />
        <CardStat label="Authority" value={item.authority?.score != null ? `${item.authority.score}/10` : "—"} />
        <CardStat label="Ref. domains" value={item.backlinks?.refdomains != null ? formatNum(item.backlinks.refdomains) : "—"} />
        <CardStat label="Backlinks" value={item.backlinks?.backlinks != null ? formatNum(item.backlinks.backlinks) : "—"} />
      </div>

      {topKw.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {topKw.map((k, i) => (
            <span
              key={i}
              className={`max-w-full truncate rounded-lg border px-2 py-0.5 text-[10px] ${
                k.relevant
                  ? "border-[color-mix(in_srgb,var(--cw-neon)_30%,transparent)] bg-[color-mix(in_srgb,var(--cw-neon)_9%,transparent)] text-[var(--cw-neon-soft)]"
                  : "border-[var(--cw-hairline)] bg-[var(--cw-raised)] text-[var(--cw-ink-muted)]"
              }`}
              title={k.keyword}
            >
              {k.keyword} <span className="font-mono text-[var(--cw-ink-faint)]">#{k.position}</span>
            </span>
          ))}
        </div>
      ) : null}

      <span className="mt-auto flex items-center justify-between gap-2 pt-3.5 text-[11px] font-bold text-[var(--cw-ink-muted)] transition-smooth group-hover:text-[var(--cw-neon)]">
        <span className="inline-flex items-center gap-1.5">
          <FiLayers className="size-3.5" /> Full profile
        </span>
        <FiChevronRight className="size-3.5" />
      </span>
    </button>
  );
}

/** A titled grid of competitor cards. */
function CompetitorGroup({ title, hint, icon: Icon, iconTone, items, onDetails }) {
  if (!items?.length) return null;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h3 className="font-heading flex items-center gap-2.5 text-base font-semibold text-[var(--cw-ink)]">
          {Icon ? <Icon className={`size-5 ${iconTone || "text-[var(--cw-neon)]"}`} /> : null}
          {title}
        </h3>
        <span className="font-mono text-[11px] text-[var(--cw-ink-faint)]">
          {items.length} {items.length === 1 ? "site" : "sites"}
        </span>
        {hint ? <span className="text-xs text-[var(--cw-ink-muted)]">· {hint}</span> : null}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((c, i) => (
          <CompetitorCard key={`${c.domain}-${c.position}-${i}`} item={c} onDetails={onDetails} />
        ))}
      </div>
    </section>
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
    <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-base text-gray-900 flex items-center gap-2"><FiBarChart2 className="size-5 text-emerald-600" /> Keyword Metrics</h3>
        <span className="font-mono text-[11px] tracking-wide text-[var(--cw-ink-faint)] uppercase">
          Keyword data · {String(metrics.source || "us").toUpperCase()}
          {metrics.fromCache ? " · cached" : ""}
        </span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 p-5">
          <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide flex items-center gap-1.5"><FiSearch className="size-3.5" /> Search Volume</span>
          <span className="block text-3xl font-bold text-gray-900 mt-1.5 leading-none">{metrics.volume != null ? formatNum(metrics.volume) : "—"}</span>
          <span className="text-xs text-gray-400 mt-1 block">searches / month</span>
        </div>
        <div className="rounded-2xl bg-gray-50/80 border border-gray-100 p-5">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Difficulty</span>
          <div className="flex items-baseline gap-1.5 mt-1.5"><span className="text-3xl font-bold text-gray-900 leading-none">{metrics.difficulty != null ? metrics.difficulty : "—"}</span><span className="text-sm text-gray-400">/100</span></div>
          <span className={`mt-2 inline-block text-[11px] font-bold px-2 py-0.5 rounded-md ${band.cls}`}>{band.label}</span>
        </div>
        <div className="rounded-2xl bg-gray-50/80 border border-gray-100 p-5">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><FiDollarSign className="size-3.5" /> CPC</span>
          <span className="block text-3xl font-bold text-gray-900 mt-1.5 leading-none">{metrics.cpcFormatted || (metrics.cpc != null ? `$${metrics.cpc}` : "—")}</span>
          <span className="text-xs text-gray-400 mt-1 block">avg cost per click</span>
        </div>
        <div className="rounded-2xl bg-gray-50/80 border border-gray-100 p-5">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><FiTrendingUp className="size-3.5" /> Competition</span>
          <span className="block text-2xl font-bold text-gray-900 mt-1.5 capitalize leading-none">{metrics.competitionLevel ? metrics.competitionLevel.toLowerCase() : "—"}</span>
          <span className="text-xs text-gray-400 mt-1 block capitalize">trend: {metrics.trendDirection || "stable"}</span>
        </div>
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
  /**
   * The analysis only uses "your site" to locate your own rank and pick the
   * rivals immediately around you — everything else (the ladder, top rankers,
   * keyword metrics) is site-independent. So an override here is safe: leave it
   * blank to analyse as the selected client, or type any domain to research a
   * SERP in someone else's context. Blank on both simply means no "you" row.
   */
  const [siteOverride, setSiteOverride] = useState("");
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("");
  const [device, setDevice] = useState("desktop");
  const [geo, setGeo] = useState("us");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedError, setSeedError] = useState("");
  const [seedResult, setSeedResult] = useState(null);
  const [modalItem, setModalItem] = useState(null);

  /** Typed domain wins; otherwise the client selected in the sidebar. */
  const analysisSite = siteOverride.trim() || selectedSite || "";
  const [pdfBusy, setPdfBusy] = useState(false);

  const handleExportPdf = async () => {
    if (!data || pdfBusy) return;
    setPdfBusy(true);
    try {
      await downloadSerpReportPdf(data);
    } catch (err) {
      setError(`PDF export failed: ${err.message || "unknown error"}`);
    } finally {
      setPdfBusy(false);
    }
  };

  const handleGenerateSeeds = async () => {
    if (!data?.keyword) return;
    setSeedLoading(true);
    setSeedError("");
    setSeedResult(null);
    try {
      const res = await fetch("/api/seo/competitor-seeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: data.keyword, siteUrl: analysisSite, geo, device, location: location.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to generate blog ideas");
      setSeedResult(json);
    } catch (err) {
      setSeedError(err.message || "Failed to generate blog ideas");
    } finally {
      setSeedLoading(false);
    }
  };

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
        body: JSON.stringify({ keyword: keyword.trim(), siteUrl: analysisSite, location: location.trim(), device, geo, refresh: force }),
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
      <form
        onSubmit={handleAnalyze}
        className="cw-lit space-y-4 rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-5"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-1.5 md:col-span-2">
            <label className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] text-[var(--cw-ink-faint)] uppercase">
              <FiSearch className="size-3.5 text-[var(--cw-neon)]" /> Target keyword or phrase
            </label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="e.g. dallas email marketing"
              className={SERP_INPUT}
            />
          </div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] text-[var(--cw-ink-faint)] uppercase">
              <FiMapPin className="size-3.5 text-[var(--cw-neon)]" /> Location
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Blank = detected from your keyword"
              className={SERP_INPUT}
            />
          </div>
          <div className="space-y-1.5 md:col-span-3">
            <label className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] text-[var(--cw-ink-faint)] uppercase">
              <FiUser className="size-3.5 text-[var(--cw-neon)]" /> Analyse for domain
            </label>
            <input
              type="text"
              value={siteOverride}
              onChange={(e) => setSiteOverride(e.target.value)}
              placeholder={
                selectedSite
                  ? `Blank = ${selectedSite} (the selected client)`
                  : "e.g. example.com — leave blank to just study the SERP"
              }
              className={SERP_INPUT}
            />
            <p className="text-[11px] text-[var(--cw-ink-faint)]">
              Only used to find that domain&rsquo;s own rank and the rivals around it. The ladder,
              top rankers and keyword metrics are the same either way.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <TabRail
              size="sm"
              tabs={[
                { id: "desktop", label: "Desktop", icon: FiMonitor },
                { id: "mobile", label: "Mobile", icon: FiSmartphone },
              ]}
              value={device}
              onChange={setDevice}
              ariaLabel="Device"
            />
            <select
              value={geo}
              onChange={(e) => setGeo(e.target.value)}
              className="rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-2.5 py-2 text-xs font-semibold text-[var(--cw-ink-dim)] transition-smooth focus:border-[var(--cw-neon)] focus:outline-none"
              title="Region for SERP & keyword database"
            >
              {GEO_OPTIONS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
            {analysisSite ? (
              <span
                className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--cw-ink-muted)]"
                title={siteOverride.trim() ? "Manual override" : "Selected client"}
              >
                <FiUser className="size-3.5 text-[var(--cw-neon)]" />
                {analysisSite}
                {siteOverride.trim() ? (
                  <span className="rounded bg-[color-mix(in_srgb,var(--cw-neon)_14%,transparent)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--cw-neon)]">
                    OVERRIDE
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="font-mono text-[11px] text-[var(--cw-ink-faint)]">
                no site — SERP only
              </span>
            )}
          </div>
          <Btn type="submit" variant="primary" size="lg" icon={FiZap} loading={loading} disabled={loading}>
            Analyze SERP
          </Btn>
        </div>
      </form>

      {loading && (
        <div className="rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-8 text-center text-sm text-[var(--cw-ink-muted)]">
          <FiRefreshCw className="mx-auto mb-3 size-6 animate-spin text-[var(--cw-neon)]" />
          Paging through the live SERP and auditing ranking pages (content, keywords, backlinks)…
          this can take 30–60s.
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
              <button type="button" onClick={handleExportPdf} disabled={pdfBusy} title="Download this analysis as a designed PDF" className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                {pdfBusy ? <FiRefreshCw className="size-3 animate-spin" /> : <FiDownload className="size-3" />} {pdfBusy ? "Building PDF…" : "Download PDF"}
              </button>
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
              <DetailCard item={data.you} onDetails={setModalItem} />
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

          {/* 3b. Generate competitor blog ideas → Studio */}
          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50/60 to-white p-5 space-y-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FiEdit3 className="size-5 text-emerald-600" />
                <div>
                  <h3 className="font-bold text-sm text-gray-900">Turn this into content that outranks them</h3>
                  <p className="text-xs text-gray-500">Generate 5 unique blog ideas from this SERP and send them to Blog Automation Studio → Competitor seeds.</p>
                </div>
              </div>
              <button type="button" onClick={handleGenerateSeeds} disabled={seedLoading} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-md hover:bg-emerald-700 disabled:opacity-50">
                {seedLoading ? <FiRefreshCw className="size-4 animate-spin" /> : <FiZap className="size-4" />}
                {seedLoading ? "Generating…" : "Generate 5 blog ideas"}
              </button>
            </div>
            {seedError && <p className="text-xs text-red-600">{seedError}</p>}
            {seedResult && (
              <div className="space-y-2 pt-1">
                <p className="text-xs font-semibold text-emerald-800 inline-flex items-center gap-1">
                  <FiCheckCircle className="size-3.5" /> {seedResult.count} ideas saved to Blog Automation Studio → Competitor seeds. Open the Studio to run them into full blogs.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {seedResult.seeds.map((s, i) => (
                    <div key={s.id || i} className="rounded-xl border border-gray-200 bg-white p-3">
                      <p className="font-bold text-xs text-gray-900">{i + 1}. {s.title || s.topic}</p>
                      {s.payload?.why && <p className="text-[11px] text-gray-600 mt-1">{s.payload.why}</p>}
                      {s.payload?.mustFollowKeywords && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {String(s.payload.mustFollowKeywords).split(/\n+/).filter(Boolean).slice(0, 4).map((k, j) => (
                            <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-100 text-emerald-800">{k}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 4. Rivals, split by whether they beat you — cards side by side */}
          <CompetitorGroup
            title="Above us"
            hint="outranking you right now"
            icon={FiArrowUp}
            iconTone="text-[var(--cw-danger)]"
            items={(data.directCompetitors || []).filter((c) => c.relation === "above")}
            onDetails={setModalItem}
          />

          <CompetitorGroup
            title="Below us"
            hint="you outrank these"
            icon={FiArrowDown}
            iconTone="text-[var(--cw-neon)]"
            items={(data.directCompetitors || []).filter((c) => c.relation === "below")}
            onDetails={setModalItem}
          />

          {/* Any rival without a clear relation still gets a home. */}
          <CompetitorGroup
            title="Direct competitors"
            hint="nearest real rivals"
            icon={FiUser}
            items={(data.directCompetitors || []).filter(
              (c) => c.relation !== "above" && c.relation !== "below"
            )}
            onDetails={setModalItem}
          />

          {/* 5. Top rankers */}
          <CompetitorGroup
            title="Top ranking"
            hint="strongest sites on this SERP"
            icon={FiAward}
            iconTone="text-[var(--cw-caution)]"
            items={data.topRankers}
            onDetails={setModalItem}
          />

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

      {modalItem && <CompetitorModal item={modalItem} onClose={() => setModalItem(null)} />}
    </SeoPanelShell>
  );
}
