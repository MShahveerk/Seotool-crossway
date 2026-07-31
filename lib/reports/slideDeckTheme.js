/**
 * Landscape slide-deck theme — Crossway Consulting branding, Anthropic-like Inter type.
 */
import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument, rgb } from "pdf-lib";
import { embedInterFonts } from "./interFonts.js";

/** Landscape US Letter-ish (points) */
export const PAGE_W = 842;
export const PAGE_H = 595;
export const MARGIN = 40;
export const FOOTER_H = 28;

export const COLORS = {
  ivory: rgb(0.98, 0.976, 0.96),
  paper: rgb(1, 1, 1),
  slate: rgb(0.078, 0.078, 0.075),
  slateSoft: rgb(0.24, 0.24, 0.23),
  muted: rgb(0.45, 0.45, 0.42),
  cloud: rgb(0.69, 0.68, 0.65),
  stone: rgb(0.8, 0.8, 0.78),
  border: rgb(0.88, 0.87, 0.84),
  accent: rgb(0.055, 0.937, 0.165), // Crossway green
  accentDeep: rgb(0.08, 0.55, 0.27),
  heatIdle: rgb(0.84, 0.88, 0.9),
  white: rgb(1, 1, 1),
  coverBg: rgb(0.078, 0.078, 0.075),
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

async function loadBrandLogo(pdf) {
  try {
    const logoPath = path.join(process.cwd(), "public", "crossway-logo.png");
    const bytes = await readFile(logoPath);
    return pdf.embedPng(bytes);
  } catch {
    return null;
  }
}

/**
 * Create a landscape slide deck document helper.
 */
export async function createSlideDeck({ title, propertyLabel, reportDate, preparedFor, internal = false }) {
  const pdf = await PDFDocument.create();
  const fonts = await embedInterFonts(pdf);
  const logo = await loadBrandLogo(pdf);
  const meta = {
    title: safePdfText(title || "Performance Report"),
    propertyLabel: safePdfText(propertyLabel || ""),
    reportDate: safePdfText(reportDate || formatReportDate()),
    preparedFor: safePdfText(preparedFor || ""),
    internal: Boolean(internal),
  };
  const pages = [];

  function drawFooter(page, index, total) {
    const y = 18;
    page.drawLine({
      start: { x: MARGIN, y: FOOTER_H },
      end: { x: PAGE_W - MARGIN, y: FOOTER_H },
      thickness: 0.6,
      color: COLORS.border,
    });
    page.drawText(safePdfText(BRAND.url), {
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

  function addSlide({ background = "ivory" } = {}) {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    const bg = background === "cover" ? COLORS.coverBg : background === "paper" ? COLORS.paper : COLORS.ivory;
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: bg });
    // Accent bar
    if (background !== "cover") {
      page.drawRectangle({
        x: 0,
        y: PAGE_H - 4,
        width: PAGE_W,
        height: 4,
        color: COLORS.accent,
      });
    }
    pages.push(page);
    return page;
  }

  function drawSlideTitle(page, heading, subtitle) {
    page.drawText(safePdfText(heading), {
      x: MARGIN,
      y: PAGE_H - 52,
      size: 22,
      font: fonts.bold,
      color: COLORS.slate,
    });
    if (subtitle) {
      page.drawText(safePdfText(subtitle), {
        x: MARGIN,
        y: PAGE_H - 72,
        size: 10,
        font: fonts.regular,
        color: COLORS.muted,
      });
    }
  }

  function drawKpiCards(page, cards, { y = PAGE_H - 120, cols = 4 } = {}) {
    const gap = 12;
    const cardW = (PAGE_W - MARGIN * 2 - gap * (cols - 1)) / cols;
    const cardH = 78;
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
      page.drawText(safePdfText(card.label || ""), {
        x: x + 14,
        y: y - 24,
        size: 9,
        font: fonts.semibold,
        color: COLORS.muted,
      });
      page.drawText(safePdfText(card.value || "—"), {
        x: x + 14,
        y: y - 48,
        size: 20,
        font: fonts.bold,
        color: COLORS.slate,
      });
      if (card.delta) {
        const up = String(card.delta).startsWith("+");
        page.drawText(safePdfText(card.delta), {
          x: x + 14,
          y: y - 66,
          size: 9,
          font: fonts.semibold,
          color: up ? COLORS.accentDeep : COLORS.muted,
        });
      }
    });
    return y - cardH - 20;
  }

  function drawTable(page, columns, rows, { yStart = PAGE_H - 100, maxRows = 12 } = {}) {
    const tableW = PAGE_W - MARGIN * 2;
    const colWs = columns.map((c) => (c.width || 1 / columns.length) * tableW);
    let y = yStart;
    const rowH = 22;
    // header
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
        x: x + 10,
        y: y - 15,
        size: 8,
        font: fonts.semibold,
        color: COLORS.white,
      });
      x += colWs[i];
    });
    y -= rowH;
    const slice = rows.slice(0, maxRows);
    slice.forEach((row, ri) => {
      if (ri % 2 === 0) {
        page.drawRectangle({
          x: MARGIN,
          y: y - rowH,
          width: tableW,
          height: rowH,
          color: COLORS.paper,
        });
      }
      let cx = MARGIN;
      columns.forEach((col, i) => {
        const val = safePdfText(row[col.key] ?? "", 80);
        page.drawText(val, {
          x: cx + 10,
          y: y - 15,
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
    page.drawRectangle({
      x: 0,
      y: 0,
      width: 8,
      height: PAGE_H,
      color: COLORS.accent,
    });
    if (logo) {
      const logoH = 42;
      const logoW = (logo.width / logo.height) * logoH;
      page.drawImage(logo, { x: MARGIN + 12, y: PAGE_H - 70, width: logoW, height: logoH });
    }
    page.drawText(safePdfText(BRAND.name), {
      x: MARGIN + 12,
      y: PAGE_H - 100,
      size: 11,
      font: fonts.semibold,
      color: COLORS.cloud,
    });
    page.drawText(safePdfText(eyebrow || "Performance Report"), {
      x: MARGIN + 12,
      y: PAGE_H / 2 + 40,
      size: 12,
      font: fonts.semibold,
      color: COLORS.accent,
    });
    const titleLines = wrapText(deckTitle || meta.title, fonts.bold, 36, PAGE_W - MARGIN * 2 - 24);
    let ty = PAGE_H / 2 + 10;
    for (const line of titleLines.slice(0, 3)) {
      page.drawText(line, {
        x: MARGIN + 12,
        y: ty,
        size: 34,
        font: fonts.bold,
        color: COLORS.white,
      });
      ty -= 40;
    }
    page.drawText(safePdfText(meta.propertyLabel), {
      x: MARGIN + 12,
      y: 120,
      size: 14,
      font: fonts.regular,
      color: COLORS.cloud,
    });
    page.drawText(safePdfText(meta.reportDate), {
      x: MARGIN + 12,
      y: 98,
      size: 11,
      font: fonts.regular,
      color: COLORS.muted,
    });
    if (meta.preparedFor) {
      page.drawText(safePdfText(`Prepared for ${meta.preparedFor}`), {
        x: MARGIN + 12,
        y: 76,
        size: 11,
        font: fonts.regular,
        color: COLORS.cloud,
      });
    }
    return page;
  }

  function addClosing() {
    const page = addSlide({ background: "cover" });
    page.drawRectangle({ x: 0, y: 0, width: 8, height: PAGE_H, color: COLORS.accent });
    page.drawText("Thank you", {
      x: MARGIN + 12,
      y: PAGE_H / 2 + 20,
      size: 36,
      font: fonts.bold,
      color: COLORS.white,
    });
    page.drawText("Questions? Let's grow together.", {
      x: MARGIN + 12,
      y: PAGE_H / 2 - 10,
      size: 14,
      font: fonts.regular,
      color: COLORS.cloud,
    });
    page.drawText(safePdfText(BRAND.url), {
      x: MARGIN + 12,
      y: 80,
      size: 12,
      font: fonts.semibold,
      color: COLORS.accent,
    });
    page.drawText("info@crosswayconsulting.com  ·  817.875.7777", {
      x: MARGIN + 12,
      y: 58,
      size: 10,
      font: fonts.regular,
      color: COLORS.muted,
    });
    return page;
  }

  async function finalize() {
    const total = pages.length;
    pages.forEach((page, i) => {
      if (i === 0 || i === total - 1) return; // cover/closing already styled
      drawFooter(page, i + 1, total);
    });
    return pdf.save();
  }

  return {
    pdf,
    fonts,
    logo,
    meta,
    pages,
    addSlide,
    addCover,
    addClosing,
    drawSlideTitle,
    drawKpiCards,
    drawTable,
    wrapText,
    finalize,
    COLORS,
    PAGE_W,
    PAGE_H,
    MARGIN,
  };
}
