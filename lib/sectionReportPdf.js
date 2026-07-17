/**
 * Section-specific PDF exports (SEO tools, inspection, etc.).
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const LINE = 13;
const GREEN = rgb(0.08, 0.45, 0.22);
const GRAY = rgb(0.35, 0.35, 0.38);
const BLACK = rgb(0.12, 0.12, 0.14);

function nf(n) {
  return new Intl.NumberFormat("en-US").format(Math.round(Number(n) || 0));
}

function pct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0.00%";
  return `${(v * 100).toFixed(2)}%`;
}

function safePdfText(s, maxLen = 500) {
  const t = String(s ?? "");
  let out = "";
  for (let i = 0; i < t.length && out.length < maxLen; i += 1) {
    const c = t.charCodeAt(i);
    out += c >= 32 && c <= 126 ? t[i] : "?";
  }
  return out;
}

async function createSectionPdf(title, propertyLabel, drawBody) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const assignPage = (p) => {
    page = p;
  };

  const ensureSpace = (minY) => {
    if (y < minY) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  const draw = (text, size, f, color, x = MARGIN) => {
    ensureSpace(MARGIN + 36);
    page.drawText(safePdfText(text), { x, y, size, font: f, color });
    y -= size + 3;
  };

  draw(title, 17, fontBold, GREEN);
  draw(`Property: ${propertyLabel}`, 10, font, GRAY);
  draw(`Generated: ${new Date().toLocaleString()}`, 9, font, GRAY);
  y -= 6;

  await drawBody({ draw, ensureSpace, page, font, fontBold, yRef: () => y, setY: (v) => { y = v; }, assignPage, MARGIN, LINE, BLACK, GRAY });

  ensureSpace(MARGIN + 20);
  page.drawText("Crossway SEO Tools", { x: MARGIN, y, size: 7, font, color: GRAY });

  return pdf.save();
}

export async function buildUrlInspectionReportPdf({ siteUrl, monitor }) {
  return createSectionPdf("URL Inspection Monitor", siteUrl, async ({ draw, font, fontBold, BLACK }) => {
    if (!monitor?.snapshot) {
      draw("No inspection snapshot available yet.", 10, font, GRAY);
      return;
    }
    const s = monitor.snapshot;
    draw(`Run date: ${safePdfText(s.runDate || s.date, 40)}`, 10, font, BLACK);
    draw(
      `Indexed: ${nf(s.indexedCount)} · Not indexed: ${nf(s.notIndexedCount)} · Unknown: ${nf(s.unknownCount)} · Errors: ${nf(s.errorCount)}`,
      10,
      font,
      BLACK
    );

    const notIndexed = (monitor.notIndexed || []).slice(0, 40);
    if (notIndexed.length) {
      draw("Not indexed URLs", 12, fontBold, BLACK);
      for (const row of notIndexed) {
        draw(`• ${safePdfText(row.url || row.inspectionUrl, 90)} — ${safePdfText(row.coverageState || row.verdict, 40)}`, 8, font, BLACK);
      }
    }

    const indexed = (monitor.indexed || []).slice(0, 25);
    if (indexed.length) {
      draw("Indexed URLs (sample)", 12, fontBold, BLACK);
      for (const row of indexed) {
        draw(`• ${safePdfText(row.url || row.inspectionUrl, 100)}`, 8, font, BLACK);
      }
    }
  });
}

export async function buildDeviceAppearanceReportPdf({ siteUrl, periodLabel, devices = [], appearances = [] }) {
  return createSectionPdf("Device & Search Appearance", siteUrl, async ({ draw, font, fontBold, BLACK }) => {
    draw(safePdfText(periodLabel || "Last 28 days", 80), 10, font, GRAY);
    draw("Device breakdown", 12, fontBold, BLACK);
    for (const d of devices.slice(0, 10)) {
      draw(
        `${safePdfText(d.device, 20)} — clicks ${nf(d.clicks)} · impr ${nf(d.impressions)} · CTR ${pct(d.ctr)} · pos ${Number(d.position || 0).toFixed(1)}`,
        9,
        font,
        BLACK
      );
    }
    if (appearances.length) {
      draw("Search appearance", 12, fontBold, BLACK);
      for (const a of appearances.slice(0, 20)) {
        draw(
          `${safePdfText(a.appearance || a.searchAppearance, 40)} — clicks ${nf(a.clicks)} · impr ${nf(a.impressions)}`,
          9,
          font,
          BLACK
        );
      }
    }
  });
}

export async function buildQueryPageMatrixReportPdf({ siteUrl, periodLabel, rows = [] }) {
  return createSectionPdf("Query × Page Matrix", siteUrl, async ({ draw, font, fontBold, BLACK }) => {
    draw(safePdfText(periodLabel || "Last 28 days", 80), 10, font, GRAY);
    draw("Top query / page pairs", 12, fontBold, BLACK);
    for (const r of rows.slice(0, 50)) {
      draw(
        `"${safePdfText(r.query, 35)}" → ${safePdfText(r.page, 55)} | clicks ${nf(r.clicks)} · impr ${nf(r.impressions)}`,
        8,
        font,
        BLACK
      );
    }
  });
}

export async function buildSitemapHealthReportPdf({ siteUrl, sitemaps = [], warnings = [] }) {
  return createSectionPdf("Sitemap Health", siteUrl, async ({ draw, font, fontBold, BLACK }) => {
    draw(`Sitemaps in Search Console: ${nf(sitemaps.length)}`, 10, font, BLACK);
    for (const sm of sitemaps.slice(0, 15)) {
      draw(
        `• ${safePdfText(sm.path || sm.feedpath, 80)} — ${safePdfText(sm.lastSubmitted || sm.lastDownloaded, 30)}`,
        8,
        font,
        BLACK
      );
    }
    if (warnings.length) {
      draw("Warnings & recommendations", 12, fontBold, BLACK);
      for (const w of warnings.slice(0, 20)) {
        draw(`• ${safePdfText(w.message || w, 110)}`, 9, font, BLACK);
      }
    }
  });
}
