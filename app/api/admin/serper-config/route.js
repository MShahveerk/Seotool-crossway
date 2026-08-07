import { requireSuperAdmin } from "../../../../lib/middleware/auth";
import prisma from "../../../../lib/prisma";

export const runtime = "nodejs";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}

/**
 * GET /api/admin/serper-config
 * Checks if Serper.dev API key is configured.
 */
export async function GET() {
  try {
    await requireSuperAdmin();

    const row = await prisma.appSetting.findUnique({
      where: { key: "serper_api_key" },
    });

    const rawKey = row?.value || process.env.SERPER_API_KEY || "";
    const configured = Boolean(rawKey.trim());
    
    // Mask key for security before returning
    let maskedKey = "";
    if (configured) {
      const clean = rawKey.trim();
      if (clean.length > 8) {
        maskedKey = `${clean.slice(0, 4)}...${clean.slice(-4)}`;
      } else {
        maskedKey = "****";
      }
    }

    return json({
      configured,
      maskedKey,
      source: row?.value ? "database" : process.env.SERPER_API_KEY ? "env" : "none",
    });
  } catch (error) {
    const status =
      error.message === "Unauthorized" || String(error.message || "").includes("Super admin")
        ? 403
        : 500;
    return json({ error: status === 403 ? "Forbidden: Super admin access required" : error.message }, status);
  }
}

/**
 * POST /api/admin/serper-config
 * Sets the Serper.dev API key.
 * Body: { key: string }
 */
export async function POST(req) {
  try {
    await requireSuperAdmin();
    const body = await req.json().catch(() => ({}));
    const key = String(body.key || "").trim();

    if (!key) {
      // If empty string is passed, delete the setting from database to fall back to environment variable or empty
      await prisma.appSetting.deleteMany({
        where: { key: "serper_api_key" },
      });
      return json({ ok: true, configured: Boolean(process.env.SERPER_API_KEY), message: "Database Serper key removed." });
    }

    await prisma.appSetting.upsert({
      where: { key: "serper_api_key" },
      update: { value: key },
      create: { key: "serper_api_key", value: key },
    });

    const maskedKey = key.length > 8 ? `${key.slice(0, 4)}...${key.slice(-4)}` : "****";

    return json({
      ok: true,
      configured: true,
      maskedKey,
      message: "Serper.dev API key updated successfully.",
    });
  } catch (error) {
    const status =
      error.status ||
      (error.message === "Unauthorized" || String(error.message || "").includes("Super admin")
        ? 403
        : 500);
    return json({ error: error.message || "Failed to update settings." }, status);
  }
}
