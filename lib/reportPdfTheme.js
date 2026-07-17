/**
 * Shared Crossway-branded PDF layout for client-facing reports.
 * Plain language, consistent colors, headers/footers on every page.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const PAGE_W = 595.28;
export const PAGE_H = 841.89;
export const MARGIN = 44;
export const HEADER_H = 68;
export const FOOTER_H = 32;
export const CONTENT_TOP = PAGE_H - HEADER_H - 28;
export const CONTENT_BOTTOM = FOOTER_H + 18;

export const BRAND = {
  name: "Crossway SEO Tool",
  tagline: "Marketing & search performance reports",
  green: rgb(0.055, 0.996, 0.165),
  greenDark: rgb(0.043, 0.8, 0.133),
  greenText: rgb(0.09, 0.55, 0.22),
  blue: rgb(0.1, 0.35, 0.62),
  white: rgb(1, 1, 1),
  black: rgb(0.08, 0.1, 0.12),
  muted: rgb(0.42, 0.45, 0.5),
  lightBg: rgb(0.96, 0.99, 0.96),
  sectionBg: rgb(0.93, 0.98, 0.93),
  border: rgb(0.85, 0.9, 0.85),
  amber: rgb(0.72, 0.45, 0.05),
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
  const t = String(s ?? "");
  let out = "";
  for (let i = 0; i < t.length && out.length < maxLen; i += 1) {
    const c = t.charCodeAt(i);
    out += c >= 32 && c <= 126 ? t[i] : "?";
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

function drawBrandedHeader(page, font, fontBold, reportTitle, propertyLabel) {
  page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H, color: BRAND.green });
  page.drawRectangle({
    x: 0,
    y: PAGE_H - HEADER_H,
    width: PAGE_W,
    height: 8,
    color: BRAND.greenDark,
  });
  page.drawText(safePdfText(BRAND.name, 40), {
    x: MARGIN,
    y: PAGE_H - 28,
    size: 11,
    font: fontBold,
    color: BRAND.black,
  });
  page.drawText(safePdfText(reportTitle, 60), {
    x: MARGIN,
    y: PAGE_H - 44,
    size: 16,
    font: fontBold,
    color: BRAND.black,
  });
  page.drawText(safePdfText(propertyLabel, 50), {
    x: MARGIN,
    y: PAGE_H - 58,
    size: 9,
    font,
    color: rgb(0.15, 0.18, 0.15),
  });
}

function drawBrandedFooter(page, font, pageNum, totalHint) {
  const y = FOOTER_H - 10;
  page.drawLine({
    start: { x: MARGIN, y: FOOTER_H + 6 },
    end: { x: PAGE_W - MARGIN, y: FOOTER_H + 6 },
    thickness: 0.5,
    color: BRAND.border,
  });
  page.drawText(safePdfText(BRAND.name, 40), {
    x: MARGIN,
    y,
    size: 7,
    font,
    color: BRAND.muted,
  });
  page.drawText(safePdfText(BRAND.tagline, 50), {
    x: MARGIN,
    y: y - 10,
    size: 6.5,
    font,
    color: BRAND.muted,
  });
  const pageLabel = totalHint ? `Page ${pageNum}` : `Page ${pageNum}`;
  const w = font.widthOfTextAtSize(pageLabel, 7);
  page.drawText(pageLabel, {
    x: PAGE_W - MARGIN - w,
    y,
    size: 7,
    font,
    color: BRAND.muted,
  });
}

/**
 * Create a branded PDF drawing context.
 */
export async function createBrandedReportContext({ reportTitle, propertyLabel, introNote }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = null;
  let pageNum = 0;
  let y = CONTENT_TOP;

  const startPage = () => {
    pageNum += 1;
    page = pdf.addPage([PAGE_W, PAGE_H]);
    drawBrandedHeader(page, font, fontBold, reportTitle, propertyLabel);
    drawBrandedFooter(page, font, pageNum);
    y = CONTENT_TOP;
    return page;
  };

  startPage();

  const ensureSpace = (minY = CONTENT_BOTTOM + 40) => {
    if (y < minY) startPage();
  };

  const drawTextLine = (text, size, f, color, x = MARGIN, extraGap = 3) => {
    ensureSpace(CONTENT_BOTTOM + size + 8);
    page.drawText(safePdfText(text), { x, y, size, font: f, color });
    y -= size + extraGap;
  };

  const drawPlainBox = (text, tone = "info") => {
    const lines = wrapText(text, 78);
    const boxH = 14 + lines.length * 11;
    ensureSpace(CONTENT_BOTTOM + boxH + 8);
    const bg = tone === "warn" ? rgb(1, 0.97, 0.92) : BRAND.lightBg;
    const border = tone === "warn" ? rgb(0.95, 0.8, 0.5) : BRAND.border;
    page.drawRectangle({
      x: MARGIN,
      y: y - boxH + 10,
      width: PAGE_W - MARGIN * 2,
      height: boxH,
      color: bg,
      borderColor: border,
      borderWidth: 0.75,
    });
    let ly = y - 2;
    for (const line of lines) {
      page.drawText(safePdfText(line), { x: MARGIN + 10, y: ly, size: 8.5, font, color: BRAND.black });
      ly -= 11;
    }
    y -= boxH + 10;
  };

  const drawSection = (title, subtitle) => {
    ensureSpace(CONTENT_BOTTOM + 52);
    y -= 6;
    page.drawRectangle({
      x: MARGIN,
      y: y - 2,
      width: 4,
      height: 22,
      color: BRAND.greenText,
    });
    page.drawText(safePdfText(title, 55), { x: MARGIN + 12, y: y + 4, size: 13, font: fontBold, color: BRAND.black });
    y -= 16;
    if (subtitle) {
      drawTextLine(subtitle, 9, font, BRAND.muted, MARGIN + 12, 6);
    }
    y -= 4;
  };

  const drawMetricRow = (metrics = []) => {
    if (!metrics.length) return;
    const cols = Math.min(metrics.length, 4);
    const gap = 8;
    const colW = (PAGE_W - MARGIN * 2 - gap * (cols - 1)) / cols;
    const boxH = 44;
    ensureSpace(CONTENT_BOTTOM + boxH + 12);

    metrics.slice(0, 4).forEach((m, i) => {
      const x = MARGIN + i * (colW + gap);
      page.drawRectangle({
        x,
        y: y - boxH + 8,
        width: colW,
        height: boxH,
        color: BRAND.sectionBg,
        borderColor: BRAND.border,
        borderWidth: 0.5,
      });
      page.drawText(safePdfText(m.label, 28), {
        x: x + 8,
        y: y - 6,
        size: 7,
        font,
        color: BRAND.muted,
      });
      page.drawText(safePdfText(m.value, 18), {
        x: x + 8,
        y: y - 22,
        size: 14,
        font: fontBold,
        color: BRAND.greenText,
      });
      if (m.hint) {
        page.drawText(safePdfText(m.hint, 24), {
          x: x + 8,
          y: y - 36,
          size: 6.5,
          font,
          color: BRAND.muted,
        });
      }
    });
    y -= boxH + 14;
  };

  const drawTableHeader = (columns, colXs) => {
    ensureSpace(CONTENT_BOTTOM + 24);
    page.drawRectangle({
      x: MARGIN,
      y: y - 4,
      width: PAGE_W - MARGIN * 2,
      height: 16,
      color: BRAND.greenText,
    });
    columns.forEach((col, i) => {
      page.drawText(safePdfText(col, 20), {
        x: colXs[i],
        y: y,
        size: 7.5,
        font: fontBold,
        color: BRAND.white,
      });
    });
    y -= 18;
  };

  const drawTableRow = (cells, colXs, alt = false) => {
    ensureSpace(CONTENT_BOTTOM + 16);
    if (alt) {
      page.drawRectangle({
        x: MARGIN,
        y: y - 3,
        width: PAGE_W - MARGIN * 2,
        height: 14,
        color: BRAND.lightBg,
      });
    }
    cells.forEach((cell, i) => {
      page.drawText(safePdfText(cell, 90), {
        x: colXs[i],
        y,
        size: 7.5,
        font,
        color: BRAND.black,
      });
    });
    y -= 14;
  };

  const drawBullet = (text) => {
    drawTextLine(`•  ${text}`, 8.5, font, BRAND.black, MARGIN + 4, 4);
  };

  // Cover intro on first page
  drawPlainBox(
    introNote ||
      `This report summarizes how your marketing is performing in plain language. Generated on ${formatReportDate()}.`
  );

  return {
    pdf,
    font,
    fontBold,
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

function wrapText(text, maxChars) {
  const words = String(text || "").split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > maxChars) {
      if (line) lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/** Layman labels used across all report types */
export const PLAIN = {
  smmTitle: "Social Media Followers",
  smmSubtitle: "How many people follow your accounts on each platform",
  smmNote: "These numbers show your audience size. Higher followers usually mean more people see your posts.",
  websiteTitle: "Website Performance on Google",
  websiteSubtitle: "How people find and visit your website through Google search",
  websiteNote:
    "Google shares this data when your website is connected. Visits = people who clicked to your site. Appearances = how often you showed up in search results.",
  clicks: "Visits from Google",
  impressions: "Search appearances",
  ctr: "Click rate",
  position: "Avg. Google ranking",
  positionHint: "Lower number = better (page 1 is around 1–10)",
  seoTitle: "Ways to Improve Your Google Rankings",
  seoSubtitle: "Action items your team can work on — explained in everyday language",
  striking: "Keywords almost on page 1 (quick wins)",
  cannibalization: "Pages competing for the same search term",
  decay: "Search terms losing traffic",
  inspectionTitle: "Is Google Showing Your Pages?",
  inspectionSubtitle: "Which pages appear in Google search and which ones need attention",
  indexed: "Showing on Google",
  notIndexed: "Not on Google yet",
  deviceTitle: "Who Is Visiting Your Site?",
  deviceSubtitle: "Breakdown by phone, computer, and tablet",
  sitemapTitle: "Your Site Map Status",
  sitemapSubtitle: "Helps Google discover all the pages on your website",
  queryPageTitle: "Which Searches Bring People to Which Pages",
  queryPageSubtitle: "The words people type in Google and the page they land on",
};
