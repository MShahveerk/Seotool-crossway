import { requireAdminRoute } from "../../../../../../lib/adminAuth";
import { ENGINE_INTERNAL, getEngineMode } from "@/lib/blogStudio/engine.js";
import {
  enqueueResearchRun,
  estimateResearchCredits,
  isWebsiteProject,
} from "@/lib/blogStudio/researchRunner.js";
import { RESEARCH_DEPTH, RESEARCH_MARKETS } from "@/lib/blogStudio/researchDefaults.js";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req) {
  try {
    await requireAdminRoute(req, "blog-automation");
    return Response.json({
      depths: RESEARCH_DEPTH,
      markets: RESEARCH_MARKETS,
      estimateDeep: estimateResearchCredits("deep"),
      estimateStandard: estimateResearchCredits("standard"),
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to load research estimates." },
      { status: error.status || 500 }
    );
  }
}

export async function POST(req) {
  try {
    const session = await requireAdminRoute(req, "blog-automation");
    const mode = await getEngineMode();
    if (mode !== ENGINE_INTERNAL) {
      return Response.json(
        { error: "Switch Engine to Internal Studio before running research." },
        { status: 409 }
      );
    }

    const url = new URL(req.url);
    const siteLink = String(url.searchParams.get("siteLink") || "").trim();
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });
    if (!isWebsiteProject(siteLink)) {
      return Response.json(
        { error: "Select a website project. Keyword research needs a real domain." },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const run = await enqueueResearchRun({
      siteLink,
      triggeredById: session.user.id,
      depth: body.depth || "deep",
      market: body.market || "us",
    });

    return Response.json(
      { run, estimatedCredits: estimateResearchCredits(body.depth || "deep") },
      { status: 202 }
    );
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to start keyword research." },
      { status: error.status || 500 }
    );
  }
}
