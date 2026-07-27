"use client";

import { useCallback, useEffect, useState } from "react";
import { FiExternalLink, FiInfo, FiLink } from "react-icons/fi";
import SeoPanelShell, { formatNum } from "./SeoPanelShell";
import ReportSectionActions from "../ReportSectionActions";

function formatFetchedAt(value) {
  if (!value) return "Never";
  try {
    return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return String(value);
  }
}

export default function LinkIndexSection({ selectedSite = "" }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const load = useCallback(
    async (forceRefresh = false) => {
      if (!selectedSite) {
        setData(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ url: selectedSite, view: "backlinks" });
        if (forceRefresh) params.set("refresh", "1");
        const res = await fetch(`/api/site-explorer?${params.toString()}`, { cache: "no-store" });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || "Failed to load link index");
        setData(payload);
      } catch (err) {
        setData(null);
        setError(err.message || "Failed to load link index");
      } finally {
        setLoading(false);
      }
    },
    [selectedSite]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const authority = data?.authority;
  const openhrefs = data?.openhrefs;

  return (
    <SeoPanelShell
      title="Link Index"
      eyebrow=""
      siteUrl={
        selectedSite && (String(selectedSite).startsWith("http") || String(selectedSite).startsWith("sc-domain:"))
          ? selectedSite
          : undefined
      }
      description="Backlink-style metrics from daily Open PageRank + Common Crawl snapshots stored in your database. Full openhrefs HTML link graph import planned when their public dataset ships."
      selectedSite={selectedSite}
      loading={loading}
      error={error}
      action={
        <ReportSectionActions
          section="link-index"
          activeSite={selectedSite}
          onRefresh={() => load(true)}
          loading={loading}
          refreshLabel="Refresh now"
        />
      }
    >
      {data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Authority (DR-like)</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">
                {authority?.score100 != null ? `${authority.score100}/100` : "—"}
              </p>
              <p className="mt-1 text-xs text-gray-600">Open PageRank · not Ahrefs DR</p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-900">Referring domains</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">
                {authority?.referringDomains != null ? formatNum(authority.referringDomains) : "—"}
              </p>
              <p className="mt-1 text-xs text-gray-600">Open PageRank (best free count today)</p>
            </div>
            <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-violet-900">Link samples (CC)</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">{formatNum(data.total || 0)}</p>
              <p className="mt-1 text-xs text-gray-600">External URL mentions in Common Crawl</p>
            </div>
          </div>

          <p className="text-sm text-gray-600">
            Last saved: <strong>{formatFetchedAt(data.fetchedAt)}</strong>
            {data.stale ? " · today’s 05:00 cron run is still pending" : " · updated daily by cron"}
          </p>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 leading-relaxed">
            <p className="flex items-start gap-2 font-semibold text-gray-900">
              <FiInfo className="mt-0.5 size-4 shrink-0" aria-hidden />
              About UR, DR, and openhrefs
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>
                <strong>DR-like score</strong> — Open PageRank authority (0–100). Comparable in spirit to Ahrefs DR /
                Moz DA, not identical.
              </li>
              <li>
                <strong>UR (URL Rating)</strong> — not available from CDX or Open PageRank; needs a page-level link index
                (future openhrefs import).
              </li>
              <li>
                <strong>openhrefs</strong> — open-source Spark/dbt pipeline over full Common Crawl dumps. It needs its
                own server cluster (not runnable inside this Next.js app). When their public{" "}
                <code className="rounded bg-white px-1 text-xs">open-domain-authority-index</code> and backlink marts
                ship, we can import them here for true backlink rows.
              </li>
            </ul>
            {openhrefs?.repo ? (
              <a
                href={openhrefs.repo}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#1d9c35] hover:underline"
              >
                openhrefs on GitHub
                <FiExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : null}
          </div>

          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900">
              <FiLink className="size-4" aria-hidden />
              Sample linking URLs (Common Crawl estimate)
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
                No link samples stored yet. Data is collected daily at 05:00 server time.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </SeoPanelShell>
  );
}
