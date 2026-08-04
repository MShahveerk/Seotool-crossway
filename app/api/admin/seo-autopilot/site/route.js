import { requireAdminRoute } from "../../../../../lib/adminAuth";
import {
  getAutopilotConfig,
  saveAutopilotConfig,
  sanitizeAutopilotConfigForClient,
} from "@/lib/seoAutopilot/engine.js";
import { buildAutopilotContext } from "@/lib/seoAutopilot/context.js";
import { enrichScorecard } from "@/lib/seoAutopilot/scorecardEnrich.js";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

function siteFrom(req) {
  const url = new URL(req.url);
  return String(url.searchParams.get("siteLink") || "").trim();
}

function scorecardNeedsHeal(sc) {
  if (!sc || typeof sc !== "object") return false;
  if (sc.enriched && Number(sc.googleHealthScore) > 0) return false;
  const health = Number(sc.googleHealthScore);
  const summary = String(sc.summary || "").trim();
  const problems = Array.isArray(sc.topProblems) ? sc.topProblems : [];
  return !(health > 0) || summary.length < 40 || problems.length === 0;
}

async function healScorecardIfNeeded(siteLink, config) {
  const sc = config?.latestScorecardJson;
  if (!scorecardNeedsHeal(sc)) return config;
  try {
    const ctx = await buildAutopilotContext(siteLink, config);
    const healed = enrichScorecard({
      auditorData: sc || {},
      context: ctx,
      config,
      geoData: sc?.geo || null,
    });
    if (sc?.tracker) healed.tracker = sc.tracker;
    await prisma.seoAutopilotSiteConfig.updateMany({
      where: { siteLink },
      data: { latestScorecardJson: healed },
    });
    return { ...config, latestScorecardJson: healed };
  } catch {
    return config;
  }
}

export async function GET(req) {
  try {
    await requireAdminRoute(req, "seo-autopilot");
    const siteLink = siteFrom(req);
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });
    let config = await getAutopilotConfig(siteLink);
    config = await healScorecardIfNeeded(siteLink, config);
    return Response.json({ config: sanitizeAutopilotConfigForClient(config) });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to load SEO Autopilot config." },
      { status: error.status || 500 }
    );
  }
}

export async function PUT(req) {
  try {
    await requireAdminRoute(req, "seo-autopilot");
    const siteLink = siteFrom(req);
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });
    const body = await req.json();
    const config = await saveAutopilotConfig(siteLink, body || {});
    return Response.json({ config: sanitizeAutopilotConfigForClient(config) });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to save SEO Autopilot config." },
      { status: error.status || 500 }
    );
  }
}
