import { requireAdminRoute } from "../../../../lib/adminAuth";
import {
  getBlogAutomationConfig,
  saveBlogAutomationConfig,
  sanitizeConfigForClient,
  getBlogAutomationHistory,
} from "../../../../lib/blogAutomation.js";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    await requireAdminRoute(req, "blog-automation");
    const [config, history] = await Promise.all([
      getBlogAutomationConfig(),
      getBlogAutomationHistory(),
    ]);
    return Response.json({ config: sanitizeConfigForClient(config), history });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to load blog automation settings." },
      { status: error.status || 500 }
    );
  }
}

export async function POST(req) {
  try {
    await requireAdminRoute(req, "blog-automation");
    const body = await req.json();
    const config = await saveBlogAutomationConfig(body);
    return Response.json({ config: sanitizeConfigForClient(config) });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to save blog automation settings." },
      { status: error.status || 500 }
    );
  }
}
