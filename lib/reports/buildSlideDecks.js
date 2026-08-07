/**
 * Build landscape slide-deck PDFs: website, SMM, combined.
 * Tabloid-density layout — authority, performance, audit, traffic.
 */
import prisma from "../prisma.js";
import { fetchSmmReportData } from "../smmReportData.js";
import { formatYearMonth } from "../smmReportMonthRange.js";
import { assembleWebsiteReportData } from "./assembleWebsiteReportData.js";
import {
  createSlideDeck,
  formatPropertyLabel,
  formatReportDate,
  formatReportMonthLabel,
  nf,
  nfExact,
  pct,
  safePdfText,
  scoreTone,
  COLORS,
  PAGE_W,
  PAGE_H,
  MARGIN,
} from "./slideDeckTheme.js";
import { drawWorldHeatMapSlide, drawCountryRankList } from "./drawWorldHeatMap.js";
import { drawKeywordInsightPanels } from "./keywordReportPanels.js";
import { countryDisplayName } from "../geo/isoCountries.js";
import { resolveReportDisplayName } from "./resolveReportPacks.js";
import { loadSmmPostsForReport, loadPublishedBlogsForReport } from "./reportContentCards.js";
import {
  getReportDeckConfig,
  isSlideEnabled,
  isStatEnabled,
  normalizeReportDeckConfig,
} from "./reportDeckConfig.js";
import { resolveSiteEquivalents } from "../siteAccess.js";
import { resolveSiteReportContext } from "../siteReportContext.js";

function anchorLabel(a) {
  return String(a?.anchor || a?.anchor_text || a?.text || "—").slice(0, 42);
}

function pagePath(p) {
  const raw = String(p?.url || p?.page || p?.target || "—");
  let path = raw;
  try {
    path = new URL(raw.startsWith("http") ? raw : `https://${raw}`).pathname || raw;
  } catch {
    path = raw.replace(/^https?:\/\//, "").slice(0, 48);
  }
  if (!path || path === "/" || path === "") return "Homepage (/)";
  return path.slice(0, 48);
}

function scoreOrDash(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return String(Math.round(Number(n)));
}

function buildExecutiveSummary(data) {
  const gsc = data.gsc;
  const auth = data.authority;
  const audit = data.audit;
  const ps = data.pagespeed?.mobile || data.pagespeed?.desktop;
  const bl = data.backlinks;
  const ov = data.seranking?.overview;

  const kpis = [
    { label: "Clicks", value: nf(gsc?.clicks) },
    { label: "Authority", value: scoreOrDash(auth?.preferredScore), tone: scoreTone(auth?.preferredScore) },
    { label: "Perf (M)", value: scoreOrDash(ps?.scores?.performance), tone: scoreTone(ps?.scores?.performance) },
    { label: "Health", value: scoreOrDash(audit?.score), tone: scoreTone(audit?.score) },
    { label: "Ref. domains", value: nf(bl?.refdomains ?? auth?.referringDomains) },
    { label: "Org. traffic", value: nf(ov?.traffic) },
  ];

  const strengths = [];
  if (gsc?.clicks) strengths.push(`${nf(gsc.clicks)} search clicks in the reporting window`);
  if (auth?.preferredScore != null) {
    strengths.push(`${auth.preferredLabel} at ${Math.round(auth.preferredScore)}`);
  }
  if (ps?.scores?.seo >= 80) strengths.push(`Lighthouse SEO score ${Math.round(ps.scores.seo)}`);
  if (bl?.dofollowBacklinks) strengths.push(`${nf(bl.dofollowBacklinks)} dofollow backlinks`);
  if (ov?.top10) strengths.push(`${nf(ov.top10)} keywords ranking in the top 10`);
  if (!strengths.length) strengths.push("Baseline metrics captured — growth plan ready");

  const risks = [];
  if (audit && (audit.critical > 0 || audit.score != null)) {
    risks.push(
      `${nfExact(audit.critical)} critical / ${nfExact(audit.warning)} warnings in site audit`
    );
  }
  if (ps?.scores?.performance != null && ps.scores.performance < 50) {
    risks.push(`Mobile performance at ${Math.round(ps.scores.performance)} - CWV risk`);
  }
  if (gsc?.position != null && gsc.position > 20) {
    risks.push(`Average position ${Number(gsc.position).toFixed(1)} - room to climb`);
  }
  if (gsc?.ctr != null && gsc.ctr < 0.02) risks.push("CTR below 2% - title/meta opportunity");
  if (!risks.length) risks.push("No critical red flags this period - protect the gains");

  const actions = [];
  if (audit?.issues?.[0]) actions.push(`Fix: ${String(audit.issues[0].title).slice(0, 40)}`);
  if (ps?.scores?.performance != null && ps.scores.performance < 70) {
    actions.push("Improve Core Web Vitals");
  }
  actions.push("Scale winning queries");

  return {
    subtitle: `${formatPropertyLabel(data.siteUrl)} · ${data.period?.label || ""}`,
    kpis,
    strengths,
    risks,
    actions,
  };
}

async function appendWebsiteSlides(
  deck,
  data,
  { includeInternal = false, reportMonth = null, deckConfig = null } = {}
) {
  const cfg = normalizeReportDeckConfig(deckConfig);
  const slideOn = (id) => isSlideEnabled(cfg, id);
  const statOn = (id) => isStatEnabled(cfg, id);
  const gsc = data.gsc;
  const period = data.period?.label || "";
  const host = formatPropertyLabel(data.siteUrl);
  const auth = data.authority || {};
  const audit = data.audit;
  const psM = data.pagespeed?.mobile;
  const psD = data.pagespeed?.desktop;
  const bl = data.backlinks;
  const ov = data.seranking?.overview;

  // ── 1. Executive dashboard — search command center (distinct from auth page) ──
  if (slideOn("executive")) {
    const page = deck.addSlide();
    deck.drawSlideTitle(page, "Executive dashboard", `${host} · ${period}`);

    const execKpis = [
      statOn("exec.clicks") ? { label: "Clicks", value: nf(gsc?.clicks) } : null,
      statOn("exec.impressions") ? { label: "Impressions", value: nf(gsc?.impressions) } : null,
      statOn("exec.ctr") ? { label: "Avg CTR", value: pct(gsc?.ctr) } : null,
      statOn("exec.position")
        ? {
            label: "Avg position",
            value: gsc?.position != null ? Number(gsc.position).toFixed(1) : "—",
          }
        : null,
      statOn("exec.orgTraffic") ? { label: "Org. traffic", value: nf(ov?.traffic) } : null,
      statOn("exec.keywords") ? { label: "Keywords", value: nf(ov?.keywords) } : null,
    ].filter(Boolean);

    if (execKpis.length) {
      deck.drawKpiCards(page, execKpis, {
        y: PAGE_H - 68,
        cols: Math.min(6, execKpis.length),
        compact: true,
      });
    }

    const chartW = 560;
    const showChart = statOn("exec.clicksChart");
    const showQueries = statOn("exec.topQueries");

    if (showChart) {
      page.drawText("DAILY CLICKS", {
        x: MARGIN,
        y: PAGE_H - 148,
        size: 8,
        font: deck.fonts.bold,
        color: COLORS.cloud,
      });
      if ((gsc?.timeSeries || []).length > 1) {
        deck.drawLineChart(page, gsc.timeSeries, {
          x: MARGIN,
          y: 52,
          width: showQueries ? chartW : PAGE_W - MARGIN * 2,
          height: PAGE_H - 210,
          valueKey: "clicks",
          yLabel: "Clicks",
        });
      } else {
        deck.drawPanel(page, {
          x: MARGIN,
          y: PAGE_H - 160,
          width: showQueries ? chartW : PAGE_W - MARGIN * 2,
          height: PAGE_H - 220,
          title: "Trend",
        });
        page.drawText("Not enough daily points for a trend chart.", {
          x: MARGIN + 16,
          y: PAGE_H / 2,
          size: 10,
          font: deck.fonts.regular,
          color: COLORS.muted,
        });
      }
    }

    if (showQueries) {
      const sideX = showChart ? MARGIN + chartW + 16 : MARGIN;
      const sideW = PAGE_W - MARGIN - sideX;
      deck.drawPanel(page, {
        x: sideX,
        y: PAGE_H - 148,
        width: sideW,
        height: PAGE_H - 210,
        title: "Top queries by clicks",
      });
    const qBars = (gsc?.topQueries || []).slice(0, 7).map((q) => ({
      label: String(q.query || q.keys?.[0] || "—"),
      value: Number(q.clicks) || 0,
      display: nf(q.clicks),
    }));
      if (qBars.length) {
        deck.drawBarList(page, qBars, {
          x: sideX + 12,
          yTop: PAGE_H - 175,
          width: sideW - 24,
          maxRows: 7,
        });
      } else {
        page.drawText("No query data.", {
          x: sideX + 12,
          y: PAGE_H / 2,
          size: 9,
          font: deck.fonts.regular,
          color: COLORS.muted,
        });
      }
    }
  }

  // ── 2. Authority & Performance ──
  if (slideOn("authority")) {
    const page = deck.addSlide();
    deck.drawSlideTitle(page, "Authority & performance", "Domain strength · Core Web Vitals · Lighthouse");

    const leftW = 300;
    deck.drawPanel(page, {
      x: MARGIN,
      y: PAGE_H - 68,
      width: leftW,
      height: PAGE_H - 120,
      title: "SEO authority",
    });

    if (statOn("auth.score")) {
      page.drawText(safePdfText(scoreOrDash(auth.preferredScore)), {
        x: MARGIN + 18,
        y: PAGE_H - 130,
        size: 48,
        font: deck.fonts.bold,
        color: scoreTone(auth.preferredScore),
      });
      page.drawText(safePdfText(auth.preferredLabel || "Authority").toUpperCase(), {
        x: MARGIN + 18,
        y: PAGE_H - 150,
        size: 9,
        font: deck.fonts.bold,
        color: COLORS.cloud,
      });
      if (auth.preferredScore != null) {
        deck.drawProgressBar(page, {
          x: MARGIN + 18,
          y: PAGE_H - 168,
          width: leftW - 36,
          value: auth.preferredScore,
          max: 100,
        });
      }
    }

    const authRows = [
      statOn("auth.inlinkRank") ? ["Authority rank", scoreOrDash(auth.inlinkRank)] : null,
      statOn("auth.openPageRank")
        ? ["Open PageRank", auth.score100 != null ? String(auth.score100) : "—"]
        : null,
      statOn("auth.globalRank")
        ? ["Global rank", auth.globalRank != null ? `#${nf(auth.globalRank)}` : "—"]
        : null,
      statOn("auth.refDomains") ? ["Referring domains", nf(auth.referringDomains)] : null,
      statOn("auth.homepageUr") ? ["Homepage UR", scoreOrDash(auth.homepageUr)] : null,
      statOn("auth.backlinks") ? ["Backlinks", nf(bl?.backlinks)] : null,
      statOn("auth.dofollow") ? ["Dofollow", nf(bl?.dofollowBacklinks)] : null,
      statOn("auth.nofollow") ? ["Nofollow", nf(bl?.nofollowBacklinks)] : null,
      statOn("auth.orgTraffic") ? ["Org. traffic", nf(ov?.traffic)] : null,
      statOn("auth.orgKeywords") ? ["Org. keywords", nf(ov?.keywords)] : null,
      statOn("auth.trafficValue")
        ? ["Traffic value", ov?.price != null ? `$${nf(ov.price)}` : "—"]
        : null,
      statOn("auth.top10") ? ["Top 10 keywords", nf(ov?.top10)] : null,
    ].filter(Boolean);
    authRows.forEach((row, i) => {
      const y = PAGE_H - 195 - i * 20;
      if (y < 55) return;
      page.drawText(safePdfText(row[0]), {
        x: MARGIN + 18,
        y,
        size: 9,
        font: deck.fonts.regular,
        color: COLORS.muted,
      });
      const val = safePdfText(row[1]);
      page.drawText(val, {
        x: MARGIN + leftW - 18 - deck.fonts.bold.widthOfTextAtSize(val, 11),
        y,
        size: 11,
        font: deck.fonts.bold,
        color: COLORS.slate,
      });
    });

    const midX = MARGIN + leftW + 12;
    const midW = 300;
    if (statOn("auth.pagespeedMobile")) {
      deck.drawPanel(page, {
        x: midX,
        y: PAGE_H - 68,
        width: midW,
        height: PAGE_H - 120,
        title: "PageSpeed · Mobile",
      });
      const panelTop = PAGE_H - 68;
      const panelH = PAGE_H - 120;
      const panelBottom = panelTop - panelH;
      const lab = (psM?.labMetrics || []).slice(0, 3);
      const labLineH = 11;
      const labReserve = lab.length ? 14 + lab.length * labLineH + 8 : 0;
      const cats = [
        ["Performance", psM?.scores?.performance],
        ["SEO", psM?.scores?.seo],
        ["Accessibility", psM?.scores?.accessibility],
        ["Best practices", psM?.scores?.bestPractices],
      ];
      const catTop = panelTop - 32;
      const catFloor = panelBottom + 12 + labReserve;
      const catStep = Math.min(52, Math.max(38, (catTop - catFloor) / cats.length));
      cats.forEach((c, i) => {
        const rowTop = catTop - i * catStep;
        const label = safePdfText(c[0]).toUpperCase();
        const value = scoreOrDash(c[1]);
        page.drawText(label, {
          x: midX + 14,
          y: rowTop,
          size: 8,
          font: deck.fonts.bold,
          color: COLORS.cloud,
        });
        page.drawText(value, {
          x: midX + midW - 14 - deck.fonts.bold.widthOfTextAtSize(value, 18),
          y: rowTop - 4,
          size: 18,
          font: deck.fonts.bold,
          color: scoreTone(c[1]),
        });
        deck.drawProgressBar(page, {
          x: midX + 14,
          y: rowTop - 20,
          width: midW - 28,
          value: c[1] ?? 0,
          max: 100,
          color: scoreTone(c[1]),
        });
      });

      if (lab.length) {
        const labTextW = midW - 28;
        let labY = panelBottom + 12 + (lab.length - 1) * labLineH;
        const labHeaderY = labY + labLineH + 2;
        page.drawText("LAB METRICS", {
          x: midX + 14,
          y: labHeaderY,
          size: 7,
          font: deck.fonts.bold,
          color: COLORS.cloud,
        });
        lab.forEach((m) => {
          const line = safePdfText(`${m.title}: ${m.displayValue || "—"}`, 120);
          const wrapped = deck.wrapText(line, deck.fonts.regular, 7, labTextW).slice(0, 1);
          page.drawText(wrapped[0] || line, {
            x: midX + 14,
            y: labY,
            size: 7,
            font: deck.fonts.regular,
            color: COLORS.slateSoft,
          });
          labY -= labLineH;
        });
      }
    }

    const rightX = midX + midW + 12;
    const rightW = PAGE_W - MARGIN - rightX;
    if (statOn("auth.pagespeedDesktop")) {
      deck.drawPanel(page, {
        x: rightX,
        y: PAGE_H - 68,
        width: rightW,
        height: PAGE_H - 120,
        title: "Desktop scores · CWV",
      });
      const dCats = [
        ["Performance", psD?.scores?.performance],
        ["SEO", psD?.scores?.seo],
        ["Accessibility", psD?.scores?.accessibility],
        ["Best practices", psD?.scores?.bestPractices],
      ];
      dCats.forEach((c, i) => {
        const rowTop = PAGE_H - 100 - i * 52;
        const label = safePdfText(c[0]).toUpperCase();
        const value = scoreOrDash(c[1]);
        page.drawText(label, {
          x: rightX + 14,
          y: rowTop,
          size: 8,
          font: deck.fonts.bold,
          color: COLORS.cloud,
        });
        page.drawText(value, {
          x: rightX + rightW - 14 - deck.fonts.bold.widthOfTextAtSize(value, 18),
          y: rowTop - 2,
          size: 18,
          font: deck.fonts.bold,
          color: scoreTone(c[1]),
        });
        deck.drawProgressBar(page, {
          x: rightX + 14,
          y: rowTop - 20,
          width: rightW - 28,
          value: c[1] ?? 0,
          max: 100,
          color: scoreTone(c[1]),
        });
      });

      const cwv = psM?.cwv?.length ? psM.cwv : psD?.cwv || [];
      page.drawText("CORE WEB VITALS", {
        x: rightX + 14,
        y: 110,
        size: 7,
        font: deck.fonts.bold,
        color: COLORS.cloud,
      });
      if (cwv.length) {
        cwv.slice(0, 4).forEach((m, i) => {
          page.drawText(
            safePdfText(`${m.id}  ${m.displayValue || m.percentile || "—"}`, 36),
            {
              x: rightX + 14,
              y: 92 - i * 14,
              size: 9,
              font: deck.fonts.regular,
              color: COLORS.slateSoft,
            }
          );
        });
      } else {
        page.drawText("Field CWV unavailable for this URL.", {
          x: rightX + 14,
          y: 92,
          size: 9,
          font: deck.fonts.regular,
          color: COLORS.muted,
        });
      }
    }
  }

  // ── 3. Traffic ──
  if (slideOn("traffic")) {
    const page = deck.addSlide();
    deck.drawSlideTitle(page, "Organic traffic", `Google Search Console · ${period}`);
    deck.drawKpiCards(
      page,
      [
        { label: "Clicks", value: nf(gsc?.clicks) },
        { label: "Impressions", value: nf(gsc?.impressions) },
        { label: "Avg CTR", value: pct(gsc?.ctr) },
        {
          label: "Avg position",
          value: gsc?.position != null ? Number(gsc.position).toFixed(1) : "—",
        },
      ],
      { y: PAGE_H - 68, cols: 4, compact: true }
    );
    if ((gsc?.timeSeries || []).length > 1) {
      const chartW = (PAGE_W - MARGIN * 2 - 16) / 2;
      const chartH = (PAGE_H - 190 - 20) / 2;
      const colGap = 16;
      const rowGap = 20;

      // Row 1 (Top): Clicks and Impressions
      deck.drawLineChart(page, gsc.timeSeries, {
        x: MARGIN,
        y: 48 + chartH + rowGap,
        width: chartW,
        height: chartH,
        valueKey: "clicks",
        yLabel: "Clicks",
      });
      deck.drawLineChart(page, gsc.timeSeries, {
        x: MARGIN + chartW + colGap,
        y: 48 + chartH + rowGap,
        width: chartW,
        height: chartH,
        valueKey: "impressions",
        yLabel: "Impressions",
      });

      // Row 2 (Bottom): CTR and Position (Position is reversed)
      deck.drawLineChart(page, gsc.timeSeries, {
        x: MARGIN,
        y: 48,
        width: chartW,
        height: chartH,
        valueKey: "ctr",
        yLabel: "Avg CTR",
      });
      deck.drawLineChart(page, gsc.timeSeries, {
        x: MARGIN + chartW + colGap,
        y: 48,
        width: chartW,
        height: chartH,
        valueKey: "position",
        yLabel: "Avg Position",
        reverseY: true,
      });
    } else if (!gsc) {
      page.drawText("Search Console data could not be loaded for this property.", {
        x: MARGIN,
        y: PAGE_H / 2,
        size: 12,
        font: deck.fonts.regular,
        color: COLORS.muted,
      });
    }
  }

  // ── 4. Heat map ──
  if (slideOn("geography")) {
    const page = deck.addSlide();
    deck.drawSlideTitle(page, "Audience geography", `Search clicks by country · ${period}`);
    try {
      const mapW = 620;
      const mapH = 390;
      // Align map top with "Top countries" heading (PAGE_H - 72).
      const listTop = PAGE_H - 72;
      const mapY = listTop - mapH;
      const { valueMap } = await drawWorldHeatMapSlide(page, deck.fonts, data.countries || [], {
        x: MARGIN,
        y: mapY,
        width: mapW,
        height: mapH,
      });
      drawCountryRankList(page, deck.fonts, valueMap, {
        x: MARGIN + mapW + 14,
        yTop: listTop,
        width: PAGE_W - MARGIN * 2 - mapW - 14,
        limit: 14,
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

  // ── 5. Keywords + pages (two-up tabloid) ──
  if (slideOn("queriesPages")) {
    const page = deck.addSlide();
    deck.drawSlideTitle(page, "Queries & pages", "What people search — and what converts clicks");
    const colW = (PAGE_W - MARGIN * 2 - 14) / 2;
    const qRows = (gsc?.topQueries || []).slice(0, 10).map((q) => ({
      query: String(q.query || q.keys?.[0] || "—"),
      clicks: nf(q.clicks),
      pos: q.position != null ? Number(q.position).toFixed(1) : "—",
    }));
    const pRows = (gsc?.topPages || []).slice(0, 10).map((p) => ({
      page: String(p.page || "").replace(/^https?:\/\//, ""),
      clicks: nf(p.clicks),
      ctr: pct(p.ctr),
    }));

    page.drawText("TOP QUERIES", {
      x: MARGIN,
      y: PAGE_H - 72,
      size: 8,
      font: deck.fonts.bold,
      color: COLORS.cloud,
    });
    page.drawText("TOP PAGES", {
      x: MARGIN + colW + 14,
      y: PAGE_H - 72,
      size: 8,
      font: deck.fonts.bold,
      color: COLORS.cloud,
    });

    const drawWrappedMini = (x, rows, cols, yStart, wrapKey) => {
      let y = yStart;
      const tableW = colW;
      const headerH = 22;
      const floorY = 48;
      page.drawRectangle({ x, y: y - headerH, width: tableW, height: headerH, color: COLORS.slate });
      let cx = x;
      cols.forEach((c) => {
        page.drawText(safePdfText(c.label).toUpperCase(), {
          x: cx + 8,
          y: y - 14,
          size: 7,
          font: deck.fonts.bold,
          color: COLORS.white,
        });
        cx += c.width * tableW;
      });
      y -= headerH;

      rows.forEach((row, ri) => {
        const lineH = 10;
        const padY = 6;
        const cellPads = {};
        cols.forEach((c) => {
          const cellW = c.width * tableW - 16;
          if (c.key === wrapKey) {
            cellPads[c.key] = deck
              .wrapText(safePdfText(row[c.key] ?? "", 400), deck.fonts.regular, 8, cellW)
              .slice(0, 4);
          } else {
            cellPads[c.key] = [safePdfText(row[c.key] ?? "", 40)];
          }
        });
        const linesNeeded = Math.max(1, ...(Object.values(cellPads).map((l) => l.length)));
        const rowH = Math.max(22, padY * 2 + linesNeeded * lineH);
        if (y - rowH < floorY) return;

        page.drawRectangle({
          x,
          y: y - rowH,
          width: tableW,
          height: rowH,
          color: ri % 2 === 0 ? COLORS.paper : COLORS.paperWarm,
        });
        let cxi = x;
        cols.forEach((c) => {
          const lines = cellPads[c.key] || ["—"];
          lines.forEach((ln, li) => {
            page.drawText(ln, {
              x: cxi + 8,
              y: y - padY - 8 - li * lineH,
              size: 8,
              font: deck.fonts.regular,
              color: COLORS.slateSoft,
            });
          });
          cxi += c.width * tableW;
        });
        y -= rowH;
      });
    };

    if (qRows.length) {
      drawWrappedMini(
        MARGIN,
        qRows,
        [
          { key: "query", label: "Query", width: 0.58 },
          { key: "clicks", label: "Clicks", width: 0.2 },
          { key: "pos", label: "Pos", width: 0.22 },
        ],
        PAGE_H - 84,
        "query"
      );
    } else {
      page.drawText("No query data.", {
        x: MARGIN,
        y: PAGE_H / 2,
        size: 10,
        font: deck.fonts.regular,
        color: COLORS.muted,
      });
    }
    if (pRows.length) {
      drawWrappedMini(
        MARGIN + colW + 14,
        pRows,
        [
          { key: "page", label: "Page", width: 0.58 },
          { key: "clicks", label: "Clicks", width: 0.2 },
          { key: "ctr", label: "CTR", width: 0.22 },
        ],
        PAGE_H - 84,
        "page"
      );
    }
  }

  // ── 6. Domain intelligence ──
  if (slideOn("domainIntel")) {
    const page = deck.addSlide();
    deck.drawSlideTitle(page, "Domain intelligence", "Organic footprint and keyword visibility");
    if (ov) {
      const domainKpis = [
        statOn("domain.kpiTraffic") ? { label: "Org. traffic", value: nf(ov.traffic) } : null,
        statOn("domain.kpiKeywords") ? { label: "Keywords", value: nf(ov.keywords) } : null,
        statOn("domain.kpiValue")
          ? { label: "Traffic value", value: ov.price != null ? `$${nf(ov.price)}` : "—" }
          : null,
        statOn("domain.kpiTop10") ? { label: "Top 10", value: nf(ov.top10) } : null,
      ].filter(Boolean);
      if (domainKpis.length) {
        deck.drawKpiCards(page, domainKpis, {
          y: PAGE_H - 72,
          cols: Math.min(4, domainKpis.length),
          compact: true,
        });
      }
      const kw = data.seranking?.keywords || [];
      const comps = statOn("domain.competitors")
        ? (data.seranking?.competitors || []).slice(0, 5)
        : [];
      const compsReserve = comps.length ? 78 : 48;
      const anyKwPanel =
        statOn("domain.ranked") || statOn("domain.crucial") || statOn("domain.trafficKw");
      if (kw.length && anyKwPanel) {
        drawKeywordInsightPanels(deck, page, kw, {
          yTop: PAGE_H - 148,
          yBottom: compsReserve,
          limit: 7,
          enabled: {
            ranked: statOn("domain.ranked"),
            crucial: statOn("domain.crucial"),
            traffic: statOn("domain.trafficKw"),
          },
        });
      } else if (!anyKwPanel && !domainKpis.length && !comps.length) {
        page.drawText("All domain intelligence stats are hidden for this site.", {
          x: MARGIN,
          y: PAGE_H - 170,
          size: 10,
          font: deck.fonts.regular,
          color: COLORS.muted,
        });
      } else if (!kw.length && anyKwPanel) {
        page.drawText("No keyword rankings available for this property yet.", {
          x: MARGIN,
          y: PAGE_H - 170,
          size: 10,
          font: deck.fonts.regular,
          color: COLORS.muted,
        });
      }
      if (comps.length) {
        page.drawText("COMPETITORS", {
          x: MARGIN,
          y: 62 + comps.length * 11,
          size: 8,
          font: deck.fonts.bold,
          color: COLORS.cloud,
        });
        comps.forEach((c, i) => {
          page.drawText(
            safePdfText(
              `${i + 1}. ${c.domain || c.name || "—"}  ·  traf ${nf(c.traffic)}  ·  kw ${nf(c.keywords)}`,
              100
            ),
            {
              x: MARGIN,
              y: 48 + (comps.length - 1 - i) * 11,
              size: 8,
              font: deck.fonts.regular,
              color: COLORS.slateSoft,
            }
          );
        });
      }
    } else {
      page.drawText("Domain intelligence data is not available for this property yet.", {
        x: MARGIN,
        y: PAGE_H / 2,
        size: 12,
        font: deck.fonts.regular,
        color: COLORS.muted,
      });
    }
  }

  // ── 7. Backlinks ──
  if (slideOn("backlinks")) {
    const page = deck.addSlide();
    deck.drawSlideTitle(page, "Backlink profile", "Authority signals · anchors · linked pages");
    if (bl && (bl.hasData || bl.backlinks || bl.refdomains)) {
      if (statOn("bl.kpis")) {
        deck.drawKpiCards(
          page,
          [
            { label: "Backlinks", value: nf(bl.backlinks) },
            { label: "Ref. domains", value: nf(bl.refdomains) },
            { label: "Authority rank", value: scoreOrDash(bl.domainInlinkRank) },
            {
              label: "Dofollow",
              value: nf(bl.dofollowBacklinks),
              delta: `${nfExact(bl.nofollowBacklinks)} nofollow`,
            },
          ],
          { y: PAGE_H - 72, cols: 4, compact: true }
        );
      }

      const colW = (PAGE_W - MARGIN * 2 - 16) / 2;
      const anchors = statOn("bl.anchors") ? (bl.topAnchors || []).slice(0, 9) : [];
      const topPages = statOn("bl.pages") ? (bl.topPages || []).slice(0, 9) : [];
      let y = PAGE_H - 160;
      page.drawText("TOP ANCHORS", {
        x: MARGIN,
        y,
        size: 8,
        font: deck.fonts.bold,
        color: COLORS.cloud,
      });
      page.drawText("TOP LINKED PAGES", {
        x: MARGIN + colW + 16,
        y,
        size: 8,
        font: deck.fonts.bold,
        color: COLORS.cloud,
      });
      y -= 16;
      anchors.forEach((a, i) => {
        page.drawText(safePdfText(anchorLabel(a), 38), {
          x: MARGIN,
          y: y - i * 18,
          size: 9,
          font: deck.fonts.regular,
          color: COLORS.slateSoft,
        });
        page.drawText(nf(a.backlinks ?? a.count), {
          x: MARGIN + colW - 40,
          y: y - i * 18,
          size: 9,
          font: deck.fonts.semibold,
          color: COLORS.slate,
        });
      });
      if (!anchors.length) {
        page.drawText("Anchor breakdown not in snapshot — refresh backlinks in-app.", {
          x: MARGIN,
          y,
          size: 9,
          font: deck.fonts.regular,
          color: COLORS.muted,
        });
      }
      topPages.forEach((p, i) => {
        page.drawText(safePdfText(pagePath(p), 40), {
          x: MARGIN + colW + 16,
          y: y - i * 18,
          size: 9,
          font: deck.fonts.regular,
          color: COLORS.slateSoft,
        });
        page.drawText(nf(p.backlinks ?? p.count), {
          x: PAGE_W - MARGIN - 36,
          y: y - i * 18,
          size: 9,
          font: deck.fonts.semibold,
          color: COLORS.slate,
        });
      });
    } else {
      page.drawText("Backlink summary unavailable. Refresh backlinks in the app.", {
        x: MARGIN,
        y: PAGE_H / 2,
        size: 12,
        font: deck.fonts.regular,
        color: COLORS.muted,
      });
    }
  }

  // ── 8. Site audit (single dense page — no priorities slide) ──
  if (slideOn("audit")) {
    const page = deck.addSlide();
    const sourceLabel =
      audit?.source === "seranking"
        ? "Live site audit"
        : audit?.source === "internal"
          ? "Technical crawl audit"
          : "Technical health";
    deck.drawSlideTitle(page, "Site audit", sourceLabel);

    if (audit && (audit.score != null || audit.issues?.length || audit.critical != null)) {
      deck.drawKpiCards(
        page,
        [
          {
            label: "Health score",
            value: scoreOrDash(audit.score),
            tone: scoreTone(audit.score),
          },
          { label: "Errors", value: nfExact(audit.critical), tone: COLORS.bad },
          { label: "Warnings", value: nfExact(audit.warning), tone: COLORS.warn },
          {
            label: audit.passed != null ? "Passed checks" : "Notices",
            value: audit.passed != null ? nfExact(audit.passed) : nfExact(audit.notice),
          },
          {
            label: "Pages",
            value: audit.totalPages != null ? nfExact(audit.totalPages) : "—",
          },
          {
            label: "Issues",
            value: nfExact(audit.issues?.length || 0),
          },
        ],
        { y: PAGE_H - 68, cols: 6, compact: true }
      );

      const tallies = (audit.sectionTallies || []).filter(
        (s) => s.errors || s.warnings || s.notices
      ).slice(0, 8);
      if (tallies.length) {
        page.drawText("ISSUES BY SECTION", {
          x: MARGIN,
          y: PAGE_H - 145,
          size: 8,
          font: deck.fonts.bold,
          color: COLORS.cloud,
        });
        tallies.forEach((s, i) => {
          const x = MARGIN + (i % 4) * 225;
          const y = PAGE_H - 165 - Math.floor(i / 4) * 22;
          page.drawText(safePdfText(s.name, 20), {
            x,
            y,
            size: 8,
            font: deck.fonts.semibold,
            color: COLORS.slateSoft,
          });
          page.drawText(
            safePdfText(`${nfExact(s.errors)}E · ${nfExact(s.warnings)}W · ${nfExact(s.notices)}N`),
            {
              x: x + 110,
              y,
              size: 8,
              font: deck.fonts.regular,
              color: COLORS.muted,
            }
          );
        });
      } else if (audit.stats) {
        page.drawText(
          safePdfText(
            `Crawl: ${nfExact(audit.stats.pagesCrawled)} pages · avg ${nfExact(audit.stats.avgResponseMs)} ms · broken external ${nfExact(audit.stats.brokenExternal)} · indexable ${nfExact(audit.stats.indexablePages)}`,
            120
          ),
          {
            x: MARGIN,
            y: PAGE_H - 150,
            size: 9,
            font: deck.fonts.regular,
            color: COLORS.slateSoft,
          }
        );
      }

      const issues = (audit.issues || []).slice(0, 11);
      if (issues.length) {
        deck.drawTable(
          page,
          [
            { key: "sev", label: "Sev", width: 0.1 },
            { key: "issue", label: "Issue", width: 0.5 },
            { key: "count", label: "Count", width: 0.12 },
            { key: "section", label: "Area", width: 0.28 },
          ],
          issues.map((iss) => ({
            sev: String(iss.severity || "notice").slice(0, 7).toUpperCase(),
            issue: String(iss.title || "Issue").slice(0, 48),
            count: nfExact(iss.count),
            section: String(iss.section || "").slice(0, 22),
          })),
          { yStart: PAGE_H - 200, maxRows: 11 }
        );
      } else {
        page.drawText(
          "Audit scores loaded, but issue details are not in cache. Re-run Site Audit in the app for full evidence.",
          {
            x: MARGIN,
            y: PAGE_H - 220,
            size: 10,
            font: deck.fonts.regular,
            color: COLORS.muted,
          }
        );
      }
    } else {
      page.drawText("No site audit snapshot found. Run Site Audit in the app to populate this slide.", {
        x: MARGIN,
        y: PAGE_H / 2,
        size: 12,
        font: deck.fonts.regular,
        color: COLORS.muted,
      });
    }
  }

  // ── Blogs created & published this month (cards with image + description) ──
  if (slideOn("blogs")) {
    let blogs = data.blogs || [];
    let blogsLabel = data.blogsMonthLabel || period;
    if (!blogs.length) {
      try {
        // Try website URL first, then raw site key (Meta IDs often stored on blog.siteLink)
        const keys = [...new Set([data.siteUrl, data.siteKey, data.domain].filter(Boolean))];
        for (const key of keys) {
          const pack = await loadPublishedBlogsForReport(key, reportMonth, { limit: 9 });
          if (pack.blogs?.length) {
            blogs = pack.blogs;
            blogsLabel = pack.label || blogsLabel;
            break;
          }
        }
      } catch {
        blogs = [];
      }
    }
    if (blogs.length) {
      for (let i = 0; i < blogs.length; i += 3) {
        const chunk = blogs.slice(i, i + 3);
        const page = deck.addSlide();
        deck.drawSlideTitle(
          page,
          "Blogs published",
          `${blogsLabel || period} · ${blogs.length} post${blogs.length === 1 ? "" : "s"}`
        );
        await drawContentCards(deck, page, chunk);
      }
    }
    data.blogs = blogs;
    data.blogsMonthLabel = blogsLabel;
  }

  if (includeInternal && data.opportunities && slideOn("seoOpportunities")) {
    const page = deck.addSlide();
    deck.drawSlideTitle(page, "SEO opportunities", "Internal — quick wins");
    const pack = data.opportunities;
    const items = [
      ...(pack.strikingDistance || []).slice(0, 4).map((i) => ({
        type: "Striking distance",
        item: i.query || i.title,
      })),
      ...(pack.cannibalization || []).slice(0, 3).map((i) => ({
        type: "Cannibalization",
        item: i.query || i.title,
      })),
      ...(pack.decay || []).slice(0, 3).map((i) => ({
        type: "Traffic decay",
        item: i.page || i.title,
      })),
    ];
    if (items.length) {
      deck.drawTable(
        page,
        [
          { key: "type", label: "Type", width: 0.3 },
          { key: "item", label: "Opportunity", width: 0.7 },
        ],
        items.map((i) => ({ type: i.type, item: String(i.item || "").slice(0, 80) })),
        { yStart: PAGE_H - 88, maxRows: 12 }
      );
    }
  }

  const summary = buildExecutiveSummary(data);
  if ((data.blogs || []).length) {
    summary.strengths = [
      `${data.blogs.length} blog post${data.blogs.length === 1 ? "" : "s"} published ${data.blogsMonthLabel || "this month"}`,
      ...(summary.strengths || []).slice(0, 4),
    ];
  }
  return summary;
}

async function drawContentCards(deck, page, items) {
  const gap = 14;
  const cols = Math.min(3, items.length);
  const cardW = (PAGE_W - MARGIN * 2 - gap * (cols - 1)) / cols;
  const cardH = PAGE_H - 130;
  const imgH = 118;
  const top = PAGE_H - 72;

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const x = MARGIN + i * (cardW + gap);
    const y = top;

    page.drawRectangle({
      x,
      y: y - cardH,
      width: cardW,
      height: cardH,
      color: COLORS.paper,
      borderColor: COLORS.border,
      borderWidth: 0.9,
    });

    page.drawRectangle({
      x: x + 1,
      y: y - imgH - 1,
      width: cardW - 2,
      height: imgH,
      color: COLORS.paperWarm,
    });

    if (item.imageBytes && item.imageKind) {
      try {
        const embedded =
          item.imageKind === "png"
            ? await deck.pdf.embedPng(item.imageBytes)
            : await deck.pdf.embedJpg(item.imageBytes);
        const maxW = cardW - 2;
        const maxH = imgH;
        const scale = Math.min(maxW / embedded.width, maxH / embedded.height);
        const w = embedded.width * scale;
        const h = embedded.height * scale;
        page.drawImage(embedded, {
          x: x + 1 + (maxW - w) / 2,
          y: y - imgH - 1 + (maxH - h) / 2,
          width: w,
          height: h,
        });
      } catch {
        page.drawText("No image", {
          x: x + 12,
          y: y - imgH / 2 - 4,
          size: 9,
          font: deck.fonts.regular,
          color: COLORS.cloud,
        });
      }
    } else {
      page.drawText("No image", {
        x: x + 12,
        y: y - imgH / 2 - 4,
        size: 9,
        font: deck.fonts.regular,
        color: COLORS.cloud,
      });
    }

    let ty = y - imgH - 18;
    if (item.badge) {
      const badge = safePdfText(item.badge, 28).toUpperCase();
      page.drawText(badge, {
        x: x + 12,
        y: ty,
        size: 7,
        font: deck.fonts.bold,
        color: item.badge === "Pending approval" ? COLORS.cloud : COLORS.accentDeep,
      });
      ty -= 14;
    }

    const titleLines = deck.wrapText(safePdfText(item.title, 80), deck.fonts.bold, 11, cardW - 24);
    for (const line of titleLines.slice(0, 2)) {
      page.drawText(line, {
        x: x + 12,
        y: ty,
        size: 11,
        font: deck.fonts.bold,
        color: COLORS.slate,
      });
      ty -= 14;
    }

    ty -= 2;
    const footerTop = y - cardH + 44;
    const lineH = 11.5;
    const maxLines = Math.max(2, Math.floor((ty - footerTop) / lineH));
    const excerptSource = safePdfText(item.excerpt || "No description available.", 1400);
    let excerptLines = deck.wrapText(excerptSource, deck.fonts.regular, 9, cardW - 24);
    if (excerptLines.length > maxLines) {
      excerptLines = excerptLines.slice(0, maxLines);
      let last = excerptLines[maxLines - 1] || "";
      const ellipsis = "…";
      while (
        last.length > 4 &&
        deck.fonts.regular.widthOfTextAtSize(last + ellipsis, 9) > cardW - 24
      ) {
        last = last.slice(0, -1).trimEnd();
      }
      excerptLines[maxLines - 1] = `${last}${ellipsis}`;
    }
    for (const line of excerptLines) {
      if (ty < footerTop) break;
      page.drawText(line, {
        x: x + 12,
        y: ty,
        size: 9,
        font: deck.fonts.regular,
        color: COLORS.muted,
      });
      ty -= lineH;
    }

    const metaBits = [];
    if (item.platform) metaBits.push(String(item.platform));
    if (item.publishedAt) {
      metaBits.push(
        new Date(item.publishedAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      );
    }
    if (metaBits.length) {
      page.drawText(safePdfText(metaBits.join(" · "), 60), {
        x: x + 12,
        y: y - cardH + 36,
        size: 8,
        font: deck.fonts.semibold,
        color: COLORS.cloud,
      });
    }

    const link = safePdfText(item.url || "", 70);
    if (link) {
      page.drawText("READ", {
        x: x + 12,
        y: y - cardH + 20,
        size: 7,
        font: deck.fonts.bold,
        color: COLORS.accentDeep,
      });
      page.drawText(link, {
        x: x + 12,
        y: y - cardH + 8,
        size: 7,
        font: deck.fonts.regular,
        color: COLORS.accentDeep,
      });
    }
  }
}

function platformConfigured(p) {
  if (!p) return false;
  if (p.hasData === true) return true;
  const name = String(p.accountName || "").trim().toLowerCase();
  if (name && name !== "not linked" && name !== "not configured") return true;
  return Number(p.followers || p.endFollowers || 0) > 0;
}

async function appendSmmSlides(deck, smm, { siteKey = "", reportMonth = null, deckConfig = null } = {}) {
  const cfg = normalizeReportDeckConfig(deckConfig);
  const slideOn = (id) => isSlideEnabled(cfg, id);
  const statOn = (id) => isStatEnabled(cfg, id);
  const platforms = smm.platforms || [];
  const connected = platforms.filter(platformConfigured);

  if (slideOn("socialPerformance")) {
    const page = deck.addSlide();
    deck.drawSlideTitle(page, "Social performance", smm.periodLabel || "");

    page.drawText(
      safePdfText(
        connected.length
          ? `${connected.length} platform(s) connected · Unlinked channels show as Not configured.`
          : "No social platforms are connected for this account yet."
      ),
      {
        x: MARGIN,
        y: PAGE_H - 68,
        size: 9,
        font: deck.fonts.regular,
        color: COLORS.muted,
      }
    );

    if (platforms.length && (statOn("smm.platformCards") || statOn("smm.followers"))) {
      if (statOn("smm.platformCards") || statOn("smm.followers")) {
        const cards = platforms.slice(0, 4).map((p) => ({
          label: String(p.label || p.platform || "").toUpperCase(),
          value: platformConfigured(p) ? nf(p.followers ?? p.endFollowers) : "Not set",
          delta: platformConfigured(p)
            ? p.monthChange != null && p.monthChange !== 0
              ? `${p.monthChange > 0 ? "+" : ""}${nfExact(p.monthChange)} MoM`
              : ""
            : "Not configured",
        }));
        deck.drawKpiCards(page, cards, {
          cols: Math.min(4, Math.max(cards.length, 1)),
          y: PAGE_H - 90,
          compact: true,
        });
      }
      deck.drawTable(
        page,
        [
          { key: "platform", label: "Platform", width: 0.18 },
          { key: "account", label: "Account", width: 0.24 },
          { key: "followers", label: "Followers", width: 0.14 },
          { key: "week", label: "WoW", width: 0.11 },
          { key: "month", label: "MoM", width: 0.11 },
          { key: "reach", label: "Reach", width: 0.11 },
          { key: "eng", label: "Eng.", width: 0.11 },
        ],
        platforms.map((p) => {
          const ok = platformConfigured(p);
          return {
            platform: p.label || p.platform,
            account: ok ? String(p.accountName || "—").slice(0, 28) : "Not configured",
            followers: ok ? nf(p.followers ?? p.endFollowers) : "—",
            week: ok ? (p.weekChange != null ? nfExact(p.weekChange) : "—") : "—",
            month: ok ? (p.monthChange != null ? nfExact(p.monthChange) : "—") : "—",
            reach: ok ? nf(p.reach) : "—",
            eng: ok ? nf(p.engagements) : "—",
          };
        }),
        { yStart: PAGE_H - 180, maxRows: 8 }
      );
    }
  }

  if (connected.length && smm.activity && slideOn("contentActivity")) {
    const act = deck.addSlide();
    deck.drawSlideTitle(act, "Content activity", smm.periodLabel || "");
    const activityKpis = [
      { label: "Reach", value: nf(smm.activity.totalReach ?? smm.totals?.reach) },
      { label: "Engagements", value: nf(smm.activity.totalEngagements ?? smm.totals?.engagements) },
      { label: "Followers", value: nf(smm.totals?.followers) },
      { label: "Connected", value: String(connected.length) },
    ];
    const kpis = statOn("smm.engagement") ? activityKpis : activityKpis.filter((k) => k.label === "Connected");
    if (kpis.length) {
      deck.drawKpiCards(act, kpis, {
        y: PAGE_H - 90,
        cols: Math.min(4, kpis.length),
        compact: true,
      });
    }
  }

  // ── Social posts: published this month + pending approval ──
  let smmPosts = [];
  if (slideOn("socialPosts")) {
    try {
      const pack = await loadSmmPostsForReport(siteKey, reportMonth || null, { limit: 9 });
      smmPosts = pack.posts || [];
      if (smmPosts.length) {
        for (let i = 0; i < smmPosts.length; i += 3) {
          const chunk = smmPosts.slice(i, i + 3);
          const postPage = deck.addSlide();
          const publishedCount = smmPosts.filter((p) => p.badge === "Published").length;
          const pendingCount = smmPosts.filter((p) => p.badge === "Pending approval").length;
          deck.drawSlideTitle(
            postPage,
            "Social posts",
            `${pack.label || smm.periodLabel || ""} · ${publishedCount} published · ${pendingCount} pending`
          );
          await drawContentCards(deck, postPage, chunk);
        }
      }
    } catch {
      smmPosts = [];
    }
  }

  const strengths = connected.map(
    (p) => `${p.label || p.platform}: ${nf(p.followers ?? p.endFollowers)} followers`
  );
  if (smmPosts.length) {
    strengths.unshift(
      `${smmPosts.length} social post${smmPosts.length === 1 ? "" : "s"} in this report (published + pending)`
    );
  }

  return {
    subtitle: smm.periodLabel || "",
    kpis: [
      { label: "Connected", value: String(connected.length) },
      { label: "Followers", value: nf(smm.totals?.followers) },
      { label: "Reach", value: nf(smm.activity?.totalReach ?? smm.totals?.reach) },
      { label: "Engagements", value: nf(smm.activity?.totalEngagements ?? smm.totals?.engagements) },
    ],
    strengths,
    risks: platforms.filter((p) => !platformConfigured(p)).map((p) => `${p.label || p.platform} not configured`),
    actions: ["Review content cadence", "Close gaps on unlinked channels", "Double down on top reach"],
  };
}

/**
 * @param {"website"|"smm"|"combined"} kind
 */
export async function buildSlideDeckPdfBytes(
  kind,
  siteKey,
  {
    reportMonth = null,
    preparedFor = "",
    includeInternal = false,
    displayName = "",
    deckConfig = null,
  } = {}
) {
  const month = reportMonth || formatYearMonth(new Date());
  const propertyLabel =
    (displayName && !/^\d+$/.test(String(displayName).trim())
      ? String(displayName).trim()
      : "") ||
    (await resolveReportDisplayName(siteKey).catch(() => null)) ||
    formatPropertyLabel(siteKey);
  const reportDate = formatReportDate();
  let resolvedConfig = deckConfig != null ? normalizeReportDeckConfig(deckConfig) : null;
  if (!resolvedConfig) {
    const [context, equivalents] = await Promise.all([
      resolveSiteReportContext(prisma, siteKey).catch(() => null),
      resolveSiteEquivalents(prisma, siteKey).catch(() => []),
    ]);
    resolvedConfig = await getReportDeckConfig(context?.websiteUrl || siteKey, {
      equivalents: [...(equivalents || []), siteKey, context?.websiteUrl].filter(Boolean),
    });
  }

  const titles = {
    website: "Website Analytics",
    smm: "Social Media Report",
    combined: "Marketing Analytics",
  };
  const monthLabel = formatReportMonthLabel(month);

  const deck = await createSlideDeck({
    title: titles[kind] || "Website Analytics",
    propertyLabel,
    reportDate,
    reportMonthLabel: monthLabel,
    preparedFor,
    internal: includeInternal,
  });

  deck.addCover({
    deckTitle: titles[kind] || "Website Analytics",
    eyebrow: includeInternal ? "Internal digest" : "Monthly Report",
    monthLabel,
  });

  let closingSummary = null;

  if (kind === "website" || kind === "combined") {
    const webData = await assembleWebsiteReportData(siteKey, {
      reportMonth: month,
      includeInternal,
    });
    closingSummary = await appendWebsiteSlides(deck, webData, {
      includeInternal,
      reportMonth: month,
      deckConfig: resolvedConfig,
    });
  }

  if (kind === "smm" || kind === "combined") {
    const smm = await fetchSmmReportData(prisma, siteKey, month);
    const smmSummary = await appendSmmSlides(deck, smm, {
      siteKey,
      reportMonth: month,
      deckConfig: resolvedConfig,
    });
    if (kind === "smm") closingSummary = smmSummary;
    else if (closingSummary && smmSummary) {
      closingSummary.strengths = [
        ...(closingSummary.strengths || []).slice(0, 3),
        ...(smmSummary.strengths || []).slice(0, 2),
      ];
      closingSummary.actions = [
        ...(closingSummary.actions || []).slice(0, 2),
        ...(smmSummary.actions || []).slice(0, 1),
      ];
    }
  }

  deck.addClosing(closingSummary);
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
