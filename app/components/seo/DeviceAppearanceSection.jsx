"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import SeoPanelShell, { formatNum, formatPct, formatPos } from "./SeoPanelShell";

const DEVICE_COLORS = { DESKTOP: "#111827", MOBILE: "#1d9c35", TABLET: "#64748b" };

export default function DeviceAppearanceSection({ selectedSite = "" }) {
  const [range, setRange] = useState("28d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [devices, setDevices] = useState([]);
  const [appearances, setAppearances] = useState([]);

  const load = useCallback(async () => {
    if (!selectedSite) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [dRes, aRes] = await Promise.all([
        fetch(
          `/api/searchconsole/insights?url=${encodeURIComponent(selectedSite)}&range=${range}&view=device`
        ),
        fetch(
          `/api/searchconsole/insights?url=${encodeURIComponent(selectedSite)}&range=${range}&view=appearance`
        ),
      ]);
      const dData = await dRes.json();
      const aData = await aRes.json();
      if (!dRes.ok) throw new Error(dData.error || "Failed to load device data");
      if (!aRes.ok) throw new Error(aData.error || "Failed to load search appearance");
      setDevices(dData.devices || []);
      setAppearances(aData.appearances || []);
    } catch (e) {
      setError(e.message || "Failed to load insights");
      setDevices([]);
      setAppearances([]);
    } finally {
      setLoading(false);
    }
  }, [selectedSite, range]);

  useEffect(() => {
    load();
  }, [load]);

  const deviceChart = useMemo(
    () =>
      devices.map((d) => ({
        name: d.label,
        device: d.device,
        clicks: d.clicks,
        impressions: d.impressions,
      })),
    [devices]
  );

  return (
    <SeoPanelShell
      title="Device & Search Appearance"
      description="See how your site performs by device and which Google search result formats drive traffic."
      selectedSite={selectedSite}
      range={range}
      onRangeChange={setRange}
      loading={loading}
      error={error}
    >
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="rounded-xl border border-gray-200 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4">Device breakdown</h2>
          {deviceChart.length === 0 ? (
            <p className="text-sm text-gray-500 py-12 text-center">No device data for this period.</p>
          ) : (
            <>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deviceChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value, name) => [formatNum(value), name === "clicks" ? "Clicks" : "Impressions"]}
                    />
                    <Bar dataKey="clicks" name="clicks" radius={[6, 6, 0, 0]}>
                      {deviceChart.map((row) => (
                        <Cell key={row.device} fill={DEVICE_COLORS[row.device] || "#94a3b8"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100">
                      <th className="py-2 pr-2">Device</th>
                      <th className="py-2 pr-2">Clicks</th>
                      <th className="py-2 pr-2">Impr.</th>
                      <th className="py-2 pr-2">CTR</th>
                      <th className="py-2">Pos.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map((d) => (
                      <tr key={d.device} className="border-b border-gray-50">
                        <td className="py-2.5 pr-2 font-medium text-gray-900">{d.label}</td>
                        <td className="py-2.5 pr-2 tabular-nums">{formatNum(d.clicks)}</td>
                        <td className="py-2.5 pr-2 tabular-nums">{formatNum(d.impressions)}</td>
                        <td className="py-2.5 pr-2 tabular-nums">{formatPct(d.ctr)}</td>
                        <td className="py-2.5 tabular-nums">{formatPos(d.position)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4">Search appearance</h2>
          {appearances.length === 0 ? (
            <p className="text-sm text-gray-500 py-12 text-center">
              No rich-result appearance data for this period. Google only returns types that earned impressions.
            </p>
          ) : (
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100">
                    <th className="py-2 pr-2">Appearance</th>
                    <th className="py-2 pr-2">Clicks</th>
                    <th className="py-2 pr-2">Impr.</th>
                    <th className="py-2 pr-2">CTR</th>
                    <th className="py-2">Pos.</th>
                  </tr>
                </thead>
                <tbody>
                  {appearances.map((a) => (
                    <tr key={a.appearance} className="border-b border-gray-50">
                      <td className="py-2.5 pr-2 font-medium text-gray-900">{a.label}</td>
                      <td className="py-2.5 pr-2 tabular-nums">{formatNum(a.clicks)}</td>
                      <td className="py-2.5 pr-2 tabular-nums">{formatNum(a.impressions)}</td>
                      <td className="py-2.5 pr-2 tabular-nums">{formatPct(a.ctr)}</td>
                      <td className="py-2.5 tabular-nums">{formatPos(a.position)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </SeoPanelShell>
  );
}
