import { requirePermission } from "../../../../lib/middleware/auth";
import { PERMISSIONS } from "../../../../lib/rbac";
import {
  getSitePublishConfig,
  sanitizeConfigForClient,
  upsertSitePublishConfig,
} from "../../../../lib/blogPublishConfig.js";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    await requirePermission(PERMISSIONS.VIEW_ALL_DATA);
    const siteLink = req.nextUrl.searchParams.get("siteLink") || req.nextUrl.searchParams.get("url") || "";
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });
    const config = await getSitePublishConfig(siteLink);
    return Response.json({ config: sanitizeConfigForClient(config) });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to load config." }, { status: error.status || 500 });
  }
}

export async function POST(req) {
  try {
    await requirePermission(PERMISSIONS.VIEW_ALL_DATA);
    const body = await req.json();
    const siteLink = String(body.siteLink || body.url || "").trim();
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });

    const existing = await getSitePublishConfig(siteLink);
    const merge = { ...body };
    if (merge.webhookSecret === "••••••••") delete merge.webhookSecret;
    if (merge.apiKey === "••••••••") delete merge.apiKey;
    if (merge.wordpressAppPassword === "••••••••") delete merge.wordpressAppPassword;
    if (merge.inboundSecret === "••••••••") delete merge.inboundSecret;

    if (!merge.webhookSecret && existing?.webhookSecret) merge.webhookSecret = existing.webhookSecret;
    if (!merge.apiKey && existing?.apiKey) merge.apiKey = existing.apiKey;
    if (!merge.wordpressAppPassword && existing?.wordpressAppPassword) merge.wordpressAppPassword = existing.wordpressAppPassword;
    if (!merge.inboundSecret && existing?.inboundSecret) merge.inboundSecret = existing.inboundSecret;

    const config = await upsertSitePublishConfig(siteLink, merge);
    return Response.json({ config: sanitizeConfigForClient(config) });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to save config." }, { status: error.status || 500 });
  }
}
