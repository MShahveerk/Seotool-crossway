import { requirePermission } from "../../../../../lib/middleware/auth";
import { PERMISSIONS } from "../../../../../lib/rbac";
import { pullWordpressDraftsForSite } from "../../../../../lib/wordpressPull.js";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const session = await requirePermission(PERMISSIONS.VIEW_ALL_DATA);
    const body = await req.json();
    const siteLink = String(body.siteLink || body.url || "").trim();
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });

    const result = await pullWordpressDraftsForSite(siteLink, {
      force: true,
      operatorUser: session.user,
      perPage: body.perPage || 50,
      statuses: Array.isArray(body.statuses) && body.statuses.length ? body.statuses : ["draft", "future", "pending"],
    });

    return Response.json({ ok: true, ...result });
  } catch (error) {
    const status = error.status || 500;
    return Response.json({ error: error.message || "WordPress pull failed." }, { status });
  }
}
