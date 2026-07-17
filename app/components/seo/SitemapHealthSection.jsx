"use client";

import { useCallback, useEffect, useState } from "react";
import { FiRefreshCw, FiCheckCircle, FiClock, FiUpload, FiAlertTriangle } from "react-icons/fi";
import SeoPanelShell, { formatNum } from "./SeoPanelShell";

export default function SitemapHealthSection({ selectedSite = "" }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sitemaps, setSitemaps] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [submitting, setSubmitting] = useState("");
  const [actionMsg, setActionMsg] = useState("");

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
      setWarnings(data.warnings || []);
    } catch (e) {
      setError(e.message || "Failed to load sitemaps");
      setSitemaps([]);
      setWarnings([]);
    } finally {
      setLoading(false);
    }
  }, [selectedSite]);

  useEffect(() => {
    load();
  }, [load]);

  const submitOne = async (feedpath) => {
    setSubmitting(feedpath);
    setActionMsg("");
    try {
      const res = await fetch("/api/searchconsole/sitemaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: selectedSite, feedpath }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.userMessage || data.error || "Submit failed");
      setActionMsg(`Submitted: ${feedpath}`);
      await load();
    } catch (e) {
      setActionMsg(e.message || "Submit failed");
    } finally {
      setSubmitting("");
    }
  };

  const submitAll = async () => {
    setSubmitting("__all__");
    setActionMsg("");
    try {
      const res = await fetch("/api/searchconsole/sitemaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: selectedSite, resubmitAll: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.userMessage || data.error || "Resubmit failed");
      if (data.skipped) {
        setActionMsg(data.reason || "Nothing to resubmit.");
      } else {
        setActionMsg(`Resubmitted ${data.okCount || 0} sitemap(s)${data.failCount ? `, ${data.failCount} failed` : ""}.`);
      }
      await load();
    } catch (e) {
      setActionMsg(e.message || "Resubmit failed");
    } finally {
      setSubmitting("");
    }
  };

  const pendingCount = sitemaps.filter((s) => s.isPending).length;

  return (
    <SeoPanelShell
      title="Sitemap Health"
      description="Monitor sitemaps in Google Search Console — stale/pending warnings, and submit or resubmit feeds."
      selectedSite={selectedSite}
      loading={loading}
      error={error}
      action={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={submitAll}
            disabled={!!submitting || sitemaps.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[#1d9c35]/40 bg-[#1d9c35]/5 text-sm font-semibold text-[#157a29] hover:bg-[#1d9c35]/10 disabled:opacity-50"
          >
            <FiUpload className={`w-4 h-4 ${submitting === "__all__" ? "animate-pulse" : ""}`} />
            Resubmit all
          </button>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <FiRefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      }
    >
      {warnings.length > 0 ? (
        <div className="mb-4 space-y-2">
          {warnings.map((w) => (
            <div
              key={w.type}
              className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              <FiAlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{w.message}</span>
            </div>
          ))}
        </div>
      ) : null}

      {actionMsg ? (
        <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          {actionMsg}
        </div>
      ) : null}

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
          <table className="w-full text-sm min-w-[720px]">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">
                <th className="px-4 py-3">Sitemap path</th>
                <th className="px-4 py-3">Last submitted</th>
                <th className="px-4 py-3">Contents</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {sitemaps.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                    No sitemaps found for this property in Search Console. Add the sitemap URL in GSC once, then use
                    Resubmit here.
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
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={!!submitting}
                        onClick={() => submitOne(s.path)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-white disabled:opacity-50"
                      >
                        <FiUpload className="w-3.5 h-3.5" />
                        {submitting === s.path ? "…" : "Resubmit"}
                      </button>
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
