/**
 * Chart palette for Carbon Neon.
 *
 * Rules that keep a dashboard readable rather than festive:
 *  - Neon green is the *primary* series only. If a chart has one line, it's neon.
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
  series: ["#0EFF2A", "#38E1FF", "#FFB020", "#949CA5", "#B184FF"],

  primary: "#0EFF2A",
  secondary: "#38E1FF",
  tertiary: "#FFB020",
  neutral: "#949CA5",
  accentAlt: "#B184FF",

  positive: "#0EFF2A",
  negative: "#FF5C5C",
  caution: "#FFB020",

  grid: "rgba(255,255,255,0.06)",
  axis: "#6D757E",
  axisTick: { fontSize: 10, fill: "#6D757E" },

  surface: "#1A1E23",
  canvas: "#101317",
  hairline: "#333941",
  ink: "#F4F6F7",
  inkMuted: "#949CA5",

  /** Shared tooltip chrome so every chart's hover looks the same. */
  tooltip: {
    contentStyle: {
      background: "#2B3038",
      border: "1px solid #333941",
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
