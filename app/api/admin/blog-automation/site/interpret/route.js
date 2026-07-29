import { requirePermission } from "@/lib/middleware/auth";
import { PERMISSIONS } from "@/lib/rbac";
import { getSiteStudioConfig, ENGINE_INTERNAL, getEngineMode } from "@/lib/blogStudio/engine.js";
import { extractTextFromUpload, interpretDocument } from "@/lib/blogStudio/interpreter.js";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    await requirePermission(PERMISSIONS.VIEW_ALL_DATA);
    const mode = await getEngineMode();
    if (mode !== ENGINE_INTERNAL) {
      return Response.json(
        { error: "Switch Engine to Internal Studio before using the interpreter." },
        { status: 409 }
      );
    }

    const url = new URL(req.url);
    const siteLink = String(url.searchParams.get("siteLink") || "").trim();
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });

    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return Response.json({ error: "Upload a .txt or .docx file as `file`." }, { status: 400 });
    }

    const config = await getSiteStudioConfig(siteLink);
    const text = await extractTextFromUpload(file);
    const result = await interpretDocument({ config, text });

    return Response.json({
      fields: result.fields,
      usage: result.usage,
      chars: text.length,
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to interpret document." },
      { status: error.status || 500 }
    );
  }
}