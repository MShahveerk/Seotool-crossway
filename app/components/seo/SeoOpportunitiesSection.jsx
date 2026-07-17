"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FiRefreshCw, FiAlertTriangle, FiTarget, FiTrendingDown, FiLayers } from "react-icons/fi";
import SeoPanelShell, { formatNum, formatPct, formatPos } from "./SeoPanelShell";

function SeverityBadge({ severity }) {
  const s = severity || "medium";
  const cls =
    s === "high"
      ? "bg-red-50 text-red-700 border-red-200"
      : s === "low"
        ? "bg-gray-50 text-gray-600 border-gray-200"
        : "bg-amber-50 text-amber-800 border-amber-200";
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${cls}`}>
      {s}
    </span>
  );
}

function TaskCard({ icon: Icon, title, count, children }) {
  return (
    <section className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 text-[#1d9c35] shrink-0" />
          <h2 className="text-sm font-bold text-gray-900 truncate">{title}</h2>
        </div>
        <span className="text-xs font-semibold tabular-nums text-gray-500">{formatNum(count)}</span>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export default function SeoOpportunitiesSection({ selectedSite = "" }) {
  const [range, setRange] = useState("28d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pack, setPack] = useState(null);

  const load = useCallback(async () => {
    if (!selectedSite) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ url: selectedSite, range });
      const res = await fetch(`/api/searchconsole/opportunities?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load opportunities");
      setPack(data);
    } catch (e) {
      setError(e.message || "Failed to load opportunities");
      setPack(null);
    } finally {
      setLoading(false);
    }
  }, [selectedSite, range]);

  useEffect(() => {
    load();
  }, [load]);

  const weeklyTasks = useMemo(() => {
    if (!pack) return [];
    const tasks = [];
    for (const w of pack.sitemapWarnings || []) {
      tasks.push({ id: `sm-${w.type}`, severity: w.severity, label: w.message, group: "Sitemap" });
    }
    for (const g of pack.deviceGaps?.gaps || []) {
      tasks.push({ id: `dev-${g.type}`, severity: g.severity, label: g.message, group: "Device" });
    }
    const strike = (pack.strikingDistance || []).slice(0, 5);
    if (strike.length) {
      tasks.push({
        id: "strike",
        severity: "medium",
        label: `Polish ${strike.length} striking-distance queries (pos 8–20) — e.g. “${strike[0].query}”.`,
        group: "Rankings",
      });
    }
    const cann = (pack.cannibalization || []).slice(0, 3);
    if (cann.length) {
      tasks.push({
        id: "cann",
        severity: "high",
        label: `Resolve keyword cannibalization on ${cann.length}+ queries (same keyword → multiple URLs).`,
        group: "Content",
      });
    }
    const decayQ = (pack.decayingQueries || []).slice(0, 3);
    if (decayQ.length) {
      tasks.push({
        id: "decay",
        severity: "high",
        label: `Investigate ${decayQ.length}+ decaying queries vs prior period (largest drop: “${decayQ[0].query}”).`,
        group: "Decay",
      });
    }
    return tasks;
  }, [pack]);

  return (
    <SeoPanelShell
      title="SEO Opportunities"
      description="Actionable queue for this week: striking distance, cannibalization, traffic decay, device gaps, and sitemap health."
      selectedSite={selectedSite}
      range={range}
      onRangeChange={setRange}
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
      {pack ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Tasks this week</p>
              <p className="mt-2 text-3xl font-bold text-gray-900 tabular-nums">{formatNum(weeklyTasks.length)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Striking distance</p>
              <p className="mt-2 text-3xl font-bold text-gray-900 tabular-nums">
                {formatNum((pack.strikingDistance || []).length)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Cannibalization</p>
              <p className="mt-2 text-3xl font-bold text-gray-900 tabular-nums">
                {formatNum((pack.cannibalization || []).length)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Decaying queries</p>
              <p className="mt-2 text-3xl font-bold text-gray-900 tabular-nums">
                {formatNum((pack.decayingQueries || []).length)}
              </p>
            </div>
          </div>

          <section className="rounded-xl border border-gray-200 p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <FiAlertTriangle className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">SEO tasks this week</h2>
            </div>
            {weeklyTasks.length === 0 ? (
              <p className="text-sm text-gray-500">No urgent SEO tasks for this period — keep monitoring.</p>
            ) : (
              <ul className="space-y-2">
                {weeklyTasks.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5"
                  >
                    <SeverityBadge severity={t.severity} />
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{t.group}</p>
                      <p className="text-sm text-gray-800 mt-0.5">{t.label}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {(pack.deviceGaps?.gaps || []).length > 0 || (pack.sitemapWarnings || []).length > 0 ? (
              <div className="mt-4 space-y-2">
                {(pack.sitemapWarnings || []).map((w) => (
                  <div
                    key={w.type}
                    className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                  >
                    {w.message}
                  </div>
                ))}
                {(pack.deviceGaps?.gaps || []).map((g) => (
                  <div
                    key={g.type}
                    className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900"
                  >
                    {g.message}
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <TaskCard icon={FiTarget} title="Striking distance (pos 8–20)" count={(pack.strikingDistance || []).length}>
              {(pack.strikingDistance || []).length === 0 ? (
                <p className="text-sm text-gray-500">No striking-distance queries in this range.</p>
              ) : (
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-sm min-w-[420px]">
                    <thead className="sticky top-0 bg-white">
                      <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b">
                        <th className="py-2 pr-2">Query</th>
                        <th className="py-2 pr-2">Pos</th>
                        <th className="py-2 pr-2">Impr</th>
                        <th className="py-2">CTR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(pack.strikingDistance || []).slice(0, 40).map((r) => (
                        <tr key={r.query} className="border-b border-gray-50">
                          <td className="py-2 pr-2 font-medium text-gray-900 max-w-[220px] truncate">{r.query}</td>
                          <td className="py-2 pr-2 tabular-nums">{formatPos(r.position)}</td>
                          <td className="py-2 pr-2 tabular-nums">{formatNum(r.impressions)}</td>
                          <td className="py-2 tabular-nums">{formatPct(r.ctr)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TaskCard>

            <TaskCard icon={FiLayers} title="Keyword cannibalization" count={(pack.cannibalization || []).length}>
              {(pack.cannibalization || []).length === 0 ? (
                <p className="text-sm text-gray-500">No multi-URL query conflicts detected.</p>
              ) : (
                <ul className="space-y-3 max-h-80 overflow-y-auto">
                  {(pack.cannibalization || []).slice(0, 25).map((c) => (
                    <li key={c.query} className="border-b border-gray-50 pb-3 last:border-0">
                      <p className="text-sm font-semibold text-gray-900">{c.query}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {c.pageCount} pages · {formatNum(c.totalImpressions)} impr · primary:{" "}
                        <span className="break-all">{c.primaryPage}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </TaskCard>

            <TaskCard icon={FiTrendingDown} title="Decaying queries" count={(pack.decayingQueries || []).length}>
              {(pack.decayingQueries || []).length === 0 ? (
                <p className="text-sm text-gray-500">No significant query decay vs prior period.</p>
              ) : (
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-sm min-w-[420px]">
                    <thead className="sticky top-0 bg-white">
                      <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b">
                        <th className="py-2 pr-2">Query</th>
                        <th className="py-2 pr-2">Clicks</th>
                        <th className="py-2">Δ%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(pack.decayingQueries || []).slice(0, 40).map((r) => (
                        <tr key={r.query} className="border-b border-gray-50">
                          <td className="py-2 pr-2 font-medium text-gray-900 max-w-[220px] truncate">{r.query}</td>
                          <td className="py-2 pr-2 tabular-nums">
                            {formatNum(r.clicks)} ← {formatNum(r.previousClicks)}
                          </td>
                          <td className="py-2 tabular-nums text-red-600 font-semibold">
                            {Number(r.clickChangePct || 0).toFixed(0)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TaskCard>

            <TaskCard icon={FiTrendingDown} title="Decaying pages" count={(pack.decayingPages || []).length}>
              {(pack.decayingPages || []).length === 0 ? (
                <p className="text-sm text-gray-500">No significant page decay vs prior period.</p>
              ) : (
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-sm min-w-[420px]">
                    <thead className="sticky top-0 bg-white">
                      <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b">
                        <th className="py-2 pr-2">Page</th>
                        <th className="py-2 pr-2">Clicks</th>
                        <th className="py-2">Δ%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(pack.decayingPages || []).slice(0, 40).map((r) => (
                        <tr key={r.page} className="border-b border-gray-50">
                          <td className="py-2 pr-2 font-medium text-gray-900 max-w-[260px] truncate">{r.page}</td>
                          <td className="py-2 pr-2 tabular-nums">
                            {formatNum(r.clicks)} ← {formatNum(r.previousClicks)}
                          </td>
                          <td className="py-2 tabular-nums text-red-600 font-semibold">
                            {Number(r.clickChangePct || 0).toFixed(0)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TaskCard>
          </div>
        </>
      ) : null}
    </SeoPanelShell>
  );
}
