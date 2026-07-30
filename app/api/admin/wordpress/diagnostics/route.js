import { requireAdminRoute } from "../../../../../lib/adminAuth";

import { getSitePublishConfig } from "../../../../../lib/blogPublishConfig.js";
import { resolveEffectiveWordpressCredentials, runWordpressDiagnostics } from "../../../../../lib/wordpressDiagnostics.js";
import { logWordpress } from "../../../../../lib/wordpressLogger.js";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    await requireAdminRoute(req);
    const body = await req.json();
    const siteLink = String(body.siteLink || body.url || "").trim();
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });

    const savedConfig = await getSitePublishConfig(siteLink);
    const effective = resolveEffectiveWordpressCredentials({ savedConfig, body });
    logWordpress("diagnostics_start", {
      siteLink,
      wordpressUrl: effective.wordpressUrl,
      wordpressUsername: effective.wordpressUsername,
      passwordSource: effective.passwordSource,
      password: effective.effectivePassword,
    });

    const diagnostics = await runWordpressDiagnostics(
      {
        wordpressUrl: effective.wordpressUrl,
        wordpressUsername: effective.wordpressUsername,
        wordpressAppPassword: effective.wordpressAppPassword,
      },
      { selectedSite: siteLink, savedConfig, body, effective }
    );

    return Response.json({ ok: true, ...diagnostics });
  } catch (error) {
    return Response.json({ ok: false, error: error.message || "Diagnostics failed." }, { status: 500 });
  }
}
