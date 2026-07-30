import { requireAdminRoute } from "../../../../../../lib/adminAuth";

import { listWordpressPullCandidates } from "@/lib/wordpressPull.js";

export const runtime = "nodejs";

/** POST — list WordPress posts available to pull (no import). */
export async function POST(req) {
  try {
    await requireAdminRoute(req);
    const body = await req.json();
    const siteLink = String(body.siteLink || body.url || "").trim();
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });

    const result = await listWordpressPullCandidates(siteLink, {
      statuses: Array.isArray(body.statuses) && body.statuses.length
        ? body.statuses
        : ["draft", "future", "pending"],
      onlyScheduled: Boolean(body.onlyScheduled),
      perPage: body.perPage || 50,
      maxPages: body.maxPages || 6,
    });

    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to list WordPress posts." },
      { status: error.status || 500 }
    );
  }
}
