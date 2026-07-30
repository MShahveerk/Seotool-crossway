import { requireAdminRoute } from "../../../../../lib/adminAuth";

import { getSitePublishConfig } from "../../../../../lib/blogPublishConfig.js";
import { pullWordpressDraftsForSite } from "../../../../../lib/wordpressPull.js";
import { resolveEffectiveWordpressCredentials, runWordpressDiagnostics } from "../../../../../lib/wordpressDiagnostics.js";
import { logWordpress } from "../../../../../lib/wordpressLogger.js";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const session = await requireAdminRoute(req);
    const body = await req.json();
    const siteLink = String(body.siteLink || body.url || "").trim();
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });

    logWordpress("pull_request", {
      siteLink,
      onlyScheduled: Boolean(body.onlyScheduled),
      includeTrash: Boolean(body.includeTrash),
      wordpressPostId: body.wordpressPostId || null,
    });

    const result = await pullWordpressDraftsForSite(siteLink, {
      force: true,
      operatorUser: session.user,
      // Manual pulls re-send approval emails so recipient fixes take effect immediately.
      resendApprovals: true,
      perPage: body.perPage || 50,
      statuses: Array.isArray(body.statuses) && body.statuses.length ? body.statuses : ["draft", "future", "pending"],
      onlyScheduled: Boolean(body.onlyScheduled),
      includeTrash: Boolean(body.includeTrash),
      probeAccess: Boolean(body.probeAccess),
      wordpressPostIds: Array.isArray(body.wordpressPostIds)
        ? body.wordpressPostIds
        : body.wordpressPostId
          ? [body.wordpressPostId]
          : [],
    });

    let diagnostics = null;
    if (body.includeDiagnostics && (!result.imported || !result.updated)) {
      const savedConfig = await getSitePublishConfig(siteLink);
      diagnostics = await runWordpressDiagnostics(
        {
          wordpressUrl: savedConfig?.wordpressUrl,
          wordpressUsername: savedConfig?.wordpressUsername,
          wordpressAppPassword: savedConfig?.wordpressAppPassword,
        },
        { selectedSite: siteLink, savedConfig, body: {}, effective: resolveEffectiveWordpressCredentials({ savedConfig }) }
      );
    }

    return Response.json({ ok: true, ...result, diagnostics });
  } catch (error) {
    const status = error.status || 500;
    return Response.json({ error: error.message || "WordPress pull failed." }, { status });
  }
}
