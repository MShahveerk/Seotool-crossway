import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { canAccessSection } from "@/lib/modulePermissions";
import {
  fetchKeywordIdeas,
  fetchHistoricalMetrics,
  resolveGeoTarget,
} from "@/lib/keywordPlanner";
import { isGoogleAdsConfigured, testGoogleAdsConnection } from "@/lib/googleAds";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!canAccessSection(session.user, "google-ads-planner") && !canAccessSection(session.user, "keyword-research")) {
      return NextResponse.json({ error: "Forbidden: Access to Google Ads Planner is not granted." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { mode = "ideas", query = "", keywords = [], siteUrl = "", geo = "us" } = body;

    const configured = isGoogleAdsConfigured();
    if (!configured) {
      const diag = await testGoogleAdsConnection().catch((err) => ({ ok: false, error: err.message }));
      return NextResponse.json(
        {
          configured: false,
          error: "Google Ads API is not fully configured.",
          diagnostics: diag,
        },
        { status: 400 }
      );
    }

    const geoInfo = resolveGeoTarget(geo);

    if (mode === "ideas") {
      const seedList = typeof query === "string" ? query.split(",").map((s) => s.trim()).filter(Boolean) : [];
      const cleanUrl = siteUrl ? String(siteUrl).trim() : null;

      const ideas = await fetchKeywordIdeas(cleanUrl, seedList, { geoTargetId: geoInfo.id });
      return NextResponse.json({
        success: true,
        configured: true,
        geo: geoInfo,
        mode: "ideas",
        count: ideas.length,
        items: ideas,
      });
    }

    if (mode === "metrics") {
      const listToFetch = Array.isArray(keywords) && keywords.length > 0
        ? keywords
        : typeof query === "string"
        ? query.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
        : [];

      if (!listToFetch.length) {
        return NextResponse.json({ error: "Please provide at least one keyword for metrics lookup." }, { status: 400 });
      }

      const metricsMap = await fetchHistoricalMetrics(listToFetch, { geoTargetId: geoInfo.id });
      const items = Array.from(metricsMap.values());

      return NextResponse.json({
        success: true,
        configured: true,
        geo: geoInfo,
        mode: "metrics",
        count: items.length,
        items,
      });
    }

    return NextResponse.json({ error: "Invalid mode. Use 'ideas' or 'metrics'." }, { status: 400 });
  } catch (err) {
    console.error("[Google Ads Planner API Error]:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Failed to query Google Ads Keyword Planner.",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const configured = isGoogleAdsConfigured();
    const diagnostics = configured ? await testGoogleAdsConnection() : null;

    return NextResponse.json({
      configured,
      diagnostics,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
