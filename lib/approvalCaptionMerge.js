import { Prisma } from "@prisma/client";

/** Cache: optional columns on `approvals` + timestamp (short TTL so migrate without restart still picks up new cols). */
let approvalOptionalColumnsCache = null;
const COLUMN_CACHE_MS = 60_000;

async function getApprovalOptionalColumns(prisma) {
  const now = Date.now();
  if (approvalOptionalColumnsCache && now - approvalOptionalColumnsCache.at < COLUMN_CACHE_MS) {
    return approvalOptionalColumnsCache.cols;
  }
  try {
    const rows = await prisma.$queryRaw`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'approvals'
    `;
    const names = new Set(
      Array.isArray(rows)
        ? rows.map((r) => String(r.COLUMN_NAME ?? r.column_name ?? "").toLowerCase())
        : []
    );
    approvalOptionalColumnsCache = {
      at: now,
      cols: {
        caption: names.has("caption"),
        userEditedCaption: names.has("user_edited_caption"),
        instructions: names.has("instructions"),
        userEditedInstructions: names.has("user_edited_instructions"),
        userEditedTitle: names.has("user_edited_title"),
      },
    };
  } catch {
    approvalOptionalColumnsCache = {
      at: now,
      cols: {
        caption: false,
        userEditedCaption: false,
        instructions: false,
        userEditedInstructions: false,
        userEditedTitle: false,
      },
    };
  }
  return approvalOptionalColumnsCache.cols;
}

/** Only include keys for columns that were actually selected (so merge does not wipe Prisma fields). */
function extrasFromRow(row, col) {
  const ex = {};
  if (col.caption) {
    ex.caption = row.caption != null ? String(row.caption) : "";
  }
  if (col.userEditedCaption) {
    ex.userEditedCaption =
      row.user_edited_caption === null || row.user_edited_caption === undefined
        ? null
        : String(row.user_edited_caption);
  }
  if (col.instructions) {
    ex.instructions = row.instructions != null ? String(row.instructions) : "";
  }
  if (col.userEditedInstructions) {
    ex.userEditedInstructions =
      row.user_edited_instructions === null || row.user_edited_instructions === undefined
        ? null
        : String(row.user_edited_instructions);
  }
  if (col.userEditedTitle) {
    ex.userEditedTitle =
      row.user_edited_title === null || row.user_edited_title === undefined
        ? null
        : String(row.user_edited_title).trim();
  }
  return ex;
}

/**
 * Load optional assignee/admin text columns by ids via raw SQL so APIs work when
 * @prisma/client predates newer columns (until `prisma generate`).
 * Skips querying missing columns (no MySQL 1054 / prisma:error spam).
 */
export async function fetchCaptionMapByApprovalIds(prisma, ids) {
  const map = new Map();
  if (!Array.isArray(ids) || ids.length === 0) return map;

  const col = await getApprovalOptionalColumns(prisma);
  const selectParts = ["id"];
  if (col.caption) selectParts.push("caption");
  if (col.userEditedCaption) selectParts.push("user_edited_caption");
  if (col.instructions) selectParts.push("instructions");
  if (col.userEditedInstructions) selectParts.push("user_edited_instructions");
  if (col.userEditedTitle) selectParts.push("user_edited_title");

  if (selectParts.length <= 1) return map;

  try {
    const fragment = selectParts.join(", ");
    const rows = await prisma.$queryRaw(
      Prisma.sql`SELECT ${Prisma.raw(fragment)} FROM approvals WHERE id IN (${Prisma.join(ids)})`
    );
    if (Array.isArray(rows)) {
      for (const row of rows) {
        map.set(String(row.id), extrasFromRow(row, col));
      }
    }
  } catch {
    // Table missing or other DB issue
  }
  return map;
}

export function mergeCaptionFieldsIntoApprovals(rows, map) {
  return rows.map((r) => {
    const id = String(r.id);
    const ex = map.get(id);
    const out = { ...r };
    if (ex) {
      if (ex.caption !== undefined) out.caption = ex.caption;
      if (ex.userEditedCaption !== undefined) out.userEditedCaption = ex.userEditedCaption;
      if (ex.instructions !== undefined) out.instructions = ex.instructions;
      if (ex.userEditedInstructions !== undefined) out.userEditedInstructions = ex.userEditedInstructions;
      if (ex.userEditedTitle !== undefined) out.userEditedTitle = ex.userEditedTitle;
    }
    return out;
  });
}

/** Clears column cache (e.g. after migrations). */
export function clearApprovalOptionalColumnsCache() {
  approvalOptionalColumnsCache = null;
}
