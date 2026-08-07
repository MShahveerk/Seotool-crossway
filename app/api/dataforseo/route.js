import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { canAccessSection } from "@/lib/modulePermissions";
import {
  getDataForSeoCredentials,
  fetchKeywordVolumeData,
  fetchSerpData,
  fetchBacklinksSummary,
} from "@/lib/dataforseo";

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!canAccessSection(session.user, "dataforseo-explorer")) {
      return NextResponse.json({ error: "Forbidden: DataForSEO section access required" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode") || "keywords";
    const keyword = searchParams.get("keyword") || searchParams.get("q") || "seo tools";
    const domain = searchParams.get("domain") || searchParams.get("target") || "";
    const locationCode = searchParams.get("locationCode") || "2840";
    const languageCode = searchParams.get("languageCode") || "en";

    const creds = await getDataForSeoCredentials();

    if (mode === "status") {
      return NextResponse.json({
        configured: creds.configured,
        login: creds.login,
      });
    }

    if (mode === "serp") {
      const serpResult = await fetchSerpData(keyword, locationCode, languageCode);
      return NextResponse.json({
        success: true,
        data: serpResult,
      });
    }

    if (mode === "backlinks") {
      if (!domain) {
        return NextResponse.json({ error: "Domain parameter is required for backlinks summary" }, { status: 400 });
      }
      const backlinksResult = await fetchBacklinksSummary(domain);
      return NextResponse.json({
        success: true,
        data: backlinksResult,
      });
    }

    // Default mode: keywords
    const keywordsResult = await fetchKeywordVolumeData(keyword, locationCode, languageCode);
    return NextResponse.json({
      success: true,
      data: keywordsResult,
    });
  } catch (err) {
    console.error("[DataForSEO Route Error]:", err.message);
    return NextResponse.json({ error: err.message || "DataForSEO request failed" }, { status: 500 });
  }
}

export async function POST(req) {
  return GET(req);
}
