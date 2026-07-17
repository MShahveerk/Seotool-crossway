/**
 * Premium Crossway PDF layout — black & off-white, editorial spacing, smart page breaks.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const PAGE_W = 595.28;
export const PAGE_H = 841.89;
export const MARGIN = 54;
export const HEADER_H = 82;
export const FOOTER_H = 40;
export const CONTENT_TOP = PAGE_H - HEADER_H - 36;
export const CONTENT_BOTTOM = FOOTER_H + 24;

const LINE = 16;
const PARA = 11;
const SECTION_GAP = 26;
const TABLE_ROW_H = 20;
const TABLE_HEAD_H = 22;
const MIN_SECTION_BLOCK = 96;
const MIN_TABLE_BLOCK = TABLE_HEAD_H + TABLE_ROW_H * 2 + 8;

export const BRAND = {
  name: "Crossway SEO Tool",
  tagline: "Marketing performance summary",
  offWhite: rgb(0.969, 0.965, 0.958),
  paper: rgb(1, 1, 1),
  black: rgb(0.06, 0.06, 0.07),
  accent: rgb(0.06, 0.06, 0.07),
  muted: rgb(0.44, 0.44, 0.48),
  lightBg: rgb(0.985, 0.983, 0.978),
  border: rgb(0.8, 0.78, 0.74),
  rule: rgb(0.68, 0.66, 0.62),
  ruleLight: rgb(0.88, 0.86, 0.82),
  warnBg: rgb(0.98, 0.965, 0.94),
  warnBorder: rgb(0.75, 0.7, 0.62),
  internalBg: rgb(0.12, 0.12, 0.13),
  white: rgb(1, 1, 1),
};

export function nf(n) {
  return new Intl.NumberFormat("en-US").format(Math.round(Number(n) || 0));
}

export function pct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0%";
  return `${(v * 100).toFixed(1)}%`;
}

export function safePdfText(s, maxLen = 500) {
  const t = String(s ?? "")
    .replace(/\u2212/g, "-")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00b7/g, ", ")
    .replace(/\u2192/g, " to ")
    .replace(/\u2026/g, "...")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"');
  let out = "";
  for (let i = 0; i < t.length && out.length < maxLen; i += 1) {
    const c = t.charCodeAt(i);
    if (c >= 32 && c <= 126) out += t[i];
  }
  return out;
}

export function formatPropertyLabel(siteUrl) {
  const raw = String(siteUrl || "").trim();
  if (!raw) return "Your account";
  if (/^\d+$/.test(raw)) return "Your social media account";
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || raw;
  }
}

export function formatReportDate(d = new Date()) {
  return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function wrapText(text, maxChars) {
  const words = String(text || "").split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > maxChars) {
      if (line) lines.push(line);
      line = w.length > maxChars ? w.slice(0, maxChars) : w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function paintPageBackground(page) {
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: BRAND.offWhite });
}

function drawBrandedHeader(page, fonts, reportTitle, propertyLabel, reportDate, internal) {
  const { display, body } = fonts;
  const cardTop = PAGE_H - HEADER_H + 10;
  const cardH = HEADER_H - 18;

  page.drawLine({
    start: { x: 0, y: PAGE_H - 2 },
    end: { x: PAGE_W, y: PAGE_H - 2 },
    thickness: 2,
    color: BRAND.black,
  });

  page.drawRectangle({
    x: MARGIN + 1.5,
    y: cardTop - 1.5,
    width: PAGE_W - MARGIN * 2,
    height: cardH,
    color: rgb(0.9, 0.89, 0.87),
  });
  page.drawRectangle({
    x: MARGIN,
    y: cardTop,
    width: PAGE_W - MARGIN * 2,
    height: cardH,
    color: BRAND.paper,
    borderColor: BRAND.border,
    borderWidth: 0.5,
  });

  page.drawText(safePdfText(BRAND.name.toUpperCase(), 42), {
    x: MARGIN + 16,
    y: PAGE_H - 28,
    size: 7.5,
    font: display,
    color: BRAND.muted,
  });

  page.drawText(safePdfText(reportTitle, 56), {
    x: MARGIN + 16,
    y: PAGE_H - 46,
    size: 16,
    font: display,
    color: BRAND.black,
  });

  page.drawText(safePdfText(propertyLabel, 48), {
    x: MARGIN + 16,
    y: PAGE_H - 62,
    size: 9,
    font: body,
    color: BRAND.muted,
  });

  const dateStr = safePdfText(reportDate, 32);
  const dateW = body.widthOfTextAtSize(dateStr, 7.5);
  page.drawText(dateStr, {
    x: PAGE_W - MARGIN - 16 - dateW,
    y: PAGE_H - 28,
    size: 7.5,
    font: body,
    color: BRAND.muted,
  });

  if (internal) {
    const badge = "INTERNAL";
    const badgeW = display.widthOfTextAtSize(badge, 7) + 14;
    const bx = PAGE_W - MARGIN - 16 - badgeW;
    page.drawRectangle({
      x: bx,
      y: PAGE_H - 58,
      width: badgeW,
      height: 14,
      color: BRAND.internalBg,
    });
    page.drawText(badge, {
      x: bx + 7,
      y: PAGE_H - 55,
      size: 7,
      font: display,
      color: BRAND.white,
    });
  }

  page.drawLine({
    start: { x: MARGIN, y: cardTop - 4 },
    end: { x: PAGE_W - MARGIN, y: cardTop - 4 },
    thickness: 0.75,
    color: BRAND.ruleLight,
  });
}

function drawBrandedFooter(page, fonts, pageNum) {
  const { body } = fonts;
  const y = FOOTER_H - 2;
  page.drawLine({
    start: { x: MARGIN, y: FOOTER_H + 12 },
    end: { x: PAGE_W - MARGIN, y: FOOTER_H + 12 },
    thickness: 0.5,
    color: BRAND.rule,
  });

  const tagline = safePdfText(BRAND.tagline, 50);
  const tagW = body.widthOfTextAtSize(tagline, 7);
  page.drawText(tagline, {
    x: (PAGE_W - tagW) / 2,
    y: y + 2,
    size: 7,
    font: body,
    color: BRAND.muted,
  });

  page.drawText(safePdfText(BRAND.name, 36), {
    x: MARGIN,
    y,
    size: 6.5,
    font: body,
    color: BRAND.muted,
  });

  const pageLabel = `${pageNum}`;
  const pw = body.widthOfTextAtSize(pageLabel, 7);
  page.drawText(pageLabel, {
    x: PAGE_W - MARGIN - pw,
    y,
    size: 7,
    font: body,
    color: BRAND.muted,
  });
}

/**
 * @param {object} opts
 * @param {boolean} [opts.internal] — show INTERNAL badge (team-only reports)
 */
export async function createBrandedReportContext({
  reportTitle,
  propertyLabel,
  introNote,
  internal = false,
}) {
  const pdf = await PDFDocument.create();
  const fontBody = await pdf.embedFont(StandardFonts.TimesRoman);
  const fontDisplay = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontBodyBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const fonts = { body: fontBody, display: fontDisplay, bodyBold: fontBodyBold };
  const reportDate = formatReportDate();

  let page = null;
  let pageNum = 0;
  let y = CONTENT_TOP;

  const startPage = () => {
    pageNum += 1;
    page = pdf.addPage([PAGE_W, PAGE_H]);
    paintPageBackground(page);
    drawBrandedHeader(page, fonts, reportTitle, propertyLabel, reportDate, internal);
    drawBrandedFooter(page, fonts, pageNum);
    y = CONTENT_TOP;
    return page;
  };

  startPage();

  const ensureSpace = (height = LINE + PARA) => {
    if (y - height < CONTENT_BOTTOM) startPage();
  };

  const drawTextLine = (text, size, f, color, x = MARGIN, extraGap = PARA) => {
    ensureSpace(size + extraGap + 6);
    page.drawText(safePdfText(text), { x, y, size, font: f, color: color || BRAND.black });
    y -= size + extraGap;
  };

  const drawPlainBox = (text, tone = "info") => {
    const lines = wrapText(text, 74);
    const innerPad = 14;
    const lineH = 13;
    const boxH = innerPad * 2 + lines.length * lineH;
    ensureSpace(boxH + SECTION_GAP);

    const bg = tone === "warn" ? BRAND.warnBg : BRAND.paper;
    const border = tone === "warn" ? BRAND.warnBorder : BRAND.border;

    page.drawRectangle({
      x: MARGIN,
      y: y - boxH + innerPad - 2,
      width: PAGE_W - MARGIN * 2,
      height: boxH,
      color: bg,
      borderColor: border,
      borderWidth: 0.75,
    });
    page.drawLine({
      start: { x: MARGIN, y: y + innerPad - 4 },
      end: { x: MARGIN + 28, y: y + innerPad - 4 },
      thickness: 2,
      color: BRAND.black,
    });

    let ly = y - innerPad + 2;
    for (const line of lines) {
      page.drawText(safePdfText(line), { x: MARGIN + 16, y: ly, size: 9.5, font: fontBody, color: BRAND.black });
      ly -= lineH;
    }
    y -= boxH + SECTION_GAP;
  };

  const drawSection = (title, subtitle) => {
    ensureSpace(MIN_SECTION_BLOCK);
    y -= SECTION_GAP * 0.4;

    page.drawLine({
      start: { x: MARGIN, y: y + 8 },
      end: { x: PAGE_W - MARGIN, y: y + 8 },
      thickness: 0.35,
      color: BRAND.ruleLight,
    });
    y -= 12;

    page.drawText(safePdfText(title, 52), {
      x: MARGIN,
      y,
      size: 14,
      font: fontDisplay,
      color: BRAND.black,
    });
    y -= 20;

    if (subtitle) {
      for (const line of wrapText(subtitle, 76)) {
        drawTextLine(line, 9.5, fontBody, BRAND.muted, MARGIN, 6);
      }
    }
    y -= 8;
  };

  const drawMetricRow = (metrics = []) => {
    if (!metrics.length) return;
    const cols = Math.min(metrics.length, 4);
    const gap = 12;
    const colW = (PAGE_W - MARGIN * 2 - gap * (cols - 1)) / cols;
    const boxH = 58;
    ensureSpace(boxH + SECTION_GAP);

    metrics.slice(0, 4).forEach((m, i) => {
      const x = MARGIN + i * (colW + gap);
      page.drawRectangle({
        x,
        y: y - boxH + 12,
        width: colW,
        height: boxH,
        color: BRAND.paper,
        borderColor: BRAND.border,
        borderWidth: 0.75,
      });
      page.drawRectangle({
        x,
        y: y + 8,
        width: colW,
        height: 3,
        color: BRAND.black,
      });
      page.drawText(safePdfText(m.label, 26), {
        x: x + 12,
        y: y - 2,
        size: 7.5,
        font: fontBody,
        color: BRAND.muted,
      });
      page.drawText(safePdfText(m.value, 16), {
        x: x + 12,
        y: y - 22,
        size: 16,
        font: fontDisplay,
        color: BRAND.black,
      });
      if (m.hint) {
        page.drawText(safePdfText(wrapText(m.hint, 20)[0], 24), {
          x: x + 12,
          y: y - 40,
          size: 7,
          font: fontBody,
          color: BRAND.muted,
        });
      }
    });
    y -= boxH + SECTION_GAP;
  };

  const drawTableHeader = (columns, colXs) => {
    ensureSpace(MIN_TABLE_BLOCK);
    page.drawRectangle({
      x: MARGIN,
      y: y - 8,
      width: PAGE_W - MARGIN * 2,
      height: TABLE_HEAD_H,
      color: BRAND.black,
    });
    columns.forEach((col, i) => {
      page.drawText(safePdfText(col, 22), {
        x: colXs[i],
        y: y - 2,
        size: 8.5,
        font: fontDisplay,
        color: BRAND.white,
      });
    });
    y -= TABLE_HEAD_H + 6;
  };

  const drawTableRow = (cells, colXs, alt = false) => {
    ensureSpace(TABLE_ROW_H + 6);
    if (alt) {
      page.drawRectangle({
        x: MARGIN,
        y: y - 6,
        width: PAGE_W - MARGIN * 2,
        height: TABLE_ROW_H,
        color: BRAND.lightBg,
      });
    }
    cells.forEach((cell, i) => {
      page.drawText(safePdfText(cell, 88), {
        x: colXs[i],
        y: y - 3,
        size: 8.5,
        font: fontBody,
        color: BRAND.black,
      });
    });
    y -= TABLE_ROW_H + 2;
  };

  const drawBullet = (text) => {
    const lines = wrapText(text, 72);
    ensureSpace(lines.length * LINE + PARA + 4);
    lines.forEach((line, idx) => {
      const prefix = idx === 0 ? "-  " : "    ";
      drawTextLine(`${prefix}${line}`, 9.5, fontBody, BRAND.black, MARGIN + 4, 7);
    });
    y -= 6;
  };

  drawPlainBox(
    introNote ||
      `A clear summary prepared on ${reportDate}. Figures are rounded for readability.`
  );

  return {
    pdf,
    font: fontBody,
    fontBold: fontDisplay,
    fontBodyBold,
    get page() {
      return page;
    },
    get y() {
      return y;
    },
    set y(v) {
      y = v;
    },
    ensureSpace,
    drawTextLine,
    drawPlainBox,
    drawSection,
    drawMetricRow,
    drawTableHeader,
    drawTableRow,
    drawBullet,
    startPage,
  };
}

export const PLAIN = {
  smmTitle: "Social Media Report",
  smmSubtitle: "How your audience and content performed, with trends vs last week and last month",
  smmNote:
    "Followers are people who follow your accounts. Reach is how many people saw your content. Interactions are likes, comments, shares, and similar activity.",
  websiteTitle: "Website Performance",
  websiteSubtitle: "How your site appears and performs in Google search",
  websiteNote:
    "Visits are people who clicked through to your site. Appearances are how often your site showed up in Google results, even if they did not click.",
  clicks: "Visits from Google",
  impressions: "Search appearances",
  ctr: "Click rate",
  position: "Average ranking",
  positionHint: "Lower is better",
  seoTitle: "SEO Opportunities",
  seoSubtitle: "Internal analysis for your marketing team",
  striking: "Keywords close to page one",
  cannibalization: "Pages competing for the same term",
  decay: "Search terms losing traffic",
  inspectionTitle: "Google Index Status",
  inspectionSubtitle: "Internal technical review",
  indexed: "On Google",
  notIndexed: "Not on Google yet",
  deviceTitle: "Visitors by Device",
  deviceSubtitle: "Internal traffic breakdown",
  sitemapTitle: "Site Map Health",
  sitemapSubtitle: "Internal sitemap review",
  queryPageTitle: "Search Terms & Pages",
  queryPageSubtitle: "Internal query-to-page analysis",
};
