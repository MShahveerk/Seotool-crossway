"use client";

import { useCallback, useEffect, useState } from "react";
import { FiRefreshCw, FiCheckCircle, FiClock } from "react-icons/fi";
import SeoPanelShell, { formatNum } from "./SeoPanelShell";

export default function SitemapHealthSection({ selectedSite = "" }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sitemaps, setSitemaps] = useState([]);

  const load = useCallback(async () => {
    if (!selectedSite) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ url: selectedSite });
      const res = await fetch(`/api/searchconsole/sitemaps?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load sitemaps");
      setSitemaps(data.sitemaps || []);
    } catch (e) {
      setError(e.message || "Failed to load sitemaps");
      setSitemaps([]);
    } finally {
      setLoading(false);
    }
  }, [selectedSite]);

  useEffect(() => {
    load();
  }, [load]);

  const pendingCount = sitemaps.filter((s) => s.isPending).length;

  return (
    <SeoPanelShell
      title="Sitemap Health"
      description="Monitor sitemaps submitted to Google Search Console — last submit time, pending status, and content counts."
      selectedSite={selectedSite}
      loading={loading}
      error={error}
      action={
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          <FiRefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Sitemaps</p>
          <p className="mt-2 text-3xl font-bold text-gray-900 tabular-nums">{formatNum(sitemaps.length)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Pending</p>
          <p className="mt-2 text-3xl font-bold text-amber-600 tabular-nums">{formatNum(pendingCount)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Ready</p>
          <p className="mt-2 text-3xl font-bold text-[#1d9c35] tabular-nums">
            {formatNum(sitemaps.length - pendingCount)}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">
                <th className="px-4 py-3">Sitemap path</th>
                <th className="px-4 py-3">Last submitted</th>
                <th className="px-4 py-3">Contents</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Type</th>
              </tr>
            </thead>
            <tbody>
              {sitemaps.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                    No sitemaps found for this property in Search Console.
                  </td>
                </tr>
              ) : (
                sitemaps.map((s) => (
                  <tr key={s.path} className="border-b border-gray-50 hover:bg-gray-50/80">
                    <td className="px-4 py-3 font-medium text-gray-900 break-all max-w-md">{s.path}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {s.lastSubmitted ? new Date(s.lastSubmitted).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{formatNum(s.contentsCount)}</td>
                    <td className="px-4 py-3">
                      {s.isPending ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                          <FiClock className="w-3.5 h-3.5" /> Pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#1d9c35]">
                          <FiCheckCircle className="w-3.5 h-3.5" /> Submitted
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {s.isSitemapsIndex ? "Index" : "Sitemap"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </SeoPanelShell>
  );
}
