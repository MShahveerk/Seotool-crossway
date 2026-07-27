"use client";

import { useEffect, useState } from "react";
import { FiExternalLink, FiInfo, FiLink, FiSearch } from "react-icons/fi";
import SeoPanelShell, { formatNum } from "./SeoPanelShell";
import ReportSectionActions from "../ReportSectionActions";
import { useSiteExplorerFetch } from "./useSiteExplorerFetch";

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

function formatFetchedAt(value) {
  if (!value) return "Never";
  try {
    return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return String(value);
  }
}

export default function LinkIndexSection({ selectedSite = "" }) {
  const [domainInput, setDomainInput] = useState("");
  const [activeDomain, setActiveDomain] = useState("");
  const [pendingAnalyze, setPendingAnalyze] = useState(false);

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
    view: "backlinks",
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

  const authority = data?.authority;
  const displayDomain = data?.domain || activeDomain;

  return (
    <SeoPanelShell
      title="Link Index"
      eyebrow=""
      siteUrl={displayDomain ? `https://${displayDomain}` : undefined}
      description="Explore any domain — Open PageRank for DA, referring domains, and homepage UR. Link samples from nightly Common Crawl."
      selectedSite={selectedSite}
      loading={loading}
      error={error}
      action={
        <ReportSectionActions
          section="link-index"
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
            onKeyDown={(e) => e.key === "Enter" && runAnalyze()}
            placeholder="Any domain — e.g. competitor.com"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
        <button
          type="button"
          disabled={loading || refreshing || !domainInput.trim()}
          onClick={runAnalyze}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1d9c35] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#178a2e] disabled:opacity-50"
        >
          Analyze
        </button>
      </div>

      {data ? (
        <div className="space-y-6">
          {(data.running || refreshing) && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              {data.message || "Loading Open PageRank metrics…"}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Authority (DR-like)</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">
                {authority?.score100 != null ? `${authority.score100}/100` : "—"}
              </p>
              <p className="mt-1 text-xs text-gray-600">Open PageRank · live</p>
            </div>
            <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-teal-900">Homepage UR</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">
                {data.homepageUr100 != null
                  ? `${data.homepageUr100}/100`
                  : authority?.score100 != null
                    ? `${authority.score100}/100`
                    : "—"}
              </p>
              <p className="mt-1 text-xs text-gray-600">UR-like · same OPR score on root domain</p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-900">Referring domains</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">
                {authority?.referringDomains != null ? formatNum(authority.referringDomains) : "—"}
              </p>
              <p className="mt-1 text-xs text-gray-600">
                {authority?.configured
                  ? authority?.referringDomains == null
                    ? "Domain not in OPR index"
                    : "Open PageRank · live"
                  : "Set OPENPAGERANK_API_KEY"}
              </p>
            </div>
            <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-violet-900">Link samples (CC)</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">{formatNum(data.total || 0)}</p>
              <p className="mt-1 text-xs text-gray-600">Nightly Common Crawl crawl</p>
            </div>
          </div>

          <p className="text-sm text-gray-600">
            Last saved: <strong>{formatFetchedAt(data.fetchedAt)}</strong>
            {data.stale ? " · indexed pages pending nightly cron" : ""}
          </p>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 leading-relaxed">
            <p className="flex items-start gap-2 font-semibold text-gray-900">
              <FiInfo className="mt-0.5 size-4 shrink-0" aria-hidden />
              About UR vs Ahrefs
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>
                <strong>DR-like</strong> — Open PageRank on the registrable domain (0–100).
              </li>
              <li>
                <strong>UR (homepage)</strong> — best free proxy: same OPR score applied to the root domain. Per-URL UR
                on indexed pages uses OPR on each URL&apos;s host (see Site Explorer → Indexed pages).
              </li>
              <li>
                <strong>Referring domains</strong> — live from Open PageRank when the domain is in their index.
              </li>
              <li>
                True Ahrefs UR needs a page-level link graph — planned via openhrefs dataset import later.
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900">
              <FiLink className="size-4" aria-hidden />
              Sample linking URLs (Common Crawl · nightly)
            </h3>
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Source domain</th>
                    <th className="px-4 py-3">Sample URL</th>
                    <th className="px-4 py-3">Mentions</th>
                    <th className="px-4 py-3">Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.items || []).map((row) => (
                    <tr key={`${row.sourceDomain}-${row.sourceUrl}`} className="border-t border-gray-100">
                      <td className="px-4 py-3 font-medium">{row.sourceDomain}</td>
                      <td className="max-w-md truncate px-4 py-3">
                        {row.sourceUrl ? (
                          <a
                            href={row.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#1d9c35] hover:underline"
                          >
                            {row.sourceUrl}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{formatNum(row.mentions)}</td>
                      <td className="px-4 py-3 text-gray-600">{row.captured || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!loading && !(data.items || []).length ? (
              <p className="mt-4 text-sm text-gray-500">
                No link samples yet — Common Crawl runs on the 05:00 cron to avoid rate limits. DA and referring domains
                above are live from Open PageRank.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </SeoPanelShell>
  );
}
