import { PDFDocument, rgb } from "pdf-lib";
import { embedNunitoFonts } from "./nunitoFonts.js";

function safeString(value) {
  if (value === null || value === undefined) return "N/A";
  const str = String(value);
  return str.length ? str : "N/A";
}

/**
 * Draw a simple label/value row.
 */
function drawRow(page, { label, value, x, y, labelWidth }) {
  page.drawText(label, {
    x,
    y,
    size: 10,
    color: rgb(0.38, 0.38, 0.45),
  });
  page.drawText(value, {
    x: x + labelWidth,
    y,
    size: 10,
    color: rgb(0.07, 0.09, 0.15),
  });
}

/**
 * Generates a PDF (as Uint8Array) for the combined report using pdf-lib.
 */
export async function generateReportPdf(report) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();

  const { width, height } = page.getSize();
  const margin = 40;

  const { display: fontTitle, body: fontBody, regular: fontSmall } = await embedNunitoFonts(pdfDoc);

  let cursorY = height - margin;

  // Title
  const title = "PageSpeed Report";
  const titleSize = 18;
  const titleWidth = fontTitle.widthOfTextAtSize(title, titleSize);
  page.drawText(title, {
    x: (width - titleWidth) / 2,
    y: cursorY,
    size: titleSize,
    font: fontTitle,
    color: rgb(0.07, 0.09, 0.15),
  });

  cursorY -= 24;

  // Basic info
  const infoLines = [
    `Website URL: ${report.url}`,
    `Generated at: ${new Date(report.generatedAt).toLocaleString()}`,
  ];
  infoLines.forEach((line) => {
    page.drawText(line, {
      x: margin,
      y: cursorY,
      size: 10,
      font: fontBody,
      color: rgb(0.25, 0.29, 0.37),
    });
    cursorY -= 14;
  });

  cursorY -= 10;

  // Divider
  page.drawLine({
    start: { x: margin, y: cursorY },
    end: { x: width - margin, y: cursorY },
    thickness: 0.5,
    color: rgb(0.85, 0.87, 0.9),
  });

  cursorY -= 22;

  // PageSpeed section
  page.drawText("PageSpeed Insights", {
    x: margin,
    y: cursorY,
    size: 14,
    font: fontTitle,
    color: rgb(0.07, 0.09, 0.15),
  });

  cursorY -= 18;

  const ps = report.pagespeed;

  if (!ps) {
    page.drawText("No PageSpeed data available.", {
      x: margin,
      y: cursorY,
      size: 10,
      font: fontBody,
      color: rgb(0.4, 0.4, 0.4),
    });
    cursorY -= 18;
  } else {
    const metaLabelWidth = 120;

    drawRow(page, {
      label: "Lighthouse version:",
      value: safeString(ps.lighthouseVersion),
      x: margin,
      y: cursorY,
      labelWidth: metaLabelWidth,
    });

    cursorY -= 14;

    drawRow(page, {
      label: "Audit fetch time:",
      value: ps.fetchTime
        ? new Date(ps.fetchTime).toLocaleString()
        : "N/A",
      x: margin,
      y: cursorY,
      labelWidth: metaLabelWidth,
    });

    cursorY -= 20;

    page.drawText("Summary Scores", {
      x: margin,
      y: cursorY,
      size: 12,
      font: fontTitle,
      color: rgb(0.07, 0.09, 0.15),
    });

    cursorY -= 16;

    const scores = [
      ["Performance", ps.performanceScore],
      ["SEO", ps.seoScore],
      ["Accessibility", ps.accessibilityScore],
      ["Best Practices", ps.bestPracticesScore],
    ];

    scores.forEach(([label, value]) => {
      drawRow(page, {
        label: `${label}:`,
        value: safeString(value),
        x: margin,
        y: cursorY,
        labelWidth: metaLabelWidth,
      });
      cursorY -= 14;
    });

    cursorY -= 12;

    page.drawText("Key Metrics", {
      x: margin,
      y: cursorY,
      size: 12,
      font: fontTitle,
      color: rgb(0.07, 0.09, 0.15),
    });

    cursorY -= 16;

    const metricLabelWidth = 80;

    const metricRow = (label, metric) => {
      const desc = metric?.title ?? "";
      const valStr =
        metric?.displayValue ??
        (metric?.numericValue !== undefined && metric?.numericValue !== null
          ? String(metric.numericValue)
          : "");

      drawRow(page, {
        label: `${label}:`,
        value: safeString(desc),
        x: margin,
        y: cursorY,
        labelWidth: metricLabelWidth,
      });

      page.drawText(safeString(valStr), {
        x: margin + metricLabelWidth + 200,
        y: cursorY,
        size: 10,
        font: fontBody,
        color: rgb(0.07, 0.09, 0.15),
      });

      cursorY -= 14;
    };

    metricRow("FCP", ps.metrics.FCP);
    metricRow("LCP", ps.metrics.LCP);
    metricRow("CLS", ps.metrics.CLS);
    metricRow("TBT", ps.metrics.TBT);

    cursorY -= 10;
  }

  // Footer
  const footerText =
    "This report is generated using Google PageSpeed Insights API.";
  page.drawText(footerText, {
    x: margin,
    y: margin / 2,
    size: 8,
    font: fontSmall,
    color: rgb(0.6, 0.6, 0.65),
  });

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

