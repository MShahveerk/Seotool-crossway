import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../api/auth/[...nextauth]/route";
import { canAccessSection } from "@/lib/modulePermissions";
import { buildCompetitorMatrix } from "@/lib/competitorAnalysis";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!canAccessSection(session.user, "competitor-matrix") && !canAccessSection(session.user, "keyword-research")) {
      return NextResponse.json({ error: "Forbidden: Access to Competitor Matrix is not granted." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { keyword = "", siteUrl = "", competitorUrls = [] } = body;

    if (!keyword && !competitorUrls.length) {
      return NextResponse.json({ error: "Please enter a target keyword or competitor URLs." }, { status: 400 });
    }

    const matrix = await buildCompetitorMatrix(siteUrl, keyword, competitorUrls);
    return NextResponse.json({
      success: true,
      data: matrix,
    });
  } catch (err) {
    console.error("[Competitor Matrix API Error]:", err);
    return NextResponse.json({ success: false, error: err.message || "Failed to analyze competitors" }, { status: 500 });
  }
}
