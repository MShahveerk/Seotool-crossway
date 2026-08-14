import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { canAccessSection } from "@/lib/modulePermissions";
import { probeProspect } from "@/lib/prospectProbe";

export const runtime = "nodejs";
/** Up to 15 page fetches against a third-party site. */
export const maxDuration = 60;

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

    const body = await req.json().catch(() => ({}));
    const { domain = "", refresh = false } = body;

    if (!String(domain).trim()) {
      return NextResponse.json({ error: "No domain supplied." }, { status: 400 });
    }

    const data = await probeProspect(String(domain).trim(), { force: Boolean(refresh) });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[Prospect Probe API Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to probe prospect" },
      { status: 500 }
    );
  }
}
