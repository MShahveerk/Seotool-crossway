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
export const MARGIN = 36;
export const FOOTER_H = 32;
export const HEADER_H = 52;

export const COLORS = {
  ivory: rgb(0.98, 0.973, 0.953), // #faf8f3
  paper: rgb(1, 1, 1),
  paperWarm: rgb(0.945, 0.937, 0.914), // #f1efe9
  slate: rgb(0.043, 0.043, 0.039), // #0b0b0a
  slateSoft: rgb(0.18, 0.17, 0.16), // body secondary — high contrast
  muted: rgb(0.28, 0.27, 0.25), // #474540 — captions / helper text
  cloud: rgb(0.36, 0.34, 0.32), // #5c574f — small labels (was too light grey)
  stone: rgb(0.78, 0.76, 0.73),
  border: rgb(0.78, 0.76, 0.73),
  accent: rgb(0.055, 1, 0.165), // #0eff2a
  accentDeep: rgb(0.114, 0.612, 0.208), // #1d9c35
  heatIdle: rgb(0.843, 0.878, 0.902),
  white: rgb(1, 1, 1),
  coverBg: rgb(0.043, 0.043, 0.039),
  cardShadow: rgb(0.93, 0.92, 0.9),
  panelDark: rgb(0.078, 0.078, 0.071),
  good: rgb(0.114, 0.612, 0.208),
  warn: rgb(0.72, 0.52, 0.08),
  bad: rgb(0.72, 0.18, 0.14),
};

export function scoreTone(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return COLORS.cloud;
  if (n >= 90) return COLORS.good;
  if (n >= 50) return COLORS.warn;
  return COLORS.bad;
}

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
  // Never surface Meta page IDs or placeholder social labels on decks
  if (/^\d+$/.test(raw) || /facebook\s*page/i.test(raw) || /meta\s*page/i.test(raw)) {
    return "Your account";
  }
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || "Your account";
  }
}

export function formatReportDate(d = new Date()) {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/** Format YYYY-MM (or Date) as a clear cover month, e.g. "August 2026". */
export function formatReportMonthLabel(reportMonth) {
  if (reportMonth instanceof Date && !Number.isNaN(reportMonth.getTime())) {
    return reportMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  const m = /^(\d{4})-(\d{2})$/.exec(String(reportMonth || "").trim());
  if (m) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  }
  return formatReportDate();
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

function drawCenteredLogo(page, logo, { cy, height = 72, plate = false } = {}) {
  if (!logo) return 0;
  const width = (logo.width / Math.max(logo.height, 1)) * height;
  const x = (PAGE_W - width) / 2;
  const y = cy - height / 2;
  if (plate) {
    const padX = 28;
    const padY = 18;
    page.drawRectangle({
      x: x - padX,
      y: y - padY,
      width: width + padX * 2,
      height: height + padY * 2,
      color: rgb(0.1, 0.1, 0.095),
      borderColor: rgb(0.22, 0.22, 0.2),
      borderWidth: 1,
    });
  }
  page.drawImage(logo, { x, y, width, height });
  return width;
}

/**
 * Create a landscape slide deck document helper.
 */
export async function createSlideDeck({
  title,
  propertyLabel,
  reportDate,
  reportMonthLabel,
  preparedFor,
  internal = false,
} = {}) {
  const pdf = await PDFDocument.create();
  const fonts = await embedNunitoFonts(pdf);
  const { logo, logoWhite } = await loadBrandLogos(pdf);
  const meta = {
    title: safePdfText(title || "Website Analytics"),
    propertyLabel: safePdfText(propertyLabel || ""),
    reportDate: safePdfText(reportDate || formatReportDate()),
    reportMonthLabel: safePdfText(reportMonthLabel || ""),
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
    if (logo) {
      const h = 18;
      const w = (logo.width / Math.max(logo.height, 1)) * h;
      drawLogo(page, logo, { x: PAGE_W - MARGIN - w, y: PAGE_H - 34, height: h });
    }

    page.drawText(safePdfText(heading), {
      x: MARGIN,
      y: PAGE_H - 34,
      size: 18,
      font: fonts.bold,
      color: COLORS.slate,
    });
    if (subtitle) {
      page.drawText(safePdfText(subtitle), {
        x: MARGIN,
        y: PAGE_H - 50,
        size: 9,
        font: fonts.regular,
        color: COLORS.muted,
      });
    }
  }

  function drawEyebrow(page, text, { x = MARGIN, y = PAGE_H - 68 } = {}) {
    page.drawText(safePdfText(String(text || "").toUpperCase()), {
      x,
      y,
      size: 8,
      font: fonts.bold,
      color: COLORS.accentDeep,
    });
  }

  function drawPanel(page, { x, y, width, height, title } = {}) {
    page.drawRectangle({
      x,
      y: y - height,
      width,
      height,
      color: COLORS.paper,
      borderColor: COLORS.border,
      borderWidth: 0.8,
    });
    if (title) {
      page.drawText(safePdfText(title).toUpperCase(), {
        x: x + 10,
        y: y - 16,
        size: 8,
        font: fonts.bold,
        color: COLORS.cloud,
      });
    }
  }

  function drawProgressBar(page, { x, y, width, value, max = 100, color } = {}) {
    const v = Math.max(0, Math.min(1, (Number(value) || 0) / (max || 100)));
    page.drawRectangle({ x, y, width, height: 5, color: COLORS.paperWarm });
    page.drawRectangle({
      x,
      y,
      width: Math.max(2, width * v),
      height: 5,
      color: color || scoreTone(value),
    });
  }

  /** Semrush-style score dial (arc + big number). */
  function drawScoreDial(page, { cx, cy, r = 36, score, label, sub } = {}) {
    const n = Number(score);
    const has = Number.isFinite(n);
    const pctVal = has ? Math.max(0, Math.min(100, n)) / 100 : 0;
    const tone = has ? scoreTone(n) : COLORS.cloud;
    const steps = 48;
    const start = Math.PI * 0.75;
    const end = Math.PI * 2.25;
    for (let i = 0; i < steps; i += 1) {
      const t0 = start + ((end - start) * i) / steps;
      const t1 = start + ((end - start) * (i + 1)) / steps;
      const x0 = cx + Math.cos(t0) * r;
      const y0 = cy + Math.sin(t0) * r;
      const x1 = cx + Math.cos(t1) * r;
      const y1 = cy + Math.sin(t1) * r;
      page.drawLine({
        start: { x: x0, y: y0 },
        end: { x: x1, y: y1 },
        thickness: 7,
        color: COLORS.border,
      });
    }
    const fillSteps = Math.round(steps * pctVal);
    for (let i = 0; i < fillSteps; i += 1) {
      const t0 = start + ((end - start) * i) / steps;
      const t1 = start + ((end - start) * (i + 1)) / steps;
      page.drawLine({
        start: { x: cx + Math.cos(t0) * r, y: cy + Math.sin(t0) * r },
        end: { x: cx + Math.cos(t1) * r, y: cy + Math.sin(t1) * r },
        thickness: 7,
        color: tone,
      });
    }
    const valueText = has ? String(Math.round(n)) : "—";
    page.drawText(valueText, {
      x: cx - fonts.bold.widthOfTextAtSize(valueText, 18) / 2,
      y: cy - 4,
      size: 18,
      font: fonts.bold,
      color: COLORS.slate,
    });
    if (label) {
      page.drawText(safePdfText(label).toUpperCase(), {
        x: cx - fonts.bold.widthOfTextAtSize(safePdfText(label).toUpperCase(), 7) / 2,
        y: cy - r - 14,
        size: 7,
        font: fonts.bold,
        color: COLORS.cloud,
      });
    }
    if (sub) {
      page.drawText(safePdfText(sub), {
        x: cx - fonts.regular.widthOfTextAtSize(safePdfText(sub), 7) / 2,
        y: cy - r - 26,
        size: 7,
        font: fonts.regular,
        color: COLORS.muted,
      });
    }
  }

  function drawKpiCards(page, cards, { y = PAGE_H - 100, cols = 4, compact = false } = {}) {
    const gap = compact ? 8 : 10;
    const cardW = (PAGE_W - MARGIN * 2 - gap * (cols - 1)) / cols;
    const cardH = compact ? 58 : 72;
    cards.slice(0, cols).forEach((card, i) => {
      const x = MARGIN + i * (cardW + gap);
      page.drawRectangle({
        x,
        y: y - cardH,
        width: cardW,
        height: cardH,
        color: COLORS.paper,
        borderColor: COLORS.border,
        borderWidth: 0.8,
      });
      page.drawRectangle({
        x,
        y: y - 2.5,
        width: cardW,
        height: 2.5,
        color: card.tone || COLORS.accentDeep,
      });
      page.drawText(safePdfText(card.label || "").toUpperCase(), {
        x: x + 10,
        y: y - 16,
        size: 7,
        font: fonts.bold,
        color: COLORS.cloud,
      });
      const valueText = safePdfText(card.value || "—");
      const valueSize = valueText.length > 12 ? 11 : valueText.length > 7 ? 15 : compact ? 18 : 22;
      page.drawText(valueText, {
        x: x + 10,
        y: y - (compact ? 38 : 42),
        size: valueSize,
        font: fonts.bold,
        color: COLORS.slate,
      });
      if (card.delta) {
        page.drawText(safePdfText(card.delta), {
          x: x + 10,
          y: y - cardH + 8,
          size: 7,
          font: fonts.semibold,
          color: COLORS.muted,
        });
      }
    });
    return y - cardH - 12;
  }

  function drawSparkline(page, series, { x, y, width, height } = {}) {
    drawLineChart(page, series, { x, y, width, height, valueKey: "clicks" });
  }

  /** Line chart with Y ticks + X date labels. */
  function drawLineChart(page, series, {
    x,
    y,
    width,
    height,
    valueKey = "clicks",
    yLabel = "Clicks",
  } = {}) {
    const points = (series || [])
      .map((p) => ({
        value: Number(p[valueKey] ?? p.clicks ?? p.value ?? 0),
        date: p.date || p.keys?.[0] || "",
      }))
      .filter((p) => Number.isFinite(p.value));
    if (points.length < 2) return;

    const padL = 36;
    const padR = 8;
    const padT = 10;
    const padB = 22;
    const plotX = x + padL;
    const plotY = y + padB;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    page.drawRectangle({
      x,
      y,
      width,
      height,
      color: COLORS.paper,
      borderColor: COLORS.border,
      borderWidth: 0.8,
    });

    const max = Math.max(...points.map((p) => p.value), 1);
    const min = 0;
    const span = Math.max(max - min, 1);

    // Axes
    page.drawLine({
      start: { x: plotX, y: plotY },
      end: { x: plotX, y: plotY + plotH },
      thickness: 0.8,
      color: COLORS.stone,
    });
    page.drawLine({
      start: { x: plotX, y: plotY },
      end: { x: plotX + plotW, y: plotY },
      thickness: 0.8,
      color: COLORS.stone,
    });

    // Y ticks
    const ticks = 4;
    for (let i = 0; i <= ticks; i += 1) {
      const t = i / ticks;
      const val = Math.round(min + span * t);
      const ty = plotY + plotH * t;
      page.drawLine({
        start: { x: plotX - 3, y: ty },
        end: { x: plotX, y: ty },
        thickness: 0.6,
        color: COLORS.stone,
      });
      if (i > 0 && i < ticks) {
        page.drawLine({
          start: { x: plotX, y: ty },
          end: { x: plotX + plotW, y: ty },
          thickness: 0.4,
          color: COLORS.paperWarm,
        });
      }
      const label = String(val);
      page.drawText(label, {
        x: plotX - 6 - fonts.regular.widthOfTextAtSize(label, 7),
        y: ty - 2,
        size: 7,
        font: fonts.regular,
        color: COLORS.muted,
      });
    }

    page.drawText(safePdfText(yLabel), {
      x: x + 4,
      y: y + height - 12,
      size: 7,
      font: fonts.bold,
      color: COLORS.cloud,
    });

    const step = plotW / (points.length - 1);
    for (let i = 1; i < points.length; i += 1) {
      const x1 = plotX + (i - 1) * step;
      const x2 = plotX + i * step;
      const y1 = plotY + ((points[i - 1].value - min) / span) * plotH;
      const y2 = plotY + ((points[i].value - min) / span) * plotH;
      page.drawLine({
        start: { x: x1, y: y1 },
        end: { x: x2, y: y2 },
        thickness: 2,
        color: COLORS.accentDeep,
      });
    }

    // X labels: first / mid / last
    const xIdx = [0, Math.floor((points.length - 1) / 2), points.length - 1];
    xIdx.forEach((idx) => {
      const raw = String(points[idx].date || "");
      const label = raw.length >= 10 ? raw.slice(5) : raw.slice(0, 8); // MM-DD
      if (!label) return;
      const tx = plotX + idx * step;
      page.drawText(label, {
        x: tx - fonts.regular.widthOfTextAtSize(label, 7) / 2,
        y: y + 6,
        size: 7,
        font: fonts.regular,
        color: COLORS.muted,
      });
    });
  }

  /** Horizontal bar chart for ranked items. */
  function drawBarList(page, rows, { x, yTop, width, maxRows = 6 } = {}) {
    const slice = (rows || []).slice(0, maxRows);
    if (!slice.length) return yTop;
    const max = Math.max(...slice.map((r) => Number(r.value) || 0), 1);
    let y = yTop;
    slice.forEach((row) => {
      const label = safePdfText(row.label || "", 32);
      const val = Number(row.value) || 0;
      page.drawText(label, {
        x,
        y,
        size: 8,
        font: fonts.regular,
        color: COLORS.slateSoft,
      });
      const valText = safePdfText(row.display ?? String(val));
      page.drawText(valText, {
        x: x + width - fonts.semibold.widthOfTextAtSize(valText, 8),
        y,
        size: 8,
        font: fonts.semibold,
        color: COLORS.slate,
      });
      y -= 12;
      const barW = Math.max(3, (val / max) * width);
      page.drawRectangle({ x, y: y + 2, width, height: 5, color: COLORS.paperWarm });
      page.drawRectangle({ x, y: y + 2, width: barW, height: 5, color: COLORS.accentDeep });
      y -= 14;
    });
    return y;
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

  function addCover({ deckTitle, eyebrow, monthLabel } = {}) {
    const page = addSlide({ background: "cover" });
    const centerX = (text, size, font) =>
      (PAGE_W - font.widthOfTextAtSize(text, size)) / 2;

    // Logo only — no repeated brand wordmarks
    const mark = logoWhite || logo;
    if (mark) {
      drawCenteredLogo(page, mark, { cy: PAGE_H - 130, height: 96, plate: false });
    }

    const eye = safePdfText(eyebrow || "Monthly Report").toUpperCase();
    page.drawText(eye, {
      x: centerX(eye, 11, fonts.bold),
      y: PAGE_H / 2 + 48,
      size: 11,
      font: fonts.bold,
      color: COLORS.accent,
    });

    const title = safePdfText(deckTitle || meta.title);
    const titleLines = wrapText(title, fonts.bold, 40, PAGE_W - 260);
    let ty = PAGE_H / 2 + 12;
    for (const line of titleLines.slice(0, 2)) {
      page.drawText(line, {
        x: centerX(line, 38, fonts.bold),
        y: ty,
        size: 38,
        font: fonts.bold,
        color: COLORS.white,
      });
      ty -= 44;
    }

    const month = safePdfText(monthLabel || meta.reportMonthLabel || "").toUpperCase();
    if (month) {
      const chipPadX = 20;
      const chipW = fonts.bold.widthOfTextAtSize(month, 14) + chipPadX * 2;
      const chipH = 30;
      const chipX = (PAGE_W - chipW) / 2;
      const chipY = ty - 6;
      page.drawRectangle({
        x: chipX,
        y: chipY - 6,
        width: chipW,
        height: chipH,
        color: rgb(0.12, 0.12, 0.11),
        borderColor: COLORS.accent,
        borderWidth: 1.4,
      });
      page.drawText(month, {
        x: chipX + chipPadX,
        y: chipY + 4,
        size: 14,
        font: fonts.bold,
        color: COLORS.accent,
      });
    }

    page.drawRectangle({
      x: PAGE_W / 2 - 28,
      y: 100,
      width: 56,
      height: 3,
      color: COLORS.accent,
    });

    if (meta.propertyLabel) {
      const prop = safePdfText(meta.propertyLabel);
      page.drawText(prop, {
        x: centerX(prop, 16, fonts.semibold),
        y: 72,
        size: 16,
        font: fonts.semibold,
        color: COLORS.white,
      });
    }
    if (meta.preparedFor) {
      const prep = safePdfText(`Prepared for ${meta.preparedFor}`);
      page.drawText(prep, {
        x: centerX(prep, 11, fonts.regular),
        y: 48,
        size: 11,
        font: fonts.regular,
        color: COLORS.cloud,
      });
    }
    return page;
  }

  /**
   * Partnership close — scoreboard + momentum/next focus + client-retention CTA.
   * @param {object} [summary]
   */
  function addClosing(summary = null) {
    const centerX = (text, size, font) =>
      (PAGE_W - font.widthOfTextAtSize(text, size)) / 2;

    if (!summary) {
      const page = addSlide({ background: "cover" });
      const mark = logoWhite || logo;
      if (mark) {
        drawCenteredLogo(page, mark, { cy: PAGE_H - 120, height: 64, plate: true });
      }
      const headline = "Onward.";
      page.drawText(headline, {
        x: centerX(headline, 40, fonts.bold),
        y: PAGE_H / 2 + 10,
        size: 40,
        font: fonts.bold,
        color: COLORS.white,
      });
      const sub = "Clear the blockers. Scale what converts. Measure the lift.";
      page.drawText(sub, {
        x: centerX(sub, 13, fonts.regular),
        y: PAGE_H / 2 - 28,
        size: 13,
        font: fonts.regular,
        color: COLORS.cloud,
      });
      page.drawRectangle({
        x: PAGE_W / 2 - 28,
        y: 120,
        width: 56,
        height: 3,
        color: COLORS.accent,
      });
      const contact = "info@crosswayconsulting.com  ·  817.875.7777";
      page.drawText(contact, {
        x: centerX(contact, 11, fonts.regular),
        y: 88,
        size: 11,
        font: fonts.regular,
        color: COLORS.muted,
      });
      const url = safePdfText(BRAND.url);
      page.drawText(url, {
        x: centerX(url, 13, fonts.bold),
        y: 64,
        size: 13,
        font: fonts.bold,
        color: COLORS.accent,
      });
      return page;
    }

    const page = addSlide({ background: "content" });
    drawSlideTitle(page, "Partnership snapshot", summary.subtitle || meta.propertyLabel);

    const kpis = summary.kpis || [];
    if (kpis.length) {
      drawKpiCards(page, kpis.slice(0, 6), {
        y: PAGE_H - 72,
        cols: Math.min(6, kpis.length),
        compact: true,
      });
    }

    const colW = (PAGE_W - MARGIN * 2 - 16) / 2;
    const panelTop = PAGE_H - 150;
    const panelH = 200;

    drawPanel(page, {
      x: MARGIN,
      y: panelTop,
      width: colW,
      height: panelH,
      title: "Momentum to protect",
    });
    drawPanel(page, {
      x: MARGIN + colW + 16,
      y: panelTop,
      width: colW,
      height: panelH,
      title: "Where we lean in next",
    });

    let yL = panelTop - 28;
    for (const line of (summary.strengths || []).slice(0, 5)) {
      const wrapped = wrapText(`-  ${safePdfText(line, 90)}`, fonts.regular, 9, colW - 24);
      for (const w of wrapped.slice(0, 2)) {
        page.drawText(w, {
          x: MARGIN + 12,
          y: yL,
          size: 9,
          font: fonts.regular,
          color: COLORS.slateSoft,
        });
        yL -= 13;
      }
      yL -= 4;
    }

    let yR = panelTop - 28;
    for (const line of (summary.risks || []).slice(0, 5)) {
      const wrapped = wrapText(`-  ${safePdfText(line, 90)}`, fonts.regular, 9, colW - 24);
      for (const w of wrapped.slice(0, 2)) {
        page.drawText(w, {
          x: MARGIN + colW + 28,
          y: yR,
          size: 9,
          font: fonts.regular,
          color: COLORS.slateSoft,
        });
        yR -= 13;
      }
      yR -= 4;
    }

    page.drawRectangle({
      x: 0,
      y: 0,
      width: PAGE_W,
      height: 88,
      color: COLORS.coverBg,
    });
    page.drawRectangle({ x: 0, y: 85, width: PAGE_W, height: 3, color: COLORS.accent });
    page.drawText("NEXT SPRINT", {
      x: MARGIN,
      y: 62,
      size: 8,
      font: fonts.bold,
      color: COLORS.accent,
    });
    page.drawText(
      safePdfText(
        "Turn this month's signal into measurable gains — clear the blockers, then double down on what already converts.",
        120
      ),
      {
        x: MARGIN,
        y: 42,
        size: 10,
        font: fonts.semibold,
        color: COLORS.white,
      }
    );
    const actions = (summary.actions || []).slice(0, 3).join("  |  ");
    page.drawText(
      safePdfText(actions || "Prioritize the top fixes in our next working session.", 130),
      {
        x: MARGIN,
        y: 22,
        size: 8,
        font: fonts.regular,
        color: COLORS.cloud,
      }
    );
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
    drawLineChart,
    drawBarList,
    drawTable,
    drawPanel,
    drawProgressBar,
    drawScoreDial,
    wrapText,
    finalize,
    COLORS,
    PAGE_W,
    PAGE_H,
    MARGIN,
  };
}
