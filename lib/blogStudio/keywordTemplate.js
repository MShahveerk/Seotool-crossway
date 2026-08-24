/**
 * Downloadable keyword-bank template for Blog Studio Decider.
 */
import * as XLSX from "xlsx";

export const KEYWORD_TEMPLATE_HEADERS = ["Keyword", "Volume", "KD", "Notes"];

export const KEYWORD_TEMPLATE_SAMPLE_ROWS = [
  ["custom mobile app development", 720, 28, "Core service — prefer this over generic cost queries"],
  ["hire app developers", 480, 31, "Commercial investigation"],
  ["app development timeline", 210, 22, "Process / expectation content"],
  ["native vs cross platform apps", 390, 24, "Comparison"],
];

export function buildKeywordTemplateWorkbook() {
  const sheet = XLSX.utils.aoa_to_sheet([KEYWORD_TEMPLATE_HEADERS, ...KEYWORD_TEMPLATE_SAMPLE_ROWS]);
  sheet["!cols"] = [{ wch: 36 }, { wch: 12 }, { wch: 10 }, { wch: 48 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Keywords");

  const guide = XLSX.utils.aoa_to_sheet([
    ["Crossway Blog Studio — keyword bank"],
    [""],
    ["How to use"],
    ["1. Keep the header row. Add one keyword per row (max 200)."],
    ["2. Volume and KD are optional. Notes are optional."],
    ["3. Download this file, fill it, then import it in Compose → Your keywords."],
    ["4. Turn on “Use my keywords instead of Research” if this list should replace the harvest for the Decider."],
    [""],
    ["Rules"],
    ["Do not invent phrases the site does not compete for."],
    ["Prefer 3–7 word specific phrases over “how much does X cost” dumps."],
    ["CSV works too: Keyword,Volume,KD,Notes"],
  ]);
  guide["!cols"] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, guide, "Instructions");
  return wb;
}

export function buildKeywordTemplateBuffer() {
  const wb = buildKeywordTemplateWorkbook();
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
