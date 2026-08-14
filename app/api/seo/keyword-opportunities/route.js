import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { canAccessSection } from "@/lib/modulePermissions";
import { getKeywordOpportunities } from "@/lib/keywordOpportunities";
import { isSerankingConfigured } from "@/lib/seranking/config";

export const runtime = "nodejs";
/** One domain + its competitors + each rival's keyword export. */
export const maxDuration = 180;

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!canAccessSection(session.user, "keyword-opportunities")) {
      return NextResponse.json(
        { error: "Forbidden: Access to Keyword Opportunities is not granted." },
        { status: 403 }
      );
    }

    if (!isSerankingConfigured()) {
      return NextResponse.json(
        { error: "Keyword data is not configured for this environment." },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { domain = "", rivals = 5, refresh = false } = body;

    if (!String(domain).trim()) {
      return NextResponse.json({ error: "Enter a domain to analyse." }, { status: 400 });
    }

    const data = await getKeywordOpportunities(
      String(domain).trim(),
      // Clamped: each rival is a separate keyword export, so this is the dial
      // that decides what a cold run costs.
      { rivals: Math.min(10, Math.max(0, Number(rivals) || 5)) },
      { force: Boolean(refresh) }
    );

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[Keyword Opportunities API Error]:", err);
    const status = err.status && Number.isInteger(err.status) ? err.status : 500;
    return NextResponse.json(
      { success: false, error: err.message || "Failed to build keyword opportunities" },
      { status }
    );
  }
}
