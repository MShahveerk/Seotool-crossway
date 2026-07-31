/**
 * Landscape slide-deck theme — Crossway Consulting branding.
 */
import { readFile } from "fs/promises";
import fs from "fs";
import path from "path";
import { PDFDocument, rgb } from "pdf-lib";
import { embedInterFonts } from "./interFonts.js";

/** Landscape US Letter-ish (points) */
export const PAGE_W = 842;
export const PAGE_H = 595;
export const MARGIN = 44;
export const FOOTER_H = 32;
export const HEADER_H = 64;

export const COLORS = {
  ivory: rgb(0.973, 0.969, 0.957),
  paper: rgb(1, 1, 1),
  slate: rgb(0.078, 0.078, 0.075),
  slateSoft: rgb(0.22, 0.22, 0.21),
  muted: rgb(0.42, 0.42, 0.4),
  cloud: rgb(0.62, 0.61, 0.58),
  stone: rgb(0.8, 0.79, 0.76),
  border: rgb(0.86, 0.85, 0.82),
  accent: rgb(0.055, 0.937, 0.165),
  accentDeep: rgb(0.08, 0.52, 0.26),
  heatIdle: rgb(0.86, 0.9, 0.91),
  white: rgb(1, 1, 1),
  coverBg: rgb(0.07, 0.07, 0.068),
  cardShadow: rgb(0.93, 0.92, 0.9),
};

export const BRAND = {
  name: "Crossway Consulting",
  tagline: "AI-powered digital growth",
  url: "crosswayconsulting.com",
};

export function nf(n) {
  return new Intl.NumberFormat("en-US").format(Math.round(Number(n) || 0));
}

export function pct(n, digits = 1) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0%";
  const asPct = Math.abs(v) <= 1 && Math.abs(v) !== 0 ? v * 100 : v;
  return `${asPct.toFixed(digits)}%`;
}

export function deltaLabel(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v === 0) return "0%";
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
  if (/^\d+$/.test(raw)) return `Meta Page ${raw}`;
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

function drawLogo(page, logo, { x, y, height = 36, plate = false } = {}) {
  if (!logo) return 0;
  const width = (logo.width / Math.max(logo.height, 1)) * height;
  if (plate) {
    const padX = 10;
    const padY = 8;
    page.drawRectangle({
      x: x - padX,
      y: y - padY,
      width: width + padX * 2,
      height: height + padY * 2,
      color: COLORS.white,
      borderColor: COLORS.border,
      borderWidth: 0.5,
    });
  }
  page.drawImage(logo, { x, y, width, height });
  return width;
}

/**
 * Create a landscape slide deck document helper.
 */
export async function createSlideDeck({ title, propertyLabel, reportDate, preparedFor, internal = false }) {
  const pdf = await PDFDocument.create();
  const fonts = await embedInterFonts(pdf);
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
    // Soft panel background
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: COLORS.ivory });
    // Top accent
    page.drawRectangle({ x: 0, y: PAGE_H - 5, width: PAGE_W, height: 5, color: COLORS.accent });
    // Header band
    page.drawRectangle({
      x: 0,
      y: PAGE_H - HEADER_H,
      width: PAGE_W,
      height: HEADER_H - 5,
      color: COLORS.paper,
    });
    page.drawLine({
      start: { x: 0, y: PAGE_H - HEADER_H },
      end: { x: PAGE_W, y: PAGE_H - HEADER_H },
      thickness: 0.8,
      color: COLORS.border,
    });
    // Logo top-right on content slides (keeps titles clear on the left)
    if (logo) {
      const h = 26;
      const w = (logo.width / Math.max(logo.height, 1)) * h;
      drawLogo(page, logo, { x: PAGE_W - MARGIN - w, y: PAGE_H - 46, height: h, plate: false });
    } else {
      page.drawText(safePdfText(BRAND.name), {
        x: PAGE_W - MARGIN - fonts.semibold.widthOfTextAtSize(BRAND.name, 10),
        y: PAGE_H - 40,
        size: 10,
        font: fonts.semibold,
        color: COLORS.slate,
      });
    }
  }

  function drawFooter(page, index, total) {
    const y = 16;
    page.drawLine({
      start: { x: MARGIN, y: FOOTER_H },
      end: { x: PAGE_W - MARGIN, y: FOOTER_H },
      thickness: 0.6,
      color: COLORS.border,
    });
    page.drawText(safePdfText(`${BRAND.name}  ·  ${BRAND.url}`), {
      x: MARGIN,
      y,
      size: 8,
      font: fonts.regular,
      color: COLORS.muted,
    });
    const conf = meta.internal ? "Internal · Confidential" : "Confidential";
    page.drawText(conf, {
      x: PAGE_W / 2 - fonts.regular.widthOfTextAtSize(conf, 8) / 2,
      y,
      size: 8,
      font: fonts.regular,
      color: COLORS.cloud,
    });
    const pageLabel = `${index} / ${total || pages.length}`;
    page.drawText(pageLabel, {
      x: PAGE_W - MARGIN - fonts.regular.widthOfTextAtSize(pageLabel, 8),
      y,
      size: 8,
      font: fonts.regular,
      color: COLORS.muted,
    });
  }

  function addSlide({ background = "content" } = {}) {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    if (background === "cover") {
      page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: COLORS.coverBg });
    } else {
      drawContentChrome(page);
    }
    pages.push(page);
    return page;
  }

  function drawSlideTitle(page, heading, subtitle) {
    page.drawText(safePdfText(heading), {
      x: MARGIN,
      y: PAGE_H - 36,
      size: 18,
      font: fonts.bold,
      color: COLORS.slate,
    });
    if (subtitle) {
      page.drawText(safePdfText(subtitle), {
        x: MARGIN,
        y: PAGE_H - 52,
        size: 9,
        font: fonts.regular,
        color: COLORS.muted,
      });
    }
  }

  function drawKpiCards(page, cards, { y = PAGE_H - 120, cols = 4 } = {}) {
    const gap = 14;
    const cardW = (PAGE_W - MARGIN * 2 - gap * (cols - 1)) / cols;
    const cardH = 92;
    cards.slice(0, cols).forEach((card, i) => {
      const x = MARGIN + i * (cardW + gap);
      // soft shadow
      page.drawRectangle({
        x: x + 2,
        y: y - cardH - 2,
        width: cardW,
        height: cardH,
        color: COLORS.cardShadow,
      });
      page.drawRectangle({
        x,
        y: y - cardH,
        width: cardW,
        height: cardH,
        color: COLORS.paper,
        borderColor: COLORS.border,
        borderWidth: 1,
      });
      // accent rail
      page.drawRectangle({
        x,
        y: y - cardH,
        width: 4,
        height: cardH,
        color: COLORS.accent,
      });
      page.drawText(safePdfText(card.label || ""), {
        x: x + 16,
        y: y - 26,
        size: 9,
        font: fonts.semibold,
        color: COLORS.muted,
      });
      page.drawText(safePdfText(card.value || "—"), {
        x: x + 16,
        y: y - 54,
        size: 22,
        font: fonts.bold,
        color: COLORS.slate,
      });
      if (card.delta) {
        const up = String(card.delta).startsWith("+");
        page.drawText(safePdfText(card.delta), {
          x: x + 16,
          y: y - 74,
          size: 10,
          font: fonts.semibold,
          color: up ? COLORS.accentDeep : COLORS.muted,
        });
      }
    });
    return y - cardH - 22;
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
        thickness: 1.8,
        color: COLORS.accentDeep,
      });
    }
  }

  function drawTable(page, columns, rows, { yStart = PAGE_H - 118, maxRows = 12 } = {}) {
    const tableW = PAGE_W - MARGIN * 2;
    const colWs = columns.map((c) => (c.width || 1 / columns.length) * tableW);
    let y = yStart;
    const rowH = 24;
    page.drawRectangle({
      x: MARGIN,
      y: y - rowH,
      width: tableW,
      height: rowH,
      color: COLORS.slate,
    });
    let x = MARGIN;
    columns.forEach((col, i) => {
      page.drawText(safePdfText(col.label), {
        x: x + 12,
        y: y - 16,
        size: 9,
        font: fonts.semibold,
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
        color: ri % 2 === 0 ? COLORS.paper : COLORS.ivory,
        borderColor: COLORS.border,
        borderWidth: 0.4,
      });
      let cx = MARGIN;
      columns.forEach((col, i) => {
        const val = safePdfText(row[col.key] ?? "", 80);
        page.drawText(val, {
          x: cx + 12,
          y: y - 16,
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
    // Green accent column
    page.drawRectangle({ x: 0, y: 0, width: 10, height: PAGE_H, color: COLORS.accent });
    // Subtle right panel
    page.drawRectangle({
      x: PAGE_W - 220,
      y: 0,
      width: 220,
      height: PAGE_H,
      color: rgb(0.1, 0.1, 0.095),
    });

    if (logoWhite || logo) {
      // White mark on dark cover — no white plate (matches site header)
      drawLogo(page, logoWhite || logo, { x: MARGIN + 18, y: PAGE_H - 100, height: 56, plate: false });
    }
    page.drawText(safePdfText(BRAND.name.toUpperCase()), {
      x: MARGIN + 18,
      y: PAGE_H - 128,
      size: 11,
      font: fonts.semibold,
      color: COLORS.cloud,
    });
    page.drawText(safePdfText(BRAND.tagline), {
      x: MARGIN + 18,
      y: PAGE_H - 146,
      size: 10,
      font: fonts.regular,
      color: COLORS.muted,
    });

    page.drawText(safePdfText(eyebrow || "Performance Report").toUpperCase(), {
      x: MARGIN + 18,
      y: PAGE_H / 2 + 56,
      size: 11,
      font: fonts.semibold,
      color: COLORS.accent,
    });

    const titleLines = wrapText(deckTitle || meta.title, fonts.bold, 38, PAGE_W - MARGIN * 2 - 240);
    let ty = PAGE_H / 2 + 20;
    for (const line of titleLines.slice(0, 3)) {
      page.drawText(line, {
        x: MARGIN + 18,
        y: ty,
        size: 36,
        font: fonts.bold,
        color: COLORS.white,
      });
      ty -= 42;
    }

    page.drawRectangle({
      x: MARGIN + 18,
      y: 118,
      width: 48,
      height: 3,
      color: COLORS.accent,
    });

    page.drawText(safePdfText(meta.propertyLabel), {
      x: MARGIN + 18,
      y: 92,
      size: 15,
      font: fonts.semibold,
      color: COLORS.white,
    });
    page.drawText(safePdfText(meta.reportDate), {
      x: MARGIN + 18,
      y: 72,
      size: 11,
      font: fonts.regular,
      color: COLORS.cloud,
    });
    if (meta.preparedFor) {
      page.drawText(safePdfText(`Prepared for ${meta.preparedFor}`), {
        x: MARGIN + 18,
        y: 52,
        size: 11,
        font: fonts.regular,
        color: COLORS.cloud,
      });
    }

    page.drawText(safePdfText(BRAND.url), {
      x: PAGE_W - 200,
      y: 40,
      size: 10,
      font: fonts.semibold,
      color: COLORS.accent,
    });
    return page;
  }

  function addClosing() {
    const page = addSlide({ background: "cover" });
    page.drawRectangle({ x: 0, y: 0, width: 10, height: PAGE_H, color: COLORS.accent });
    if (logoWhite || logo) {
      drawLogo(page, logoWhite || logo, { x: MARGIN + 18, y: PAGE_H - 96, height: 52, plate: false });
    }
    page.drawText("Thank you", {
      x: MARGIN + 18,
      y: PAGE_H / 2 + 24,
      size: 40,
      font: fonts.bold,
      color: COLORS.white,
    });
    page.drawText("Questions? Let's grow together.", {
      x: MARGIN + 18,
      y: PAGE_H / 2 - 12,
      size: 14,
      font: fonts.regular,
      color: COLORS.cloud,
    });
    page.drawText(safePdfText(BRAND.url), {
      x: MARGIN + 18,
      y: 88,
      size: 13,
      font: fonts.semibold,
      color: COLORS.accent,
    });
    page.drawText("info@crosswayconsulting.com  ·  817.875.7777", {
      x: MARGIN + 18,
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
