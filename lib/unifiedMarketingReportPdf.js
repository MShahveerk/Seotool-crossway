import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const LINE = 13;
const GREEN = rgb(0.08, 0.45, 0.22);
const BLUE = rgb(0.12, 0.28, 0.55);
const GRAY = rgb(0.35, 0.35, 0.38);
const BLACK = rgb(0.12, 0.12, 0.14);

function nf(n) {
  return new Intl.NumberFormat("en-US").format(Math.round(Number(n) || 0));
}

function pct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0.00%";
  return `${(v * 100).toFixed(2)}%`;
}

function safePdfText(s, maxLen) {
  const t = String(s ?? "");
  let out = "";
  for (let i = 0; i < t.length && out.length < maxLen; i += 1) {
    const c = t.charCodeAt(i);
    out += c >= 32 && c <= 126 ? t[i] : "?";
  }
  return out;
}

function ensureSpace(y, minY, pdf, assignPage) {
  if (y < minY) {
    assignPage(pdf.addPage([PAGE_W, PAGE_H]));
    return PAGE_H - MARGIN;
  }
  return y;
}

const PDF_PLATFORMS = [
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "youtube", label: "YouTube" },
  { key: "tiktok", label: "TikTok" },
];

function canonicalPlatformKey(p) {
  const k = String(p || "").toLowerCase().trim();
  if (k === "x") return "tiktok";
  return k;
}

/**
 * Merge platform rows (SMM stats cards or SMM baseline rows) into four fixed rows (Facebook, Instagram, YouTube, TikTok).
 * @param {{ platform?: string, accountName?: string, accountHandle?: string, followers?: number }[]} platformCards
 */
export function buildStandardFollowerRows(platformCards) {
  const byKey = new Map();
  for (const c of platformCards || []) {
    const key = canonicalPlatformKey(c.platform);
    if (!PDF_PLATFORMS.some((d) => d.key === key)) continue;
    const prev = byKey.get(key);
    const f = Number(c.followers || 0);
    if (!prev || f >= Number(prev.followers || 0)) {
      const handle = String(c.accountHandle || "").trim();
      const name = String(c.accountName || "").trim();
      const acct = handle || name || "—";
      byKey.set(key, { followers: f, accountLabel: acct });
    }
  }
  return PDF_PLATFORMS.map(({ key, label }) => {
    const row = byKey.get(key);
    return {
      platform: label,
      accountName: row?.accountLabel || "—",
      followers: row?.followers ?? 0,
    };
  });
}

/**
 * @param {object} opts
 * @param {string} opts.siteUrl
 * @param {string} opts.reportTitle
 * @param {string} opts.smmPeriodLabel
 * @param {{ platform?: string, accountName?: string, accountHandle?: string, followers?: number }[]} opts.smmPlatformCards — SMM baseline rows or API platform cards (merged into Facebook / Instagram / YouTube / TikTok)
 * @param {string} opts.platformFilter
 * @param {null|{ periodLabel: string, totals: object, topQueries: array, topPages: array, errorNote?: string }} opts.websiteStats
 */
export async function buildUnifiedMarketingReportPdfBytes(opts) {
  const {
    siteUrl,
    reportTitle = "Site marketing report",
    smmPeriodLabel,
    smmPlatformCards = [],
    platformFilter = "all",
    websiteStats = null,
    seoOpportunities = null,
    includeSmm = smmPlatformCards?.length > 0 || !websiteStats,
    includeWebsite = Boolean(websiteStats),
    includeSeo = Boolean(seoOpportunities),
  } = opts;

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const assignPage = (p) => {
    page = p;
  };

  const draw = (text, size, f, color, x = MARGIN) => {
    y = ensureSpace(y, MARGIN + 36, pdf, assignPage);
    page.drawText(safePdfText(text, 500), { x, y, size, font: f, color });
    y -= size + 3;
  };

  draw(reportTitle, 17, fontBold, GREEN);
  draw(`Property: ${siteUrl}`, 10, font, GRAY);
  draw(`Generated: ${new Date().toLocaleString()}`, 9, font, GRAY);
  y -= 6;

  if (includeSmm) {
    draw("Social media (SMM)", 13, fontBold, BLACK);
    draw(`Period: ${smmPeriodLabel}`, 10, font, GRAY);
    draw(`Platform filter: ${platformFilter}`, 10, font, GRAY);
    draw("Follower counts: Facebook, Instagram, YouTube, and TikTok.", 9, font, GRAY);
    draw("Values come from SMM baseline (User Management / social_media_daily_stats) for this site.", 9, font, GRAY);
    y -= 4;

    draw("Followers by platform", 11, fontBold, BLACK);
    const c0 = MARGIN;
    const c1 = MARGIN + 120;
    const c2 = MARGIN + 400;
    y = ensureSpace(y, MARGIN + 40, pdf, assignPage);
    page.drawText("Platform", { x: c0, y, size: 8, font: fontBold, color: BLACK });
    page.drawText("Account", { x: c1, y, size: 8, font: fontBold, color: BLACK });
    page.drawText("Followers", { x: c2, y, size: 8, font: fontBold, color: BLACK });
    y -= LINE;

    const cards = buildStandardFollowerRows(smmPlatformCards);
    for (const c of cards) {
      y = ensureSpace(y, MARGIN + 26, pdf, assignPage);
      page.drawText(safePdfText(c.platform, 12), { x: c0, y, size: 8, font, color: BLACK });
      page.drawText(safePdfText(c.accountName, 36), { x: c1, y, size: 8, font, color: BLACK });
      page.drawText(nf(c.followers), { x: c2, y, size: 8, font, color: BLACK });
      y -= LINE - 1;
    }
  }

  if (includeWebsite && websiteStats) {
    y -= 10;
    y = ensureSpace(y, MARGIN + 120, pdf, assignPage);
    draw("Website statistics (Google Search)", 13, fontBold, BLUE);
    draw(safePdfText(websiteStats.periodLabel || "", 80), 10, font, GRAY);

    if (websiteStats.errorNote) {
      draw(`Note: ${safePdfText(websiteStats.errorNote, 110)}`, 9, font, GRAY);
    }
    if (websiteStats.totals) {
      const t = websiteStats.totals;
      draw(`Total clicks: ${nf(t.clicks)}`, 10, font, BLACK);
      draw(`Total impressions: ${nf(t.impressions)}`, 10, font, BLACK);
      draw(`Average CTR: ${pct(t.averageCtr)}`, 10, font, BLACK);
      draw(`Average position: ${Number(t.averagePosition || 0).toFixed(1)}`, 10, font, BLACK);
    }

    const qRows = (websiteStats.topQueries || []).slice(0, 35);
    if (qRows.length) {
      y -= 4;
      draw("Top search queries", 11, fontBold, BLACK);
      const q0 = MARGIN;
      const q1 = MARGIN + 220;
      const q2 = MARGIN + 360;
      const q3 = MARGIN + 470;
      y = ensureSpace(y, MARGIN + 36, pdf, assignPage);
      page.drawText("Query", { x: q0, y, size: 8, font: fontBold, color: BLACK });
      page.drawText("Clicks", { x: q1, y, size: 8, font: fontBold, color: BLACK });
      page.drawText("Impr.", { x: q2, y, size: 8, font: fontBold, color: BLACK });
      page.drawText("CTR", { x: q3, y, size: 8, font: fontBold, color: BLACK });
      y -= LINE;
      for (const q of qRows) {
        y = ensureSpace(y, MARGIN + 24, pdf, assignPage);
        page.drawText(safePdfText(q.query, 48), { x: q0, y, size: 7, font, color: BLACK });
        page.drawText(nf(q.clicks), { x: q1, y, size: 7, font, color: BLACK });
        page.drawText(nf(q.impressions), { x: q2, y, size: 7, font, color: BLACK });
        page.drawText(pct(q.ctr), { x: q3, y, size: 7, font, color: BLACK });
        y -= LINE - 1;
      }
    }

    const pRows = (websiteStats.topPages || []).slice(0, 35);
    if (pRows.length) {
      y -= 4;
      draw("Top landing pages (URLs)", 11, fontBold, BLACK);
      const p0 = MARGIN;
      const p1 = MARGIN + 340;
      const p2 = MARGIN + 430;
      y = ensureSpace(y, MARGIN + 36, pdf, assignPage);
      page.drawText("Page URL", { x: p0, y, size: 8, font: fontBold, color: BLACK });
      page.drawText("Clicks", { x: p1, y, size: 8, font: fontBold, color: BLACK });
      page.drawText("Impr.", { x: p2, y, size: 8, font: fontBold, color: BLACK });
      y -= LINE;
      for (const row of pRows) {
        y = ensureSpace(y, MARGIN + 24, pdf, assignPage);
        page.drawText(safePdfText(row.page, 85), { x: p0, y, size: 7, font, color: BLACK });
        page.drawText(nf(row.clicks), { x: p1, y, size: 7, font, color: BLACK });
        page.drawText(nf(row.impressions), { x: p2, y, size: 7, font, color: BLACK });
        y -= LINE - 1;
      }
    }
  }

  if (includeSeo && seoOpportunities) {
    y -= 10;
    y = ensureSpace(y, MARGIN + 100, pdf, assignPage);
    draw("SEO opportunities", 13, fontBold, GREEN);
    if (seoOpportunities.errorNote) {
      draw(`Note: ${safePdfText(seoOpportunities.errorNote, 110)}`, 9, font, GRAY);
    } else {
      draw(
        `Striking distance: ${nf((seoOpportunities.strikingDistance || []).length)} · Cannibalization: ${nf((seoOpportunities.cannibalization || []).length)} · Decaying queries: ${nf((seoOpportunities.decayingQueries || []).length)}`,
        9,
        font,
        GRAY
      );
      for (const g of (seoOpportunities.deviceGaps?.gaps || []).slice(0, 4)) {
        draw(`• ${safePdfText(g.message, 110)}`, 8, font, BLACK);
      }
      for (const w of (seoOpportunities.sitemapWarnings || []).slice(0, 3)) {
        draw(`• ${safePdfText(w.message, 110)}`, 8, font, BLACK);
      }

      const strike = (seoOpportunities.strikingDistance || []).slice(0, 15);
      if (strike.length) {
        y -= 2;
        draw("Striking-distance queries", 11, fontBold, BLACK);
        for (const q of strike) {
          y = ensureSpace(y, MARGIN + 22, pdf, assignPage);
          page.drawText(
            safePdfText(
              `${q.query}  |  pos ${Number(q.position || 0).toFixed(1)}  |  impr ${nf(q.impressions)}  |  CTR ${pct(q.ctr)}`,
              120
            ),
            { x: MARGIN, y, size: 7, font, color: BLACK }
          );
          y -= LINE - 1;
        }
      }

      const cann = (seoOpportunities.cannibalization || []).slice(0, 10);
      if (cann.length) {
        y -= 2;
        draw("Keyword cannibalization", 11, fontBold, BLACK);
        for (const c of cann) {
          draw(
            `“${safePdfText(c.query, 40)}” → ${c.pageCount} pages (${nf(c.totalImpressions)} impr)`,
            8,
            font,
            BLACK
          );
        }
      }

      const decay = (seoOpportunities.decayingQueries || []).slice(0, 12);
      if (decay.length) {
        y -= 2;
        draw("Decaying queries vs prior period", 11, fontBold, BLACK);
        for (const q of decay) {
          draw(
            `${safePdfText(q.query, 40)}  ${nf(q.clicks)}←${nf(q.previousClicks)} clicks (${Number(q.clickChangePct || 0).toFixed(0)}%)`,
            8,
            font,
            BLACK
          );
        }
      }
    }
  }

  y -= 12;
  y = ensureSpace(y, MARGIN + 20, pdf, assignPage);
  page.drawText("Crossway SEO Tools — combined SMM & website report", {
    x: MARGIN,
    y,
    size: 7,
    font,
    color: GRAY,
  });

  return pdf.save();
}
