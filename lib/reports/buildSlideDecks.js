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
  nfExact,
  pct,
  safePdfText,
  COLORS,
  PAGE_W,
  PAGE_H,
  MARGIN,
} from "./slideDeckTheme.js";
import { drawWorldHeatMapSlide, drawCountryRankList } from "./drawWorldHeatMap.js";
import { countryDisplayName } from "../geo/isoCountries.js";
import { resolveReportDisplayName } from "./resolveReportPacks.js";

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

function anchorLabel(a) {
  return String(a?.anchor || a?.anchor_text || a?.text || "—").slice(0, 48);
}

function pageLabel(p) {
  return String(p?.url || p?.page || p?.target || "—")
    .replace(/^https?:\/\//, "")
    .slice(0, 55);
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
        { label: "Clicks", value: nf(gsc.clicks) },
        { label: "Impressions", value: nf(gsc.impressions) },
        { label: "Avg CTR", value: pct(gsc.ctr) },
        {
          label: "Avg position",
          value: gsc.position ? Number(gsc.position).toFixed(1) : "—",
        },
      ]);
      if ((gsc.timeSeries || []).length > 1) {
        page.drawText("Daily clicks", {
          x: MARGIN,
          y: nextY + 4,
          size: 10,
          font: deck.fonts.bold,
          color: COLORS.slate,
        });
        deck.drawSparkline(page, gsc.timeSeries, {
          x: MARGIN,
          y: 58,
          width: PAGE_W - MARGIN * 2,
          height: Math.max(70, nextY - 80),
        });
      }
      page.drawText("Source: Google Search Console", {
        x: MARGIN,
        y: 44,
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
    deck.drawSlideTitle(page, "Where your audience is", `Search clicks by country · ${period}`);
    try {
      const mapW = 560;
      const mapH = 340;
      const { valueMap } = await drawWorldHeatMapSlide(page, deck.fonts, data.countries || [], {
        x: MARGIN,
        y: 62,
        width: mapW,
        height: mapH,
      });
      drawCountryRankList(page, deck.fonts, valueMap, {
        x: MARGIN + mapW + 24,
        yTop: PAGE_H - 88,
        width: PAGE_W - MARGIN * 2 - mapW - 24,
        limit: 11,
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
    deck.drawSlideTitle(page, "Top traffic by country", period);
    const totalClicks = data.countries.reduce((s, r) => s + (r.clicks || 0), 0) || 1;
    deck.drawTable(
      page,
      [
        { key: "country", label: "Country", width: 0.4 },
        { key: "clicks", label: "Clicks", width: 0.2 },
        { key: "impressions", label: "Impressions", width: 0.25 },
        { key: "share", label: "Share", width: 0.15 },
      ],
      data.countries.slice(0, 14).map((c) => ({
        country: countryDisplayName(c.country),
        clicks: nf(c.clicks),
        impressions: nf(c.impressions),
        share: pct((c.clicks || 0) / totalClicks),
      })),
      { yStart: PAGE_H - 88, maxRows: 14 }
    );
  }

  // Keywords / queries
  {
    const page = deck.addSlide();
    deck.drawSlideTitle(page, "Keywords", "Top organic search queries");
    const rows = (gsc?.topQueries || []).slice(0, 14).map((q) => ({
      query: String(q.query || q.keys?.[0] || "—").slice(0, 60),
      clicks: nf(q.clicks),
      impressions: nf(q.impressions),
      ctr: pct(q.ctr),
      position: q.position != null ? Number(q.position).toFixed(1) : "—",
    }));
    if (rows.length) {
      deck.drawTable(
        page,
        [
          { key: "query", label: "Query", width: 0.42 },
          { key: "clicks", label: "Clicks", width: 0.14 },
          { key: "impressions", label: "Impr.", width: 0.16 },
          { key: "ctr", label: "CTR", width: 0.14 },
          { key: "position", label: "Pos.", width: 0.14 },
        ],
        rows,
        { yStart: PAGE_H - 88, maxRows: 14 }
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
    const rows = (gsc?.topPages || []).slice(0, 14).map((p) => ({
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
        { yStart: PAGE_H - 88, maxRows: 14 }
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
        { label: "Org. traffic", value: nf(ov.traffic) },
        { label: "Keywords", value: nf(ov.keywords) },
        { label: "Traffic value", value: ov.price != null ? `$${nf(ov.price)}` : "—" },
        { label: "Top 10 keywords", value: nf(ov.top10) },
      ]);
      const kw = (data.seranking?.keywords || []).slice(0, 8);
      if (kw.length) {
        page.drawText("Sample organic keywords", {
          x: MARGIN,
          y: PAGE_H - 220,
          size: 11,
          font: deck.fonts.bold,
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
            keyword: String(k.keyword || k.name || "—").slice(0, 48),
            pos: String(k.position ?? k.pos ?? "—"),
            vol: nf(k.volume ?? k.searchVolume),
            traf: nf(k.traffic),
          })),
          { yStart: PAGE_H - 238, maxRows: 8 }
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

  // Backlinks — full app-parity summary
  {
    const bl = data.backlinks;
    const page = deck.addSlide();
    deck.drawSlideTitle(page, "Backlinks", "Link profile, anchors, and top linked pages");
    if (bl && (bl.hasData || bl.backlinks || bl.refdomains)) {
      deck.drawKpiCards(page, [
        { label: "Backlinks", value: nf(bl.backlinks ?? bl.totalBacklinks) },
        { label: "Ref. domains", value: nf(bl.refdomains ?? bl.referringDomains) },
        {
          label: "Domain rank",
          value: bl.domainInlinkRank != null ? String(bl.domainInlinkRank) : "—",
        },
        {
          label: "Dofollow",
          value: nf(bl.dofollowBacklinks ?? bl.dofollow),
          delta:
            bl.nofollowBacklinks != null || bl.nofollow != null
              ? `${nfExact(bl.nofollowBacklinks ?? bl.nofollow)} nofollow`
              : "",
        },
      ]);

      const anchors = (bl.topAnchors || []).slice(0, 8);
      const topPages = (bl.topPages || []).slice(0, 8);
      const colW = (PAGE_W - MARGIN * 2 - 20) / 2;
      let y = PAGE_H - 230;

      page.drawText("Top anchors", {
        x: MARGIN,
        y,
        size: 11,
        font: deck.fonts.bold,
        color: COLORS.slate,
      });
      page.drawText("Top linked pages", {
        x: MARGIN + colW + 20,
        y,
        size: 11,
        font: deck.fonts.bold,
        color: COLORS.slate,
      });
      y -= 18;

      if (anchors.length) {
        anchors.forEach((a, i) => {
          const yy = y - i * 18;
          page.drawText(safePdfText(anchorLabel(a), 40), {
            x: MARGIN,
            y: yy,
            size: 9,
            font: deck.fonts.regular,
            color: COLORS.slateSoft,
          });
          page.drawText(nf(a.backlinks ?? a.count), {
            x: MARGIN + colW - 40,
            y: yy,
            size: 9,
            font: deck.fonts.semibold,
            color: COLORS.slate,
          });
        });
      } else {
        page.drawText("No anchor breakdown in this snapshot.", {
          x: MARGIN,
          y,
          size: 9,
          font: deck.fonts.regular,
          color: COLORS.muted,
        });
      }

      if (topPages.length) {
        topPages.forEach((p, i) => {
          const yy = y - i * 18;
          page.drawText(safePdfText(pageLabel(p), 42), {
            x: MARGIN + colW + 20,
            y: yy,
            size: 9,
            font: deck.fonts.regular,
            color: COLORS.slateSoft,
          });
          page.drawText(nf(p.backlinks ?? p.count), {
            x: PAGE_W - MARGIN - 36,
            y: yy,
            size: 9,
            font: deck.fonts.semibold,
            color: COLORS.slate,
          });
        });
      } else {
        page.drawText("No linked-page breakdown in this snapshot.", {
          x: MARGIN + colW + 20,
          y,
          size: 9,
          font: deck.fonts.regular,
          color: COLORS.muted,
        });
      }
    } else {
      page.drawText("Backlink summary unavailable. Refresh backlinks in the app to populate.", {
        x: MARGIN,
        y: PAGE_H / 2,
        size: 12,
        font: deck.fonts.regular,
        color: COLORS.muted,
      });
    }
  }

  // Site audit — SE Ranking primary + issue detail
  {
    const audit = data.audit;
    const page = deck.addSlide();
    const sourceLabel =
      audit?.source === "seranking"
        ? "SE Ranking site audit"
        : audit?.source === "internal"
          ? "Technical crawl audit"
          : "Technical health snapshot";
    deck.drawSlideTitle(page, "Site audit", sourceLabel);

    if (audit && (audit.score != null || audit.critical != null || audit.issues?.length)) {
      deck.drawKpiCards(page, [
        {
          label: "Health score",
          value: audit.score != null ? String(Math.round(audit.score)) : "—",
        },
        { label: "Errors", value: nfExact(audit.critical) },
        { label: "Warnings", value: nfExact(audit.warning) },
        {
          label: audit.passed != null ? "Passed" : "Notices",
          value: audit.passed != null ? nfExact(audit.passed) : nfExact(audit.notice),
        },
      ]);

      const issues = (audit.issues || []).slice(0, 8);
      if (issues.length) {
        page.drawText("Priority issues", {
          x: MARGIN,
          y: PAGE_H - 220,
          size: 11,
          font: deck.fonts.bold,
          color: COLORS.slate,
        });
        deck.drawTable(
          page,
          [
            { key: "sev", label: "Severity", width: 0.14 },
            { key: "issue", label: "Issue", width: 0.58 },
            { key: "count", label: "Count", width: 0.12 },
            { key: "section", label: "Area", width: 0.16 },
          ],
          issues.map((iss) => ({
            sev: String(iss.severity || "notice").toUpperCase(),
            issue: String(iss.title || "Issue").slice(0, 55),
            count: nfExact(iss.count),
            section: String(iss.section || "").slice(0, 18),
          })),
          { yStart: PAGE_H - 238, maxRows: 8 }
        );
      } else if (audit.stats) {
        page.drawText(
          safePdfText(
            `Crawled ${nfExact(audit.stats.pagesCrawled)} pages · avg ${nfExact(audit.stats.avgResponseMs)} ms · ${nfExact(audit.stats.brokenExternal)} broken external`
          ),
          {
            x: MARGIN,
            y: PAGE_H - 230,
            size: 11,
            font: deck.fonts.regular,
            color: COLORS.slateSoft,
          }
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

  // Audit detail / fix guidance (second slide when we have descriptions)
  {
    const audit = data.audit;
    const detailed = (audit?.issues || []).filter((i) => i.description || i.fixSteps).slice(0, 5);
    if (detailed.length) {
      const page = deck.addSlide();
      deck.drawSlideTitle(page, "Audit priorities", "What to fix next — impact & guidance");
      let y = PAGE_H - 88;
      for (const iss of detailed) {
        page.drawText(safePdfText(`${String(iss.severity || "").toUpperCase()}  ·  ${iss.title}`, 90), {
          x: MARGIN,
          y,
          size: 11,
          font: deck.fonts.bold,
          color: COLORS.slate,
        });
        y -= 16;
        const body = safePdfText(iss.description || iss.fixSteps || "", 220);
        const lines = deck.wrapText(body, deck.fonts.regular, 10, PAGE_W - MARGIN * 2);
        for (const line of lines.slice(0, 2)) {
          page.drawText(line, {
            x: MARGIN,
            y,
            size: 10,
            font: deck.fonts.regular,
            color: COLORS.muted,
          });
          y -= 13;
        }
        if (iss.pages?.length) {
          page.drawText(safePdfText(`e.g. ${iss.pages[0]}`, 90), {
            x: MARGIN,
            y,
            size: 8,
            font: deck.fonts.regular,
            color: COLORS.cloud,
          });
          y -= 12;
        }
        y -= 10;
        if (y < 60) break;
      }
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
        ? `${connected.length} platform(s) connected for ${smm.periodLabel || "this period"}. Unlinked channels show as Not configured.`
        : "No social platforms are connected for this account yet."
    ),
    {
      x: MARGIN,
      y: PAGE_H - 80,
      size: 10,
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
          : p.weekChange != null && p.weekChange !== 0
            ? `${p.weekChange > 0 ? "+" : ""}${nfExact(p.weekChange)} WoW`
            : ""
        : "Not configured",
    }));
    deck.drawKpiCards(page, cards, {
      cols: Math.min(4, Math.max(cards.length, 1)),
      y: PAGE_H - 110,
    });
    deck.drawTable(
      page,
      [
        { key: "platform", label: "Platform", width: 0.22 },
        { key: "account", label: "Account", width: 0.22 },
        { key: "followers", label: "Followers", width: 0.14 },
        { key: "week", label: "WoW", width: 0.12 },
        { key: "month", label: "MoM", width: 0.12 },
        { key: "reach", label: "Reach", width: 0.09 },
        { key: "eng", label: "Eng.", width: 0.09 },
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

  if (connected.length && smm.activity) {
    const act = deck.addSlide();
    deck.drawSlideTitle(act, "Content activity", smm.periodLabel || "");
    act.drawText(
      safePdfText("Totals include connected platforms only — Not configured channels are excluded."),
      {
        x: MARGIN,
        y: PAGE_H - 80,
        size: 10,
        font: deck.fonts.regular,
        color: COLORS.muted,
      }
    );
    deck.drawKpiCards(act, [
      { label: "Reach", value: nf(smm.activity.totalReach ?? smm.totals?.reach) },
      { label: "Engagements", value: nf(smm.activity.totalEngagements ?? smm.totals?.engagements) },
      { label: "Followers (total)", value: nf(smm.totals?.followers) },
      { label: "Connected", value: String(connected.length) },
    ]);
    if ((smm.summaryLines || []).length) {
      let y = PAGE_H - 240;
      for (const line of smm.summaryLines.slice(0, 4)) {
        const wrapped = deck.wrapText(safePdfText(line), deck.fonts.regular, 11, PAGE_W - MARGIN * 2);
        for (const w of wrapped.slice(0, 3)) {
          act.drawText(w, {
            x: MARGIN,
            y,
            size: 11,
            font: deck.fonts.regular,
            color: COLORS.slateSoft,
          });
          y -= 16;
        }
        y -= 6;
      }
    }
  }
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
            "01   Website traffic overview",
            "02   Audience geography",
            "03   Keywords & pages",
            "04   Domain intelligence & backlinks",
            "05   Site audit priorities",
            "06   Social performance",
          ]
        : [
            "01   Traffic overview",
            "02   Audience geography",
            "03   Keywords & top pages",
            "04   Domain intelligence",
            "05   Backlink profile",
            "06   Site audit & priorities",
          ];
    items.forEach((line, i) => {
      toc.drawText(line, {
        x: MARGIN,
        y: PAGE_H - 110 - i * 32,
        size: 16,
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
      ["01   Platform KPIs", "02   Content activity"].forEach((line, i) => {
        toc.drawText(line, {
          x: MARGIN,
          y: PAGE_H - 110 - i * 32,
          size: 16,
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
