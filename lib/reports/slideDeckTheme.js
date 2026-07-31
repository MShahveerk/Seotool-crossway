/**
 * 16:9 slide-deck theme — Crossway Consulting / ShipSearch-class craft.
 * Nunito typography, ink + paper palette, bright accent.
 */
import { readFile } from "fs/promises";
import fs from "fs";
import path from "path";
import { PDFDocument, rgb } from "pdf-lib";
import { embedNunitoFonts } from "./nunitoFonts.js";

/** 16:9 landscape (points) — pitch-deck proportion */
export const PAGE_W = 960;
export const PAGE_H = 540;
export const MARGIN = 48;
export const FOOTER_H = 36;
export const HEADER_H = 56;

export const COLORS = {
  ivory: rgb(0.98, 0.973, 0.953), // #faf8f3
  paper: rgb(1, 1, 1),
  paperWarm: rgb(0.945, 0.937, 0.914), // #f1efe9
  slate: rgb(0.043, 0.043, 0.039), // #0b0b0a
  slateSoft: rgb(0.22, 0.21, 0.2),
  muted: rgb(0.42, 0.396, 0.376), // #6b6560
  cloud: rgb(0.659, 0.635, 0.58), // #a8a294
  stone: rgb(0.831, 0.816, 0.784),
  border: rgb(0.831, 0.816, 0.784), // #d4d0c8
  accent: rgb(0.055, 1, 0.165), // #0eff2a
  accentDeep: rgb(0.114, 0.612, 0.208), // #1d9c35
  heatIdle: rgb(0.843, 0.878, 0.902),
  white: rgb(1, 1, 1),
  coverBg: rgb(0.043, 0.043, 0.039),
  cardShadow: rgb(0.93, 0.92, 0.9),
  panelDark: rgb(0.078, 0.078, 0.071),
};

export const BRAND = {
  name: "Crossway Consulting",
  tagline: "AI-powered digital growth",
  url: "crosswayconsulting.com",
};

/** Format a number for slides; missing / non-finite / zero → em dash (not fake zeros). */
export function nf(n, empty = "—") {
  if (n == null || n === "") return empty;
  const v = Number(n);
  if (!Number.isFinite(v) || v === 0) return empty;
  return new Intl.NumberFormat("en-US").format(Math.round(v));
}

/** Like nf but keeps real zeros (e.g. audit error count). */
export function nfExact(n, empty = "—") {
  if (n == null || n === "") return empty;
  const v = Number(n);
  if (!Number.isFinite(v)) return empty;
  return new Intl.NumberFormat("en-US").format(Math.round(v));
}

export function pct(n, digits = 1, empty = "—") {
  if (n == null || n === "") return empty;
  const v = Number(n);
  if (!Number.isFinite(v) || v === 0) return empty;
  const asPct = Math.abs(v) <= 1 ? v * 100 : v;
  return `${asPct.toFixed(digits)}%`;
}

export function deltaLabel(n, empty = "—") {
  if (n == null || n === "") return empty;
  const v = Number(n);
  if (!Number.isFinite(v) || v === 0) return empty;
  const sign = v > 0 ? "+" : "";
  return `${sign}${pct(v)}`;
}

export function safePdfText(s, maxLen = 400) {
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
  if (/^\d+$/.test(raw)) return "Social account";
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || raw;
  }
}

export function formatReportDate(d = new Date()) {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export function wrapText(text, font, size, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

async function embedPngCandidate(pdf, candidates) {
  for (const logoPath of candidates) {
    try {
      if (!fs.existsSync(logoPath)) continue;
      const bytes = await readFile(logoPath);
      if (!bytes?.length || bytes[0] !== 0x89) continue;
      return await pdf.embedPng(bytes);
    } catch {
      /* try next */
    }
  }
  return null;
}

async function loadBrandLogos(pdf) {
  const root = path.join(process.cwd(), "public");
  const logo = await embedPngCandidate(pdf, [
    path.join(root, "crossway-logo.png"),
    path.join(root, "crossway-logo-black.png"),
    path.join(root, "crossway-logo-email.png"),
  ]);
  const logoWhite = await embedPngCandidate(pdf, [
    path.join(root, "crossway-logo-white.png"),
    path.join(root, "crossway-logo.png"),
    path.join(root, "crossway-logo-email.png"),
  ]);
  return { logo, logoWhite: logoWhite || logo };
}

function drawLogo(page, logo, { x, y, height = 36 } = {}) {
  if (!logo) return 0;
  const width = (logo.width / Math.max(logo.height, 1)) * height;
  page.drawImage(logo, { x, y, width, height });
  return width;
}

/**
 * Create a landscape slide deck document helper.
 */
export async function createSlideDeck({ title, propertyLabel, reportDate, preparedFor, internal = false }) {
  const pdf = await PDFDocument.create();
  const fonts = await embedNunitoFonts(pdf);
  const { logo, logoWhite } = await loadBrandLogos(pdf);
  const meta = {
    title: safePdfText(title || "Performance Report"),
    propertyLabel: safePdfText(propertyLabel || ""),
    reportDate: safePdfText(reportDate || formatReportDate()),
    preparedFor: safePdfText(preparedFor || ""),
    internal: Boolean(internal),
  };
  const pages = [];

  function drawContentChrome(page) {
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: COLORS.ivory });
    // Thin ink bar at top (pitch-deck accent)
    page.drawRectangle({ x: 0, y: PAGE_H - 3, width: PAGE_W, height: 3, color: COLORS.slate });
  }

  function drawFooter(page, index, total) {
    const y = 14;
    page.drawLine({
      start: { x: MARGIN, y: FOOTER_H },
      end: { x: PAGE_W - MARGIN, y: FOOTER_H },
      thickness: 0.6,
      color: COLORS.border,
    });
    const brand = `${BRAND.name}`;
    page.drawText(safePdfText(brand), {
      x: MARGIN,
      y,
      size: 8,
      font: fonts.bold,
      color: COLORS.slate,
    });
    page.drawText(safePdfText(BRAND.url.toUpperCase()), {
      x: MARGIN + fonts.bold.widthOfTextAtSize(brand, 8) + 10,
      y,
      size: 7,
      font: fonts.semibold,
      color: COLORS.cloud,
    });
    const conf = meta.internal ? "INTERNAL  ·  CONFIDENTIAL" : "CONFIDENTIAL";
    page.drawText(conf, {
      x: PAGE_W / 2 - fonts.semibold.widthOfTextAtSize(conf, 7) / 2,
      y,
      size: 7,
      font: fonts.semibold,
      color: COLORS.cloud,
    });
    const pageLabel = String(index).padStart(2, "0");
    page.drawText(pageLabel, {
      x: PAGE_W - MARGIN - fonts.bold.widthOfTextAtSize(pageLabel, 9),
      y,
      size: 9,
      font: fonts.bold,
      color: COLORS.slate,
    });
  }

  function addSlide({ background = "content" } = {}) {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    if (background === "cover") {
      page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: COLORS.coverBg });
      page.drawRectangle({ x: 0, y: PAGE_H - 3, width: PAGE_W, height: 3, color: COLORS.accent });
    } else {
      drawContentChrome(page);
    }
    pages.push(page);
    return page;
  }

  function drawSlideTitle(page, heading, subtitle) {
    // Logo top-right
    if (logo) {
      const h = 22;
      const w = (logo.width / Math.max(logo.height, 1)) * h;
      drawLogo(page, logo, { x: PAGE_W - MARGIN - w, y: PAGE_H - 40, height: h });
    }

    page.drawText(safePdfText(heading), {
      x: MARGIN,
      y: PAGE_H - 42,
      size: 22,
      font: fonts.bold,
      color: COLORS.slate,
    });
    if (subtitle) {
      page.drawText(safePdfText(subtitle), {
        x: MARGIN,
        y: PAGE_H - 60,
        size: 10,
        font: fonts.regular,
        color: COLORS.muted,
      });
    }
  }

  function drawEyebrow(page, text, { x = MARGIN, y = PAGE_H - 78 } = {}) {
    page.drawText(safePdfText(String(text || "").toUpperCase()), {
      x,
      y,
      size: 9,
      font: fonts.bold,
      color: COLORS.accentDeep,
    });
  }

  function drawKpiCards(page, cards, { y = PAGE_H - 118, cols = 4 } = {}) {
    const gap = 12;
    const cardW = (PAGE_W - MARGIN * 2 - gap * (cols - 1)) / cols;
    const cardH = 88;
    cards.slice(0, cols).forEach((card, i) => {
      const x = MARGIN + i * (cardW + gap);
      page.drawRectangle({
        x,
        y: y - cardH,
        width: cardW,
        height: cardH,
        color: COLORS.paper,
        borderColor: COLORS.border,
        borderWidth: 1,
      });
      page.drawRectangle({
        x,
        y: y - 3,
        width: cardW,
        height: 3,
        color: COLORS.accentDeep,
      });
      page.drawText(safePdfText(card.label || "").toUpperCase(), {
        x: x + 16,
        y: y - 28,
        size: 8,
        font: fonts.bold,
        color: COLORS.cloud,
      });
      const valueText = safePdfText(card.value || "—");
      const valueSize = valueText.length > 12 ? 14 : valueText.length > 8 ? 18 : 26;
      page.drawText(valueText, {
        x: x + 16,
        y: y - 56,
        size: valueSize,
        font: fonts.bold,
        color: COLORS.slate,
      });
      if (card.delta) {
        const deltaText = safePdfText(card.delta);
        const up = deltaText.startsWith("+");
        const neutral = /^not /i.test(deltaText) || deltaText === "—";
        page.drawText(deltaText, {
          x: x + 16,
          y: y - 74,
          size: 9,
          font: fonts.semibold,
          color: neutral ? COLORS.muted : up ? COLORS.accentDeep : COLORS.muted,
        });
      }
    });
    return y - cardH - 18;
  }

  function drawSparkline(page, series, { x, y, width, height } = {}) {
    const values = (series || [])
      .map((p) => Number(p.clicks ?? p.value ?? 0))
      .filter((n) => Number.isFinite(n));
    if (values.length < 2) return;
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const span = Math.max(max - min, 1);
    page.drawRectangle({
      x,
      y,
      width,
      height,
      color: COLORS.paper,
      borderColor: COLORS.border,
      borderWidth: 1,
    });
    const step = width / (values.length - 1);
    for (let i = 1; i < values.length; i += 1) {
      const x1 = x + (i - 1) * step;
      const x2 = x + i * step;
      const y1 = y + 8 + ((values[i - 1] - min) / span) * (height - 16);
      const y2 = y + 8 + ((values[i] - min) / span) * (height - 16);
      page.drawLine({
        start: { x: x1, y: y1 },
        end: { x: x2, y: y2 },
        thickness: 2,
        color: COLORS.accentDeep,
      });
    }
  }

  function drawTable(page, columns, rows, { yStart = PAGE_H - 118, maxRows = 12 } = {}) {
    const tableW = PAGE_W - MARGIN * 2;
    const colWs = columns.map((c) => (c.width || 1 / columns.length) * tableW);
    let y = yStart;
    const rowH = 22;
    page.drawRectangle({
      x: MARGIN,
      y: y - rowH,
      width: tableW,
      height: rowH,
      color: COLORS.slate,
    });
    let x = MARGIN;
    columns.forEach((col, i) => {
      page.drawText(safePdfText(col.label).toUpperCase(), {
        x: x + 12,
        y: y - 14,
        size: 8,
        font: fonts.bold,
        color: COLORS.white,
      });
      x += colWs[i];
    });
    y -= rowH;
    const slice = rows.slice(0, maxRows);
    slice.forEach((row, ri) => {
      page.drawRectangle({
        x: MARGIN,
        y: y - rowH,
        width: tableW,
        height: rowH,
        color: ri % 2 === 0 ? COLORS.paper : COLORS.paperWarm,
        borderColor: COLORS.border,
        borderWidth: 0.4,
      });
      let cx = MARGIN;
      columns.forEach((col, i) => {
        const val = safePdfText(row[col.key] ?? "", 90);
        page.drawText(val, {
          x: cx + 12,
          y: y - 14,
          size: 9,
          font: fonts.regular,
          color: COLORS.slateSoft,
        });
        cx += colWs[i];
      });
      y -= rowH;
    });
    return y - 8;
  }

  function addCover({ deckTitle, eyebrow }) {
    const page = addSlide({ background: "cover" });

    if (logoWhite || logo) {
      drawLogo(page, logoWhite || logo, { x: MARGIN, y: PAGE_H - 88, height: 44 });
    }

    page.drawText(safePdfText(BRAND.name.toUpperCase()), {
      x: MARGIN,
      y: PAGE_H - 112,
      size: 10,
      font: fonts.bold,
      color: COLORS.cloud,
    });

    page.drawText(safePdfText(eyebrow || "Performance Report").toUpperCase(), {
      x: MARGIN,
      y: PAGE_H / 2 + 70,
      size: 11,
      font: fonts.bold,
      color: COLORS.accent,
    });

    const titleLines = wrapText(deckTitle || meta.title, fonts.bold, 42, PAGE_W - MARGIN * 2 - 80);
    let ty = PAGE_H / 2 + 30;
    for (const line of titleLines.slice(0, 3)) {
      page.drawText(line, {
        x: MARGIN,
        y: ty,
        size: 40,
        font: fonts.bold,
        color: COLORS.white,
      });
      ty -= 46;
    }

    page.drawRectangle({
      x: MARGIN,
      y: 118,
      width: 56,
      height: 3,
      color: COLORS.accent,
    });

    page.drawText(safePdfText(meta.propertyLabel), {
      x: MARGIN,
      y: 90,
      size: 16,
      font: fonts.semibold,
      color: COLORS.white,
    });
    page.drawText(safePdfText(meta.reportDate), {
      x: MARGIN,
      y: 68,
      size: 11,
      font: fonts.regular,
      color: COLORS.cloud,
    });
    if (meta.preparedFor) {
      page.drawText(safePdfText(`Prepared for ${meta.preparedFor}`), {
        x: MARGIN,
        y: 48,
        size: 11,
        font: fonts.regular,
        color: COLORS.cloud,
      });
    }

    page.drawText(safePdfText(BRAND.url.toUpperCase()), {
      x: PAGE_W - MARGIN - fonts.bold.widthOfTextAtSize(BRAND.url.toUpperCase(), 10),
      y: 36,
      size: 10,
      font: fonts.bold,
      color: COLORS.accent,
    });
    return page;
  }

  function addClosing() {
    const page = addSlide({ background: "cover" });
    if (logoWhite || logo) {
      drawLogo(page, logoWhite || logo, { x: MARGIN, y: PAGE_H - 88, height: 44 });
    }
    page.drawText("Thank you", {
      x: MARGIN,
      y: PAGE_H / 2 + 28,
      size: 44,
      font: fonts.bold,
      color: COLORS.white,
    });
    page.drawText("Questions? Let's grow together.", {
      x: MARGIN,
      y: PAGE_H / 2 - 12,
      size: 14,
      font: fonts.regular,
      color: COLORS.cloud,
    });
    page.drawRectangle({
      x: MARGIN,
      y: 120,
      width: 56,
      height: 3,
      color: COLORS.accent,
    });
    page.drawText(safePdfText(BRAND.url), {
      x: MARGIN,
      y: 88,
      size: 14,
      font: fonts.bold,
      color: COLORS.accent,
    });
    page.drawText("info@crosswayconsulting.com  ·  817.875.7777", {
      x: MARGIN,
      y: 64,
      size: 11,
      font: fonts.regular,
      color: COLORS.muted,
    });
    return page;
  }

  async function finalize() {
    const total = pages.length;
    pages.forEach((page, i) => {
      if (i === 0 || i === total - 1) return;
      drawFooter(page, i + 1, total);
    });
    return pdf.save();
  }

  return {
    pdf,
    fonts,
    logo,
    logoWhite,
    meta,
    pages,
    addSlide,
    addCover,
    addClosing,
    drawSlideTitle,
    drawEyebrow,
    drawKpiCards,
    drawSparkline,
    drawTable,
    wrapText,
    finalize,
    COLORS,
    PAGE_W,
    PAGE_H,
    MARGIN,
  };
}
