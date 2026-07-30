import { requireAnySectionRoute } from "../../../../../lib/adminAuth";

import { pullMetaDraftsForSite } from "@/lib/metaDraftPull.js";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    // Used from Post Automation Studio publish config (and Create Post workflows).
    await requireAnySectionRoute(["post-automation", "admin-approvals"]);
    const body = await req.json().catch(() => ({}));
    const siteKey =
      String(body.siteKey || body.site || req.nextUrl.searchParams.get("siteKey") || "").trim();
    if (!siteKey) return Response.json({ error: "siteKey is required." }, { status: 400 });

    const result = await pullMetaDraftsForSite(siteKey, { force: true });
    return Response.json(result);
  } catch (error) {
    const msg = error.message || "Meta pull failed.";
    const forbidden =
      msg === "Unauthorized" || msg.includes("Forbidden") || msg.includes("Insufficient permissions");
    return Response.json({ error: msg }, { status: forbidden ? 403 : error.status || 500 });
  }
}
