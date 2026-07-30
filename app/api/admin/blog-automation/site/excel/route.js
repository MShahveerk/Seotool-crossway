import { requireAdminRoute } from "../../../../../../lib/adminAuth";

import { ENGINE_INTERNAL, getEngineMode } from "@/lib/blogStudio/engine.js";
import {
  getActiveCampaign,
  getExcelQueuePayload,
  uploadAndImportSpreadsheet,
  bulkUpdateQueueRows,
  computeExcelSchedule,
  EXCEL_MAX_ROWS,
} from "@/lib/blogStudio/excelQueue.js";
import { getSiteStudioConfig } from "@/lib/blogStudio/engine.js";

export const runtime = "nodejs";

function siteFrom(req) {
  return String(new URL(req.url).searchParams.get("siteLink") || "").trim();
}

/** GET active campaign + rows + today's schedule */
export async function GET(req) {
  try {
    await requireAdminRoute(req, "blog-automation");
    const siteLink = siteFrom(req);
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });
    const payload = await getExcelQueuePayload(siteLink);
    return Response.json(payload);
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to load excel queue." },
      { status: error.status || 500 }
    );
  }
}

/** POST multipart upload (.xlsx / .xls / .csv) */
export async function POST(req) {
  try {
    await requireAdminRoute(req, "blog-automation");
    const mode = await getEngineMode();
    if (mode !== ENGINE_INTERNAL) {
      return Response.json(
        { error: "Switch Engine to Internal Studio before uploading Excel campaigns." },
        { status: 409 }
      );
    }

    const siteLink = siteFrom(req);
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });

    const form = await req.formData();
    const file = form.get("file");
    const useAi = String(form.get("useAi") || "1") !== "0";
    if (!file || typeof file === "string") {
      return Response.json({ error: "Upload an .xlsx, .xls, or .csv file as `file`." }, { status: 400 });
    }

    const name = String(file.name || "").toLowerCase();
    if (!/\.(xlsx|xls|csv)$/i.test(name)) {
      return Response.json({ error: "Supported formats: .xlsx, .xls, .csv" }, { status: 400 });
    }

    const result = await uploadAndImportSpreadsheet({ siteLink, file, useAi });
    const payload = await getExcelQueuePayload(siteLink);
    return Response.json({
      ...payload,
      usage: result.usage,
      sheetName: result.sheetName,
      columnMap: result.columnMap,
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to import spreadsheet." },
      { status: error.status || 500 }
    );
  }
}

/** PUT bulk cell edits: { rows: [{ id, topic, keywords, ... }] } */
export async function PUT(req) {
  try {
    await requireAdminRoute(req, "blog-automation");
    const siteLink = siteFrom(req);
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });

    const body = await req.json();
    const updates = Array.isArray(body.rows) ? body.rows : [];
    if (!updates.length) {
      return Response.json({ error: "rows array is required." }, { status: 400 });
    }

    // Ensure rows belong to this site
    const { default: prisma } = await import("@/lib/prisma");
    const ids = updates.map((u) => u.id).filter(Boolean);
    const owned = await prisma.blogAutomationQueueRow.findMany({
      where: { id: { in: ids }, siteLink },
      select: { id: true },
    });
    const ownedSet = new Set(owned.map((r) => r.id));
    const safe = updates.filter((u) => ownedSet.has(u.id));
    const rows = await bulkUpdateQueueRows(safe);
    const campaign = await getActiveCampaign(siteLink);
    const siteConfig = await getSiteStudioConfig(siteLink);
    const schedule = computeExcelSchedule({ siteConfig, campaign });
    return Response.json({ rows, campaign, schedule });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to update rows." },
      { status: error.status || 500 }
    );
  }
}
