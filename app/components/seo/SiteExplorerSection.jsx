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
    if (!host) return;
    setDomainInput(host);
    setActiveDomain(host);
  }, [selectedSite]);

  const selectedHost = hostFromSite(selectedSite);
  const gscSiteUrl =
    selectedSite && selectedHost && (!activeDomain || activeDomain === selectedHost) ? selectedSite : "";

  const { data, loading, refreshing, error, load } = useSiteExplorerFetch({
    selectedSite: activeDomain ? "" : selectedSite,
    exploreDomain: activeDomain,
    gscSiteUrl,
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
  const gsc = data?.gsc;
  const pageSourceGsc = data?.pageSource === "gsc";
  const displayDomain = data?.domain || activeDomain;

  return (
    <SeoPanelShell
      title="Site Explorer"
      eyebrow=""
      siteUrl={displayDomain ? `https://${displayDomain}` : undefined}
      description="Open PageRank for DR, homepage UR, and referring domains. Indexed pages from Google Search Console when the property is connected."
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
              {data.stale
                ? " · weekly refresh due"
                : data.cacheExpiresAt
                  ? ` · cached until ${formatFetchedAt(data.cacheExpiresAt)}`
                  : " · weekly cache"}
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
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard
                  label="Authority (DR-like)"
                  value={authority?.score100 != null ? `${authority.score100}/100` : "—"}
                  sub="Open PageRank domain score"
                  accent="border-emerald-100 bg-emerald-50/40"
                />
                <StatCard
                  label="Homepage UR"
                  value={
                    data.homepageUr100 != null
                      ? `${data.homepageUr100}/100`
                      : authority?.homepageUr100 != null
                        ? `${authority.homepageUr100}/100`
                        : "—"
                  }
                  sub="Estimated from DR + path (not identical to DR)"
                  accent="border-teal-100 bg-teal-50/40"
                />
                <StatCard
                  label="Referring domains"
                  value={
                    authority?.referringDomains != null
                      ? formatNum(authority.referringDomains)
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
                  label={
                    overview.source === "gsc"
                      ? gsc?.sitemapUrlCount
                        ? "Submitted URLs (Sitemaps)"
                        : "Indexed URLs (Sample)"
                      : "Indexed URLs"
                  }
                  value={formatNum(overview.indexedUrls)}
                  sub={
                    overview.source === "gsc"
                      ? gsc?.sitemapUrlCount
                        ? `Discovered in GSC sitemaps`
                        : "Monitored GSC sample set"
                      : "Common Crawl · nightly cron"
                  }
                  accent="border-sky-100 bg-sky-50/40"
                />
              </div>

              {gsc?.available ? (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <StatCard
                    label="Pages in search"
                    value={formatNum(gsc.pagesInSearch ?? overview.pagesInSearch ?? 0)}
                    sub="GSC performance · last 28 days"
                  />
                  <StatCard
                    label="Indexed (inspection)"
                    value={
                      gsc.inspectionIndexed != null
                        ? formatNum(gsc.inspectionIndexed)
                        : overview.inspectionIndexed != null
                          ? formatNum(overview.inspectionIndexed)
                          : "—"
                    }
                    sub={
                      gsc.inspectionTotal
                        ? `Daily batch · ${formatNum(gsc.inspectionTotal)} URLs checked`
                        : "Enable SEO_URL_INSPECT_DAILY for samples"
                    }
                  />
                  <StatCard
                    label="Fetch success (sample)"
                    value={overview.http200Rate != null ? `${Math.round(overview.http200Rate * 100)}%` : "—"}
                    sub={`URL inspection · last run ${overview.lastCapture || "unknown"}`}
                  />
                  <StatCard
                    label="Sitemaps"
                    value={formatNum(gsc.sitemapCount ?? 0)}
                    sub={
                      gsc.sitemapCount
                        ? `${formatNum(gsc.sitemapUrlCount ?? 0)} URLs in feeds`
                        : "Submit sitemap in GSC"
                    }
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <StatCard
                    label="HTTP 200 rate (sample)"
                    value={overview.http200Rate != null ? `${Math.round(overview.http200Rate * 100)}%` : "—"}
                    sub={`Indexed pages sample · last capture ${overview.lastCapture || "unknown"}`}
                  />
                  <StatCard
                    label="Global rank"
                    value={authority?.globalRank ? formatNum(authority.globalRank) : "—"}
                    sub="Open PageRank"
                  />
                </div>
              )}

              {gsc?.available && authority?.globalRank ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    label="Global rank"
                    value={formatNum(authority.globalRank)}
                    sub="Open PageRank"
                  />
                </div>
              ) : null}

              {!gsc?.available && selectedSite && activeDomain && activeDomain !== selectedHost ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 leading-relaxed">
                  Indexed pages from Search Console are only available for sites connected in this dashboard. Open
                  PageRank metrics still load for any domain.
                </div>
              ) : null}

              {!gsc?.available && selectedSite && (!activeDomain || activeDomain === selectedHost) ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 leading-relaxed">
                  Connect this site in Google Search Console (service account as Owner) to populate indexed URLs,
                  sitemaps, and URL inspection data.
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <BreakdownList
                  title={overview.source === "gsc" ? "Coverage (inspection sample)" : "HTTP status (sample)"}
                  data={overview.statusBreakdown}
                />
                {overview.source !== "gsc" ? (
                  <BreakdownList title="Content types (sample)" data={overview.mimeBreakdown} />
                ) : null}
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
                    <th className="px-4 py-3">UR (est.)</th>
                    <th className="px-4 py-3">URL</th>
                    <th className="px-4 py-3">{pageSourceGsc ? "Index status" : "Status"}</th>
                    {pageSourceGsc ? (
                      <th className="px-4 py-3">Impressions</th>
                    ) : (
                      <th className="px-4 py-3">Type</th>
                    )}
                    <th className="px-4 py-3">{pageSourceGsc ? "Last crawl" : "Captured"}</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.items || []).map((row) => (
                    <tr key={`${row.url}-${row.timestamp || row.captured}`} className="border-t border-gray-100">
                      <td className="px-4 py-3 tabular-nums font-semibold text-gray-900">
                        {row.ur100 != null ? (
                          <span title={row.dr100 != null ? `DR (host): ${row.dr100}` : undefined}>
                            {row.ur100}/100
                          </span>
                        ) : (
                          "—"
                        )}
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
                      <td className="px-4 py-3 text-gray-700">{row.status ?? row.coverageState ?? "—"}</td>
                      {pageSourceGsc ? (
                        <td className="px-4 py-3 tabular-nums">{row.impressions != null ? formatNum(row.impressions) : "—"}</td>
                      ) : (
                        <td className="px-4 py-3 text-gray-600">{row.mime || "—"}</td>
                      )}
                      <td className="px-4 py-3 text-gray-600">{row.captured || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-4 py-3 text-sm">
                <span className="text-gray-600">
                  Total URLs: <strong>{formatNum(data.totalPages || 0)}</strong>
                  {pageSourceGsc ? " · Google Search Console" : ""}
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

          {!loading && tab !== "overview" && !(data.items || []).length ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
              <FiGlobe className="mx-auto mb-3 size-8 text-gray-300" aria-hidden />
              {gsc?.available
                ? "No pages returned from Search Console yet. Submit a sitemap and wait for the daily URL inspection batch."
                : "No indexed pages yet. Connect this domain in Search Console, or wait for the nightly Common Crawl cron."}
            </div>
          ) : null}
        </>
      ) : null}
    </SeoPanelShell>
  );
}
