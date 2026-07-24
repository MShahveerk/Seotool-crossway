import { requirePermission } from "../../../../../lib/middleware/auth";
import { PERMISSIONS } from "../../../../../lib/rbac";
import { triggerBlogWebhook, getBlogAutomationHistory } from "../../../../../lib/blogAutomation.js";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const session = await requirePermission(PERMISSIONS.VIEW_ALL_DATA);
    const body = await req.json().catch(() => ({}));
    const run = await triggerBlogWebhook({
      prompt: body.prompt || "",
      source: "manual",
      triggeredBy: session.user?.email || null,
    });
    const history = await getBlogAutomationHistory();
    return Response.json({ ok: true, run, history });
  } catch (error) {
    const history = await getBlogAutomationHistory().catch(() => []);
    return Response.json(
      { ok: false, error: error.message || "Webhook trigger failed.", run: error.run || null, history },
      { status: error.status || 500 }
    );
  }
}
