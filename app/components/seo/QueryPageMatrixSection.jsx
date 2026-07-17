"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SeoPanelShell, { formatNum, formatPct, formatPos } from "./SeoPanelShell";

export default function QueryPageMatrixSection({ selectedSite = "" }) {
  const [range, setRange] = useState("28d");
  const [tab, setTab] = useState("matrix");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pairs, setPairs] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [queryFilter, setQueryFilter] = useState("");

  const load = useCallback(async () => {
    if (!selectedSite) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const base = `url=${encodeURIComponent(selectedSite)}&range=${range}`;
      const [mRes, sRes] = await Promise.all([
        fetch(`/api/searchconsole/insights?${base}&view=matrix`),
        fetch(`/api/searchconsole/insights?${base}&view=striking`),
      ]);
      const mData = await mRes.json();
      const sData = await sRes.json();
      if (!mRes.ok) throw new Error(mData.error || "Failed to load query/page matrix");
      if (!sRes.ok) throw new Error(sData.error || "Failed to load striking-distance list");
      setPairs(mData.pairs || []);
      setOpportunities(sData.opportunities || []);
    } catch (e) {
      setError(e.message || "Failed to load SEO opportunities");
      setPairs([]);
      setOpportunities([]);
    } finally {
      setLoading(false);
    }
  }, [selectedSite, range]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredPairs = useMemo(() => {
    const q = queryFilter.trim().toLowerCase();
    if (!q) return pairs.slice(0, 200);
    return pairs
      .filter(
        (p) =>
          String(p.query).toLowerCase().includes(q) || String(p.page).toLowerCase().includes(q)
      )
      .slice(0, 200);
  }, [pairs, queryFilter]);

  return (
    <SeoPanelShell
      title="Query × Page & Opportunities"
      description="See which keywords drive which pages, plus striking-distance queries worth optimizing (positions 8–20, high impressions, low CTR)."
      selectedSite={selectedSite}
      range={range}
      onRangeChange={setRange}
      loading={loading}
      error={error}
      action={
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          <button
            type="button"
            onClick={() => setTab("matrix")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
              tab === "matrix" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"
            }`}
          >
            Query × Page
          </button>
          <button
            type="button"
            onClick={() => setTab("striking")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
              tab === "striking" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"
            }`}
          >
            Striking distance
          </button>
        </div>
      }
    >
      {tab === "matrix" ? (
        <>
          <div className="mb-3">
            <input
              type="search"
              value={queryFilter}
              onChange={(e) => setQueryFilter(e.target.value)}
              placeholder="Filter by query or page URL…"
              className="w-full sm:max-w-md rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">
                    <th className="px-4 py-3">Query</th>
                    <th className="px-4 py-3">Page</th>
                    <th className="px-4 py-3">Clicks</th>
                    <th className="px-4 py-3">Impr.</th>
                    <th className="px-4 py-3">CTR</th>
                    <th className="px-4 py-3">Pos.</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPairs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                        No query/page pairs for this period.
                      </td>
                    </tr>
                  ) : (
                    filteredPairs.map((row, i) => (
                      <tr key={`${row.query}-${row.page}-${i}`} className="border-b border-gray-50 hover:bg-gray-50/80">
                        <td className="px-4 py-2.5 font-medium text-gray-900 max-w-[200px] truncate" title={row.query}>
                          {row.query}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 max-w-[280px] truncate" title={row.page}>
                          {row.page}
                        </td>
                        <td className="px-4 py-2.5 tabular-nums">{formatNum(row.clicks)}</td>
                        <td className="px-4 py-2.5 tabular-nums">{formatNum(row.impressions)}</td>
                        <td className="px-4 py-2.5 tabular-nums">{formatPct(row.ctr)}</td>
                        <td className="px-4 py-2.5 tabular-nums">{formatPos(row.position)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 text-xs text-amber-900">
            Opportunities: position 8–20, ≥50 impressions, CTR under 8%. High-impression queries closest to page one.
          </div>
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">
                  <th className="px-4 py-3">Query</th>
                  <th className="px-4 py-3">Impr.</th>
                  <th className="px-4 py-3">Clicks</th>
                  <th className="px-4 py-3">CTR</th>
                  <th className="px-4 py-3">Pos.</th>
                  <th className="px-4 py-3">Score</th>
                </tr>
              </thead>
              <tbody>
                {opportunities.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                      No striking-distance opportunities found for this period.
                    </td>
                  </tr>
                ) : (
                  opportunities.map((row) => (
                    <tr key={row.query} className="border-b border-gray-50 hover:bg-gray-50/80">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{row.query}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatNum(row.impressions)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatNum(row.clicks)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatPct(row.ctr)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatPos(row.position)}</td>
                      <td className="px-4 py-2.5 tabular-nums font-semibold text-[#1d9c35]">
                        {formatNum(row.opportunityScore)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </SeoPanelShell>
  );
}
