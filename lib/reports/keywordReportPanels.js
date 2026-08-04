/**
 * Bucket domain keywords for report slides.
 */
import { COLORS, MARGIN, PAGE_W, nf, safePdfText } from "./slideDeckTheme.js";

function posOf(k) {
  const p = k?.position ?? k?.pos;
  return p != null && Number.isFinite(Number(p)) ? Number(p) : null;
}

function volOf(k) {
  const v = k?.volume ?? k?.searchVolume;
  return v != null && Number.isFinite(Number(v)) ? Number(v) : 0;
}

function trafOf(k) {
  const t = k?.traffic;
  return t != null && Number.isFinite(Number(t)) ? Number(t) : 0;
}

function kwKey(k) {
  return String(k?.keyword || k?.name || "")
    .trim()
    .toLowerCase();
}

function uniqueByKeyword(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = kwKey(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

/**
 * @returns {{ ranked: object[], crucial: object[], traffic: object[] }}
 */
export function bucketKeywordsForReport(keywords, { limit = 8 } = {}) {
  const list = Array.isArray(keywords) ? keywords.filter((k) => kwKey(k)) : [];

  const ranked = uniqueByKeyword(
    list
      .filter((k) => {
        const p = posOf(k);
        return p != null && p >= 1 && p <= 20;
      })
      .sort((a, b) => posOf(a) - posOf(b) || trafOf(b) - trafOf(a))
  ).slice(0, limit);

  const crucialPool = list
    .filter((k) => {
      const p = posOf(k);
      return p != null && p >= 4 && p <= 20 && volOf(k) > 0;
    })
    .sort((a, b) => {
      const score = (k) => volOf(k) * (21 - (posOf(k) || 20));
      return score(b) - score(a) || volOf(b) - volOf(a);
    });
  let crucial = uniqueByKeyword(crucialPool).slice(0, limit);
  if (crucial.length < Math.min(4, limit)) {
    const filler = list
      .filter((k) => volOf(k) > 0 && posOf(k) != null)
      .sort((a, b) => volOf(b) - volOf(a));
    crucial = uniqueByKeyword([...crucial, ...filler]).slice(0, limit);
  }

  const traffic = uniqueByKeyword(
    [...list].sort((a, b) => trafOf(b) - trafOf(a) || volOf(b) - volOf(a))
  )
    .filter((k) => trafOf(k) > 0 || posOf(k) != null)
    .slice(0, limit);

  return { ranked, crucial, traffic };
}

function toRow(k) {
  const p = posOf(k);
  return {
    keyword: String(k.keyword || k.name || "—"),
    pos: p != null ? String(Math.round(p * 10) / 10) : "—",
    vol: nf(volOf(k) || null),
    traf: nf(trafOf(k) || null),
  };
}

/**
 * Three-column keyword breakdown under Domain intelligence KPIs.
 */
export function drawKeywordInsightPanels(deck, page, keywords, {
  yTop = 390,
  yBottom = 56,
  limit = 7,
  enabled = { ranked: true, crucial: true, traffic: true },
} = {}) {
  const buckets = bucketKeywordsForReport(keywords, { limit });
  const gap = 12;
  const allPanels = [
    {
      key: "ranked",
      title: "Ranked",
      caption: "Already on page 1–2",
      rows: buckets.ranked,
      empty: "No rankings in positions 1–20",
    },
    {
      key: "crucial",
      title: "Crucial",
      caption: "High volume · close to winning",
      rows: buckets.crucial,
      empty: "No striking-distance keywords",
    },
    {
      key: "traffic",
      title: "Highest traffic",
      caption: "Driving the most visits",
      rows: buckets.traffic,
      empty: "No traffic-bearing keywords yet",
    },
  ].filter((p) => enabled[p.key] !== false);

  if (!allPanels.length) return;

  const panelW =
    allPanels.length === 1
      ? PAGE_W - MARGIN * 2
      : (PAGE_W - MARGIN * 2 - gap * (allPanels.length - 1)) / allPanels.length;
  const panels = allPanels;

  const headerH = 28;
  const tableHeaderH = 18;
  const lineH = 9;
  const usableH = Math.max(80, yTop - yBottom - headerH - tableHeaderH);

  panels.forEach((panel, i) => {
    const x = MARGIN + i * (panelW + gap);
    let y = yTop;

    page.drawText(panel.title.toUpperCase(), {
      x,
      y,
      size: 8,
      font: deck.fonts.bold,
      color: COLORS.cloud,
    });
    y -= 12;
    page.drawText(safePdfText(panel.caption, 48), {
      x,
      y,
      size: 7,
      font: deck.fonts.regular,
      color: COLORS.muted,
    });
    y -= 14;

    const rows = panel.rows.slice(0, limit).map(toRow);
    if (!rows.length) {
      page.drawText(panel.empty, {
        x,
        y: y - 4,
        size: 8,
        font: deck.fonts.regular,
        color: COLORS.muted,
      });
      return;
    }

    page.drawRectangle({
      x,
      y: y - tableHeaderH,
      width: panelW,
      height: tableHeaderH,
      color: COLORS.slate,
    });
    const cols = [
      { key: "keyword", label: "Keyword", w: 0.52 },
      { key: "pos", label: "Pos", w: 0.12 },
      { key: "vol", label: "Vol", w: 0.18 },
      { key: "traf", label: "Traf", w: 0.18 },
    ];
    let cx = x;
    cols.forEach((c) => {
      page.drawText(c.label.toUpperCase(), {
        x: cx + 4,
        y: y - 12,
        size: 6,
        font: deck.fonts.bold,
        color: COLORS.white,
      });
      cx += c.w * panelW;
    });
    y -= tableHeaderH;

    let used = 0;
    rows.forEach((row, ri) => {
      const kwW = cols[0].w * panelW - 8;
      const kwLines = deck
        .wrapText(safePdfText(row.keyword, 240), deck.fonts.regular, 7, kwW)
        .slice(0, 3);
      const rowH = Math.max(tableHeaderH, 6 + kwLines.length * lineH);
      if (used + rowH > usableH) return;
      used += rowH;

      page.drawRectangle({
        x,
        y: y - rowH,
        width: panelW,
        height: rowH,
        color: ri % 2 === 0 ? COLORS.paper : COLORS.paperWarm,
      });
      let cxi = x;
      cols.forEach((c) => {
        if (c.key === "keyword") {
          kwLines.forEach((ln, li) => {
            page.drawText(ln, {
              x: cxi + 4,
              y: y - 8 - li * lineH,
              size: 7,
              font: deck.fonts.regular,
              color: COLORS.slateSoft,
            });
          });
        } else {
          page.drawText(safePdfText(row[c.key] ?? "", 18), {
            x: cxi + 4,
            y: y - 11,
            size: 7,
            font: deck.fonts.regular,
            color: COLORS.slateSoft,
          });
        }
        cxi += c.w * panelW;
      });
      y -= rowH;
    });
  });
}
