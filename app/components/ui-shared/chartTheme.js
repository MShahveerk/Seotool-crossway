/**
 * Chart palette for RoboSEO.Ai electric navy.
 *
 * Rules that keep a dashboard readable rather than festive:
 *  - Electric blue is the *primary* series only. If a chart has one line, it's blue.
 *  - Cyan is the second series, amber the third, grey the fourth. Four is the
 *    limit before a legend is doing the work the chart should do.
 *  - Comparison/previous-period lines reuse the same hue, dashed and dimmed —
 *    never a new colour, because it isn't new data.
 *  - Grid lines are white at very low alpha, so they read as texture, not ink.
 *
 * Hex values (not CSS vars) because SVG fills inside Recharts don't inherit
 * custom properties reliably across its gradient defs.
 */

export const CHART = {
  /** Series colours, in the order they should be used. */
  series: ["#00A3FF", "#00F0FF", "#FFB020", "#949CA5", "#B184FF"],

  primary: "#00A3FF",
  secondary: "#00F0FF",
  tertiary: "#FFB020",
  neutral: "#949CA5",
  accentAlt: "#B184FF",

  positive: "#00A3FF",
  negative: "#FF5C5C",
  caution: "#FFB020",

  grid: "rgba(255,255,255,0.06)",
  axis: "#6D757E",
  axisTick: { fontSize: 10, fill: "#6D757E" },

  surface: "#0E1624",
  canvas: "#070D18",
  hairline: "#2A3650",
  ink: "#F4F6F7",
  inkMuted: "#949CA5",

  /** Shared tooltip chrome so every chart's hover looks the same. */
  tooltip: {
    contentStyle: {
      background: "#1C2740",
      border: "1px solid #2A3650",
      borderRadius: "12px",
      color: "#F4F6F7",
      fontSize: "12px",
      boxShadow: "0 18px 48px -12px rgba(0,0,0,0.8)",
    },
    labelStyle: { color: "#949CA5", fontSize: "11px", fontWeight: 700 },
    itemStyle: { color: "#F4F6F7" },
    cursor: { stroke: "rgba(255,255,255,0.15)", strokeWidth: 1 },
  },
};

/** Pick a series colour by index, wrapping if a chart exceeds the palette. */
export function seriesColor(index = 0) {
  return CHART.series[index % CHART.series.length];
}

export default CHART;
