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
    if (!host) return;
    setDomainInput(host);
    setActiveDomain(host);
  }, [selectedSite]);

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
      description="Domain authority metrics from Open PageRank — DR, estimated homepage UR, and referring domain count."
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                  : authority?.homepageUr100 != null
                    ? `${authority.homepageUr100}/100`
                    : "—"}
              </p>
              <p className="mt-1 text-xs text-gray-600">Estimated from DR (depth-adjusted, not a copy)</p>
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
                <strong>DR</strong> — Open PageRank on the registrable domain (0–100).
              </li>
              <li>
                <strong>Homepage UR</strong> — estimated from DR with a small lift; inner pages score lower by URL depth
                (see Site Explorer → Indexed pages).
              </li>
              <li>
                <strong>Referring domains</strong> — live from Open PageRank when the domain is in their index.
              </li>
              <li>
                Per-page backlink rows from Common Crawl are hidden for now — they are not real backlinks. Full link data
                is planned via openhrefs import.
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center text-sm text-gray-600">
            <FiLink className="mx-auto mb-3 size-8 text-gray-300" aria-hidden />
            <p className="font-semibold text-gray-800">Backlink table paused</p>
            <p className="mt-2 max-w-lg mx-auto leading-relaxed">
              Common Crawl URL mentions are not reliable backlinks. Use <strong>Referring domains</strong> above (OPR)
              for now, or Site Explorer → Indexed pages for per-URL UR estimates.
            </p>
          </div>
        </div>
      ) : null}
    </SeoPanelShell>
  );
}
