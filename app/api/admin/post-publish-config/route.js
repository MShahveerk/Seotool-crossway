import { requirePermission } from "@/lib/middleware/auth";
import { PERMISSIONS } from "@/lib/rbac";
import {
  getSitePostConfig,
  sanitizePostConfigForClient,
  upsertSitePostConfig,
} from "@/lib/postPublishConfig.js";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    await requirePermission(PERMISSIONS.VIEW_ALL_DATA);
    const siteKey = req.nextUrl.searchParams.get("siteKey") || req.nextUrl.searchParams.get("site") || "";
    if (!siteKey) return Response.json({ error: "siteKey is required." }, { status: 400 });
    const config = await getSitePostConfig(siteKey);
    return Response.json({ config: sanitizePostConfigForClient(config) });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to load config." }, { status: error.status || 500 });
  }
}

export async function POST(req) {
  try {
    await requirePermission(PERMISSIONS.VIEW_ALL_DATA);
    const body = await req.json();
    const siteKey = String(body.siteKey || body.site || body.selectedSite || "").trim();
    if (!siteKey) return Response.json({ error: "siteKey is required." }, { status: 400 });

    const existing = await getSitePostConfig(siteKey);
    const merge = { ...body };
    if (merge.inboundSecret === "••••••••") delete merge.inboundSecret;
    if (merge.metaPageAccessToken === "••••••••") delete merge.metaPageAccessToken;
    if (merge.imapPassword === "••••••••") delete merge.imapPassword;
    if (merge.webhookSecret === "••••••••") delete merge.webhookSecret;
    if (merge.apiKey === "••••••••") delete merge.apiKey;

    if (!merge.inboundSecret && existing?.inboundSecret) merge.inboundSecret = existing.inboundSecret;
    if (!merge.metaPageAccessToken && existing?.metaPageAccessToken) {
      merge.metaPageAccessToken = existing.metaPageAccessToken;
    }
    if (!merge.imapPassword && existing?.imapPassword) merge.imapPassword = existing.imapPassword;
    if (!merge.webhookSecret && existing?.webhookSecret) merge.webhookSecret = existing.webhookSecret;
    if (!merge.apiKey && existing?.apiKey) merge.apiKey = existing.apiKey;

    const config = await upsertSitePostConfig(siteKey, merge);
    return Response.json({ config: sanitizePostConfigForClient(config) });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to save config." }, { status: error.status || 500 });
  }
}
