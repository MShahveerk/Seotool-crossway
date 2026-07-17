"use client";

import { useState } from "react";
import { FiSearch, FiRefreshCw } from "react-icons/fi";
import SeoPanelShell from "./SeoPanelShell";

function StatusPill({ label, tone = "neutral" }) {
  const styles = {
    good: "bg-emerald-50 text-emerald-800 border-emerald-200",
    bad: "bg-red-50 text-red-700 border-red-200",
    warn: "bg-amber-50 text-amber-800 border-amber-200",
    neutral: "bg-gray-50 text-gray-700 border-gray-200",
  };
  return (
    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${styles[tone] || styles.neutral}`}>
      {label}
    </span>
  );
}

function toneForVerdict(verdict) {
  const v = String(verdict || "").toUpperCase();
  if (v.includes("PASS") || v === "VALID") return "good";
  if (v.includes("FAIL") || v.includes("ERROR") || v === "INVALID") return "bad";
  if (v.includes("NEUTRAL") || v.includes("PARTIAL")) return "warn";
  return "neutral";
}

export default function UrlInspectionSection({ selectedSite = "" }) {
  const [inspectionUrl, setInspectionUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const runInspect = async (e) => {
    e?.preventDefault?.();
    if (!selectedSite) return;
    const target = String(inspectionUrl || "").trim();
    if (!target) {
      setError("Enter a full page URL to inspect.");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const qs = new URLSearchParams({
        url: selectedSite,
        inspectionUrl: target,
      });
      const res = await fetch(`/api/searchconsole/inspect?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Inspection failed");
      setResult(data);
    } catch (err) {
      setError(err.message || "Inspection failed");
    } finally {
      setLoading(false);
    }
  };

  const idx = result?.indexStatusResult || {};

  return (
    <SeoPanelShell
      title="URL Inspection"
      description="Check how Google indexes a specific page — coverage state, indexing verdict, and last crawl time."
      selectedSite={selectedSite}
      loading={false}
      error={error}
    >
      <form onSubmit={runInspect} className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="url"
          value={inspectionUrl}
          onChange={(e) => setInspectionUrl(e.target.value)}
          placeholder={
            String(selectedSite).startsWith("http")
              ? `${selectedSite.replace(/\/$/, "")}/your-page`
              : "https://example.com/page-to-inspect"
          }
          className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0EFF2A]/30"
        />
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-black text-white text-sm font-semibold disabled:opacity-60"
        >
          {loading ? <FiRefreshCw className="w-4 h-4 animate-spin" /> : <FiSearch className="w-4 h-4" />}
          {loading ? "Inspecting…" : "Inspect URL"}
        </button>
      </form>

      {result ? (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 bg-gray-50 border-b border-gray-200">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Inspected URL</p>
            <p className="mt-1 text-sm font-medium text-gray-900 break-all">{result.url}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Verdict</p>
              <StatusPill label={idx.verdict || "UNKNOWN"} tone={toneForVerdict(idx.verdict)} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Coverage</p>
              <p className="text-sm font-medium text-gray-900">{idx.coverageState || "UNKNOWN"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Indexing state</p>
              <p className="text-sm font-medium text-gray-900">{idx.indexingState || "UNKNOWN"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Last crawl</p>
              <p className="text-sm font-medium text-gray-900">
                {idx.lastCrawlTime ? new Date(idx.lastCrawlTime).toLocaleString() : "—"}
              </p>
            </div>
          </div>
        </div>
      ) : (
        !loading && (
          <div className="rounded-xl border border-dashed border-gray-200 px-6 py-16 text-center text-sm text-gray-500">
            Paste a page URL and inspect to see Google&apos;s live indexing status for that URL.
          </div>
        )
      )}
    </SeoPanelShell>
  );
}
