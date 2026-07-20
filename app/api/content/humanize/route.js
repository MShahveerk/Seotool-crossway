import { requireAuth } from "../../../../lib/middleware/auth";
import { humanizeText } from "../../../../lib/openrouter.js";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    await requireAuth();
    const body = await req.json();
    const type = body.type === "blog" ? "blog" : "caption";
    const text = String(body.text || "");
    const result = await humanizeText(text, type);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const status = error.status || 500;
    return Response.json({ ok: false, error: error.message || "Humanize failed." }, { status });
  }
}
