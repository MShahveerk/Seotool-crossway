import { requireAdminRoute } from "../../../../../../lib/adminAuth";

import * as XLSX from "xlsx";
import { ENGINE_INTERNAL, getEngineMode, getSiteStudioConfig } from "@/lib/blogStudio/engine.js";
import { readPrefixAgents, writePrefixAgents } from "@/lib/blogStudio/prefixConfig.js";
import {
  OPERATOR_KEYWORD_MAX,
  rowsFromSpreadsheetJson,
  sanitizeOperatorKeywords,
} from "@/lib/blogStudio/operatorKeywords.js";

export const runtime = "nodejs";

function siteFrom(req) {
  return String(new URL(req.url).searchParams.get("siteLink") || "").trim();
}

async function payload(siteLink) {
  const stored = await readPrefixAgents(siteLink);
  const keywords = sanitizeOperatorKeywords(stored.operatorKeywords);
  return {
    keywords,
    useOperatorKeywords: Boolean(stored.useOperatorKeywords),
    importedAt: stored.operatorKeywordsImportedAt || null,
    max: OPERATOR_KEYWORD_MAX,
  };
}

/** GET current keyword bank */
export async function GET(req) {
  try {
    await requireAdminRoute(req, "blog-automation");
    const siteLink = siteFrom(req);
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });
    return Response.json(await payload(siteLink));
  } catch (error) {
    return Response.json({ error: error.message || "Failed to load keywords." }, { status: error.status || 500 });
  }
}

/** POST multipart upload (.xlsx / .xls / .csv) */
export async function POST(req) {
  try {
    await requireAdminRoute(req, "blog-automation");
    const mode = await getEngineMode();
    if (mode !== ENGINE_INTERNAL) {
      return Response.json(
        { error: "Switch Engine to Internal Studio before importing keywords." },
        { status: 409 }
      );
    }
    const siteLink = siteFrom(req);
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });
    await getSiteStudioConfig(siteLink);

    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return Response.json({ error: "Upload an .xlsx, .xls, or .csv file as `file`." }, { status: 400 });
    }
    const name = String(file.name || "").toLowerCase();
    if (!/\.(xlsx|xls|csv)$/i.test(name)) {
      return Response.json({ error: "Supported formats: .xlsx, .xls, or .csv" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheetName = wb.SheetNames.find((n) => !/^instructions$/i.test(n)) || wb.SheetNames[0];
    if (!sheetName) {
      return Response.json({ error: "Spreadsheet has no sheets." }, { status: 400 });
    }
    const objects = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "", raw: false });
    const keywords = sanitizeOperatorKeywords(rowsFromSpreadsheetJson(objects));
    if (!keywords.length) {
      return Response.json(
        { error: "No keywords found. Use a Keyword column (Volume, KD, Notes optional)." },
        { status: 400 }
      );
    }

    await writePrefixAgents(siteLink, {
      operatorKeywords: keywords,
      operatorKeywordsImportedAt: new Date().toISOString(),
    });
    const next = await payload(siteLink);
    return Response.json({ ...next, imported: keywords.length, sheetName });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to import keywords." }, { status: error.status || 500 });
  }
}

/** PUT { useOperatorKeywords, keywords? } */
export async function PUT(req) {
  try {
    await requireAdminRoute(req, "blog-automation");
    const siteLink = siteFrom(req);
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });
    const body = await req.json();
    const patch = {};
    if (body.useOperatorKeywords !== undefined) patch.useOperatorKeywords = Boolean(body.useOperatorKeywords);
    if (body.keywords !== undefined) {
      patch.operatorKeywords = sanitizeOperatorKeywords(body.keywords);
      patch.operatorKeywordsImportedAt = new Date().toISOString();
    }
    if (!Object.keys(patch).length) {
      return Response.json({ error: "Nothing to update." }, { status: 400 });
    }
    await writePrefixAgents(siteLink, patch);
    return Response.json(await payload(siteLink));
  } catch (error) {
    return Response.json({ error: error.message || "Failed to save keywords." }, { status: error.status || 500 });
  }
}

/** DELETE clears the bank (toggle stays as-is). */
export async function DELETE(req) {
  try {
    await requireAdminRoute(req, "blog-automation");
    const siteLink = siteFrom(req);
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });
    await writePrefixAgents(siteLink, {
      operatorKeywords: [],
      operatorKeywordsImportedAt: "",
      useOperatorKeywords: false,
    });
    return Response.json(await payload(siteLink));
  } catch (error) {
    return Response.json({ error: error.message || "Failed to clear keywords." }, { status: error.status || 500 });
  }
}
