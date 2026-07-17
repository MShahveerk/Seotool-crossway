import {
  createBrandedReportContext,
  formatPropertyLabel,
  nf,
  pct,
  safePdfText,
  PLAIN,
  BRAND,
} from "./reportPdfTheme.js";

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
 * Merge platform rows into four fixed rows (Facebook, Instagram, YouTube, TikTok).
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
      const acct = handle || name || "Not linked";
      byKey.set(key, { followers: f, accountLabel: acct });
    }
  }
  return PDF_PLATFORMS.map(({ key, label }) => {
    const row = byKey.get(key);
    return {
      platform: label,
      accountName: row?.accountLabel || "Not linked",
      followers: row?.followers ?? 0,
    };
  });
}

function laymanReportTitle(rawTitle) {
  const t = String(rawTitle || "").toLowerCase();
  if (t.includes("client") || (t.includes("marketing") && !t.includes("seo"))) return "Your Marketing Performance Report";
  if (t.includes("smm") && t.includes("website")) return "Your Marketing Performance Report";
  if (t.includes("smm")) return "Social Media Followers Report";
  if (t.includes("website")) return "Website Performance Report";
  if (t.includes("seo") || t.includes("opportunit")) return "Google Ranking Improvement Report";
  return "Marketing Performance Report";
}

/**
 * Build a branded, plain-language PDF report.
 */
export async function buildUnifiedMarketingReportPdfBytes(opts) {
  const {
    siteUrl,
    reportTitle = "Marketing report",
    smmPeriodLabel,
    smmPlatformCards = [],
    websiteStats = null,
    seoOpportunities = null,
    includeSmm = smmPlatformCards?.length > 0 || !websiteStats,
    includeWebsite = Boolean(websiteStats),
    includeSeo = Boolean(seoOpportunities),
  } = opts;

  const propertyLabel = formatPropertyLabel(siteUrl);
  const ctx = await createBrandedReportContext({
    reportTitle: laymanReportTitle(reportTitle),
    propertyLabel,
    introNote: `A simple summary for ${propertyLabel}. Period: ${smmPeriodLabel || "recent activity"}. No technical jargon — just what matters.`,
  });

  const { pdf, font, fontBold, drawSection, drawMetricRow, drawPlainBox, drawTableHeader, drawTableRow, drawBullet, drawTextLine } =
    ctx;

  if (includeSmm) {
    drawSection(PLAIN.smmTitle, PLAIN.smmSubtitle);
    drawPlainBox(PLAIN.smmNote);

    const cards = buildStandardFollowerRows(smmPlatformCards);
    const totalFollowers = cards.reduce((s, c) => s + Number(c.followers || 0), 0);
    drawMetricRow([
      { label: "Total followers", value: nf(totalFollowers), hint: "Across all platforms" },
      { label: "Report period", value: safePdfText(smmPeriodLabel, 16), hint: "Time covered" },
      { label: "Platforms tracked", value: String(cards.filter((c) => c.followers > 0).length), hint: "With data" },
    ]);

    const colXs = [48, 168, 420];
    drawTableHeader(["Platform", "Account", "Followers"], colXs);
    cards.forEach((c, i) => {
      drawTableRow([c.platform, c.accountName, nf(c.followers)], colXs, i % 2 === 1);
    });
  }

  if (includeWebsite && websiteStats) {
    drawSection(PLAIN.websiteTitle, `${PLAIN.websiteSubtitle}. ${websiteStats.periodLabel || ""}`);
    drawPlainBox(PLAIN.websiteNote);

    if (websiteStats.errorNote) {
      drawPlainBox(`We could not load all website data: ${websiteStats.errorNote}`, "warn");
    }

    if (websiteStats.totals) {
      const t = websiteStats.totals;
      drawMetricRow([
        { label: PLAIN.clicks, value: nf(t.clicks), hint: "People who visited from Google" },
        { label: PLAIN.impressions, value: nf(t.impressions), hint: "Times you appeared in search" },
        { label: PLAIN.ctr, value: pct(t.averageCtr), hint: "% who clicked after seeing you" },
        {
          label: PLAIN.position,
          value: Number(t.averagePosition || 0).toFixed(1),
          hint: PLAIN.positionHint,
        },
      ]);
    }

    const qRows = (websiteStats.topQueries || []).slice(0, 30);
    if (qRows.length) {
      drawTextLine("Top search terms people used to find you", 11, fontBold, BRAND.black);
      const qCols = [48, 300, 380, 460];
      drawTableHeader(["Search term", "Visits", "Appearances", "Click rate"], qCols);
      qRows.forEach((q, i) => {
        drawTableRow(
          [safePdfText(q.query, 42), nf(q.clicks), nf(q.impressions), pct(q.ctr)],
          qCols,
          i % 2 === 1
        );
      });
    }

    const pRows = (websiteStats.topPages || []).slice(0, 25);
    if (pRows.length) {
      drawSection("Most visited pages", "The pages on your site that got the most visits from Google");
      const pCols = [48, 400, 480];
      drawTableHeader(["Page on your website", "Visits", "Appearances"], pCols);
      pRows.forEach((row, i) => {
        drawTableRow([safePdfText(row.page, 58), nf(row.clicks), nf(row.impressions)], pCols, i % 2 === 1);
      });
    }
  }

  if (includeSeo && seoOpportunities) {
    drawSection(PLAIN.seoTitle, PLAIN.seoSubtitle);

    if (seoOpportunities.errorNote) {
      drawPlainBox(`Some improvement suggestions could not be loaded: ${seoOpportunities.errorNote}`, "warn");
    } else {
      const strikeN = (seoOpportunities.strikingDistance || []).length;
      const cannN = (seoOpportunities.cannibalization || []).length;
      const decayN = (seoOpportunities.decayingQueries || []).length;

      drawMetricRow([
        { label: "Quick wins", value: nf(strikeN), hint: "Keywords close to page 1" },
        { label: "Competing pages", value: nf(cannN), hint: "Same keyword, many pages" },
        { label: "Losing traffic", value: nf(decayN), hint: "Terms trending down" },
      ]);

      for (const g of (seoOpportunities.deviceGaps?.gaps || []).slice(0, 3)) {
        drawBullet(safePdfText(g.message, 100));
      }
      for (const w of (seoOpportunities.sitemapWarnings || []).slice(0, 3)) {
        drawBullet(safePdfText(w.message, 100));
      }

      const strike = (seoOpportunities.strikingDistance || []).slice(0, 12);
      if (strike.length) {
        drawTextLine(PLAIN.striking, 11, fontBold, BRAND.black);
        for (const q of strike) {
          drawBullet(
            `"${safePdfText(q.query, 35)}" — ranking #${Number(q.position || 0).toFixed(1)}, ${nf(q.impressions)} appearances, ${pct(q.ctr)} click rate`
          );
        }
      }

      const cann = (seoOpportunities.cannibalization || []).slice(0, 8);
      if (cann.length) {
        drawTextLine(PLAIN.cannibalization, 11, fontBold, BRAND.black);
        for (const c of cann) {
          drawBullet(
            `"${safePdfText(c.query, 35)}" appears on ${c.pageCount} different pages (${nf(c.totalImpressions)} total appearances)`
          );
        }
      }

      const decay = (seoOpportunities.decayingQueries || []).slice(0, 10);
      if (decay.length) {
        drawTextLine(PLAIN.decay, 11, fontBold, BRAND.black);
        for (const q of decay) {
          const change = Number(q.clickChangePct || 0);
          const dir = change < 0 ? "down" : "up";
          drawBullet(
            `"${safePdfText(q.query, 35)}" — visits ${dir} ${Math.abs(change).toFixed(0)}% (${nf(q.previousClicks)} → ${nf(q.clicks)})`
          );
        }
      }
    }
  }

  return pdf.save();
}
