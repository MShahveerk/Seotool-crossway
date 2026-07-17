import { requirePermission } from "../../../../../lib/middleware/auth";
import { PERMISSIONS } from "../../../../../lib/rbac";
import { pullWordpressDraftsForSite } from "../../../../../lib/wordpressPull.js";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    await requirePermission(PERMISSIONS.VIEW_ALL_DATA);
    const body = await req.json();
    const siteLink = String(body.siteLink || body.url || "").trim();
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });

    const result = await pullWordpressDraftsForSite(siteLink, {
      force: true,
      perPage: body.perPage || 25,
      statuses: Array.isArray(body.statuses) ? body.statuses : undefined,
    });

    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ error: error.message || "WordPress pull failed." }, { status: error.status || 500 });
  }
}
