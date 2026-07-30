import { requireAutoscheduleRoute } from "../../../../lib/adminAuth";

import {
  getAutoscheduleConfig,
  saveAutoscheduleConfig,
  normalizeKind,
} from "@/lib/contentAutoschedule/engine.js";

export const runtime = "nodejs";

function paramsFrom(req) {
  const url = new URL(req.url);
  return {
    kind: normalizeKind(url.searchParams.get("kind")),
    siteLink: String(url.searchParams.get("siteLink") || "").trim(),
  };
}

export async function GET(req) {
  try {
    await requireAutoscheduleRoute(req);
    const { kind, siteLink } = paramsFrom(req);
    if (!kind || !siteLink) {
      return Response.json({ error: "kind and siteLink are required." }, { status: 400 });
    }
    const config = await getAutoscheduleConfig(kind, siteLink);
    return Response.json({ config });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to load autoschedule config." },
      { status: error.status || 500 }
    );
  }
}

export async function PUT(req) {
  try {
    await requireAutoscheduleRoute(req);
    const { kind, siteLink } = paramsFrom(req);
    if (!kind || !siteLink) {
      return Response.json({ error: "kind and siteLink are required." }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const config = await saveAutoscheduleConfig(kind, siteLink, body || {});
    return Response.json({ config });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to save autoschedule config." },
      { status: error.status || 500 }
    );
  }
}
