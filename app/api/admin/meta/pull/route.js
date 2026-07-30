import { requireAdminRoute } from "../../../../../lib/adminAuth";

import { pullMetaDraftsForSite } from "@/lib/metaDraftPull.js";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    await requireAdminRoute(req, "admin-approvals");
    const body = await req.json().catch(() => ({}));
    const siteKey =
      String(body.siteKey || body.site || req.nextUrl.searchParams.get("siteKey") || "").trim();
    if (!siteKey) return Response.json({ error: "siteKey is required." }, { status: 400 });

    const result = await pullMetaDraftsForSite(siteKey, { force: true });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message || "Meta pull failed." }, { status: error.status || 500 });
  }
}
