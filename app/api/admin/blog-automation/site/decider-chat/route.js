import { requireAdminRoute } from "../../../../../../lib/adminAuth";

import { ENGINE_INTERNAL, getEngineMode } from "@/lib/blogStudio/engine.js";
import { runDeciderChatTurn } from "@/lib/blogStudio/deciderChat.js";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req) {
  try {
    await requireAdminRoute(req, "blog-automation");
    const mode = await getEngineMode();
    if (mode !== ENGINE_INTERNAL) {
      return Response.json(
        { error: "Switch Engine to Internal Studio before briefing a topic." },
        { status: 409 }
      );
    }

    const url = new URL(req.url);
    const siteLink = String(url.searchParams.get("siteLink") || "").trim();
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const turn = await runDeciderChatTurn({
      siteLink,
      messages: Array.isArray(body.messages) ? body.messages : [],
    });

    return Response.json(turn);
  } catch (error) {
    return Response.json(
      { error: error.message || "Topic Decider chat failed.", code: error.code || null },
      { status: error.status || 500 }
    );
  }
}
