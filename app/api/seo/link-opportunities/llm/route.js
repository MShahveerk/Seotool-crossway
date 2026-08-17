import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../auth/[...nextauth]/route";
import { canAccessSection } from "@/lib/modulePermissions";
import {
  getLinkOpportunitiesLlmConfig,
  saveLinkOpportunitiesLlmConfig,
  sanitizeLinkOpportunitiesLlmForClient,
} from "@/lib/linkOpportunitiesLlm.js";

export const runtime = "nodejs";

async function requireAccess() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!canAccessSection(session.user, "link-opportunities")) {
    return {
      error: NextResponse.json(
        { error: "Forbidden: Access to Link Opportunities is not granted." },
        { status: 403 }
      ),
    };
  }
  return { session };
}

export async function GET() {
  try {
    const gate = await requireAccess();
    if (gate.error) return gate.error;
    const config = await getLinkOpportunitiesLlmConfig();
    return NextResponse.json({
      success: true,
      config: sanitizeLinkOpportunitiesLlmForClient(config),
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to load LLM probe settings." },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    const gate = await requireAccess();
    if (gate.error) return gate.error;
    const body = await req.json().catch(() => ({}));
    const saved = await saveLinkOpportunitiesLlmConfig(body || {});
    return NextResponse.json({
      success: true,
      config: sanitizeLinkOpportunitiesLlmForClient(saved),
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to save LLM probe settings." },
      { status: 500 }
    );
  }
}
