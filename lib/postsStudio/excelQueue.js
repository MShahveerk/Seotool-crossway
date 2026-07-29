/**
 * Excel / CSV campaign queue for Post Automation Studio.
 */
import * as XLSX from "xlsx";
import prisma from "../prisma.js";
import { chatCompletion } from "../blogStudio/providers.js";
import { getSiteStudioConfig } from "./engine.js";
import { DEFAULT_INTERPRETER_PROMPT } from "./defaults.js";

export const EXCEL_MAX_ROWS = 50;

export const QUEUE_FIELDS = [
  "topic",
  "keywords",
  "seedContext",
  "imagePrompt",
  "platform",
  "ctaText",
  "ctaUrl",
  "notes",
];

const FIELD_PATTERNS = {
  topic: [
    { re: /^(topic|title|post title\/?angle|post title|angle|subject|headline|hook)$/, score: 100 },
    { re: /\b(post title|title\/angle|headline|hook|angle)\b/, score: 90 },
    { re: /\btopic\b/, score: 70 },
  ],
  keywords: [
    { re: /\b(primary|focus|main|target)\b.*\bkeywords?\b/, score: 100, role: "primary" },
    { re: /\bhashtags?\b/, score: 95, role: "secondary" },
    {
      re: /\b(secondary|supporting|related)\b.*\b(keywords?|hashtags?)\b/,
      score: 96,
      role: "secondary",
    },
    { re: /^(keywords?|hashtags?)$/, score: 88, role: "primary" },
    { re: /\bkeywords?\b/, score: 75, role: "primary" },
  ],
  seedContext: [
    { re: /^(caption brief|brief|context|seed|angle notes|copy brief)$/, score: 100 },
    { re: /\b(caption brief|content brief|copy brief)\b/, score: 95 },
    { re: /\b(brief|context|instructions)\b/, score: 80 },
  ],
  imagePrompt: [
    { re: /^(image|image prompt|image direction|visual|visual direction)$/, score: 100 },
    { re: /\b(image prompt|image direction|visual)\b/, score: 95 },
    { re: /\b(image|visual)\b/, score: 70 },
  ],
  platform: [
    { re: /^(platform|channel|network|target platform)$/, score: 100 },
    { re: /\b(platform|facebook|instagram)\b/, score: 80 },
  ],
  ctaText: [
    { re: /^(cta|cta text|call to action)$/, score: 100 },
    { re: /\b(cta text|call to action)\b/, score: 95 },
  ],
  ctaUrl: [
    { re: /^(cta url|cta link|conversion url)$/, score: 100 },
    { re: /\b(cta url|cta link)\b/, score: 95 },
    { re: /^(url|link)$/, score: 40 },
  ],
  notes: [
    { re: /^(notes|extra|comments?)$/, score: 90 },
    { re: /\b(notes|comments?)\b/, score: 60 },
  ],
};

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

export function buildColumnMap(headers = []) {
  const scored = [];
  for (const header of headers) {
    let best = { field: null, score: 0, role: null };
    for (const field of QUEUE_FIELDS) {
      const hit = scoreHeaderForField(header, field);
      if (hit.score > best.score) best = { field, score: hit.score, role: hit.role };
    }
    if (best.score >= 55) scored.push({ header, ...best });
  }
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

function normalizePlatformCell(value) {
  const v = String(value || "").toLowerCase().trim();
  if (v.includes("both") || (v.includes("facebook") && v.includes("instagram"))) return "both";
  if (v.includes("instagram") || v === "ig") return "instagram";
  if (v.includes("facebook") || v === "fb") return "facebook";
  return v || "";
}

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
    platform: normalizePlatformCell(joinUnique(buckets.platform)),
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
      platform: fields.platform || null,
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

export async function interpretSpreadsheetRows({ config, headers, rows, columnMap: heuristicMap }) {
  const sample = rows.slice(0, 5).map((r) => r.rawJson);
  const system = String(config.interpreterPrompt || "").trim() || DEFAULT_INTERPRETER_PROMPT;
  const result = await chatCompletion({
    provider: config.interpreterProvider,
    model: config.interpreterModel,
    system,
    user: JSON.stringify({ headers, sampleRows: sample, heuristicColumnMap: heuristicMap || {} }, null, 2),
    siteConfig: config,
    jsonMode: true,
    maxTokens: 4000,
  });
  const aiMapRaw = result.json?.columnMap && typeof result.json.columnMap === "object" ? result.json.columnMap : {};
  const merged = { ...(heuristicMap || rows[0]?._columnMap || {}) };
  for (const [header, field] of Object.entries(aiMapRaw)) {
    const f = String(field || "").trim();
    if (!f || f === "ignore") {
      delete merged[header];
      continue;
    }
    if (!QUEUE_FIELDS.includes(f)) continue;
    const h = normHeader(header);
    const role = /\b(secondary|supporting|hashtag)\b/.test(h) ? "secondary" : f === "keywords" ? "primary" : null;
    merged[header] = { field: f, score: 100, role: f === "keywords" ? role : null };
  }
  const refined = rows.map((row, idx) => {
    const fromMap = applyColumnMap(row.rawJson || {}, merged);
    return {
      ...row,
      topic: fromMap.topic || row.topic || `Row ${idx + 1}`,
      keywords: fromMap.keywords || row.keywords,
      seedContext: fromMap.seedContext || row.seedContext,
      imagePrompt: fromMap.imagePrompt || row.imagePrompt,
      platform: fromMap.platform || row.platform,
      ctaText: fromMap.ctaText || row.ctaText,
      ctaUrl: fromMap.ctaUrl || row.ctaUrl,
      notes: fromMap.notes || row.notes,
      _columnMap: merged,
    };
  });
  return {
    rows: refined,
    columnMap: merged,
    usage: { costUsd: result.costUsd, model: result.model, provider: result.provider },
  };
}

export async function createCampaignFromRows({ siteLink, fileName, headers, rows, replaceActive = true }) {
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
    await prisma.postAutomationCampaign.updateMany({
      where: { siteLink: link, status: "active" },
      data: { status: "archived" },
    });
  }
  const campaign = await prisma.postAutomationCampaign.create({
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
          platform: r.platform || null,
          ctaText: r.ctaText || null,
          ctaUrl: r.ctaUrl || null,
          notes: r.notes || null,
          rawJson: r.rawJson || null,
        })),
      },
    },
    include: { rows: { orderBy: { rowIndex: "asc" } } },
  });
  await prisma.postAutomationSiteConfig.upsert({
    where: { siteLink: link },
    create: { siteLink: link, autoSource: "excel", autoEnabled: false },
    update: { autoSource: "excel" },
  });
  return campaign;
}

export async function getActiveCampaign(siteLink) {
  return prisma.postAutomationCampaign.findFirst({
    where: { siteLink: String(siteLink || "").trim(), status: "active" },
    include: { rows: { orderBy: { rowIndex: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
}

function sameLocalDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function computeExcelSchedule({ siteConfig, campaign, now = new Date() } = {}) {
  const rows = Array.isArray(campaign?.rows) ? campaign.rows : [];
  const processingRow = rows.find((r) => r.status === "processing") || null;
  const nextPending = rows.find((r) => r.status === "pending") || null;
  const intervalMinutes = Math.max(5, Math.round(Number(siteConfig?.autoIntervalMinutes) || 720));
  const autoEnabled = Boolean(siteConfig?.autoEnabled);
  const autoSource = String(siteConfig?.autoSource || "seed").toLowerCase() === "excel" ? "excel" : "seed";
  const lastAutoAt = siteConfig?.lastAutoAt ? new Date(siteConfig.lastAutoAt) : null;
  const nextRunAt = lastAutoAt ? new Date(lastAutoAt.getTime() + intervalMinutes * 60_000) : now;
  const due = !lastAutoAt || now.getTime() >= nextRunAt.getTime();
  const effectiveRunAt = due ? now : nextRunAt;
  const scheduledForToday = sameLocalDay(effectiveRunAt, now);
  const nextRow = processingRow || nextPending;
  const todaysRow = scheduledForToday || due ? nextRow : null;
  let statusLabel = "Idle";
  if (autoSource !== "excel") statusLabel = "Excel source off";
  else if (!campaign) statusLabel = "No campaign";
  else if (!nextRow) statusLabel = "Queue complete";
  else if (processingRow) statusLabel = "Running now";
  else if (!autoEnabled) statusLabel = "Paused — next row ready";
  else if (due) statusLabel = "Due now — next cron tick";
  else if (scheduledForToday) statusLabel = "Scheduled today";
  else statusLabel = "Scheduled upcoming";
  return {
    autoEnabled,
    autoSource,
    intervalMinutes,
    lastAutoAt: lastAutoAt ? lastAutoAt.toISOString() : null,
    nextRunAt: effectiveRunAt.toISOString(),
    due,
    scheduledForToday,
    statusLabel,
    todaysRowId: todaysRow?.id || null,
    todaysRowIndex: todaysRow != null ? todaysRow.rowIndex : null,
    todaysTopic: todaysRow?.topic || null,
    todaysStatus: todaysRow?.status || null,
    nextRowId: nextRow?.id || null,
    nextRowIndex: nextRow != null ? nextRow.rowIndex : null,
    nextTopic: nextRow?.topic || null,
    pendingCount: rows.filter((r) => r.status === "pending").length,
    doneCount: rows.filter((r) => r.status === "done").length,
  };
}

export async function getExcelQueuePayload(siteLink) {
  const { sanitizeSiteConfigForClient } = await import("./engine.js");
  const config = await getSiteStudioConfig(siteLink);
  const campaign = await getActiveCampaign(siteLink);
  const schedule = computeExcelSchedule({ siteConfig: config, campaign });
  return {
    campaign,
    schedule,
    maxRows: EXCEL_MAX_ROWS,
    config: sanitizeSiteConfigForClient(config),
  };
}

export async function updateQueueRow(rowId, patch = {}) {
  const data = {};
  for (const key of [
    "topic",
    "keywords",
    "seedContext",
    "imagePrompt",
    "platform",
    "ctaText",
    "ctaUrl",
    "notes",
    "status",
  ]) {
    if (patch[key] !== undefined) data[key] = patch[key] === "" ? null : patch[key];
  }
  if (data.topic != null) data.topic = String(data.topic).slice(0, 512);
  if (data.platform != null) data.platform = normalizePlatformCell(data.platform) || null;
  return prisma.postAutomationQueueRow.update({ where: { id: rowId }, data });
}

export async function bulkUpdateQueueRows(updates = []) {
  const results = [];
  for (const u of updates) {
    if (!u?.id) continue;
    results.push(await updateQueueRow(u.id, u));
  }
  return results;
}

export async function claimNextQueueRow(siteLink) {
  const link = String(siteLink || "").trim();
  const campaign = await getActiveCampaign(link);
  if (!campaign) return null;
  const row = campaign.rows.find((r) => r.status === "pending");
  if (!row) {
    if (campaign.rows.every((r) => ["done", "skipped"].includes(r.status))) {
      await prisma.postAutomationCampaign.update({
        where: { id: campaign.id },
        data: { status: "completed" },
      });
    }
    return null;
  }
  return prisma.postAutomationQueueRow.update({
    where: { id: row.id },
    data: { status: "processing" },
  });
}

export async function markQueueRowResult(rowId, { status, runId, approvalId, errorMessage } = {}) {
  const nextStatus = status || "done";
  const terminal = ["done", "failed", "skipped"].includes(nextStatus);
  return prisma.postAutomationQueueRow.update({
    where: { id: rowId },
    data: {
      status: nextStatus,
      runId: runId || undefined,
      approvalId: approvalId || undefined,
      errorMessage: errorMessage !== undefined ? errorMessage : undefined,
      processedAt: terminal ? new Date() : undefined,
    },
  });
}

export async function uploadAndImportSpreadsheet({ siteLink, file, useAi = true } = {}) {
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
      console.warn(`[postsExcel] AI interpret skipped: ${err.message}`);
    }
  }
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
