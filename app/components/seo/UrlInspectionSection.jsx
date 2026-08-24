"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FiSearch, FiRefreshCw, FiCheckCircle, FiXCircle, FiHelpCircle } from "react-icons/fi";
import SeoPanelShell, { formatNum } from "./SeoPanelShell";
import ReportSectionActions from "../ReportSectionActions";
import IndexingTasksPanel from "./IndexingTasksPanel";

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

function ymdLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatRunDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function UrlTable({ rows, emptyLabel, showCause }) {
  if (!rows?.length) {
    return <p className="text-sm text-gray-500 py-8 text-center">{emptyLabel}</p>;
  }
  return (
    <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead className="sticky top-0 bg-gray-50 z-10">
          <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">
            <th className="px-3 py-2.5">Page URL</th>
            <th className="px-3 py-2.5">Verdict</th>
            <th className="px-3 py-2.5">Last crawl</th>
            {showCause ? <th className="px-3 py-2.5">Cause / coverage</th> : <th className="px-3 py-2.5">Coverage</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id || r.url} className="border-b border-gray-50 hover:bg-gray-50/70 align-top">
              <td className="px-3 py-2.5 font-medium text-gray-900 break-all max-w-md">{r.url}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                <StatusPill label={r.verdict || "—"} tone={toneForVerdict(r.verdict)} />
              </td>
              <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                {r.lastCrawlTime ? new Date(r.lastCrawlTime).toLocaleString() : "—"}
              </td>
              <td className="px-3 py-2.5 text-gray-700 max-w-sm">
                {showCause ? r.cause || r.coverageState || "—" : r.coverageState || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function UrlInspectionSection({ selectedSite = "" }) {
  const [inspectionUrl, setInspectionUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const [monitorLoading, setMonitorLoading] = useState(true);
  const [monitorError, setMonitorError] = useState("");
  const [monitor, setMonitor] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedDate, setSelectedDate] = useState("");

  const loadMonitor = useCallback(async () => {
    if (!selectedSite) {
      setMonitorLoading(false);
      return;
    }
    setMonitorLoading(true);
    setMonitorError("");
    try {
      const qs = new URLSearchParams({ url: selectedSite });
      if (selectedDate) qs.set("date", selectedDate);
      const [mRes, hRes] = await Promise.all([
        fetch(`/api/searchconsole/inspection-monitor?${qs.toString()}`),
        fetch(`/api/searchconsole/inspection-monitor/history?${new URLSearchParams({ url: selectedSite, days: "30" })}`),
      ]);
      const mData = await mRes.json();
      const hData = await hRes.json();
      if (!mRes.ok) throw new Error(mData.error || "Failed to load daily inspection results");
      setMonitor(mData);
      if (hRes.ok) setHistory(hData.history || []);
      // Seed day picker once from latest snapshot (avoid clobbering user selection)
      setSelectedDate((prev) => {
        if (prev) return prev;
        if (mData.snapshot?.runDate) return String(mData.snapshot.runDate).slice(0, 10);
        return prev;
      });
    } catch (e) {
      setMonitorError(e.message || "Failed to load monitor");
      setMonitor(null);
    } finally {
      setMonitorLoading(false);
    }
  }, [selectedSite, selectedDate]);

  useEffect(() => {
    loadMonitor();
  }, [loadMonitor]);

  const historyDates = useMemo(() => {
    const dates = (history || []).map((h) => String(h.runDate).slice(0, 10));
    return Array.from(new Set(dates)).sort().reverse();
  }, [history]);

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
  const snap = monitor?.snapshot;

  return (
    <SeoPanelShell
      title="URL Inspection"
      description="Inspect a single URL live, and review daily monitored results (sitemap + top pages) with indexed vs not-indexed counts and causes."
      selectedSite={selectedSite}
      loading={false}
      error={error || monitorError}
      action={
        <ReportSectionActions
          section="url-inspection"
          activeSite={selectedSite}
          onRefresh={loadMonitor}
          loading={monitorLoading}
          refreshLabel="Refresh daily"
        />
      }
    >
      <form onSubmit={runInspect} className="flex flex-col sm:flex-row gap-3 mb-8">
        <input
          type="url"
          value={inspectionUrl}
          onChange={(e) => setInspectionUrl(e.target.value)}
          placeholder={
            String(selectedSite).startsWith("http")
              ? `${selectedSite.replace(/\/$/, "")}/your-page`
              : "https://example.com/page-to-inspect"
          }
          className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00A3FF]/30"
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
        <div className="rounded-xl border border-gray-200 overflow-hidden mb-8">
          <div className="px-5 py-4 bg-gray-50 border-b border-gray-200">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Live inspection</p>
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
            {idx.robotsTxtState ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">robots.txt</p>
                <p className="text-sm font-medium text-gray-900">{idx.robotsTxtState}</p>
              </div>
            ) : null}
            {idx.pageFetchState ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Page fetch</p>
                <p className="text-sm font-medium text-gray-900">{idx.pageFetchState}</p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Daily inspection results</h2>
            <p className="text-xs text-gray-500 mt-1 max-w-2xl">
              Monitored URLs from sitemaps + Search Console top pages (capped/rotated daily). Not Google&apos;s entire
              Coverage inventory. Enable with <code className="text-[11px]">SEO_URL_INSPECT_DAILY=true</code>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Day</label>
            <select
              value={selectedDate || ""}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
            >
              {!historyDates.length ? <option value={selectedDate || ymdLocal()}>{selectedDate || "Latest"}</option> : null}
              {historyDates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        {monitorLoading ? (
          <div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center text-sm text-gray-500">
            Loading daily results…
          </div>
        ) : !snap ? (
          <div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center text-sm text-gray-500">
            No daily inspection run stored yet for this site. After deploy, set{" "}
            <code className="text-xs">SEO_URL_INSPECT_DAILY=true</code> — cron runs at 05:00 server time.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Run date</p>
                <p className="mt-2 text-lg font-bold text-gray-900">{formatRunDate(snap.runDate)}</p>
                <p className="text-xs text-gray-500 mt-1 capitalize">{snap.status}</p>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-800">
                  <FiCheckCircle className="w-3.5 h-3.5" /> Indexed
                </div>
                <p className="mt-2 text-3xl font-bold text-emerald-900 tabular-nums">
                  {formatNum(snap.indexedCount)}
                </p>
              </div>
              <div className="rounded-xl border border-red-100 bg-red-50/40 p-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-red-800">
                  <FiXCircle className="w-3.5 h-3.5" /> Not indexed
                </div>
                <p className="mt-2 text-3xl font-bold text-red-900 tabular-nums">
                  {formatNum(snap.notIndexedCount)}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <FiHelpCircle className="w-3.5 h-3.5" /> Inspected
                </div>
                <p className="mt-2 text-3xl font-bold text-gray-900 tabular-nums">{formatNum(snap.totalUrls)}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Unknown {formatNum(snap.unknownCount)} · Errors {formatNum(snap.errorCount)}
                </p>
              </div>
            </div>

            {history.length > 1 ? (
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <h3 className="text-sm font-bold text-gray-900">Recent daily history</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[520px]">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b">
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Indexed</th>
                        <th className="px-3 py-2">Not indexed</th>
                        <th className="px-3 py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...history].reverse().slice(0, 14).map((h) => {
                        const d = String(h.runDate).slice(0, 10);
                        return (
                          <tr
                            key={h.id}
                            className={`border-b border-gray-50 cursor-pointer hover:bg-gray-50 ${
                              d === selectedDate ? "bg-[#1d9c35]/5" : ""
                            }`}
                            onClick={() => setSelectedDate(d)}
                          >
                            <td className="px-3 py-2 font-medium">{d}</td>
                            <td className="px-3 py-2 tabular-nums text-emerald-700">{formatNum(h.indexedCount)}</td>
                            <td className="px-3 py-2 tabular-nums text-red-700">{formatNum(h.notIndexedCount)}</td>
                            <td className="px-3 py-2 tabular-nums">{formatNum(h.totalUrls)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 bg-emerald-50/60 border-b border-emerald-100 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-emerald-900">Indexed pages</h3>
                  <span className="text-xs font-semibold text-emerald-800 tabular-nums">
                    {formatNum(monitor?.indexed?.length || 0)}
                  </span>
                </div>
                <div className="p-2">
                  <UrlTable
                    rows={monitor?.indexed || []}
                    emptyLabel="No indexed pages in this day’s monitored set."
                    showCause={false}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 bg-red-50/60 border-b border-red-100 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-red-900">Not indexed pages</h3>
                  <span className="text-xs font-semibold text-red-800 tabular-nums">
                    {formatNum(monitor?.notIndexed?.length || 0)}
                  </span>
                </div>
                <div className="p-2">
                  <UrlTable
                    rows={monitor?.notIndexed || []}
                    emptyLabel="No non-indexed pages in this day’s monitored set."
                    showCause
                  />
                </div>
              </div>
            </div>

            {(monitor?.errors?.length || 0) > 0 ? (
              <div className="rounded-xl border border-amber-200 overflow-hidden">
                <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
                  <h3 className="text-sm font-bold text-amber-900">
                    Inspection errors ({formatNum(monitor.errors.length)})
                  </h3>
                </div>
                <div className="p-2">
                  <UrlTable rows={monitor.errors} emptyLabel="" showCause />
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>

      <IndexingTasksPanel selectedSite={selectedSite} />
    </SeoPanelShell>
  );
}
