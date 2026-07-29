import * as XLSX from "xlsx";

export const EXCEL_TEMPLATE_HEADERS = [
  "Post Title/Angle",
  "Primary Keyword",
  "Secondary Keywords / Hashtags",
  "Caption Brief",
  "Image Direction",
  "Platform",
  "CTA Text",
  "CTA URL",
  "Notes",
];

export const EXCEL_TEMPLATE_SAMPLE_ROWS = [
  [
    "3 signs your freight quote is about to surprise you",
    "freight quote",
    "shipping costs, FCL, customs fees",
    "Punchy carousel-style caption. Educate first-time importers. End with soft CTA.",
    "Shipping containers at golden hour, clean square crop, no text",
    "both",
    "Get a quote",
    "https://example.com/contact",
    "Keep under 8 hashtags",
  ],
  [
    "FCL vs LCL in one practical checklist",
    "FCL vs LCL",
    "container load, ocean freight, landed cost",
    "Comparison post. Friendly expert tone. Ask a question in the first line.",
    "Port yard with stacked containers, professional photo style",
    "instagram",
    "Talk to logistics",
    "https://example.com/contact",
    "",
  ],
  [
    "Incoterms 2020: the 60-second explainer your ops team needs",
    "Incoterms 2020",
    "FOB, CIF, international shipping terms",
    "Myth-busting style. No legal advice. One clear CTA.",
    "Clipboard with shipping docs beside a pallet, soft daylight",
    "facebook",
    "Request a consult",
    "https://example.com/contact",
    "Do not invent legal claims",
  ],
];

export function buildExcelTemplateBuffer() {
  const aoa = [EXCEL_TEMPLATE_HEADERS, ...EXCEL_TEMPLATE_SAMPLE_ROWS];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = EXCEL_TEMPLATE_HEADERS.map((h) => ({
    wch: Math.min(42, Math.max(16, h.length + 4)),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Campaign");
  const guide = XLSX.utils.aoa_to_sheet([
    ["Crossway Post Automation — Excel queue template"],
    [""],
    ["Platform values: facebook | instagram | both"],
    ["Max 50 rows. Upload in Post Automation Studio → Excel queue."],
  ]);
  guide["!cols"] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, guide, "Instructions");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
