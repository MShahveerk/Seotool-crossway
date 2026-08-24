/**
 * Carbon Neon PDF theme — the app's dark UI, recreated as a document.
 *
 * The existing `reportPdfTheme` is the light, off-white house style used by the
 * monthly client reports. The SEO tools look nothing like that on screen, and
 * their exports should read as the same product you were just looking at:
 * near-black canvas, graphite cards with hairline borders, one neon green
 * accent, stat tiles, and tables with a raised header and hairline rows.
 *
 * Same engine as the light theme (pdf-lib), so everything stays a real
 * document: selectable text, embedded fonts, page numbers, automatic page
 * breaks, and table headers that repeat when a table spans pages.
 *
 * Palette is the app's, converted straight from the CSS tokens:
 *   canvas #070D18 · surface #0E1624 · raised #151E30 · hairline #2A3650
 *   ink #F4F6F7 · dim #CCD2D9 · muted #9BA3AD · faint #79818B · neon #00A3FF
 */

import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument, rgb } from "pdf-lib";
import { embedInterFonts } from "./reports/interFonts.js";

export const PAGE_W = 595.28;
export const PAGE_H = 841.89;
export const MARGIN = 46;

const HEADER_H = 92;
const CONT_HEADER_H = 40;
const FOOTER_H = 34;
const CONTENT_TOP = PAGE_H - HEADER_H - 26;
const CONTENT_TOP_CONT = PAGE_H - CONT_HEADER_H - 24;
const CONTENT_BOTTOM = FOOTER_H + 18;

const LINE = 15;
const PARA = 10;
const SECTION_GAP = 24;
const ROW_H = 19;
const HEAD_H = 22;

/** Straight from the Carbon Neon CSS tokens. */
const hex = (h) => {
  const v = h.replace("#", "");
  return rgb(
    parseInt(v.slice(0, 2), 16) / 255,
    parseInt(v.slice(2, 4), 16) / 255,
    parseInt(v.slice(4, 6), 16) / 255
  );
};

export const CARBON = {
  canvas: hex("#070D18"),
  surface: hex("#0E1624"),
  raised: hex("#151E30"),
  overlay: hex("#1C2740"),
  hairline: hex("#2A3650"),
  hairlineStrong: hex("#3D4D6A"),
  ink: hex("#F4F6F7"),
  dim: hex("#CCD2D9"),
  muted: hex("#9BA3AD"),
  faint: hex("#79818B"),
  neon: hex("#00A3FF"),
  neonDeep: hex("#0077CC"),
  neonInk: hex("#031018"),
  info: hex("#00F0FF"),
  caution: hex("#FFB020"),
  danger: hex("#FF5C5C"),
  white: rgb(1, 1, 1),
};

/** pdf-lib's standard encoders reject most non-ASCII; normalise before drawing. */
export function safeText(s, maxLen = 400) {
  const t = String(s ?? "")
    .replace(/−/g, "-")
    .replace(/[–—]/g, "-")
    .replace(/·/g, "-")
    .replace(/→/g, "->")
    .replace(/…/g, "...")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[★☆]/g, "*");
  let out = "";
  for (let i = 0; i < t.length && out.length < maxLen; i += 1) {
    const c = t.charCodeAt(i);
    if (c >= 32 && c <= 126) out += t[i];
  }
  return out;
}

export function nf(n) {
  return new Intl.NumberFormat("en-US").format(Math.round(Number(n) || 0));
}

export function hostLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || raw;
  }
}

export function reportDate(d = new Date()) {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/** Width-aware wrap — measures the real font rather than guessing by character count. */
function wrapToWidth(text, font, size, maxW) {
  const words = safeText(text, 4000).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/** Trim to fit a column, adding an ellipsis when it doesn't. */
export function fitText(text, font, size, maxW) {
  let s = safeText(text, 300);
  if (font.widthOfTextAtSize(s, size) <= maxW) return s;
  while (s.length > 1 && font.widthOfTextAtSize(`${s}...`, size) > maxW) {
    s = s.slice(0, -1);
  }
  return `${s}...`;
}

async function loadLogo(pdf) {
  // The white mark, because this theme is dark.
  for (const name of ["brand/roboseo-mark.png", "brand/roboseo-lockup.png", "crossway-logo-white.png", "crossway-logo.png"]) {
    try {
      const bytes = await readFile(path.join(process.cwd(), "public", name));
      return await pdf.embedPng(bytes);
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

/**
 * @param {object} opts
 * @param {string} opts.eyebrow      small neon label above the title
 * @param {string} opts.reportTitle
 * @param {string} opts.subject      domain / keyword this report is about
 * @param {string} [opts.meta]       one line of context under the subject
 * @param {string} [opts.introNote]  executive summary paragraph
 */
export async function createCarbonReport({ eyebrow, reportTitle, subject, meta, introNote }) {
  const pdf = await PDFDocument.create();
  const fonts = await embedInterFonts(pdf);
  const { regular: body, bold: display, semibold } = fonts;
  const logo = await loadLogo(pdf);
  const dateStr = reportDate();
  const contentW = PAGE_W - MARGIN * 2;

  let page = null;
  let pageNum = 0;
  let y = CONTENT_TOP;
  let activeTable = null;

  const paintCanvas = (p) => {
    p.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: CARBON.canvas });
  };

  const drawCoverHeader = (p) => {
    // A neon rule across the very top — the app's active-state marker, as a
    // masthead. Cheap, unmistakable, and it costs no vertical space.
    p.drawRectangle({ x: 0, y: PAGE_H - 3, width: PAGE_W, height: 3, color: CARBON.neon });

    if (logo) {
      const size = 30;
      p.drawImage(logo, { x: MARGIN, y: PAGE_H - 24 - size, width: size, height: size });
    }

    const textX = MARGIN + (logo ? 40 : 0);
    p.drawText(safeText((eyebrow || "RoboSEO.Ai").toUpperCase(), 48), {
      x: textX,
      y: PAGE_H - 34,
      size: 7.5,
      font: display,
      color: CARBON.neon,
    });
    p.drawText(safeText(reportTitle, 46), {
      x: textX,
      y: PAGE_H - 52,
      size: 17,
      font: display,
      color: CARBON.ink,
    });
    if (subject) {
      p.drawText(fitText(subject, body, 9.5, contentW - 150), {
        x: textX,
        y: PAGE_H - 67,
        size: 9.5,
        font: body,
        color: CARBON.muted,
      });
    }

    const dw = body.widthOfTextAtSize(dateStr, 8);
    p.drawText(dateStr, {
      x: PAGE_W - MARGIN - dw,
      y: PAGE_H - 34,
      size: 8,
      font: body,
      color: CARBON.faint,
    });

    p.drawLine({
      start: { x: MARGIN, y: PAGE_H - HEADER_H + 8 },
      end: { x: PAGE_W - MARGIN, y: PAGE_H - HEADER_H + 8 },
      thickness: 0.6,
      color: CARBON.hairline,
    });
  };

  const drawContHeader = (p) => {
    p.drawRectangle({ x: 0, y: PAGE_H - 2, width: PAGE_W, height: 2, color: CARBON.neon });
    if (logo) {
      p.drawImage(logo, { x: MARGIN, y: PAGE_H - 28, width: 16, height: 16 });
    }
    p.drawText(safeText(reportTitle, 50), {
      x: MARGIN + (logo ? 22 : 0),
      y: PAGE_H - 24,
      size: 8,
      font: semibold,
      color: CARBON.muted,
    });
    if (subject) {
      const s = fitText(subject, body, 8, 220);
      const w = body.widthOfTextAtSize(s, 8);
      p.drawText(s, { x: PAGE_W - MARGIN - w, y: PAGE_H - 24, size: 8, font: body, color: CARBON.faint });
    }
    p.drawLine({
      start: { x: MARGIN, y: PAGE_H - CONT_HEADER_H + 6 },
      end: { x: PAGE_W - MARGIN, y: PAGE_H - CONT_HEADER_H + 6 },
      thickness: 0.6,
      color: CARBON.hairline,
    });
  };

  const drawFooter = (p, n) => {
    p.drawLine({
      start: { x: MARGIN, y: FOOTER_H + 6 },
      end: { x: PAGE_W - MARGIN, y: FOOTER_H + 6 },
      thickness: 0.6,
      color: CARBON.hairline,
    });
    p.drawText(safeText("RoboSEO.Ai", 30), {
      x: MARGIN,
      y: FOOTER_H - 6,
      size: 7,
      font: body,
      color: CARBON.faint,
    });
    const label = String(n);
    const w = body.widthOfTextAtSize(label, 7.5);
    p.drawText(label, {
      x: PAGE_W - MARGIN - w,
      y: FOOTER_H - 6,
      size: 7.5,
      font: semibold,
      color: CARBON.muted,
    });
  };

  const startPage = () => {
    pageNum += 1;
    page = pdf.addPage([PAGE_W, PAGE_H]);
    paintCanvas(page);
    if (pageNum === 1) {
      drawCoverHeader(page);
      y = CONTENT_TOP;
    } else {
      drawContHeader(page);
      y = CONTENT_TOP_CONT;
    }
    drawFooter(page, pageNum);
    return page;
  };

  startPage();

  const ensureSpace = (height = LINE + PARA, opts = {}) => {
    if (y - height < CONTENT_BOTTOM) {
      startPage();
      if (opts.repeatTableHeader && activeTable) {
        paintTableHead(activeTable.headers, activeTable.xs, activeTable.aligns, activeTable.widths);
      }
    }
  };

  const text = (str, { size = 9.5, font = body, color = CARBON.dim, x = MARGIN, gap = PARA } = {}) => {
    ensureSpace(size + gap + 4);
    page.drawText(safeText(str, 300), { x, y, size, font, color });
    y -= size + gap;
  };

  /** Body copy that wraps to the content width. */
  const paragraph = (str, { size = 9.5, color = CARBON.dim, font = body } = {}) => {
    for (const line of wrapToWidth(str, font, size, contentW)) {
      ensureSpace(size + 6);
      page.drawText(line, { x: MARGIN, y, size, font, color });
      y -= size + 5;
    }
    y -= 6;
  };

  /** Section rule + title, mirroring the app's section headers. */
  const section = (title, subtitle) => {
    ensureSpace(90);
    y -= SECTION_GAP * 0.5;
    page.drawLine({
      start: { x: MARGIN, y: y + 10 },
      end: { x: PAGE_W - MARGIN, y: y + 10 },
      thickness: 0.6,
      color: CARBON.hairline,
    });
    y -= 14;
    // Neon tick to the left of every section title — the app's active marker.
    page.drawRectangle({ x: MARGIN, y: y - 1, width: 2.5, height: 12, color: CARBON.neon });
    page.drawText(safeText(title, 60), {
      x: MARGIN + 10,
      y,
      size: 13,
      font: display,
      color: CARBON.ink,
    });
    y -= 17;
    if (subtitle) {
      for (const line of wrapToWidth(subtitle, body, 9, contentW)) {
        ensureSpace(14);
        page.drawText(line, { x: MARGIN + 10, y, size: 9, font: body, color: CARBON.muted });
        y -= 13;
      }
    }
    y -= 8;
  };

  /** The app's StatTile, as a row of up to four. */
  const statTiles = (tiles = []) => {
    if (!tiles.length) return;
    const cols = Math.min(tiles.length, 4);
    const gap = 10;
    const w = (contentW - gap * (cols - 1)) / cols;
    const h = 62;
    ensureSpace(h + SECTION_GAP);

    tiles.slice(0, 4).forEach((t, i) => {
      const x = MARGIN + i * (w + gap);
      page.drawRectangle({
        x,
        y: y - h + 12,
        width: w,
        height: h,
        color: CARBON.surface,
        borderColor: CARBON.hairline,
        borderWidth: 0.8,
      });
      // Lit top edge, like `.cw-lit` in the UI.
      page.drawRectangle({
        x: x + 1,
        y: y + 11,
        width: w - 2,
        height: 0.8,
        color: t.accent ? CARBON.neon : CARBON.hairlineStrong,
      });
      page.drawText(fitText(String(t.label || "").toUpperCase(), semibold, 7, w - 20), {
        x: x + 10,
        y: y - 2,
        size: 7,
        font: semibold,
        color: CARBON.faint,
      });
      page.drawText(fitText(String(t.value ?? "-"), display, 17, w - 20), {
        x: x + 10,
        y: y - 24,
        size: 17,
        font: display,
        color: t.accent ? CARBON.neon : CARBON.ink,
      });
      if (t.hint) {
        page.drawText(fitText(t.hint, body, 7, w - 20), {
          x: x + 10,
          y: y - 38,
          size: 7,
          font: body,
          color: CARBON.muted,
        });
      }
    });
    y -= h + SECTION_GAP * 0.7;
  };

  /** A tinted callout — the app's neon-bordered notice. */
  const callout = (str, tone = "neon") => {
    const accent =
      tone === "danger" ? CARBON.danger : tone === "caution" ? CARBON.caution : CARBON.neon;
    const lines = wrapToWidth(str, body, 9, contentW - 34);
    const h = 18 + lines.length * 13;
    ensureSpace(h + 16);
    page.drawRectangle({
      x: MARGIN,
      y: y - h + 12,
      width: contentW,
      height: h,
      color: CARBON.surface,
      borderColor: CARBON.hairline,
      borderWidth: 0.8,
    });
    page.drawRectangle({ x: MARGIN, y: y - h + 12, width: 2.5, height: h, color: accent });
    let ly = y;
    for (const line of lines) {
      page.drawText(line, { x: MARGIN + 14, y: ly, size: 9, font: body, color: CARBON.dim });
      ly -= 13;
    }
    y -= h + 12;
  };

  const bullet = (str) => {
    const lines = wrapToWidth(str, body, 9.5, contentW - 16);
    ensureSpace(lines.length * 13 + 8);
    lines.forEach((line, i) => {
      if (i === 0) {
        page.drawCircle({ x: MARGIN + 3, y: y + 3, size: 1.8, color: CARBON.neon });
      }
      page.drawText(line, { x: MARGIN + 14, y, size: 9.5, font: body, color: CARBON.dim });
      y -= 13;
    });
    y -= 5;
  };

  /* ── Tables ───────────────────────────────────────────────────────────
     Column geometry is computed once from proportional widths, so headers and
     cells cannot disagree — which is exactly what went wrong in the HTML
     exports. Right-aligned columns align their header too. */
  const layout = (fractions) => {
    const xs = [];
    const widths = [];
    let acc = 0;
    for (const f of fractions) {
      xs.push(MARGIN + 8 + acc * contentW);
      widths.push(f * contentW - 16);
      acc += f;
    }
    return { xs, widths };
  };

  const paintTableHead = (headers, xs, aligns, widths) => {
    page.drawRectangle({
      x: MARGIN,
      y: y - 7,
      width: contentW,
      height: HEAD_H,
      color: CARBON.raised,
    });
    headers.forEach((h, i) => {
      const label = fitText(String(h).toUpperCase(), semibold, 7, widths[i]);
      const w = semibold.widthOfTextAtSize(label, 7);
      const right = aligns[i] === "r";
      const centre = aligns[i] === "c";
      const x = right
        ? xs[i] + widths[i] - w
        : centre
          ? xs[i] + (widths[i] - w) / 2
          : xs[i];
      page.drawText(label, { x, y: y + 1, size: 7, font: semibold, color: CARBON.faint });
    });
    y -= HEAD_H - 2;
  };

  /**
   * @param {string[]} headers
   * @param {number[]} fractions  column widths as fractions of the content width
   * @param {string[]} [aligns]   "l" | "c" | "r" per column
   */
  const tableHeader = (headers, fractions, aligns) => {
    const a = aligns || headers.map(() => "l");
    const { xs, widths } = layout(fractions);
    activeTable = { headers, xs, aligns: a, widths };
    ensureSpace(HEAD_H + ROW_H * 2);
    paintTableHead(headers, xs, a, widths);
  };

  const tableRow = (cells, { alt = false, accentFirst = false, tone = null } = {}) => {
    if (!activeTable) return;
    const { xs, aligns, widths } = activeTable;
    ensureSpace(ROW_H + 4, { repeatTableHeader: true });

    if (alt) {
      page.drawRectangle({
        x: MARGIN,
        y: y - 5,
        width: contentW,
        height: ROW_H,
        color: CARBON.surface,
      });
    }
    // Hairline under every row, like the app's DataTable.
    page.drawLine({
      start: { x: MARGIN, y: y - 6 },
      end: { x: PAGE_W - MARGIN, y: y - 6 },
      thickness: 0.4,
      color: CARBON.hairline,
    });

    cells.forEach((cell, i) => {
      const isFirst = i === 0;
      const font = isFirst && accentFirst ? semibold : body;
      const color = tone && isFirst ? tone : isFirst ? CARBON.ink : CARBON.dim;
      const label = fitText(String(cell ?? "-"), font, 8.5, widths[i]);
      const w = font.widthOfTextAtSize(label, 8.5);
      const right = aligns[i] === "r";
      const centre = aligns[i] === "c";
      const x = right
        ? xs[i] + widths[i] - w
        : centre
          ? xs[i] + (widths[i] - w) / 2
          : xs[i];
      page.drawText(label, { x, y: y + 1, size: 8.5, font, color });
    });
    y -= ROW_H;
  };

  /** Horizontal bar, for distributions. */
  const barRow = (label, value, max, { hint = "", accent = false } = {}) => {
    ensureSpace(ROW_H + 6);
    const labelW = 58;
    const valueW = 46;
    const barW = contentW - labelW - valueW - 120;
    page.drawText(fitText(label, semibold, 8.5, labelW), {
      x: MARGIN,
      y,
      size: 8.5,
      font: semibold,
      color: CARBON.dim,
    });
    page.drawRectangle({
      x: MARGIN + labelW,
      y: y + 1,
      width: barW,
      height: 5,
      color: CARBON.raised,
    });
    const pct = max > 0 ? Math.max(0.01, Math.min(1, value / max)) : 0;
    page.drawRectangle({
      x: MARGIN + labelW,
      y: y + 1,
      width: barW * pct,
      height: 5,
      color: accent ? CARBON.neon : CARBON.info,
    });
    const v = nf(value);
    const vw = semibold.widthOfTextAtSize(v, 8.5);
    page.drawText(v, {
      x: MARGIN + labelW + barW + 12 + (valueW - vw),
      y,
      size: 8.5,
      font: semibold,
      color: CARBON.ink,
    });
    if (hint) {
      page.drawText(fitText(hint, body, 7.5, 110), {
        x: MARGIN + labelW + barW + valueW + 24,
        y,
        size: 7.5,
        font: body,
        color: CARBON.faint,
      });
    }
    y -= ROW_H;
  };

  const spacer = (h = 10) => {
    y -= h;
  };

  if (meta) {
    text(meta, { size: 8.5, color: CARBON.faint, gap: 12 });
  }
  if (introNote) {
    callout(introNote);
  }

  return {
    pdf,
    fonts,
    get page() {
      return page;
    },
    get y() {
      return y;
    },
    set y(v) {
      y = v;
    },
    CARBON,
    text,
    paragraph,
    section,
    statTiles,
    callout,
    bullet,
    tableHeader,
    tableRow,
    barRow,
    spacer,
    ensureSpace,
    startPage,
  };
}
