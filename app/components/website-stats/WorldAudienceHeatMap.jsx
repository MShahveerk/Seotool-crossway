"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { geoEqualEarth, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import {
  alpha3FromNumericId,
  countryDisplayName,
  normalizeCountryCode,
} from "@/lib/geo/isoCountries";

const LAND_IDLE = "#d7e0e6";
const LAND_STROKE = "rgba(255,255,255,0.85)";
const OCEAN_A = "#e9f3f7";
const OCEAN_B = "#f4faf8";
const HEAT = ["#c6f6d5", "#86efac", "#4ade80", "#22c55e", "#15803d", "#14532d"];

function heatColor(value, max) {
  if (!value || !max) return LAND_IDLE;
  const t = Math.sqrt(Math.max(0, Math.min(1, value / max)));
  const idx = Math.min(HEAT.length - 1, Math.floor(t * (HEAT.length - 1)));
  return HEAT[idx];
}

function formatNum(value) {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(value || 0)));
}

function buildValueMap(countries) {
  const map = new Map();
  for (const row of countries || []) {
    const code = normalizeCountryCode(row.country);
    if (!code) continue;
    const clicks = Number(row.clicks) || 0;
    map.set(code, (map.get(code) || 0) + clicks);
  }
  return map;
}

let cachedGeographies = null;
let cachePromise = null;

async function loadWorldGeographies() {
  if (cachedGeographies) return cachedGeographies;
  if (!cachePromise) {
    cachePromise = import("world-atlas/countries-110m.json").then((mod) => {
      const topo = mod.default || mod;
      const fc = feature(topo, topo.objects.countries);
      // Drop Antarctica — cleaner continents for audience maps.
      cachedGeographies = (fc.features || []).filter((g) => String(g.id) !== "10");
      return cachedGeographies;
    });
  }
  return cachePromise;
}

/**
 * Beautiful world heat map for Search Console country traffic.
 * @param {"compact"|"detail"} variant
 */
export default function WorldAudienceHeatMap({
  countries = [],
  variant = "compact",
  metricLabel = "Clicks",
  showHeading = true,
}) {
  const svgRef = useRef(null);
  const [geographies, setGeographies] = useState([]);
  const [hover, setHover] = useState(null);
  const [loadError, setLoadError] = useState("");

  const isDetail = variant === "detail";
  const width = isDetail ? 920 : 640;
  const height = isDetail ? 420 : 280;

  const valueMap = useMemo(() => buildValueMap(countries), [countries]);
  const maxValue = useMemo(() => {
    let max = 0;
    for (const v of valueMap.values()) max = Math.max(max, v);
    return max;
  }, [valueMap]);

  const ranked = useMemo(() => {
    return [...valueMap.entries()]
      .map(([code, clicks]) => ({ code, clicks, name: countryDisplayName(code) }))
      .sort((a, b) => b.clicks - a.clicks);
  }, [valueMap]);

  useEffect(() => {
    let cancelled = false;
    loadWorldGeographies()
      .then((features) => {
        if (!cancelled) setGeographies(features);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || "Failed to load world map");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { paths, projection } = useMemo(() => {
    const proj = geoEqualEarth()
      .fitExtent(
        [
          [8, 12],
          [width - 8, height - 18],
        ],
        { type: "Sphere" }
      )
      .precision(0.5);
    const pathGen = geoPath(proj);
    const next = (geographies || []).map((geo) => {
      const alpha3 = alpha3FromNumericId(geo.id);
      const value = alpha3 ? valueMap.get(alpha3) || 0 : 0;
      return {
        id: String(geo.id),
        alpha3,
        value,
        d: pathGen(geo) || "",
        name: alpha3 ? countryDisplayName(alpha3) : "Unknown",
      };
    });
    return { paths: next, projection: proj };
  }, [geographies, valueMap, width, height]);

  const spherePath = useMemo(() => {
    if (!projection) return "";
    return geoPath(projection)({ type: "Sphere" }) || "";
  }, [projection]);

  const graticulePath = useMemo(() => {
    if (!projection) return "";
    const lines = [];
    for (let lat = -60; lat <= 60; lat += 30) {
      const coords = [];
      for (let lon = -180; lon <= 180; lon += 5) coords.push([lon, lat]);
      lines.push({ type: "LineString", coordinates: coords });
    }
    for (let lon = -150; lon <= 150; lon += 30) {
      const coords = [];
      for (let lat = -80; lat <= 80; lat += 5) coords.push([lon, lat]);
      lines.push({ type: "LineString", coordinates: coords });
    }
    return geoPath(projection)({ type: "GeometryCollection", geometries: lines }) || "";
  }, [projection]);

  const listLimit = isDetail ? 12 : 7;
  const topList = ranked.slice(0, listLimit);

  return (
    <div className={isDetail ? "space-y-4" : "space-y-3"}>
      <div className="flex items-start justify-between gap-3">
        {showHeading ? (
          <div>
            <h3
              className={`font-semibold tracking-tight text-gray-900 ${
                isDetail ? "text-xl" : "text-[15px]"
              }`}
            >
              Where your audience is
            </h3>
            <p className={`text-gray-500 ${isDetail ? "text-sm mt-0.5" : "text-[11px] mt-0.5"}`}>
              Search traffic heat by country
              {maxValue ? ` · peak ${formatNum(maxValue)} ${metricLabel.toLowerCase()}` : ""}
            </p>
          </div>
        ) : (
          <p className={`text-gray-500 ${isDetail ? "text-sm" : "text-[11px]"}`}>
            Search traffic heat by country
            {maxValue ? ` · peak ${formatNum(maxValue)} ${metricLabel.toLowerCase()}` : ""}
          </p>
        )}
        <div className="hidden sm:flex items-center gap-1.5 pt-1 shrink-0">
          <span className="text-[10px] uppercase tracking-wide text-gray-400">Low</span>
          <div className="flex h-2 w-24 overflow-hidden rounded-full ring-1 ring-black/5">
            {HEAT.map((c) => (
              <span key={c} className="flex-1" style={{ background: c }} />
            ))}
          </div>
          <span className="text-[10px] uppercase tracking-wide text-gray-400">High</span>
        </div>
      </div>

      <div className={`grid gap-3 ${isDetail ? "lg:grid-cols-[1.7fr_1fr]" : "grid-cols-1 sm:grid-cols-[1.35fr_1fr]"}`}>
        <div
          className={`relative overflow-hidden rounded-xl border border-emerald-900/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] ${
            isDetail ? "min-h-[320px]" : "min-h-[168px]"
          }`}
          style={{
            background: `radial-gradient(120% 90% at 50% 20%, ${OCEAN_B} 0%, ${OCEAN_A} 55%, #dfeaf0 100%)`,
          }}
        >
          {/* soft atmosphere */}
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background:
                "radial-gradient(ellipse 70% 45% at 50% 110%, rgba(34,197,94,0.12), transparent 60%), radial-gradient(ellipse 40% 30% at 18% 22%, rgba(255,255,255,0.55), transparent 55%)",
            }}
          />

          {loadError ? (
            <div className="relative z-10 flex h-full min-h-[168px] items-center justify-center p-4 text-center text-xs text-amber-700">
              {loadError}
            </div>
          ) : !paths.length ? (
            <div className="relative z-10 flex h-full min-h-[168px] items-center justify-center">
              <div className="h-8 w-8 animate-pulse rounded-full bg-emerald-200/60" />
            </div>
          ) : (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${width} ${height}`}
              className="relative z-10 h-full w-full"
              role="img"
              aria-label="World map of audience traffic by country"
            >
              <defs>
                <filter id="landShadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#0f172a" floodOpacity="0.12" />
                </filter>
              </defs>

              {spherePath ? (
                <path
                  d={spherePath}
                  fill="url(#oceanFill)"
                  style={{ fill: "rgba(255,255,255,0.22)" }}
                  stroke="rgba(148,163,184,0.35)"
                  strokeWidth={0.6}
                />
              ) : null}

              {graticulePath ? (
                <path
                  d={graticulePath}
                  fill="none"
                  stroke="rgba(148,163,184,0.22)"
                  strokeWidth={0.4}
                  strokeDasharray="2 3"
                />
              ) : null}

              <g filter="url(#landShadow)">
                {paths.map((p) => {
                  const active = hover?.alpha3 && hover.alpha3 === p.alpha3;
                  const hasTraffic = p.value > 0;
                  return (
                    <path
                      key={p.id}
                      d={p.d}
                      fill={heatColor(p.value, maxValue)}
                      stroke={active ? "#065f46" : LAND_STROKE}
                      strokeWidth={active ? 1.1 : hasTraffic ? 0.55 : 0.4}
                      className="transition-[fill,stroke-width] duration-200"
                      style={{ cursor: hasTraffic || p.alpha3 ? "pointer" : "default" }}
                      onMouseEnter={(e) => {
                        if (!p.alpha3) return;
                        const rect = svgRef.current?.getBoundingClientRect();
                        setHover({
                          alpha3: p.alpha3,
                          name: p.name,
                          value: p.value,
                          x: e.clientX - (rect?.left || 0),
                          y: e.clientY - (rect?.top || 0),
                        });
                      }}
                      onMouseMove={(e) => {
                        if (!p.alpha3) return;
                        const rect = svgRef.current?.getBoundingClientRect();
                        setHover((prev) =>
                          prev
                            ? {
                                ...prev,
                                x: e.clientX - (rect?.left || 0),
                                y: e.clientY - (rect?.top || 0),
                              }
                            : prev
                        );
                      }}
                      onMouseLeave={() => setHover(null)}
                    />
                  );
                })}
              </g>
            </svg>
          )}

          {hover ? (
            <div
              className="pointer-events-none absolute z-20 rounded-lg border border-emerald-900/10 bg-white/95 px-2.5 py-1.5 text-[11px] shadow-lg backdrop-blur-sm"
              style={{
                left: Math.min(Math.max(hover.x + 12, 8), (svgRef.current?.clientWidth || 240) - 140),
                top: Math.max(hover.y - 36, 8),
              }}
            >
              <div className="font-semibold text-gray-900">{hover.name}</div>
              <div className="text-emerald-700">
                {formatNum(hover.value)} {metricLabel.toLowerCase()}
              </div>
            </div>
          ) : null}

          {!ranked.length && paths.length ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 text-center text-[11px] text-gray-500">
              No country traffic in this range yet
            </div>
          ) : null}
        </div>

        <div className={isDetail ? "rounded-xl border border-gray-200 bg-white p-3" : ""}>
          <div className="mb-1.5 grid grid-cols-[1fr_auto] gap-2 border-b border-gray-200 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            <span>Country</span>
            <span className="text-right">{metricLabel}</span>
          </div>
          <div className={`space-y-1.5 ${isDetail ? "max-h-[340px] overflow-y-auto pr-1" : ""}`}>
            {topList.length ? (
              topList.map((row, i) => {
                const pct = maxValue ? (row.clicks / maxValue) * 100 : 0;
                const active = hover?.alpha3 === row.code;
                return (
                  <div
                    key={row.code}
                    className={`rounded-md px-1 py-0.5 transition-colors ${active ? "bg-emerald-50" : ""}`}
                    onMouseEnter={() =>
                      setHover({
                        alpha3: row.code,
                        name: row.name,
                        value: row.clicks,
                        x: 24,
                        y: 24,
                      })
                    }
                    onMouseLeave={() => setHover(null)}
                  >
                    <div className="mb-0.5 flex items-center justify-between gap-2 text-xs">
                      <span className="flex min-w-0 items-center gap-1.5 text-gray-800">
                        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[9px] font-bold text-emerald-800">
                          {i + 1}
                        </span>
                        <span className="truncate">{row.name}</span>
                      </span>
                      <span className="shrink-0 font-medium text-gray-800">{formatNum(row.clicks)}</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-emerald-600 transition-all duration-500"
                        style={{ width: `${Math.max(pct, row.clicks ? 4 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="py-6 text-center text-xs text-gray-500">No country data for this period.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
