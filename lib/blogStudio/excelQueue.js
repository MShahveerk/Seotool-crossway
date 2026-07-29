/**
 * Excel / CSV campaign queue for Blog Automation Studio.
 * Max 50 rows; interpreter maps arbitrary columns into editable seed fields.
 */
import * as XLSX from "xlsx";
import prisma from "../prisma.js";
import { chatCompletion } from "./providers.js";
import { getSiteStudioConfig } from "./engine.js";

export const EXCEL_MAX_ROWS = 50;

/** Target queue fields the UI edits. */
export const QUEUE_FIELDS = [
  "topic",
  "keywords",
  "seedContext",
  "imagePrompt",
  "audience",
  "ctaText",
  "ctaUrl",
  "notes",
];

/**
 * Scored header patterns. Higher score wins.
 * Multi-column fields (keywords, seedContext, notes) can collect several columns.
 */
const FIELD_PATTERNS = {
  topic: [
    { re: /^(topic|title|blog title|post title|article title|subject|headline|h1)$/, score: 100 },
    { re: /\b(blog title|post title|article title|headline)\b/, score: 90 },
    { re: /^(topic|title)$/, score: 95 },
    { re: /\btopic\b/, score: 70 },
  ],
  keywords: [
    // Primary / must-follow first
    {
      re: /\b(primary|must\s*follow|focus|main|target|seed|core)\b.*\b(seo\s*)?keywords?\b/,
      score: 100,
      role: "primary",
    },
    { re: /^(primary|must\s*follow|focus|main|target)\s*keywords?$/, score: 100, role: "primary" },
    { re: /^(seo\s*)?keywords?$/, score: 88, role: "primary" },
    { re: /^keyword$/, score: 85, role: "primary" },
    // Secondary / supporting — still maps into keywords (merged)
    {
      re: /\b(secondary|supporting|related|lsi|long\s*tail|long-tail)\b.*\b(seo\s*)?keywords?\b/,
      score: 96,
      role: "secondary",
    },
    { re: /\bsecondary\s+(seo\s+)?keywords?\b/, score: 96, role: "secondary" },
    { re: /\b(seo\s*)?keywords?\b/, score: 75, role: "primary" },
  ],
  seedContext: [
    { re: /^(context|brief|content brief|seed|seed prompt|seed context|angle|outline)$/, score: 100 },
    { re: /\b(content brief|seed prompt|seed context|writing brief)\b/, score: 95 },
    { re: /\b(brief|context|angle|instructions|summary|description)\b/, score: 80 },
    { re: /\b(content|seed)\b/, score: 55 },
  ],
  imagePrompt: [
    {
      re: /^(image|image prompt|image direction|featured image|visual|visual direction|thumbnail prompt|hero image)$/,
      score: 100,
    },
    { re: /\b(image prompt|image direction|featured image|thumbnail|visual direction|hero image)\b/, score: 95 },
    { re: /\b(image|visual|thumbnail)\b/, score: 70 },
  ],
  audience: [
    { re: /^(audience|target audience|persona|reader|buyer persona)$/, score: 100 },
    { re: /\b(target audience|buyer persona)\b/, score: 95 },
    { re: /\b(audience|persona|reader)\b/, score: 80 },
  ],
  ctaText: [
    { re: /^(cta|cta text|call to action|button text|cta label)$/, score: 100 },
    { re: /\b(cta text|call to action|button text)\b/, score: 95 },
    { re: /^(cta)$/, score: 90 },
  ],
  ctaUrl: [
    { re: /^(cta url|cta link|conversion url|destination url|cta href)$/, score: 100 },
    { re: /\b(cta url|cta link|conversion url)\b/, score: 95 },
    // bare "url" / "link" only if clearly CTA-ish — keep modest score
    { re: /^(url|link|href)$/, score: 40 },
  ],
  notes: [
    { re: /^(notes|extra|extra notes|seo notes|comments?|remark|internal notes)$/, score: 90 },
    { re: /\b(seo notes|extra notes|internal notes)\b/, score: 88 },
    { re: /\b(notes|comments?)\b/, score: 60 },
  ],
};

/** Fields that may receive multiple spreadsheet columns (joined). */
const MULTI_FIELDS = new Set(["keywords", "seedContext", "notes", "imagePrompt"]);

function normHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/[_./\\]+/g, " ")
    .replace(/\s+/g, " ");
}

function scoreHeaderForField(header, field) {
  const h = normHeader(header);
  if (!h) return { score: 0, role: null };
  let best = { score: 0, role: null };
  for (const rule of FIELD_PATTERNS[field] || []) {
    if (rule.re.test(h) && rule.score > best.score) {
      best = { score: rule.score, role: rule.role || null };
    }
  }
  return best;
}

/**
 * Map each spreadsheet header → best queue field (or null).
 * Returns { [originalHeader]: { field, score, role } }
 */
export function buildColumnMap(headers = []) {
  const scored = [];
  for (const header of headers) {
    let best = { field: null, score: 0, role: null };
    for (const field of QUEUE_FIELDS) {
      const hit = scoreHeaderForField(header, field);
      if (hit.score > best.score) {
        best = { field, score: hit.score, role: hit.role };
      }
    }
    // Ignore weak bare matches (e.g. generic "url" at 40) unless nothing stronger
    if (best.score >= 55) {
      scored.push({ header, ...best });
    }
  }

  // Prefer higher scores; for single-value fields keep only the best column
  scored.sort((a, b) => b.score - a.score);
  const map = {};
  const claimedSingle = new Set();

  for (const item of scored) {
    if (!item.field) continue;
    if (!MULTI_FIELDS.has(item.field)) {
      if (claimedSingle.has(item.field)) continue;
      claimedSingle.add(item.field);
    }
    map[item.header] = { field: item.field, score: item.score, role: item.role };
  }
  return map;
}

function joinUnique(parts) {
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const t = String(p || "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.join("\n");
}

/** Apply a columnMap to one raw spreadsheet row. */
export function applyColumnMap(raw, columnMap) {
  const buckets = Object.fromEntries(QUEUE_FIELDS.map((f) => [f, []]));
  const keywordPrimary = [];
  const keywordSecondary = [];

  for (const [header, meta] of Object.entries(columnMap || {})) {
    const val = String(raw?.[header] ?? "").trim();
    if (!val || !meta?.field) continue;
    if (meta.field === "keywords") {
      if (meta.role === "secondary") keywordSecondary.push(val);
      else keywordPrimary.push(val);
      continue;
    }
    buckets[meta.field].push(val);
  }

  const keywords = joinUnique([...keywordPrimary, ...keywordSecondary]);
  const topic = joinUnique(buckets.topic);
  return {
    topic: topic || keywordPrimary[0] || keywords.split("\n")[0] || "",
    keywords,
    seedContext: joinUnique(buckets.seedContext),
    imagePrompt: joinUnique(buckets.imagePrompt),
    audience: joinUnique(buckets.audience),
    ctaText: joinUnique(buckets.ctaText),
    ctaUrl: joinUnique(buckets.ctaUrl),
    notes: joinUnique(buckets.notes),
  };
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
  const columnMap = buildColumnMap(headers);
  const mapped = rows.map((raw, idx) => {
    const fields = applyColumnMap(raw, columnMap);
    return {
      rowIndex: idx,
      topic: fields.topic || fields.keywords || `Row ${idx + 1}`,
      keywords: fields.keywords,
      seedContext: fields.seedContext,
      imagePrompt: fields.imagePrompt,
      audience: fields.audience,
      ctaText: fields.ctaText,
      ctaUrl: fields.ctaUrl,
      notes: fields.notes,
      rawJson: raw,
      status: "pending",
      _columnMap: columnMap,
    };
  });

  return { fileName, sheetName, headers, columnMap, rows: mapped };
}

const DEFAULT_EXCEL_INTERPRETER_SYSTEM = `You map spreadsheet COLUMN HEADERS into Blog Automation Studio queue fields.

Return ONLY valid JSON:
{
  "columnMap": {
    "<exact header from input>": "topic|keywords|seedContext|imagePrompt|audience|ctaText|ctaUrl|notes|ignore"
  }
}

Field meanings:
- topic: blog title / subject / headline
- keywords: ANY SEO keyword columns — primary, secondary, supporting, LSI, "secondary seo keywords", "must-follow keywords", etc. (all map to keywords)
- seedContext: brief, context, angle, writing instructions, seed prompt
- imagePrompt: image direction / featured image / visual prompt
- audience: target audience / persona
- ctaText: call-to-action label/text
- ctaUrl: CTA URL / conversion link
- notes: misc SEO notes / comments not covered above
- ignore: irrelevant columns (ids, dates, status, owner, etc.)

Examples:
- "Secondary SEO Keywords" → keywords
- "Primary Keyword" → keywords
- "Blog Title" → topic
- "Image Direction" → imagePrompt
- "Content Brief" → seedContext

Map EVERY provided header. Use the exact header strings as keys. Do not invent values.`;

/**
 * AI maps headers → fields, then we apply that map to EVERY row (not just a sample).
 */
export async function interpretSpreadsheetRows({ config, headers, rows, columnMap: heuristicMap }) {
  const sample = rows.slice(0, 5).map((r) => r.rawJson);
  const system = String(config.interpreterPrompt || "").trim()
    ? `${String(config.interpreterPrompt).trim()}

Also follow these Excel mapping rules:
${DEFAULT_EXCEL_INTERPRETER_SYSTEM}`
    : DEFAULT_EXCEL_INTERPRETER_SYSTEM;

  const result = await chatCompletion({
    provider: config.interpreterProvider,
    model: config.interpreterModel,
    system,
    user: JSON.stringify(
      {
        headers,
        sampleRows: sample,
        heuristicColumnMap: heuristicMap || rows[0]?._columnMap || {},
        hint: "Prefer mapping keyword-like headers (including secondary SEO keywords) to keywords.",
      },
      null,
      2
    ),
    siteConfig: config,
    jsonMode: true,
    maxTokens: 4000,
  });

  const aiMapRaw = result.json?.columnMap && typeof result.json.columnMap === "object"
    ? result.json.columnMap
    : {};

  // Merge AI map over heuristic; ignore → drop
  const merged = { ...(heuristicMap || rows[0]?._columnMap || {}) };
  for (const [header, field] of Object.entries(aiMapRaw)) {
    const f = String(field || "").trim();
    if (!f || f === "ignore") {
      delete merged[header];
      continue;
    }
    if (!QUEUE_FIELDS.includes(f)) continue;
    const h = normHeader(header);
    const role = /\b(secondary|supporting|related|lsi|long\s*tail)\b/.test(h)
      ? "secondary"
      : f === "keywords"
        ? "primary"
        : null;
    merged[header] = {
      field: f,
      score: 100,
      role: f === "keywords" ? role : null,
    };
  }

  // If AI returned legacy per-row format, still honor those cells as overrides
  const aiRows = Array.isArray(result.json?.rows) ? result.json.rows : [];
  const byIndex = new Map(aiRows.map((r) => [Number(r.rowIndex), r]));

  const refined = rows.map((row, idx) => {
    const fromMap = applyColumnMap(row.rawJson || {}, merged);
    const ai = byIndex.get(idx) || byIndex.get(row.rowIndex) || {};
    const keywords = joinUnique([
      ai.keywords,
      fromMap.keywords,
      row.keywords,
    ]);
    const topic =
      String(ai.topic || fromMap.topic || row.topic || "").trim() ||
      keywords.split("\n")[0] ||
      `Row ${idx + 1}`;
    return {
      ...row,
      topic,
      keywords,
      seedContext: String(ai.seedContext || ai.seed_context || fromMap.seedContext || row.seedContext || "").trim(),
      imagePrompt: String(ai.imagePrompt || ai.image_prompt || fromMap.imagePrompt || row.imagePrompt || "").trim(),
      audience: String(ai.audience || fromMap.audience || row.audience || "").trim(),
      ctaText: String(ai.ctaText || ai.cta_text || fromMap.ctaText || row.ctaText || "").trim(),
      ctaUrl: String(ai.ctaUrl || ai.cta_url || fromMap.ctaUrl || row.ctaUrl || "").trim(),
      notes: String(ai.notes || fromMap.notes || row.notes || "").trim(),
      _columnMap: merged,
    };
  });

  return {
    rows: refined,
    columnMap: merged,
    usage: { costUsd: result.costUsd, model: result.model, provider: result.provider },
  };
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
        columnMap: parsed.columnMap,
      });
      rows = interpreted.rows;
      usage = interpreted.usage;
    } catch (err) {
      console.warn(`[excelQueue] AI interpret skipped: ${err.message}`);
    }
  }

  // Never persist internal mapping helpers on queue rows
  const cleanRows = rows.map(({ _columnMap, ...rest }) => rest);

  const campaign = await createCampaignFromRows({
    siteLink,
    fileName: parsed.fileName,
    headers: parsed.headers,
    rows: cleanRows,
  });

  return {
    campaign,
    usage,
    sheetName: parsed.sheetName,
    columnMap: rows[0]?._columnMap || parsed.columnMap || {},
  };
}
