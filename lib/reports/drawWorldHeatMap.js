/**
 * Draw a world audience heat map onto a pdf-lib landscape slide.
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { geoEqualEarth, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import { rgb } from "pdf-lib";
import { alpha3FromNumericId, countryDisplayName, normalizeCountryCode } from "../geo/isoCountries.js";
import { COLORS, nf, safePdfText } from "./slideDeckTheme.js";

const require = createRequire(import.meta.url);

let cachedFeatures = null;

async function loadFeatures() {
  if (cachedFeatures) return cachedFeatures;
  let topo;
  try {
    topo = require("world-atlas/countries-110m.json");
  } catch {
    const p = path.join(process.cwd(), "node_modules", "world-atlas", "countries-110m.json");
    topo = JSON.parse(fs.readFileSync(p, "utf8"));
  }
  const fc = feature(topo, topo.objects.countries);
  cachedFeatures = (fc.features || []).filter((g) => String(g.id) !== "10");
  return cachedFeatures;
}

function heatColor(value, max) {
  if (!value || !max) return COLORS.heatIdle;
  const t = Math.sqrt(Math.max(0, Math.min(1, value / max)));
  const stops = [
    [0.78, 0.96, 0.83],
    [0.53, 0.94, 0.67],
    [0.29, 0.87, 0.5],
    [0.13, 0.77, 0.37],
    [0.08, 0.5, 0.24],
    [0.08, 0.33, 0.18],
  ];
  const idx = Math.min(stops.length - 1, Math.floor(t * (stops.length - 1)));
  const [r, g, b] = stops[idx];
  return rgb(r, g, b);
}

function buildValueMap(countries) {
  const map = new Map();
  for (const row of countries || []) {
    const code = normalizeCountryCode(row.country);
    if (!code) continue;
    map.set(code, (map.get(code) || 0) + (Number(row.clicks) || 0));
  }
  return map;
}

/** Build an SVG path string in PDF coords (y-up) for a geography. */
function geographyToPdfPath(geo, projection, ox, oyBottom, mapH) {
  let d = "";
  const context = {
    beginPath() {},
    moveTo(px, py) {
      d += `M ${ox + px} ${oyBottom + (mapH - py)} `;
    },
    lineTo(px, py) {
      d += `L ${ox + px} ${oyBottom + (mapH - py)} `;
    },
    closePath() {
      d += "Z ";
    },
    // bezier approximations unused by most country polygons after projection
    bezierCurveTo(c1x, c1y, c2x, c2y, px, py) {
      d += `C ${ox + c1x} ${oyBottom + (mapH - c1y)} ${ox + c2x} ${oyBottom + (mapH - c2y)} ${ox + px} ${oyBottom + (mapH - py)} `;
    },
    quadraticCurveTo(cx, cy, px, py) {
      d += `Q ${ox + cx} ${oyBottom + (mapH - cy)} ${ox + px} ${oyBottom + (mapH - py)} `;
    },
    arc() {},
    rect() {},
  };
  geoPath(projection, context)(geo);
  return d.trim();
}

export async function drawWorldHeatMapSlide(page, fonts, countries, {
  x = 40,
  y = 70,
  width = 500,
  height = 340,
} = {}) {
  const features = await loadFeatures();
  const valueMap = buildValueMap(countries);
  let max = 0;
  for (const v of valueMap.values()) max = Math.max(max, v);

  const projection = geoEqualEarth().fitExtent(
    [
      [2, 2],
      [width - 2, height - 2],
    ],
    { type: "Sphere" }
  );

  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: rgb(0.91, 0.95, 0.97),
    borderColor: COLORS.border,
    borderWidth: 1,
  });

  for (const geo of features) {
    const alpha3 = alpha3FromNumericId(geo.id);
    const value = alpha3 ? valueMap.get(alpha3) || 0 : 0;
    const d = geographyToPdfPath(geo, projection, x, y, height);
    if (!d) continue;
    try {
      page.drawSvgPath(d, {
        color: heatColor(value, max),
        borderColor: rgb(1, 1, 1),
        borderWidth: 0.4,
      });
    } catch {
      /* skip malformed */
    }
  }

  const legendY = y - 6;
  page.drawText("Low", {
    x,
    y: legendY - 10,
    size: 8,
    font: fonts.regular,
    color: COLORS.muted,
  });
  [0.15, 0.35, 0.55, 0.75, 0.9, 1].forEach((t, i) => {
    page.drawRectangle({
      x: x + 28 + i * 22,
      y: legendY - 12,
      width: 20,
      height: 8,
      color: heatColor(t * (max || 1), max || 1),
    });
  });
  page.drawText("High", {
    x: x + 28 + 6 * 22 + 6,
    y: legendY - 10,
    size: 8,
    font: fonts.regular,
    color: COLORS.muted,
  });

  return { max, valueMap };
}

export function drawCountryRankList(page, fonts, valueMap, {
  x,
  yTop,
  width = 240,
  limit = 10,
} = {}) {
  const ranked = [...valueMap.entries()]
    .map(([code, clicks]) => ({ code, clicks, name: countryDisplayName(code) }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, limit);
  const max = ranked[0]?.clicks || 1;
  let y = yTop;
  page.drawText("Top countries", {
    x,
    y,
    size: 11,
    font: fonts.semibold,
    color: COLORS.slate,
  });
  y -= 22;
  ranked.forEach((row, i) => {
    page.drawText(`${i + 1}. ${safePdfText(row.name, 28)}`, {
      x,
      y,
      size: 9,
      font: fonts.regular,
      color: COLORS.slateSoft,
    });
    page.drawText(nf(row.clicks), {
      x: x + width - 50,
      y,
      size: 9,
      font: fonts.semibold,
      color: COLORS.slate,
    });
    y -= 12;
    const barW = Math.max(4, (row.clicks / max) * (width - 8));
    page.drawRectangle({
      x,
      y: y + 2,
      width: width - 8,
      height: 4,
      color: COLORS.border,
    });
    page.drawRectangle({
      x,
      y: y + 2,
      width: barW,
      height: 4,
      color: COLORS.accentDeep,
    });
    y -= 14;
  });
  if (!ranked.length) {
    page.drawText("No country traffic in this period.", {
      x,
      y,
      size: 9,
      font: fonts.regular,
      color: COLORS.muted,
    });
  }
}
