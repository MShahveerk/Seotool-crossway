import { requirePermission } from "../../../../../lib/middleware/auth";
import { PERMISSIONS } from "../../../../../lib/rbac";
import { getSitePublishConfig } from "../../../../../lib/blogPublishConfig.js";
import { testWordpressConnection } from "../../../../../lib/wordpressClient.js";
import { resolveEffectiveWordpressCredentials, runWordpressDiagnostics } from "../../../../../lib/wordpressDiagnostics.js";
import { logWordpressConfig, logWordpress } from "../../../../../lib/wordpressLogger.js";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    await requirePermission(PERMISSIONS.VIEW_ALL_DATA);
    const body = await req.json();
    const siteLink = String(body.siteLink || body.url || "").trim();

    const savedConfig = siteLink ? await getSitePublishConfig(siteLink) : null;
    const effective = resolveEffectiveWordpressCredentials({ savedConfig, body });

    logWordpressConfig("test_start", {
      siteLink,
      url: effective.wordpressUrl,
      username: effective.wordpressUsername,
      password: effective.wordpressAppPassword,
      passwordSource: effective.passwordSource,
    });

    const testConfig = {
      wordpressUrl: effective.wordpressUrl,
      wordpressUsername: effective.wordpressUsername,
      wordpressAppPassword: effective.wordpressAppPassword,
    };

    if (!testConfig.wordpressAppPassword) {
      const diagnostics = await runWordpressDiagnostics(testConfig, {
        selectedSite: siteLink,
        savedConfig,
        body,
        effective,
      });
      return Response.json(
        {
          ok: false,
          error: "Paste the WordPress application password and click Save publish settings before testing.",
          diagnostics,
        },
        { status: 400 }
      );
    }

    const [result, diagnostics] = await Promise.all([
      testWordpressConnection(testConfig),
      runWordpressDiagnostics(testConfig, { selectedSite: siteLink, savedConfig, body, effective }),
    ]);

    logWordpress("test_complete", {
      siteLink,
      ok: true,
      name: result.name,
      roles: result.roles,
      wordpressUrl: result.wordpressUrl,
      apiTotal: result.apiTotal,
      diagnosis: result.diagnosis || diagnostics?.access?.diagnosis || null,
    });

    return Response.json({ ok: true, ...result, diagnostics });
  } catch (error) {
    const status = error.response?.status || error.status || 500;
    const detail = error.response?.data?.message || error.message || "WordPress connection failed.";
    return Response.json({ ok: false, error: detail }, { status: status >= 400 && status < 600 ? status : 500 });
  }
}
