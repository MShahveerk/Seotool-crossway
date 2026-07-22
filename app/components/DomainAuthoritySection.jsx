"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  FiAward,
  FiRefreshCw,
  FiInfo,
  FiPlus,
  FiX,
  FiTrendingUp,
  FiGlobe,
  FiKey,
  FiExternalLink,
} from "react-icons/fi";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { isMetaPageId } from "../../lib/siteAccess";

function siteHost(url) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return String(url).replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || "";
  }
}

function scoreTone(score) {
  if (score == null) return { text: "text-gray-400", bg: "bg-gray-50", bar: "#d1d5db", label: "No data" };
  if (score >= 6) return { text: "text-emerald-700", bg: "bg-emerald-50", bar: "#1d9c35", label: "Strong" };
  if (score >= 4) return { text: "text-lime-700", bg: "bg-lime-50", bar: "#84cc16", label: "Established" };
  if (score >= 2.5) return { text: "text-amber-700", bg: "bg-amber-50", bar: "#f59e0b", label: "Growing" };
  return { text: "text-red-700", bg: "bg-red-50", bar: "#ef4444", label: "Early stage" };
}

/* ------------------------------- score dial -------------------------------- */

function ScoreDial({ score }) {
  const value = typeof score === "number" ? Math.max(0, Math.min(10, score)) : null;
  const radius = 62;
  const stroke = 11;
  const r = radius - stroke / 2;
  const circumference = 2 * Math.PI * r;
  const offset = value == null ? circumference : circumference - (value / 10) * circumference;
  const tone = scoreTone(value);

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[132px] w-[132px]">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 132 132" aria-hidden>
          <circle cx="66" cy="66" r={r} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
          <circle
            cx="66"
            cy="66"
            r={r}
            fill="none"
            stroke={tone.bar}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-4xl font-bold tabular-nums ${tone.text}`}>
            {value == null ? "—" : value.toFixed(1)}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">/ 10</span>
        </div>
      </div>
      <p className="mt-2 text-sm font-bold text-gray-900">Authority Score</p>
      <span className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone.bg} ${tone.text}`}>
        {tone.label}
      </span>
    </div>
  );
}

/* ----------------------------------- main ----------------------------------- */

export default function DomainAuthoritySection({ selectedSite = "" }) {
  const { data: session } = useSession();
  const hasGlobalAccess = session?.user?.role === "super_admin" || session?.user?.role === "smm";
  const userSiteLink = session?.user?.siteLink || "";
  const effectiveSite = hasGlobalAccess ? selectedSite || userSiteLink : userSiteLink;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [competitors, setCompetitors] = useState([]);
  const [competitorInput, setCompetitorInput] = useState("");
  const [comparing, setComparing] = useState(false);

  const needsWebsite = useMemo(() => {
    if (!effectiveSite) return true;
    if (String(effectiveSite).startsWith("http") || String(effectiveSite).startsWith("sc-domain:")) return false;
    return isMetaPageId(effectiveSite);
  }, [effectiveSite]);

  const load = useCallback(
    async (competitorList = []) => {
      if (!effectiveSite || needsWebsite) {
        setLoading(false);
        setData(null);
        return;
      }
      if (competitorList.length) setComparing(true);
      else setLoading(true);
      setError("");
      try {
        const q = new URLSearchParams({ url: effectiveSite });
        if (competitorList.length) q.set("competitors", competitorList.join(","));
        const res = await fetch(`/api/authority?${q.toString()}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Failed to load authority data");
        setData(body);
      } catch (err) {
        setError(err.message || "Failed to load authority data");
      } finally {
        setLoading(false);
        setComparing(false);
      }
    },
    [effectiveSite, needsWebsite]
  );

  useEffect(() => {
    setData(null);
    setCompetitors([]);
    setCompetitorInput("");
    load();
  }, [load]);

  const addCompetitor = () => {
    const cleaned = competitorInput
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0];
    if (!cleaned || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(cleaned)) return;
    if (competitors.includes(cleaned) || cleaned === data?.domain || competitors.length >= 5) return;
    const next = [...competitors, cleaned];
    setCompetitors(next);
    setCompetitorInput("");
    load(next);
  };

  const removeCompetitor = (domain) => {
    const next = competitors.filter((d) => d !== domain);
    setCompetitors(next);
    load(next);
  };

  const host = data?.domain || siteHost(effectiveSite);

  const trendData = (data?.trend || [])
    .filter((t) => t.score != null)
    .map((t) => ({
      date: new Date(t.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      score: t.score,
    }));

  const comparisonData = useMemo(() => {
    if (!data) return [];
    const rows = [{ domain: data.domain, score: data.score ?? 0, self: true }];
    for (const c of data.competitors || []) rows.push({ domain: c.domain, score: c.score ?? 0, self: false });
    return rows.sort((a, b) => b.score - a.score);
  }, [data]);

  if (needsWebsite) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center min-h-[calc(100vh-2rem)] flex flex-col items-center justify-center">
        <FiAward className="w-10 h-10 text-gray-300 mb-4" aria-hidden />
        <p className="text-sm text-gray-600 max-w-md">
          Select a website from the client dropdown to view its Domain Authority. Meta-only pages need a linked
          website URL.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 min-h-[calc(100vh-2rem)]">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h2 className="text-[26px] font-semibold text-gray-900">Domain Authority</h2>
          <p className="text-sm text-gray-600 mt-1.5 max-w-2xl">
            How strong this domain's link profile is on a 0–10 scale (Open PageRank, built from Common Crawl backlink
            data — comparable to Ahrefs DR / Moz DA). Scores refresh daily for every website in the system.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(competitors)}
          disabled={loading || comparing}
          className="inline-flex shrink-0 items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <FiRefreshCw className={`w-4 h-4 ${loading || comparing ? "animate-spin" : ""}`} aria-hidden />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="mb-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <FiInfo className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-gray-300 border-t-[#1d9c35]" />
          <p className="text-sm text-gray-500">Loading authority data…</p>
        </div>
      ) : data && !data.configured ? (
        /* ------------------------- setup required state ------------------------- */
        <div className="mx-auto max-w-2xl py-16">
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-8 text-center">
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm">
              <FiKey className="h-8 w-8 text-amber-600" aria-hidden />
            </span>
            <h3 className="mt-4 text-lg font-bold text-gray-900">One-time setup needed</h3>
            <p className="mt-2 text-sm text-gray-600 leading-relaxed">
              Domain Authority uses the Open PageRank API from Keywords Everywhere (free tier: 30,000 domains/month).
              Create a Bearer key on their dashboard — it takes two minutes:
            </p>
            <ol className="mt-5 space-y-3 text-left text-sm text-gray-700">
              {[
                <>
                  Sign in at{" "}
                  <a
                    href="https://openpagerank.keywordseverywhere.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-[#1d9c35] hover:underline inline-flex items-center gap-1"
                  >
                    openpagerank.keywordseverywhere.com <FiExternalLink className="h-3 w-3" aria-hidden />
                  </a>{" "}
                  (Keywords Everywhere account) and copy your API key — it starts with{" "}
                  <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px] border border-amber-200">
                    opr_live_
                  </code>
                </>,
                <>
                  Add it to the server environment as{" "}
                  <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[12px] border border-amber-200">
                    OPENPAGERANK_API_KEY
                  </code>{" "}
                  (sent as{" "}
                  <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px] border border-amber-200">
                    Authorization: Bearer …
                  </code>
                  )
                </>,
                <>Restart the app — scores will appear here and refresh automatically every day at 4:30 AM.</>,
              ].map((step, idx) => (
                <li key={idx} className="flex gap-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
                    {idx + 1}
                  </span>
                  <span className="leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : data ? (
        <div className="space-y-8">
          {/* Overview */}
          <section className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-5 items-stretch">
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)] flex items-center justify-center lg:min-w-[220px]">
              <ScoreDial score={data.score} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  <FiGlobe className="h-3.5 w-3.5" aria-hidden />
                  Domain
                </p>
                <p className="mt-2 text-xl font-bold text-gray-900 break-all">{host}</p>
                {!data.found ? (
                  <p className="mt-1 text-xs text-amber-700">
                    Not in the Open PageRank index yet — common for very new sites. Scores appear once the domain
                    accumulates crawlable backlinks.
                  </p>
                ) : null}
              </div>
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  <FiTrendingUp className="h-3.5 w-3.5" aria-hidden />
                  Global rank
                </p>
                <p className="mt-2 text-xl font-bold tabular-nums text-gray-900">
                  {data.globalRank ? `#${data.globalRank.toLocaleString()}` : "—"}
                </p>
                <p className="mt-1 text-xs text-gray-400">Position among all ranked domains worldwide</p>
              </div>
              <div className="sm:col-span-2 rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50 to-white p-5">
                <p className="text-xs text-gray-600 leading-relaxed">
                  <span className="font-bold text-gray-800">How to grow this score:</span> earn links from
                  reputable, topically related websites — guest posts, digital PR, local directories/chambers,
                  supplier &amp; partner pages, and genuinely link-worthy content (guides, tools, original data).
                  Authority moves slowly; expect changes over months, not days.
                </p>
              </div>
            </div>
          </section>

          {/* Trend */}
          {trendData.length >= 2 ? (
            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-3">
                Authority trend (last 90 days)
              </p>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 5, right: 5, bottom: 0, left: -22 }}>
                    <defs>
                      <linearGradient id="authorityGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1d9c35" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#1d9c35" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
                      formatter={(v) => [`${v} / 10`, "Authority"]}
                    />
                    <Area type="monotone" dataKey="score" stroke="#1d9c35" strokeWidth={2.5} fill="url(#authorityGrad)" dot={{ r: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>
          ) : (
            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Authority trend</p>
              <p className="mt-2 text-sm text-gray-500">
                The trend chart builds up as daily snapshots accumulate — check back in a few days.
              </p>
            </section>
          )}

          {/* Competitor comparison */}
          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Competitor comparison</p>
                <p className="mt-0.5 text-xs text-gray-400">Benchmark this domain against up to 5 competitors</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={competitorInput}
                  onChange={(e) => setCompetitorInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCompetitor();
                    }
                  }}
                  placeholder="competitor.com"
                  className="w-52 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#1d9c35] focus:bg-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={addCompetitor}
                  disabled={comparing || competitors.length >= 5}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1d9c35] px-3 py-2 text-sm font-semibold text-white hover:bg-[#178a2c] disabled:opacity-50"
                >
                  <FiPlus className="h-4 w-4" aria-hidden />
                  Compare
                </button>
              </div>
              {competitors.map((d) => (
                <span
                  key={d}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700"
                >
                  {d}
                  <button type="button" onClick={() => removeCompetitor(d)} className="text-gray-400 hover:text-red-500">
                    <FiX className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </span>
              ))}
            </div>

            {comparing ? (
              <div className="mt-6 flex items-center gap-2 text-sm text-gray-500">
                <FiRefreshCw className="h-4 w-4 animate-spin" aria-hidden />
                Fetching competitor scores…
              </div>
            ) : comparisonData.length > 1 ? (
              <div className="mt-6 h-[60px]" style={{ height: comparisonData.length * 52 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparisonData} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 10 }}>
                    <XAxis type="number" domain={[0, 10]} hide />
                    <YAxis
                      type="category"
                      dataKey="domain"
                      width={160}
                      tick={{ fontSize: 12, fill: "#374151", fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
                      formatter={(v) => [`${Number(v).toFixed(1)} / 10`, "Authority"]}
                      cursor={{ fill: "rgba(0,0,0,0.03)" }}
                    />
                    <Bar dataKey="score" radius={[0, 8, 8, 0]} barSize={22} label={{ position: "right", fontSize: 12, fill: "#6b7280", formatter: (v) => Number(v).toFixed(1) }}>
                      {comparisonData.map((row) => (
                        <Cell key={row.domain} fill={row.self ? "#1d9c35" : "#cbd5e1"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="mt-6 text-sm text-gray-400">Add a competitor domain above to see the comparison.</p>
            )}
          </section>

          {/* Explainer */}
          <section className="rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50 to-white p-5">
            <p className="flex items-start gap-1.5 text-xs text-gray-500 leading-relaxed">
              <FiInfo className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gray-400" aria-hidden />
              Open PageRank scores (0–10, logarithmic) are computed from Common Crawl's web-wide link graph — the same
              concept behind Ahrefs DR and Moz DA, so use it for relative comparisons rather than exact equivalence.
              Going from 2 → 3 is much easier than 6 → 7. Scores refresh daily at 4:30 AM for every website in the
              system, building the trend history automatically.
            </p>
          </section>
        </div>
      ) : null}
    </div>
  );
}
