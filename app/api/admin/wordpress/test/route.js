import { requirePermission } from "../../../../../lib/middleware/auth";
import { PERMISSIONS } from "../../../../../lib/rbac";
import { getSitePublishConfig } from "../../../../../lib/blogPublishConfig.js";
import { testWordpressConnection } from "../../../../../lib/wordpressClient.js";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    await requirePermission(PERMISSIONS.VIEW_ALL_DATA);
    const body = await req.json();
    const siteLink = String(body.siteLink || body.url || "").trim();

    let config = null;
    if (siteLink) {
      config = await getSitePublishConfig(siteLink);
    }

    const testConfig = {
      wordpressUrl: body.wordpressUrl || config?.wordpressUrl,
      wordpressUsername: body.wordpressUsername || config?.wordpressUsername,
      wordpressAppPassword: config?.wordpressAppPassword || "",
    };

    const rawPassword = String(body.wordpressAppPassword || "").trim();
    if (rawPassword && rawPassword !== "••••••••") {
      testConfig.wordpressAppPassword = rawPassword.replace(/\s+/g, "");
    }

    if (!testConfig.wordpressAppPassword) {
      return Response.json(
        { ok: false, error: "Paste the WordPress application password and click Save publish settings before testing." },
        { status: 400 }
      );
    }

    const result = await testWordpressConnection(testConfig);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const status = error.response?.status || error.status || 500;
    const detail = error.response?.data?.message || error.message || "WordPress connection failed.";
    return Response.json({ ok: false, error: detail }, { status: status >= 400 && status < 600 ? status : 500 });
  }
}
