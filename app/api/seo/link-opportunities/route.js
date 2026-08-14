import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { canAccessSection } from "@/lib/modulePermissions";
import { getLinkOpportunities } from "@/lib/linkOpportunities";
import { isSerpApiConfigured } from "@/lib/serpapi";
import { isSerankingConfigured } from "@/lib/seranking/config";

export const runtime = "nodejs";
/** Up to 11 backlink profiles behind a cold keyword — this one needs the room. */
export const maxDuration = 300;

const ALLOWED_GEO = new Set(["us", "uk", "ca", "au", "pk"]);

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!canAccessSection(session.user, "link-opportunities")) {
      return NextResponse.json(
        { error: "Forbidden: Access to Link Opportunities is not granted." },
        { status: 403 }
      );
    }

    if (!isSerpApiConfigured()) {
      return NextResponse.json(
        { error: "Live SERP data is not configured. Add SERPAPI_API_KEY to your environment." },
        { status: 503 }
      );
    }

    if (!isSerankingConfigured()) {
      return NextResponse.json(
        { error: "Backlink data is not configured for this environment." },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const {
      keyword = "",
      siteUrl = "",
      location = "",
      device = "desktop",
      geo = "us",
      rankers = 10,
      refdomains = 200,
      refresh = false,
    } = body;

    if (!String(keyword).trim()) {
      return NextResponse.json({ error: "Please enter a target keyword or phrase." }, { status: 400 });
    }

    const data = await getLinkOpportunities(
      siteUrl,
      keyword,
      {
        location,
        device: device === "mobile" ? "mobile" : "desktop",
        geo: ALLOWED_GEO.has(String(geo).toLowerCase()) ? String(geo).toLowerCase() : "us",
        // Clamped: depth is the credit dial, so it can't be driven off a cliff
        // by a hand-edited request. 20 x 250 is the ceiling the UI offers.
        rankers: Math.min(20, Math.max(3, Number(rankers) || 10)),
        refdomains: Math.min(250, Math.max(25, Number(refdomains) || 200)),
      },
      { force: Boolean(refresh) }
    );

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[Link Opportunities API Error]:", err);
    const status = err.status && Number.isInteger(err.status) ? err.status : 500;
    return NextResponse.json(
      { success: false, error: err.message || "Failed to build link opportunities" },
      { status }
    );
  }
}
