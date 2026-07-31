/**
 * Build landscape slide-deck PDFs: website, SMM, combined.
 */
import prisma from "../prisma.js";
import { fetchSmmReportData } from "../smmReportData.js";
import { formatYearMonth } from "../smmReportMonthRange.js";
import { assembleWebsiteReportData } from "./assembleWebsiteReportData.js";
import {
  createSlideDeck,
  formatPropertyLabel,
  formatReportDate,
  nf,
  pct,
  deltaLabel,
  safePdfText,
  COLORS,
  PAGE_W,
  PAGE_H,
  MARGIN,
} from "./slideDeckTheme.js";
import { drawWorldHeatMapSlide, drawCountryRankList } from "./drawWorldHeatMap.js";
import { countryDisplayName } from "../geo/isoCountries.js";

function unavailableSlide(deck, title, message) {
  const page = deck.addSlide();
  deck.drawSlideTitle(page, title, "Data unavailable for this period");
  page.drawText(safePdfText(message || "Connect this data source to populate this slide."), {
    x: MARGIN,
    y: PAGE_H / 2,
    size: 12,
    font: deck.fonts.regular,
    color: COLORS.muted,
  });
}

async function appendWebsiteSlides(deck, data, { includeInternal = false } = {}) {
  const gsc = data.gsc;
  const period = data.period?.label || "";

  // Summary KPIs
  {
    const page = deck.addSlide();
    deck.drawSlideTitle(page, "Traffic overview", `${formatPropertyLabel(data.siteUrl)} · ${period}`);
    if (gsc) {
      const nextY = deck.drawKpiCards(page, [
        { label: "CLICKS", value: nf(gsc.clicks) },
        { label: "IMPRESSIONS", value: nf(gsc.impressions) },
        { label: "AVG CTR", value: pct(gsc.ctr) },
        { label: "AVG POSITION", value: (gsc.position || 0).toFixed(1) },
      ]);
      if ((gsc.timeSeries || []).length > 1) {
        page.drawText("Daily clicks", {
          x: MARGIN,
          y: nextY + 8,
          size: 11,
          font: deck.fonts.semibold,
          color: COLORS.slate,
        });
        deck.drawSparkline(page, gsc.timeSeries, {
          x: MARGIN,
          y: 70,
          width: PAGE_W - MARGIN * 2,
          height: nextY - 90,
        });
      }
      page.drawText("Source: Google Search Console", {
        x: MARGIN,
        y: 48,
        size: 8,
        font: deck.fonts.regular,
        color: COLORS.cloud,
      });
    } else {
      page.drawText("Search Console data could not be loaded for this property.", {
        x: MARGIN,
        y: PAGE_H / 2,
        size: 12,
        font: deck.fonts.regular,
        color: COLORS.muted,
      });
    }
  }

  // Heat map
  {
    const page = deck.addSlide();
    deck.drawSlideTitle(page, "Where your audience is", "Search clicks by country");
    try {
      const { valueMap } = await drawWorldHeatMapSlide(page, deck.fonts, data.countries || [], {
        x: MARGIN,
        y: 55,
        width: 500,
        height: 380,
      });
      drawCountryRankList(page, deck.fonts, valueMap, {
        x: MARGIN + 520,
        yTop: PAGE_H - 100,
        width: 240,
        limit: 12,
      });
    } catch (err) {
      page.drawText(safePdfText(`Map unavailable: ${err.message}`), {
        x: MARGIN,
        y: PAGE_H / 2,
        size: 11,
        font: deck.fonts.regular,
        color: COLORS.muted,
      });
    }
  }

  // Top countries table
  if (data.countries?.length) {
    const page = deck.addSlide();
    deck.drawSlideTitle(page, "Top traffic by countries", period);
    deck.drawTable(
      page,
      [
        { key: "country", label: "Country", width: 0.45 },
        { key: "clicks", label: "Clicks", width: 0.2 },
        { key: "impressions", label: "Impressions", width: 0.2 },
        { key: "share", label: "Share", width: 0.15 },
      ],
      data.countries.slice(0, 14).map((c) => {
        const total = data.countries.reduce((s, r) => s + (r.clicks || 0), 0) || 1;
        return {
          country: countryDisplayName(c.country),
          clicks: nf(c.clicks),
          impressions: nf(c.impressions),
          share: pct((c.clicks || 0) / total),
        };
      }),
      { yStart: PAGE_H - 100, maxRows: 14 }
    );
  }

  // Keywords / queries
  {
    const page = deck.addSlide();
    deck.drawSlideTitle(page, "Keywords", "Top organic search queries");
    const rows = (gsc?.topQueries || []).slice(0, 12).map((q) => ({
      query: q.query || q.keys?.[0] || "—",
      clicks: nf(q.clicks),
      impressions: nf(q.impressions),
      ctr: pct(q.ctr),
      position: (q.position || 0).toFixed(1),
    }));
    if (rows.length) {
      deck.drawTable(
        page,
        [
          { key: "query", label: "Query", width: 0.4 },
          { key: "clicks", label: "Clicks", width: 0.15 },
          { key: "impressions", label: "Impr.", width: 0.15 },
          { key: "ctr", label: "CTR", width: 0.15 },
          { key: "position", label: "Pos.", width: 0.15 },
        ],
        rows,
        { yStart: PAGE_H - 100, maxRows: 12 }
      );
    } else {
      page.drawText("No query data for this period.", {
        x: MARGIN,
        y: PAGE_H / 2,
        size: 12,
        font: deck.fonts.regular,
        color: COLORS.muted,
      });
    }
  }

  // Top pages
  {
    const page = deck.addSlide();
    deck.drawSlideTitle(page, "Top pages", "Pages driving search traffic");
    const rows = (gsc?.topPages || []).slice(0, 12).map((p) => ({
      page: String(p.page || "").replace(/^https?:\/\//, "").slice(0, 70),
      clicks: nf(p.clicks),
      impressions: nf(p.impressions),
      ctr: pct(p.ctr),
    }));
    if (rows.length) {
      deck.drawTable(
        page,
        [
          { key: "page", label: "Page", width: 0.55 },
          { key: "clicks", label: "Clicks", width: 0.15 },
          { key: "impressions", label: "Impr.", width: 0.15 },
          { key: "ctr", label: "CTR", width: 0.15 },
        ],
        rows,
        { yStart: PAGE_H - 100, maxRows: 12 }
      );
    } else {
      page.drawText("No page data for this period.", {
        x: MARGIN,
        y: PAGE_H / 2,
        size: 12,
        font: deck.fonts.regular,
        color: COLORS.muted,
      });
    }
  }

  // SE Ranking domain overview
  {
    const page = deck.addSlide();
    deck.drawSlideTitle(page, "Domain intelligence", "Authority & organic footprint");
    const ov = data.seranking?.overview;
    if (ov) {
      deck.drawKpiCards(page, [
        { label: "ORG. TRAFFIC", value: nf(ov.traffic) },
        { label: "KEYWORDS", value: nf(ov.keywords) },
        { label: "TRAFFIC VALUE", value: ov.price != null ? `$${nf(ov.price)}` : "—" },
        { label: "TOP 10 KEYWORDS", value: nf(ov.top10) },
      ]);
      const kw = (data.seranking?.keywords || []).slice(0, 8);
      if (kw.length) {
        page.drawText("Sample organic keywords", {
          x: MARGIN,
          y: PAGE_H - 230,
          size: 11,
          font: deck.fonts.semibold,
          color: COLORS.slate,
        });
        deck.drawTable(
          page,
          [
            { key: "keyword", label: "Keyword", width: 0.5 },
            { key: "pos", label: "Pos.", width: 0.15 },
            { key: "vol", label: "Volume", width: 0.2 },
            { key: "traf", label: "Traffic", width: 0.15 },
          ],
          kw.map((k) => ({
            keyword: k.keyword || k.name || "—",
            pos: String(k.position ?? k.pos ?? "—"),
            vol: nf(k.volume ?? k.searchVolume),
            traf: nf(k.traffic),
          })),
          { yStart: PAGE_H - 250, maxRows: 8 }
        );
      }
    } else {
      page.drawText("SE Ranking domain data is not available for this property yet.", {
        x: MARGIN,
        y: PAGE_H / 2,
        size: 12,
        font: deck.fonts.regular,
        color: COLORS.muted,
      });
    }
  }

  // Backlinks
  {
    const page = deck.addSlide();
    deck.drawSlideTitle(page, "Backlinks", "Link profile summary");
    const bl = data.backlinks;
    if (bl) {
      deck.drawKpiCards(page, [
        { label: "BACKLINKS", value: nf(bl.backlinks ?? bl.totalBacklinks) },
        { label: "REF. DOMAINS", value: nf(bl.refdomains ?? bl.referringDomains) },
        { label: "DOFOLLOW", value: nf(bl.dofollow) },
        { label: "NOFOLLOW", value: nf(bl.nofollow) },
      ]);
    } else {
      page.drawText("Backlink summary unavailable.", {
        x: MARGIN,
        y: PAGE_H / 2,
        size: 12,
        font: deck.fonts.regular,
        color: COLORS.muted,
      });
    }
  }

  // Site audit
  {
    const page = deck.addSlide();
    deck.drawSlideTitle(page, "Site audit", "Technical health snapshot");
    const audit = data.audit;
    const payload = audit?.payload || audit;
    const score = payload?.healthScore ?? payload?.score ?? audit?.healthScore;
    const errors = payload?.criticalCount ?? payload?.errors ?? 0;
    const warnings = payload?.warningCount ?? payload?.warnings ?? 0;
    const notices = payload?.noticeCount ?? payload?.notices ?? 0;
    if (score != null || errors || warnings) {
      deck.drawKpiCards(page, [
        { label: "HEALTH SCORE", value: String(score ?? "—") },
        { label: "ERRORS", value: nf(errors) },
        { label: "WARNINGS", value: nf(warnings) },
        { label: "NOTICES", value: nf(notices) },
      ]);
      const issues = payload?.topIssues || payload?.issues || [];
      if (Array.isArray(issues) && issues.length) {
        deck.drawTable(
          page,
          [
            { key: "issue", label: "Top issues", width: 0.75 },
            { key: "count", label: "Count", width: 0.25 },
          ],
          issues.slice(0, 8).map((iss) => ({
            issue: iss.title || iss.name || iss.issue || String(iss),
            count: nf(iss.count ?? iss.pages ?? 0),
          })),
          { yStart: PAGE_H - 230, maxRows: 8 }
        );
      }
    } else {
      page.drawText("Run a site audit in the app to populate this slide.", {
        x: MARGIN,
        y: PAGE_H / 2,
        size: 12,
        font: deck.fonts.regular,
        color: COLORS.muted,
      });
    }
  }

  if (includeInternal && data.opportunities) {
    const page = deck.addSlide();
    deck.drawSlideTitle(page, "SEO opportunities", "Internal — quick wins");
    const pack = data.opportunities;
    const items = [
      ...(pack.strikingDistance || []).slice(0, 4).map((i) => ({ type: "Striking distance", item: i.query || i.title })),
      ...(pack.cannibalization || []).slice(0, 3).map((i) => ({ type: "Cannibalization", item: i.query || i.title })),
      ...(pack.decay || []).slice(0, 3).map((i) => ({ type: "Traffic decay", item: i.page || i.title })),
    ];
    if (items.length) {
      deck.drawTable(
        page,
        [
          { key: "type", label: "Type", width: 0.3 },
          { key: "item", label: "Opportunity", width: 0.7 },
        ],
        items.map((i) => ({ type: i.type, item: String(i.item || "").slice(0, 80) })),
        { yStart: PAGE_H - 100, maxRows: 12 }
      );
    } else {
      page.drawText("No high-priority opportunities flagged this week.", {
        x: MARGIN,
        y: PAGE_H / 2,
        size: 12,
        font: deck.fonts.regular,
        color: COLORS.muted,
      });
    }
  }
}

async function appendSmmSlides(deck, smm) {
  const page = deck.addSlide();
  deck.drawSlideTitle(page, "Social performance", smm.periodLabel || "");
  const platforms = smm.platforms || [];
  if (platforms.length) {
    const cards = platforms.slice(0, 4).map((p) => ({
      label: String(p.label || p.platform || "").toUpperCase(),
      value: nf(p.followers ?? p.endFollowers),
      delta: p.monthDeltaPct != null ? deltaLabel(p.monthDeltaPct) : p.weekDeltaPct != null ? deltaLabel(p.weekDeltaPct) : "",
    }));
    deck.drawKpiCards(page, cards.length ? cards : [{ label: "FOLLOWERS", value: "—" }], {
      cols: Math.min(4, Math.max(cards.length, 1)),
    });
    deck.drawTable(
      page,
      [
        { key: "platform", label: "Platform", width: 0.25 },
        { key: "followers", label: "Followers", width: 0.2 },
        { key: "week", label: "WoW", width: 0.15 },
        { key: "month", label: "MoM", width: 0.15 },
        { key: "reach", label: "Reach", width: 0.125 },
        { key: "eng", label: "Engagements", width: 0.125 },
      ],
      platforms.map((p) => ({
        platform: p.label || p.platform,
        followers: nf(p.followers ?? p.endFollowers),
        week: p.weekDeltaPct != null ? deltaLabel(p.weekDeltaPct) : "—",
        month: p.monthDeltaPct != null ? deltaLabel(p.monthDeltaPct) : "—",
        reach: nf(p.reach),
        eng: nf(p.engagements),
      })),
      { yStart: PAGE_H - 230, maxRows: 8 }
    );
  } else {
    page.drawText(safePdfText((smm.summaryLines || [])[0] || "No social data linked for this account."), {
      x: MARGIN,
      y: PAGE_H / 2,
      size: 12,
      font: deck.fonts.regular,
      color: COLORS.muted,
    });
  }

  if (smm.activity) {
    const act = deck.addSlide();
    deck.drawSlideTitle(act, "Content activity", smm.periodLabel || "");
    deck.drawKpiCards(act, [
      { label: "REACH", value: nf(smm.activity.totalReach ?? smm.totals?.reach) },
      { label: "ENGAGEMENTS", value: nf(smm.activity.totalEngagements ?? smm.totals?.engagements) },
      { label: "POSTS", value: nf(smm.activity.posts ?? smm.totals?.posts) },
      { label: "REELS / VIDEO", value: nf(smm.activity.reels ?? smm.totals?.reels) },
    ]);
  }
}

/**
 * @param {"website"|"smm"|"combined"} kind
 */
export async function buildSlideDeckPdfBytes(kind, siteKey, {
  reportMonth = null,
  preparedFor = "",
  includeInternal = false,
} = {}) {
  const month = reportMonth || formatYearMonth(new Date());
  const propertyLabel = formatPropertyLabel(siteKey);
  const reportDate = formatReportDate();

  const titles = {
    website: "Website Performance",
    smm: "Social Media Report",
    combined: "Marketing Performance",
  };

  const deck = await createSlideDeck({
    title: titles[kind] || "Performance Report",
    propertyLabel,
    reportDate,
    preparedFor,
    internal: includeInternal,
  });

  deck.addCover({
    deckTitle: titles[kind] || "Performance Report",
    eyebrow: includeInternal ? "Internal digest" : "Client report",
  });

  if (kind === "website" || kind === "combined") {
    const toc = deck.addSlide();
    deck.drawSlideTitle(toc, "In this report", propertyLabel);
    const items =
      kind === "combined"
        ? [
            "01  Website traffic overview",
            "02  Where your audience is",
            "03  Keywords & pages",
            "04  Domain intelligence & backlinks",
            "05  Site audit",
            "06  Social performance",
          ]
        : [
            "01  Traffic overview",
            "02  Where your audience is",
            "03  Countries & keywords",
            "04  Top pages",
            "05  Domain intelligence",
            "06  Backlinks & site audit",
          ];
    items.forEach((line, i) => {
      toc.drawText(line, {
        x: MARGIN,
        y: PAGE_H - 120 - i * 28,
        size: 14,
        font: deck.fonts.regular,
        color: COLORS.slateSoft,
      });
    });

    const webData = await assembleWebsiteReportData(siteKey, {
      reportMonth: month,
      includeInternal,
    });
    await appendWebsiteSlides(deck, webData, { includeInternal });
  }

  if (kind === "smm" || kind === "combined") {
    if (kind === "smm") {
      const toc = deck.addSlide();
      deck.drawSlideTitle(toc, "In this report", propertyLabel);
      ["01  Platform KPIs", "02  Content activity"].forEach((line, i) => {
        toc.drawText(line, {
          x: MARGIN,
          y: PAGE_H - 120 - i * 28,
          size: 14,
          font: deck.fonts.regular,
          color: COLORS.slateSoft,
        });
      });
    }
    const smm = await fetchSmmReportData(prisma, siteKey, month);
    await appendSmmSlides(deck, smm);
  }

  deck.addClosing();
  return deck.finalize();
}

export function slideDeckFilename(kind, siteKey, reportMonth) {
  const slug = formatPropertyLabel(siteKey)
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    .toLowerCase();
  const month = reportMonth || formatYearMonth(new Date());
  return `crossway-${kind}-${slug}-${month}.pdf`;
}
