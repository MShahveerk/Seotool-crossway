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
import { countryDisplayName } from "../geo/isoCountries.js";
import { resolveReportDisplayName } from "./resolveReportPacks.js";

function anchorLabel(a) {
  return String(a?.anchor || a?.anchor_text || a?.text || "—").slice(0, 42);
}

function pagePath(p) {
  const raw = String(p?.url || p?.page || p?.target || "—");
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).pathname || raw;
  } catch {
    return raw.replace(/^https?:\/\//, "").slice(0, 48);
  }
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
  if (audit?.critical) risks.push(`${nfExact(audit.critical)} critical audit errors need attention`);
  if (audit?.warning) risks.push(`${nfExact(audit.warning)} warnings across the technical crawl`);
  if (ps?.scores?.performance != null && ps.scores.performance < 50) {
    risks.push(`Mobile performance at ${Math.round(ps.scores.performance)} — CWV risk`);
  }
  if (gsc?.position != null && gsc.position > 20) {
    risks.push(`Average position ${Number(gsc.position).toFixed(1)} — room to climb`);
  }
  if (gsc?.ctr != null && gsc.ctr < 0.02) risks.push("CTR below 2% — title/meta opportunity");
  if (!risks.length) risks.push("No critical red flags in this pack — keep compounding wins");

  const actions = [];
  if (audit?.issues?.[0]) actions.push(`Fix: ${String(audit.issues[0].title).slice(0, 40)}`);
  if (ps?.scores?.performance != null && ps.scores.performance < 70) {
    actions.push("Ship Core Web Vitals improvements");
  }
  actions.push("Expand winning queries & strengthen links");

  return {
    subtitle: `${formatPropertyLabel(data.siteUrl)} · ${data.period?.label || ""}`,
    kpis,
    strengths,
    risks,
    actions,
  };
}

async function appendWebsiteSlides(deck, data, { includeInternal = false } = {}) {
  const gsc = data.gsc;
  const period = data.period?.label || "";
  const host = formatPropertyLabel(data.siteUrl);
  const auth = data.authority || {};
  const audit = data.audit;
  const psM = data.pagespeed?.mobile;
  const psD = data.pagespeed?.desktop;
  const bl = data.backlinks;
  const ov = data.seranking?.overview;

  // ── 1. Executive scorecard (tabloid) ──
  {
    const page = deck.addSlide();
    deck.drawSlideTitle(page, "Executive scorecard", `${host} · ${period}`);

    deck.drawScoreDial(page, {
      cx: MARGIN + 55,
      cy: PAGE_H - 175,
      r: 42,
      score: auth.preferredScore,
      label: auth.preferredLabel || "Authority",
      sub: auth.globalRank != null ? `Rank #${nf(auth.globalRank)}` : "",
    });
    deck.drawScoreDial(page, {
      cx: MARGIN + 170,
      cy: PAGE_H - 175,
      r: 42,
      score: psM?.scores?.performance ?? psD?.scores?.performance,
      label: "Performance",
      sub: "PageSpeed mobile",
    });
    deck.drawScoreDial(page, {
      cx: MARGIN + 285,
      cy: PAGE_H - 175,
      r: 42,
      score: audit?.score,
      label: "Site health",
      sub: audit?.source === "seranking" ? "SE Ranking audit" : "Technical audit",
    });
    deck.drawScoreDial(page, {
      cx: MARGIN + 400,
      cy: PAGE_H - 175,
      r: 42,
      score: psM?.scores?.seo ?? psD?.scores?.seo,
      label: "Lighthouse SEO",
      sub: "Lab SEO category",
    });

    const rightX = MARGIN + 470;
    deck.drawPanel(page, {
      x: rightX,
      y: PAGE_H - 70,
      width: PAGE_W - MARGIN - rightX,
      height: 220,
      title: "Search & footprint",
    });
    const metrics = [
      ["Clicks", nf(gsc?.clicks)],
      ["Impressions", nf(gsc?.impressions)],
      ["Avg CTR", pct(gsc?.ctr)],
      ["Avg position", gsc?.position != null ? Number(gsc.position).toFixed(1) : "—"],
      ["Organic traffic", nf(ov?.traffic)],
      ["Organic keywords", nf(ov?.keywords)],
      ["Backlinks", nf(bl?.backlinks)],
      ["Referring domains", nf(bl?.refdomains ?? auth.referringDomains)],
    ];
    metrics.forEach((row, i) => {
      const col = i < 4 ? 0 : 1;
      const ri = i % 4;
      const x = rightX + 14 + col * 200;
      const y = PAGE_H - 100 - ri * 42;
      page.drawText(safePdfText(row[0]).toUpperCase(), {
        x,
        y: y + 14,
        size: 7,
        font: deck.fonts.bold,
        color: COLORS.cloud,
      });
      page.drawText(safePdfText(row[1]), {
        x,
        y,
        size: 16,
        font: deck.fonts.bold,
        color: COLORS.slate,
      });
    });

    if ((gsc?.timeSeries || []).length > 1) {
      page.drawText("CLICK TREND", {
        x: MARGIN,
        y: 118,
        size: 8,
        font: deck.fonts.bold,
        color: COLORS.cloud,
      });
      deck.drawSparkline(page, gsc.timeSeries, {
        x: MARGIN,
        y: 48,
        width: PAGE_W - MARGIN * 2,
        height: 62,
      });
    }
  }

  // ── 2. Authority & Performance ──
  {
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

    const authRows = [
      ["InLink Rank", scoreOrDash(auth.inlinkRank)],
      ["Open PageRank", auth.score100 != null ? String(auth.score100) : "—"],
      ["Global rank", auth.globalRank != null ? `#${nf(auth.globalRank)}` : "—"],
      ["Referring domains", nf(auth.referringDomains)],
      ["Homepage UR", scoreOrDash(auth.homepageUr)],
      ["Dofollow links", nf(bl?.dofollowBacklinks)],
    ];
    authRows.forEach((row, i) => {
      const y = PAGE_H - 200 - i * 28;
      page.drawText(safePdfText(row[0]), {
        x: MARGIN + 18,
        y,
        size: 10,
        font: deck.fonts.regular,
        color: COLORS.muted,
      });
      page.drawText(safePdfText(row[1]), {
        x: MARGIN + leftW - 18 - deck.fonts.bold.widthOfTextAtSize(safePdfText(row[1]), 12),
        y,
        size: 12,
        font: deck.fonts.bold,
        color: COLORS.slate,
      });
    });

    const midX = MARGIN + leftW + 12;
    const midW = 300;
    deck.drawPanel(page, {
      x: midX,
      y: PAGE_H - 68,
      width: midW,
      height: PAGE_H - 120,
      title: "PageSpeed · Mobile",
    });
    const cats = [
      ["Performance", psM?.scores?.performance],
      ["SEO", psM?.scores?.seo],
      ["Accessibility", psM?.scores?.accessibility],
      ["Best practices", psM?.scores?.bestPractices],
    ];
    cats.forEach((c, i) => {
      const y = PAGE_H - 105 - i * 48;
      page.drawText(safePdfText(c[0]).toUpperCase(), {
        x: midX + 14,
        y: y + 16,
        size: 7,
        font: deck.fonts.bold,
        color: COLORS.cloud,
      });
      page.drawText(scoreOrDash(c[1]), {
        x: midX + 14,
        y: y - 2,
        size: 18,
        font: deck.fonts.bold,
        color: scoreTone(c[1]),
      });
      deck.drawProgressBar(page, {
        x: midX + 70,
        y: y + 2,
        width: midW - 100,
        value: c[1] ?? 0,
        max: 100,
        color: scoreTone(c[1]),
      });
    });

    const lab = (psM?.labMetrics || []).slice(0, 4);
    if (lab.length) {
      page.drawText("LAB METRICS", {
        x: midX + 14,
        y: 118,
        size: 7,
        font: deck.fonts.bold,
        color: COLORS.cloud,
      });
      lab.forEach((m, i) => {
        page.drawText(safePdfText(`${m.title}: ${m.displayValue || "—"}`, 40), {
          x: midX + 14,
          y: 98 - i * 14,
          size: 8,
          font: deck.fonts.regular,
          color: COLORS.slateSoft,
        });
      });
    }

    const rightX = midX + midW + 12;
    const rightW = PAGE_W - MARGIN - rightX;
    deck.drawPanel(page, {
      x: rightX,
      y: PAGE_H - 68,
      width: rightW,
      height: PAGE_H - 120,
      title: "Desktop · Field / CWV",
    });
    const dCats = [
      ["Perf", psD?.scores?.performance],
      ["SEO", psD?.scores?.seo],
      ["A11y", psD?.scores?.accessibility],
      ["BP", psD?.scores?.bestPractices],
    ];
    dCats.forEach((c, i) => {
      const x = rightX + 14 + (i % 2) * 110;
      const y = PAGE_H - 120 - Math.floor(i / 2) * 70;
      page.drawText(safePdfText(c[0]).toUpperCase(), {
        x,
        y: y + 20,
        size: 7,
        font: deck.fonts.bold,
        color: COLORS.cloud,
      });
      page.drawText(scoreOrDash(c[1]), {
        x,
        y,
        size: 22,
        font: deck.fonts.bold,
        color: scoreTone(c[1]),
      });
    });

    const cwv = psM?.cwv?.length ? psM.cwv : psD?.cwv || [];
    page.drawText("CORE WEB VITALS", {
      x: rightX + 14,
      y: 160,
      size: 7,
      font: deck.fonts.bold,
      color: COLORS.cloud,
    });
    if (cwv.length) {
      cwv.slice(0, 5).forEach((m, i) => {
        page.drawText(
          safePdfText(`${m.id}: ${m.displayValue || m.percentile || "—"}`, 36),
          {
            x: rightX + 14,
            y: 140 - i * 16,
            size: 9,
            font: deck.fonts.regular,
            color: COLORS.slateSoft,
          }
        );
      });
    } else {
      page.drawText("Field data unavailable for this URL.", {
        x: rightX + 14,
        y: 140,
        size: 9,
        font: deck.fonts.regular,
        color: COLORS.muted,
      });
    }
  }

  // ── 3. Traffic ──
  {
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
      { y: PAGE_H - 72, cols: 4, compact: true }
    );
    if ((gsc?.timeSeries || []).length > 1) {
      deck.drawSparkline(page, gsc.timeSeries, {
        x: MARGIN,
        y: 55,
        width: PAGE_W - MARGIN * 2,
        height: PAGE_H - 200,
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
  {
    const page = deck.addSlide();
    deck.drawSlideTitle(page, "Audience geography", `Search clicks by country · ${period}`);
    try {
      const mapW = 580;
      const mapH = 360;
      const { valueMap } = await drawWorldHeatMapSlide(page, deck.fonts, data.countries || [], {
        x: MARGIN,
        y: 52,
        width: mapW,
        height: mapH,
      });
      drawCountryRankList(page, deck.fonts, valueMap, {
        x: MARGIN + mapW + 18,
        yTop: PAGE_H - 78,
        width: PAGE_W - MARGIN * 2 - mapW - 18,
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

  // ── 5. Keywords + pages (two-up tabloid) ──
  {
    const page = deck.addSlide();
    deck.drawSlideTitle(page, "Queries & pages", "What people search — and what converts clicks");
    const colW = (PAGE_W - MARGIN * 2 - 14) / 2;
    const qRows = (gsc?.topQueries || []).slice(0, 11).map((q) => ({
      query: String(q.query || q.keys?.[0] || "—").slice(0, 36),
      clicks: nf(q.clicks),
      pos: q.position != null ? Number(q.position).toFixed(1) : "—",
    }));
    const pRows = (gsc?.topPages || []).slice(0, 11).map((p) => ({
      page: String(p.page || "")
        .replace(/^https?:\/\//, "")
        .slice(0, 40),
      clicks: nf(p.clicks),
      ctr: pct(p.ctr),
    }));

    // Left table manually positioned
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

    const drawMini = (x, rows, cols, yStart) => {
      let y = yStart;
      const rowH = 22;
      const tableW = colW;
      page.drawRectangle({ x, y: y - rowH, width: tableW, height: rowH, color: COLORS.slate });
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
      y -= rowH;
      rows.forEach((row, ri) => {
        page.drawRectangle({
          x,
          y: y - rowH,
          width: tableW,
          height: rowH,
          color: ri % 2 === 0 ? COLORS.paper : COLORS.paperWarm,
        });
        let cxi = x;
        cols.forEach((c) => {
          page.drawText(safePdfText(row[c.key] ?? "", 40), {
            x: cxi + 8,
            y: y - 14,
            size: 8,
            font: deck.fonts.regular,
            color: COLORS.slateSoft,
          });
          cxi += c.width * tableW;
        });
        y -= rowH;
      });
    };

    if (qRows.length) {
      drawMini(
        MARGIN,
        qRows,
        [
          { key: "query", label: "Query", width: 0.55 },
          { key: "clicks", label: "Clicks", width: 0.22 },
          { key: "pos", label: "Pos", width: 0.23 },
        ],
        PAGE_H - 84
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
      drawMini(
        MARGIN + colW + 14,
        pRows,
        [
          { key: "page", label: "Page", width: 0.55 },
          { key: "clicks", label: "Clicks", width: 0.22 },
          { key: "ctr", label: "CTR", width: 0.23 },
        ],
        PAGE_H - 84
      );
    }
  }

  // ── 6. Domain intelligence ──
  {
    const page = deck.addSlide();
    deck.drawSlideTitle(page, "Domain intelligence", "Organic footprint from SE Ranking");
    if (ov) {
      deck.drawKpiCards(
        page,
        [
          { label: "Org. traffic", value: nf(ov.traffic) },
          { label: "Keywords", value: nf(ov.keywords) },
          { label: "Traffic value", value: ov.price != null ? `$${nf(ov.price)}` : "—" },
          { label: "Top 10", value: nf(ov.top10) },
        ],
        { y: PAGE_H - 72, cols: 4, compact: true }
      );
      const kw = (data.seranking?.keywords || []).slice(0, 10);
      const comps = (data.seranking?.competitors || []).slice(0, 6);
      if (kw.length) {
        deck.drawTable(
          page,
          [
            { key: "keyword", label: "Keyword", width: 0.45 },
            { key: "pos", label: "Pos", width: 0.12 },
            { key: "vol", label: "Volume", width: 0.2 },
            { key: "traf", label: "Traffic", width: 0.23 },
          ],
          kw.map((k) => ({
            keyword: String(k.keyword || k.name || "—").slice(0, 42),
            pos: String(k.position ?? k.pos ?? "—"),
            vol: nf(k.volume ?? k.searchVolume),
            traf: nf(k.traffic),
          })),
          { yStart: PAGE_H - 150, maxRows: comps.length ? 7 : 10 }
        );
      }
      if (comps.length) {
        page.drawText("COMPETITORS", {
          x: MARGIN,
          y: 130,
          size: 8,
          font: deck.fonts.bold,
          color: COLORS.cloud,
        });
        comps.forEach((c, i) => {
          page.drawText(
            safePdfText(
              `${i + 1}. ${c.domain || c.name || "—"}  ·  traf ${nf(c.traffic)}  ·  kw ${nf(c.keywords)}`,
              90
            ),
            {
              x: MARGIN,
              y: 112 - i * 12,
              size: 8,
              font: deck.fonts.regular,
              color: COLORS.slateSoft,
            }
          );
        });
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

  // ── 7. Backlinks ──
  {
    const page = deck.addSlide();
    deck.drawSlideTitle(page, "Backlink profile", "Authority signals · anchors · linked pages");
    if (bl && (bl.hasData || bl.backlinks || bl.refdomains)) {
      deck.drawKpiCards(
        page,
        [
          { label: "Backlinks", value: nf(bl.backlinks) },
          { label: "Ref. domains", value: nf(bl.refdomains) },
          { label: "InLink Rank", value: scoreOrDash(bl.domainInlinkRank) },
          {
            label: "Dofollow",
            value: nf(bl.dofollowBacklinks),
            delta: `${nfExact(bl.nofollowBacklinks)} nofollow`,
          },
        ],
        { y: PAGE_H - 72, cols: 4, compact: true }
      );

      const colW = (PAGE_W - MARGIN * 2 - 16) / 2;
      const anchors = (bl.topAnchors || []).slice(0, 9);
      const topPages = (bl.topPages || []).slice(0, 9);
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
  {
    const page = deck.addSlide();
    const sourceLabel =
      audit?.source === "seranking"
        ? "SE Ranking site audit"
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

  if (includeInternal && data.opportunities) {
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

  return buildExecutiveSummary(data);
}

function platformConfigured(p) {
  if (!p) return false;
  if (p.hasData === true) return true;
  const name = String(p.accountName || "").trim().toLowerCase();
  if (name && name !== "not linked" && name !== "not configured") return true;
  return Number(p.followers || p.endFollowers || 0) > 0;
}

async function appendSmmSlides(deck, smm) {
  const page = deck.addSlide();
  deck.drawSlideTitle(page, "Social performance", smm.periodLabel || "");
  const platforms = smm.platforms || [];
  const connected = platforms.filter(platformConfigured);

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

  if (platforms.length) {
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

  if (connected.length && smm.activity) {
    const act = deck.addSlide();
    deck.drawSlideTitle(act, "Content activity", smm.periodLabel || "");
    deck.drawKpiCards(
      act,
      [
        { label: "Reach", value: nf(smm.activity.totalReach ?? smm.totals?.reach) },
        { label: "Engagements", value: nf(smm.activity.totalEngagements ?? smm.totals?.engagements) },
        { label: "Followers", value: nf(smm.totals?.followers) },
        { label: "Connected", value: String(connected.length) },
      ],
      { y: PAGE_H - 90, cols: 4, compact: true }
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
    strengths: connected.map((p) => `${p.label || p.platform}: ${nf(p.followers ?? p.endFollowers)} followers`),
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
    eyebrow: includeInternal ? "Internal digest" : "Client report",
    monthLabel,
  });

  let closingSummary = null;

  if (kind === "website" || kind === "combined") {
    const webData = await assembleWebsiteReportData(siteKey, {
      reportMonth: month,
      includeInternal,
    });
    closingSummary = await appendWebsiteSlides(deck, webData, { includeInternal });
  }

  if (kind === "smm" || kind === "combined") {
    const smm = await fetchSmmReportData(prisma, siteKey, month);
    const smmSummary = await appendSmmSlides(deck, smm);
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
