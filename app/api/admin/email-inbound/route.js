import { requirePermission } from "@/lib/middleware/auth";
import { PERMISSIONS } from "@/lib/rbac";
import { getSitePostConfig } from "@/lib/postPublishConfig.js";
import { getSitePublishConfig } from "@/lib/blogPublishConfig.js";
import { testImapConnection, pullEmailPostsForSite, pullEmailBlogsForSite } from "@/lib/emailInboundPull.js";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    await requirePermission(PERMISSIONS.VIEW_ALL_DATA);
    const body = await req.json();
    const contentType = String(body.contentType || "post").toLowerCase();
    const siteKey = String(body.siteKey || body.siteLink || body.site || "").trim();
    const action = String(body.action || "pull").toLowerCase();

    if (!siteKey) return Response.json({ error: "siteKey is required." }, { status: 400 });

    if (contentType === "blog") {
      const config = await getSitePublishConfig(siteKey);
      if (!config) return Response.json({ error: "Save blog publish settings first." }, { status: 404 });
      if (action === "test") {
        const result = await testImapConnection(config);
        return Response.json({ ok: true, result });
      }
      const result = await pullEmailBlogsForSite(siteKey, { force: true, acceptAllSubjects: Boolean(body.acceptAllSubjects) });
      return Response.json(result);
    }

    const config = await getSitePostConfig(siteKey);
    if (!config) return Response.json({ error: "Save post settings first." }, { status: 404 });
    if (action === "test") {
      const result = await testImapConnection(config);
      return Response.json({ ok: true, result });
    }
    const result = await pullEmailPostsForSite(siteKey, { force: true });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message || "Email inbound failed." }, { status: error.status || 500 });
  }
}
