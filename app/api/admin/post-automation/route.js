import { requireAdminRoute } from "../../../../lib/adminAuth";

import {
  getGlobalPostsAutomationConfig,
  saveGlobalPostsAutomationConfig,
} from "@/lib/postsStudio/engine.js";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdminRoute(req);
    const config = await getGlobalPostsAutomationConfig();
    return Response.json({ config });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to load post automation settings." },
      { status: error.status || 500 }
    );
  }
}

export async function POST(req) {
  try {
    await requireAdminRoute(req);
    const body = await req.json();
    const config = await saveGlobalPostsAutomationConfig(body || {});
    return Response.json({ config });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to save post automation settings." },
      { status: error.status || 500 }
    );
  }
}
