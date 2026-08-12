import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../api/auth/[...nextauth]/route";
import { canAccessSection } from "@/lib/modulePermissions";
import { buildSerpAnalysis } from "@/lib/serpAnalysis";
import { isSerpApiConfigured } from "@/lib/serpapi";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!canAccessSection(session.user, "serp-analysis")) {
      return NextResponse.json({ error: "Forbidden: Access to SERP Analysis is not granted." }, { status: 403 });
    }

    if (!isSerpApiConfigured()) {
      return NextResponse.json(
        { error: "SerpApi is not configured. Add SERPAPI_API_KEY to your environment." },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { keyword = "", siteUrl = "", location = "", device = "desktop", depth = 100, geo = "us" } = body;

    if (!String(keyword).trim()) {
      return NextResponse.json({ error: "Please enter a target keyword or phrase." }, { status: 400 });
    }

    const ALLOWED_GEO = new Set(["us", "uk", "ca", "au", "pk"]);

    const data = await buildSerpAnalysis(siteUrl, keyword, {
      location,
      device: device === "mobile" ? "mobile" : "desktop",
      geo: ALLOWED_GEO.has(String(geo).toLowerCase()) ? String(geo).toLowerCase() : "us",
      depth: Math.min(100, Math.max(10, Number(depth) || 30)),
    });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[SERP Analysis API Error]:", err);
    const status = err.status && Number.isInteger(err.status) ? err.status : 500;
    return NextResponse.json({ success: false, error: err.message || "Failed to analyze SERP" }, { status });
  }
}
