import { requireAdminRoute } from "../../../../../../lib/adminAuth";
import { researchSiteProfile } from "@/lib/seoAutopilot/siteResearch.js";
import {
  getAutopilotConfig,
  saveAutopilotConfig,
  sanitizeAutopilotConfigForClient,
} from "@/lib/seoAutopilot/engine.js";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    await requireAdminRoute(req, "seo-autopilot");
    const url = new URL(req.url);
    const siteLink = String(url.searchParams.get("siteLink") || "").trim();
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const persist = body.persist !== false;

    const { profile, meta } = await researchSiteProfile(siteLink);
    let config = null;
    if (persist) {
      const existing = await getAutopilotConfig(siteLink);
      config = await saveAutopilotConfig(siteLink, {
        ...existing,
        ...profile,
        // Keep existing brandNotes if research didn't add any and user already has notes
        brandNotes: profile.brandNotes || existing.brandNotes || "",
      });
      config = sanitizeAutopilotConfigForClient(config);
    }

    return Response.json({ profile, meta, config });
  } catch (error) {
    return Response.json(
      { error: error.message || "Site research failed." },
      { status: error.status || 500 }
    );
  }
}
