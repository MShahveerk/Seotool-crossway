import { requireAdminRoute } from "../../../../../lib/adminAuth";

import { generateBlogPrompt } from "../../../../../lib/blogAutomation.js";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    await requireAdminRoute(req, "blog-automation");
    const body = await req.json().catch(() => ({}));
    const result = await generateBlogPrompt({
      topic: body.topic || "",
      notes: body.notes || "",
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(
      { ok: false, error: error.message || "Prompt generation failed." },
      { status: error.status || 500 }
    );
  }
}
