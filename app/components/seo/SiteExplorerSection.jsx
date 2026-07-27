"use client";

import { useEffect, useState } from "react";
import {
  FiGlobe,
  FiExternalLink,
  FiInfo,
  FiCompass,
  FiSearch,
} from "react-icons/fi";
import SeoPanelShell, { formatNum } from "./SeoPanelShell";
import ReportSectionActions from "../ReportSectionActions";
import { useSiteExplorerFetch } from "./useSiteExplorerFetch";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "pages", label: "Indexed pages" },
  { id: "subdomains", label: "Subdomains" },
  { id: "referring", label: "Referring domains" },
];

function hostFromSite(site) {
  if (!site) return "";
  try {
    const u = site.startsWith("http") || site.startsWith("sc-domain:") ? site : `https://${site}`;
    if (u.startsWith("sc-domain:")) return u.replace("sc-domain:", "").trim();
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return String(site).replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || "";
  }
}

function StatCard({ label, value, sub, accent = "border-gray-200" }) {
  return (
    <div className={`rounded-xl border ${accent} bg-white p-4 shadow-sm`}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900 tabular-nums">{value}</p>
      {sub ? <p className="mt-1 text-xs text-gray-500 leading-relaxed">{sub}</p> : null}
    </div>
  );
}

function formatFetchedAt(value) {
  if (!value) return "Never";
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(value);
  }
}

function BreakdownList({ title, data, limit = 6 }) {
  const entries = Object.entries(data || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  if (!entries.length) return null;
  const total = entries.reduce((sum, [, n]) => sum + n, 0) || 1;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{title}</p>
      <ul className="mt-3 space-y-2">
        {entries.map(([key, count]) => (
          <li key={key} className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-gray-700">{key}</span>
            <span className="shrink-0 font-semibold tabular-nums text-gray-900">
              {formatNum(count)}{" "}
              <span className="text-xs font-normal text-gray-400">({Math.round((count / total) * 100)}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SiteExplorerSection({ selectedSite = "" }) {
  const [tab, setTab] = useState("overview");
  const [page, setPage] = useState(1);
  const [domainInput, setDomainInput] = useState("");
  const [activeDomain, setActiveDomain] = useState("");
  const [pendingAnalyze, setPendingAnalyze] = useState(false);
  const pageSize = 50;

  useEffect(() => {
    const host = hostFromSite(selectedSite);
    if (host && !activeDomain) {
      setDomainInput(host);
      setActiveDomain(host);
    }
  }, [selectedSite, activeDomain]);

  const { data, loading, refreshing, error, load } = useSiteExplorerFetch({
    selectedSite: activeDomain ? "" : selectedSite,
    exploreDomain: activeDomain,
    view: tab,
    page,
    pageSize,
  });

  useEffect(() => {
    if (pendingAnalyze && activeDomain) {
      setPendingAnalyze(false);
      load(true);
    }
  }, [pendingAnalyze, activeDomain, load]);

  const runAnalyze = () => {
    const d = domainInput
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0];
    if (!d) return;
    setActiveDomain(d);
    setPendingAnalyze(true);
  };

  useEffect(() => {
    setPage(1);
  }, [tab, activeDomain]);

  const overview = data?.overview || {
    indexedUrls: 0,
    subdomains: 0,
    referringDomains: 0,
    http200Rate: null,
    statusBreakdown: {},
    mimeBreakdown: {},
    lastCapture: null,
  };
  const authority = data?.authority;
  const displayDomain = data?.domain || activeDomain;

  return (
    <SeoPanelShell
      title="Site Explorer"
      eyebrow=""
      siteUrl={displayDomain ? `https://${displayDomain}` : undefined}
      description="Explore any domain — Open PageRank for DA, referring domains, and UR. Common Crawl indexed pages update overnight."
      selectedSite={selectedSite}
      loading={loading}
      error={error}
      action={
        <ReportSectionActions
          section="site-explorer"
          activeSite={displayDomain ? `https://${displayDomain}` : selectedSite}
          onRefresh={runAnalyze}
          loading={loading || refreshing}
          refreshLabel={refreshing ? "Analyzing…" : "Analyze"}
        />
      }
    >
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" aria-hidden />
          <input
            type="text"
            value={domainInput}
            onChange={(e) => setDomainInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runAnalyze(true)}
            placeholder="Any domain — e.g. ahrefs.com, nike.com"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
        <button
          type="button"
          disabled={loading || refreshing || !domainInput.trim()}
          onClick={runAnalyze}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1d9c35] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#178a2e] disabled:opacity-50"
        >
          <FiCompass className="size-4" aria-hidden />
          Analyze
        </button>
      </div>

      {data ? (
        <>
          {data.empty && !authority?.found ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 leading-relaxed">
              {data.message}
              {!authority?.configured ? (
                <p className="mt-2 text-amber-900/90">
                  Add <code className="rounded bg-white/80 px-1 text-xs">OPENPAGERANK_API_KEY</code> to .env for DA,
                  referring domains, and UR.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm text-sky-950">
            <FiCompass className="size-4 shrink-0" aria-hidden />
            <span>
              Crawl index: <strong>{data.crawl?.name || data.crawl?.id || "—"}</strong>
              {data.crawl?.to ? ` · captured through ${String(data.crawl.to).slice(0, 10)}` : ""}
            </span>
            <span className="text-sky-800/80">·</span>
            <span>
              Last saved: <strong>{formatFetchedAt(data.fetchedAt)}</strong>
              {data.stale ? " (today’s cron run pending)" : " (daily cron)"}
            </span>
          </div>

          {(data.running || refreshing) && (
            <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              {data.message ||
                "Fetching from Common Crawl in the background — this page updates every few seconds."}
            </div>
          )}

          {data.blocked ? (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <FiInfo className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Common Crawl rate-limited the last crawl. DA and referring domains still come from Open PageRank. Indexed
                pages retry on the 05:00 cron.
              </span>
            </div>
          ) : null}

          <div className="mb-6 inline-flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  tab === t.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "overview" && (overview || authority?.found) ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <StatCard
                  label="Authority (DR-like)"
                  value={authority?.score100 != null ? `${authority.score100}/100` : "—"}
                  sub="Open PageRank domain score"
                  accent="border-emerald-100 bg-emerald-50/40"
                />
                <StatCard
                  label="Homepage UR"
                  value={data.homepageUr100 != null ? `${data.homepageUr100}/100` : authority?.score100 != null ? `${authority.score100}/100` : "—"}
                  sub="UR-like · OPR on registrable domain"
                  accent="border-teal-100 bg-teal-50/40"
                />
                <StatCard
                  label="Referring domains"
                  value={
                    authority?.referringDomains != null
                      ? formatNum(authority.referringDomains)
                      : authority?.configured
                        ? "—"
                        : "—"
                  }
                  sub={
                    authority?.configured
                      ? authority?.referringDomains == null
                        ? "Not in OPR index for this domain"
                        : "Open PageRank (live)"
                      : "Set OPENPAGERANK_API_KEY"
                  }
                  accent="border-amber-100 bg-amber-50/40"
                />
                <StatCard
                  label="Indexed URLs"
                  value={formatNum(overview.indexedUrls)}
                  sub="Common Crawl · nightly cron"
                  accent="border-sky-100 bg-sky-50/40"
                />
                <StatCard
                  label="Link samples (CC)"
                  value={formatNum(overview.referringDomains)}
                  sub="Overnight crawl estimate"
                  accent="border-violet-100 bg-violet-50/40"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <StatCard label="Subdomains" value={formatNum(overview.subdomains)} sub="Hosts under this domain" />
                <StatCard
                  label="HTTP 200 rate (sample)"
                  value={overview.http200Rate != null ? `${Math.round(overview.http200Rate * 100)}%` : "—"}
                  sub={`Last capture ${overview.lastCapture || "unknown"}`}
                />
                <StatCard
                  label="Global rank"
                  value={authority?.globalRank ? formatNum(authority.globalRank) : "—"}
                  sub="Open PageRank"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <BreakdownList title="HTTP status (sample)" data={overview.statusBreakdown} />
                <BreakdownList title="Content types (sample)" data={overview.mimeBreakdown} />
              </div>

              {data.notes?.length ? (
                <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 leading-relaxed">
                  {data.notes.map((note) => (
                    <p key={note} className="flex items-start gap-2">
                      <FiInfo className="mt-0.5 size-4 shrink-0 text-gray-400" aria-hidden />
                      <span>{note}</span>
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === "pages" ? (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-4 py-3">UR-like</th>
                    <th className="px-4 py-3">URL</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Captured</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.items || []).map((row) => (
                    <tr key={`${row.url}-${row.timestamp}`} className="border-t border-gray-100">
                      <td className="px-4 py-3 tabular-nums font-semibold text-gray-900">
                        {row.ur100 != null ? `${row.ur100}/100` : "—"}
                      </td>
                      <td className="max-w-md truncate px-4 py-3">
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-[#1d9c35] hover:underline"
                        >
                          {row.url}
                          <FiExternalLink className="size-3.5 shrink-0" aria-hidden />
                        </a>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{row.status ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{row.mime || "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{row.captured || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-4 py-3 text-sm">
                <span className="text-gray-600">
                  Total indexed URLs: <strong>{formatNum(data.totalPages || 0)}</strong>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-gray-500">Page {page}</span>
                  <button
                    type="button"
                    disabled={loading || (data.items || []).length < pageSize}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {tab === "subdomains" ? (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Subdomain</th>
                    <th className="px-4 py-3">Pages seen</th>
                    <th className="px-4 py-3">Last capture</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.items || []).map((row) => (
                    <tr key={row.host} className="border-t border-gray-100">
                      <td className="px-4 py-3 font-medium text-gray-900">{row.host}</td>
                      <td className="px-4 py-3 tabular-nums">{formatNum(row.pages)}</td>
                      <td className="px-4 py-3 text-gray-600">{row.captured || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {tab === "referring" ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 leading-relaxed">
                Referring domain <strong>count</strong> comes from Open PageRank above. Rows below are Common Crawl URL
                mentions (filled overnight). For a full link list see <strong>Link Index</strong>.
              </p>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Referring domain</th>
                      <th className="px-4 py-3">Mentions</th>
                      <th className="px-4 py-3">Sample URL</th>
                      <th className="px-4 py-3">Last seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.items || []).map((row) => (
                      <tr key={row.host} className="border-t border-gray-100">
                        <td className="px-4 py-3 font-medium text-gray-900">{row.host}</td>
                        <td className="px-4 py-3 tabular-nums">{formatNum(row.mentions)}</td>
                        <td className="max-w-xs truncate px-4 py-3">
                          {row.sampleUrl ? (
                            <a
                              href={row.sampleUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#1d9c35] hover:underline"
                            >
                              {row.sampleUrl}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{row.captured || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {!loading && tab !== "overview" && !(data.items || []).length ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
              <FiGlobe className="mx-auto mb-3 size-8 text-gray-300" aria-hidden />
              No stored data for this tab yet. The daily cron runs at 05:00 server time, or click Refresh now.
            </div>
          ) : null}
        </>
      ) : null}
    </SeoPanelShell>
  );
}
