import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../auth/[...nextauth]/route";
import { canAccessSection } from "@/lib/modulePermissions";
import { getLinkOpportunities } from "@/lib/linkOpportunities";
import { buildLinkOpportunitiesPdf } from "@/lib/linkOpportunitiesPdf";

export const runtime = "nodejs";
export const maxDuration = 300;

function slug(s) {
  return (
    String(s || "link-opportunities")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "link-opportunities"
  );
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canAccessSection(session.user, "link-opportunities")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      keyword = "",
      siteUrl = "",
      location = "",
      originCountry = "",
      device = "desktop",
      geo = "us",
      rankers = 10,
      refdomains = 200,
    } = body;

    if (!String(keyword).trim()) {
      return NextResponse.json({ error: "No keyword supplied." }, { status: 400 });
    }

    // Depth must match what the screen ran, or this misses the cache and
    // silently re-bills a full analysis just to print it.
    const data = await getLinkOpportunities(siteUrl, keyword, {
      location,
      originCountry,
      device,
      geo,
      rankers: Math.min(30, Math.max(3, Number(rankers) || 10)),
      refdomains: Math.min(200, Math.max(25, Number(refdomains) || 200)),
    });
    const bytes = await buildLinkOpportunitiesPdf(data);

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="link-opportunities-${slug(keyword)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[Link Opportunities PDF Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to build the report" },
      { status: 500 }
    );
  }
}
