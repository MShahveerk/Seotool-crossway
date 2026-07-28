import { resolveWebsiteAccess } from "../../../../lib/resolveWebsiteAccess.js";
import { loadExplorer, startExplorerAudit } from "../../../../lib/seranking/loadBundle.js";
import { isSerankingConfigured } from "../../../../lib/seranking/config.js";
import { SerankingApiError } from "../../../../lib/seranking/client.js";
import { resolveSerankingTarget } from "../../../../lib/seranking/resolveTarget.js";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    if (!isSerankingConfigured()) {
      return Response.json({ error: "SE Ranking is not configured." }, { status: 503 });
    }
    await resolveWebsiteAccess(req);
    const target = req.nextUrl.searchParams.get("target");
    if (!target?.trim()) {
      return Response.json({ error: "Enter a domain to explore (e.g. example.com)." }, { status: 400 });
    }

    const force = req.nextUrl.searchParams.get("refresh") === "1";
    const autostartAudit = req.nextUrl.searchParams.get("autostart") === "1";

    const result = await loadExplorer(target, { allowManual: true, force, autostartAudit });
    return Response.json(result);
  } catch (err) {
    const status = err instanceof SerankingApiError ? err.status : err.status || 500;
    return Response.json({ error: err.message || "Explorer request failed." }, { status });
  }
}

export async function POST(req) {
  try {
    if (!isSerankingConfigured()) {
      return Response.json({ error: "SE Ranking is not configured." }, { status: 503 });
    }
    await resolveWebsiteAccess(req);
    const body = await req.json().catch(() => ({}));
    const target = body.target || req.nextUrl.searchParams.get("target");
    if (!target?.trim()) {
      return Response.json({ error: "Enter a domain to audit." }, { status: 400 });
    }

    resolveSerankingTarget(target);
    const result = await startExplorerAudit(target, { allowManual: true });
    return Response.json(result);
  } catch (err) {
    const status = err instanceof SerankingApiError ? err.status : err.status || 500;
    return Response.json(
      { error: err.message || "Could not start audit.", auditId: err.auditId },
      { status }
    );
  }
}
