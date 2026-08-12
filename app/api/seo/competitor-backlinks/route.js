import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../api/auth/[...nextauth]/route";
import { canAccessSection } from "@/lib/modulePermissions";
import { fetchCompetitorBacklinkDetail } from "@/lib/serpAnalysis";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canAccessSection(session.user, "serp-analysis")) {
      return NextResponse.json({ error: "Forbidden: SERP Analysis access is not granted." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const domain = String(body.domain || "").trim();
    if (!domain) return NextResponse.json({ error: "domain is required." }, { status: 400 });

    const data = await fetchCompetitorBacklinkDetail(domain, {
      refLimit: 250,
      linkLimit: 100,
      force: body.force === true,
    });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[Competitor Backlinks API Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to load backlink detail" },
      { status: err.status && Number.isInteger(err.status) ? err.status : 500 }
    );
  }
}
