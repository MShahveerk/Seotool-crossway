/**
 * Excel / CSV campaign queue for Blog Automation Studio.
 * Max 50 rows; interpreter maps arbitrary columns into editable seed fields.
 */
import * as XLSX from "xlsx";
import prisma from "../prisma.js";
import { chatCompletion } from "./providers.js";
import { getSiteStudioConfig } from "./engine.js";

export const EXCEL_MAX_ROWS = 50;

const FIELD_ALIASES = {
  topic: ["topic", "title", "blog title", "post title", "subject", "headline", "h1"],
  keywords: [
    "keyword",
    "keywords",
    "primary keyword",
    "primary_keyword",
    "must follow",
    "seed keyword",
    "target keyword",
  ],
  seedContext: [
    "context",
    "brief",
    "notes",
    "description",
    "summary",
    "angle",
    "content",
    "seed",
    "instructions",
  ],
  imagePrompt: [
    "image",
    "image prompt",
    "image_prompt",
    "featured image",
    "visual",
    "thumbnail prompt",
    "image direction",
  ],
  audience: ["audience", "target audience", "persona", "reader"],
  ctaText: ["cta", "cta text", "cta_text", "call to action"],
  ctaUrl: ["cta url", "cta_url", "link", "conversion url", "url"],
  notes: ["extra", "extra notes", "seo notes", "comment", "comments"],
};

function normHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function pickField(rowObj, field) {
  const aliases = FIELD_ALIASES[field] || [];
  const entries = Object.entries(rowObj || {});
  for (const alias of aliases) {
    for (const [key, val] of entries) {
      if (normHeader(key) === alias && String(val || "").trim()) {
        return String(val).trim();
      }
    }
  }
  // fuzzy contains
  for (const alias of aliases) {
    for (const [key, val] of entries) {
      const nk = normHeader(key);
      if (nk.includes(alias) && String(val || "").trim()) return String(val).trim();
    }
  }
  return "";
}

export function parseSpreadsheetBuffer(buffer, fileName = "upload.xlsx") {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    const err = new Error("Spreadsheet has no sheets.");
    err.status = 400;
    throw err;
  }
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  if (!Array.isArray(rows) || !rows.length) {
    const err = new Error("Spreadsheet has no data rows.");
    err.status = 400;
    throw err;
  }
  if (rows.length > EXCEL_MAX_ROWS) {
    const err = new Error(`Spreadsheet has ${rows.length} rows. Maximum is ${EXCEL_MAX_ROWS}.`);
    err.status = 400;
    throw err;
  }

  const headers = Object.keys(rows[0] || {});
  const mapped = rows.map((raw, idx) => {
    const topic = pickField(raw, "topic");
    const keywords = pickField(raw, "keywords");
    return {
      rowIndex: idx,
      topic: topic || keywords || `Row ${idx + 1}`,
      keywords,
      seedContext: pickField(raw, "seedContext"),
      imagePrompt: pickField(raw, "imagePrompt"),
      audience: pickField(raw, "audience"),
      ctaText: pickField(raw, "ctaText"),
      ctaUrl: pickField(raw, "ctaUrl"),
      notes: pickField(raw, "notes"),
      rawJson: raw,
      status: "pending",
    };
  });

  return { fileName, sheetName, headers, rows: mapped };
}

/**
 * Optional AI pass: refine mapping when headers are unusual.
 */
export async function interpretSpreadsheetRows({ config, headers, rows }) {
  const sample = rows.slice(0, 8).map((r) => r.rawJson);
  const system =
    config.interpreterPrompt ||
    `You map spreadsheet rows into blog automation seed fields.
Return ONLY JSON: { "rows": [ { "rowIndex": 0, "topic": "", "keywords": "", "seedContext": "", "imagePrompt": "", "audience": "", "ctaText": "", "ctaUrl": "", "notes": "" } ] }
Keep rowIndex aligned with input order. Do not invent URLs.`;

  const result = await chatCompletion({
    provider: config.interpreterProvider,
    model: config.interpreterModel,
    system,
    user: JSON.stringify({ headers, sampleRows: sample, totalRows: rows.length }, null, 2),
    siteConfig: config,
    jsonMode: true,
    maxTokens: 6000,
  });

  const aiRows = Array.isArray(result.json?.rows) ? result.json.rows : [];
  const byIndex = new Map(aiRows.map((r) => [Number(r.rowIndex), r]));

  const refined = rows.map((row, idx) => {
    const ai = byIndex.get(idx) || byIndex.get(row.rowIndex) || {};
    return {
      ...row,
      topic: String(ai.topic || row.topic || "").trim() || row.topic,
      keywords: String(ai.keywords || row.keywords || "").trim(),
      seedContext: String(ai.seedContext || ai.seed_context || row.seedContext || "").trim(),
      imagePrompt: String(ai.imagePrompt || ai.image_prompt || row.imagePrompt || "").trim(),
      audience: String(ai.audience || row.audience || "").trim(),
      ctaText: String(ai.ctaText || ai.cta_text || row.ctaText || "").trim(),
      ctaUrl: String(ai.ctaUrl || ai.cta_url || row.ctaUrl || "").trim(),
      notes: String(ai.notes || row.notes || "").trim(),
    };
  });

  return { rows: refined, usage: { costUsd: result.costUsd, model: result.model, provider: result.provider } };
}

export async function createCampaignFromRows({
  siteLink,
  fileName,
  headers,
  rows,
  replaceActive = true,
}) {
  const link = String(siteLink || "").trim();
  if (!link) {
    const err = new Error("siteLink is required.");
    err.status = 400;
    throw err;
  }
  if (!rows?.length) {
    const err = new Error("No rows to import.");
    err.status = 400;
    throw err;
  }
  if (rows.length > EXCEL_MAX_ROWS) {
    const err = new Error(`Maximum ${EXCEL_MAX_ROWS} rows allowed.`);
    err.status = 400;
    throw err;
  }

  if (replaceActive) {
    await prisma.blogAutomationCampaign.updateMany({
      where: { siteLink: link, status: "active" },
      data: { status: "archived" },
    });
  }

  const campaign = await prisma.blogAutomationCampaign.create({
    data: {
      siteLink: link,
      fileName: String(fileName || "upload.xlsx").slice(0, 512),
      status: "active",
      headersJson: headers || [],
      rowCount: rows.length,
      rows: {
        create: rows.map((r, idx) => ({
          siteLink: link,
          rowIndex: Number.isFinite(r.rowIndex) ? r.rowIndex : idx,
          status: "pending",
          topic: String(r.topic || "").slice(0, 512) || `Row ${idx + 1}`,
          keywords: r.keywords || null,
          seedContext: r.seedContext || null,
          imagePrompt: r.imagePrompt || null,
          audience: r.audience || null,
          ctaText: r.ctaText || null,
          ctaUrl: r.ctaUrl || null,
          notes: r.notes || null,
          rawJson: r.rawJson || null,
        })),
      },
    },
    include: { rows: { orderBy: { rowIndex: "asc" } } },
  });

  // Prefer excel as auto source when a campaign is uploaded
  await prisma.blogAutomationSiteConfig.upsert({
    where: { siteLink: link },
    create: {
      siteLink: link,
      autoSource: "excel",
      autoEnabled: false,
    },
    update: { autoSource: "excel" },
  });

  return campaign;
}

export async function getActiveCampaign(siteLink) {
  return prisma.blogAutomationCampaign.findFirst({
    where: { siteLink: String(siteLink || "").trim(), status: "active" },
    include: { rows: { orderBy: { rowIndex: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateQueueRow(rowId, patch = {}) {
  const data = {};
  for (const key of [
    "topic",
    "keywords",
    "seedContext",
    "imagePrompt",
    "audience",
    "ctaText",
    "ctaUrl",
    "notes",
    "status",
  ]) {
    if (patch[key] !== undefined) data[key] = patch[key] === "" ? null : patch[key];
  }
  if (data.topic != null) data.topic = String(data.topic).slice(0, 512);
  return prisma.blogAutomationQueueRow.update({ where: { id: rowId }, data });
}

export async function bulkUpdateQueueRows(updates = []) {
  const results = [];
  for (const u of updates) {
    if (!u?.id) continue;
    results.push(await updateQueueRow(u.id, u));
  }
  return results;
}

/** Next pending row for excel-driven auto. */
export async function claimNextQueueRow(siteLink) {
  const link = String(siteLink || "").trim();
  const campaign = await getActiveCampaign(link);
  if (!campaign) return null;

  const row = campaign.rows.find((r) => r.status === "pending");
  if (!row) {
    if (campaign.rows.every((r) => ["done", "skipped"].includes(r.status))) {
      await prisma.blogAutomationCampaign.update({
        where: { id: campaign.id },
        data: { status: "completed" },
      });
    }
    return null;
  }

  return prisma.blogAutomationQueueRow.update({
    where: { id: row.id },
    data: { status: "processing" },
  });
}

export async function markQueueRowResult(rowId, { status, runId, blogPostId, errorMessage } = {}) {
  const nextStatus = status || "done";
  const terminal = ["done", "failed", "skipped"].includes(nextStatus);
  return prisma.blogAutomationQueueRow.update({
    where: { id: rowId },
    data: {
      status: nextStatus,
      runId: runId || undefined,
      blogPostId: blogPostId || undefined,
      errorMessage: errorMessage !== undefined ? errorMessage : undefined,
      processedAt: terminal ? new Date() : undefined,
    },
  });
}

export async function uploadAndImportSpreadsheet({
  siteLink,
  file,
  useAi = true,
} = {}) {
  const name = String(file.name || "upload.xlsx");
  const buf = Buffer.from(await file.arrayBuffer());
  const parsed = parseSpreadsheetBuffer(buf, name);
  let rows = parsed.rows;
  let usage = null;

  if (useAi) {
    try {
      const config = await getSiteStudioConfig(siteLink);
      const interpreted = await interpretSpreadsheetRows({
        config,
        headers: parsed.headers,
        rows,
      });
      rows = interpreted.rows;
      usage = interpreted.usage;
    } catch (err) {
      console.warn(`[excelQueue] AI interpret skipped: ${err.message}`);
    }
  }

  const campaign = await createCampaignFromRows({
    siteLink,
    fileName: parsed.fileName,
    headers: parsed.headers,
    rows,
  });

  return { campaign, usage, sheetName: parsed.sheetName };
}
