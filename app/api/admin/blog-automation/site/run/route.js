import { requireAdminRoute } from "../../../../../../lib/adminAuth";

import { enqueueStudioRun } from "@/lib/blogStudio/runner.js";
import { ENGINE_INTERNAL, getEngineMode } from "@/lib/blogStudio/engine.js";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const session = await requireAdminRoute(req, "blog-automation");
    const mode = await getEngineMode();
    if (mode !== ENGINE_INTERNAL) {
      return Response.json(
        { error: "Switch Engine to Internal Studio before running a draft." },
        { status: 409 }
      );
    }

    const url = new URL(req.url);
    const siteLink = String(url.searchParams.get("siteLink") || "").trim();
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const run = await enqueueStudioRun({
      siteLink,
      topic: body.topic || "",
      trigger: "manual",
      triggeredById: session.user.id,
      generateImage: body.generateImage !== false,
      overrides: body.overrides || null,
    });

    return Response.json({ run }, { status: 202 });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to start studio run." },
      { status: error.status || 500 }
    );
  }
}
