import { requireSuperAdmin } from "../../../../lib/middleware/auth";
import {
  getDataSourcesConfig,
  invalidateSerpApiKeyCache,
  sanitizeDataSourcesForClient,
  saveDataSourcesConfig,
} from "../../../../lib/dataSources";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireSuperAdmin();
    const row = await getDataSourcesConfig();
    return Response.json(
      { config: sanitizeDataSourcesForClient(row) },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    const status =
      error.message === "Unauthorized" || String(error.message || "").includes("Super admin")
        ? 403
        : 500;
    return Response.json(
      { error: status === 403 ? "Forbidden: Super admin access required" : error.message },
      { status }
    );
  }
}

export async function PUT(req) {
  try {
    await requireSuperAdmin();
    const body = await req.json().catch(() => ({}));
    const saved = await saveDataSourcesConfig(body);
    invalidateSerpApiKeyCache();
    return Response.json({ config: sanitizeDataSourcesForClient(saved) });
  } catch (error) {
    const status =
      error.message === "Unauthorized" || String(error.message || "").includes("Super admin")
        ? 403
        : 500;
    return Response.json(
      { error: status === 403 ? "Forbidden: Super admin access required" : error.message },
      { status }
    );
  }
}
