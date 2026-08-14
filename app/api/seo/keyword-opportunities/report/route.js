import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../auth/[...nextauth]/route";
import { canAccessSection } from "@/lib/modulePermissions";
import { getKeywordOpportunities } from "@/lib/keywordOpportunities";
import { buildKeywordOpportunitiesPdf } from "@/lib/keywordOpportunitiesPdf";

export const runtime = "nodejs";
export const maxDuration = 180;

function slug(s) {
  return (
    String(s || "keyword-opportunities")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "keyword-opportunities"
  );
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canAccessSection(session.user, "keyword-opportunities")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { domain = "" } = body;

    if (!String(domain).trim()) {
      return NextResponse.json({ error: "No domain supplied." }, { status: 400 });
    }

    const data = await getKeywordOpportunities(String(domain).trim());
    const bytes = await buildKeywordOpportunitiesPdf(data);

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="keyword-opportunities-${slug(domain)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[Keyword Opportunities PDF Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to build the report" },
      { status: 500 }
    );
  }
}
