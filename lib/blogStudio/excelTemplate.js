/**
 * Downloadable Excel campaign template for Blog Automation Studio.
 */
import * as XLSX from "xlsx";

export const EXCEL_TEMPLATE_HEADERS = [
  "Blog Title",
  "Primary Keyword",
  "Secondary SEO Keywords",
  "Content Brief",
  "Image Direction",
  "Target Audience",
  "CTA Text",
  "CTA URL",
  "Notes",
];

export const EXCEL_TEMPLATE_SAMPLE_ROWS = [
  [
    "How to Choose a Freight Forwarder for First-Time Importers",
    "freight forwarder",
    "ocean freight, FCL shipping, import logistics",
    "Practical guide for new importers. Cover vetting, documentation, and common mistakes. Keep tone expert but approachable.",
    "Container ship at dawn, clean cinematic lighting, no text overlays",
    "First-time importers and SMB logistics managers",
    "Get a freight quote",
    "https://example.com/contact",
    "Must mention customs clearance once",
  ],
  [
    "FCL vs LCL Shipping: Which Option Saves More on Mid-Size Orders",
    "FCL vs LCL",
    "container shipping costs, less than container load, full container load",
    "Compare cost, speed, and risk. Include a simple decision checklist.",
    "Stacked shipping containers in a port yard, professional photo style",
    "E-commerce operators shipping 1–10 pallets",
    "Talk to a logistics expert",
    "https://example.com/contact",
    "",
  ],
  [
    "What Is Incoterms 2020 and Why It Matters for Cross-Border Shipments",
    "Incoterms 2020",
    "FOB shipping, CIF meaning, international trade terms",
    "Explain the most used Incoterms with plain-language buyer/seller responsibility examples.",
    "Clipboard with shipping documents beside a cargo pallet, soft daylight",
    "Procurement and supply-chain teams",
    "Request a consultation",
    "https://example.com/contact",
    "Do not invent legal advice",
  ],
];

export function buildExcelTemplateWorkbook() {
  const aoa = [EXCEL_TEMPLATE_HEADERS, ...EXCEL_TEMPLATE_SAMPLE_ROWS];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = EXCEL_TEMPLATE_HEADERS.map((h) => ({
    wch: Math.min(42, Math.max(16, h.length + 4)),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Campaign");

  const guide = XLSX.utils.aoa_to_sheet([
    ["Crossway Blog Automation — Excel queue template"],
    [""],
    ["How to use"],
    ["1. Keep the header row (row 1). You can rename headers; the interpreter maps common SEO names."],
    ["2. Add up to 50 data rows (one blog per row)."],
    ["3. Upload this file in Blog Automation Studio → Excel queue."],
    ["4. Set frequency, review/edit cells, enable Auto."],
    [""],
    ["Suggested headers"],
    ["Blog Title → topic"],
    ["Primary Keyword → keywords"],
    ["Secondary SEO Keywords → keywords (merged)"],
    ["Content Brief → seed context"],
    ["Image Direction → image prompt"],
    ["Target Audience → audience"],
    ["CTA Text / CTA URL → CTA fields"],
    ["Notes → notes"],
    [""],
    ["Tips"],
    ["You can use your own column names (e.g. 'Secondary SEO Keywords', 'Focus Keyword')."],
    ["Delete the sample rows before uploading your real campaign if you want."],
  ]);
  guide["!cols"] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, guide, "Instructions");
  return wb;
}

export function buildExcelTemplateBuffer() {
  const wb = buildExcelTemplateWorkbook();
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
