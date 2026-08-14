import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../auth/[...nextauth]/route";
import { canAccessSection } from "@/lib/modulePermissions";
import { getSerpAnalysis } from "@/lib/serpAnalysis";
import { buildSerpAnalysisPdf } from "@/lib/serpAnalysisPdf";

export const runtime = "nodejs";
export const maxDuration = 120;

function slug(s) {
  return (
    String(s || "serp-analysis")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "serp-analysis"
  );
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canAccessSection(session.user, "serp-analysis")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { keyword = "", siteUrl = "", location = "", device = "desktop", geo = "us" } = body;

    if (!String(keyword).trim()) {
      return NextResponse.json({ error: "No keyword supplied." }, { status: 400 });
    }

    // Re-read from cache rather than trusting a client-supplied payload — the
    // analysis is cached 3 days, so this is normally free and guarantees the
    // document matches what the tool actually computed.
    const data = await getSerpAnalysis(siteUrl, keyword, { location, device, geo });
    const bytes = await buildSerpAnalysisPdf(data);

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="serp-analysis-${slug(keyword)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[SERP Analysis PDF Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to build the report" },
      { status: 500 }
    );
  }
}
