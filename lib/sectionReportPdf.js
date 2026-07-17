/**
 * Section-specific branded PDF exports (SEO tools, inspection, etc.).
 */
import {
  createBrandedReportContext,
  formatPropertyLabel,
  nf,
  pct,
  safePdfText,
  PLAIN,
  BRAND,
} from "./reportPdfTheme.js";

async function createBrandedSectionPdf(title, subtitle, siteUrl, introNote, drawBody, internal = true) {
  const propertyLabel = formatPropertyLabel(siteUrl);
  const ctx = await createBrandedReportContext({
    reportTitle: title,
    propertyLabel,
    introNote: introNote || subtitle,
    internal,
  });

  await drawBody(ctx);
  return ctx.pdf.save();
}

export async function buildUrlInspectionReportPdf({ siteUrl, monitor }) {
  return createBrandedSectionPdf(
    PLAIN.inspectionTitle,
    PLAIN.inspectionSubtitle,
    siteUrl,
    "We check whether Google has added your pages to search results. Green = showing on Google. Red = needs attention.",
    async ({ drawSection, drawMetricRow, drawPlainBox, drawBullet, drawTextLine, font, fontBold }) => {
      if (!monitor?.snapshot) {
        drawPlainBox("No inspection data yet. Daily checks will appear here once your site is being monitored.", "warn");
        return;
      }
      const s = monitor.snapshot;
      const runDate = s.runDate ? new Date(s.runDate).toLocaleDateString("en-US", { dateStyle: "medium" }) : "Recent";

      drawSection("Summary", `Last checked: ${runDate}`);
      drawMetricRow([
        { label: PLAIN.indexed, value: nf(s.indexedCount), hint: "Pages Google is showing" },
        { label: PLAIN.notIndexed, value: nf(s.notIndexedCount), hint: "Pages that need fixing" },
        { label: "Needs review", value: nf(s.unknownCount), hint: "Status unclear" },
        { label: "Errors", value: nf(s.errorCount), hint: "Could not be checked" },
      ]);

      const notIndexed = (monitor.notIndexed || []).slice(0, 35);
      if (notIndexed.length) {
        drawSection("Pages not showing on Google yet", "These pages may need updates before Google will list them");
        for (const row of notIndexed) {
          drawBullet(
            `${safePdfText(row.url || row.inspectionUrl, 75)} — ${safePdfText(row.coverageState || row.cause || row.verdict || "Needs review", 40)}`
          );
        }
      }

      const indexed = (monitor.indexed || []).slice(0, 20);
      if (indexed.length) {
        drawTextLine("Pages showing on Google (sample)", 11, fontBold, BRAND.black);
        for (const row of indexed) {
          drawBullet(safePdfText(row.url || row.inspectionUrl, 85));
        }
      }
    }
  );
}

export async function buildDeviceAppearanceReportPdf({ siteUrl, periodLabel, devices = [], appearances = [] }) {
  return createBrandedSectionPdf(
    PLAIN.deviceTitle,
    PLAIN.deviceSubtitle,
    siteUrl,
    `Data from ${periodLabel || "the last 28 days"}. See whether more visitors use phones or computers — and how your site appears in Google results.`,
    async ({ drawSection, drawTableHeader, drawTableRow, drawBullet, fontBold }) => {
      drawSection("Visitors by device", "Phone, computer, or tablet");

      const dCols = [48, 130, 230, 340, 440];
      drawTableHeader(["Device", "Visits", "Appearances", "Click rate", "Avg. ranking"], dCols);
      const deviceLabels = { DESKTOP: "Computer", MOBILE: "Phone", TABLET: "Tablet" };
      devices.slice(0, 10).forEach((d, i) => {
        const label = deviceLabels[String(d.device || d.label || "").toUpperCase()] || d.label || d.device;
        drawTableRow(
          [
            label,
            nf(d.clicks),
            nf(d.impressions),
            pct(d.ctr),
            Number(d.position || 0).toFixed(1),
          ],
          dCols,
          i % 2 === 1
        );
      });

      if (appearances.length) {
        drawSection("How you appear in Google", "Rich results, images, and other search formats");
        for (const a of appearances.slice(0, 20)) {
          drawBullet(
            `${safePdfText(a.appearance || a.searchAppearance || a.label, 40)} — ${nf(a.clicks)} visits, ${nf(a.impressions)} appearances`
          );
        }
      }
    }
  );
}

export async function buildQueryPageMatrixReportPdf({ siteUrl, periodLabel, rows = [] }) {
  return createBrandedSectionPdf(
    PLAIN.queryPageTitle,
    PLAIN.queryPageSubtitle,
    siteUrl,
    `From ${periodLabel || "the last 28 days"}. Shows what people searched for and which page on your site they landed on.`,
    async ({ drawSection, drawTableHeader, drawTableRow }) => {
      drawSection("Search terms and landing pages", "What people typed vs. where they ended up");
      const cols = [48, 220, 380, 460];
      drawTableHeader(["What they searched", "Page they visited", "Visits", "Appearances"], cols);
      rows.slice(0, 45).forEach((r, i) => {
        drawTableRow(
          [safePdfText(r.query, 30), safePdfText(r.page, 38), nf(r.clicks), nf(r.impressions)],
          cols,
          i % 2 === 1
        );
      });
    }
  );
}

export async function buildSitemapHealthReportPdf({ siteUrl, sitemaps = [], warnings = [] }) {
  return createBrandedSectionPdf(
    PLAIN.sitemapTitle,
    PLAIN.sitemapSubtitle,
    siteUrl,
    "A sitemap is a list of your website pages that you share with Google. It helps Google find and index your content faster.",
    async ({ drawSection, drawMetricRow, drawBullet, drawPlainBox }) => {
      drawMetricRow([
        { label: "Sitemaps registered", value: nf(sitemaps.length), hint: "Lists submitted to Google" },
        { label: "Warnings", value: nf(warnings.length), hint: "Items to review" },
      ]);

      if (sitemaps.length) {
        drawSection("Your sitemaps", "Files that tell Google about your pages");
        for (const sm of sitemaps.slice(0, 15)) {
          drawBullet(
            `${safePdfText(sm.path || sm.feedpath, 70)} — last updated ${safePdfText(sm.lastSubmitted || sm.lastDownloaded || "unknown", 20)}`
          );
        }
      }

      if (warnings.length) {
        drawSection("Recommended actions", "Things your team may want to fix");
        for (const w of warnings.slice(0, 20)) {
          drawPlainBox(safePdfText(w.message || w, 110), "warn");
        }
      } else {
        drawPlainBox("No sitemap warnings right now — your site maps look healthy.");
      }
    }
  );
}
