import { resolveSearchConsoleRequest } from "../../../../lib/searchConsoleRequest";
import {
  listIndexingTasks,
  syncIndexingTasksFromSnapshot,
} from "../../../../lib/indexingTasks";
import prisma from "../../../../lib/prisma";
import { normalizeSiteOrigin } from "../../../../lib/validation";

export const runtime = "nodejs";

/**
 * GET /api/searchconsole/indexing-tasks?url=&status=open|done|all
 */
export async function GET(req) {
  try {
    const { siteUrl } = await resolveSearchConsoleRequest(req);
    const status = String(req.nextUrl.searchParams.get("status") || "open").trim();
    const tasks = await listIndexingTasks(siteUrl, { status });
    return new Response(
      JSON.stringify({
        siteUrl,
        status,
        tasks,
        total: tasks.length,
        note: "Tasks are auto-created from daily not-indexed URL inspections, with step-by-step fix guides.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
      }
    );
  } catch (error) {
    const status = error.status || 500;
    return new Response(
      JSON.stringify({ error: error.message || "Failed to load indexing tasks." }),
      { status, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * POST /api/searchconsole/indexing-tasks
 * Body: { url?, syncFromLatest?: true } — rebuild tasks from latest completed snapshot.
 */
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body.url && req.nextUrl) req.nextUrl.searchParams.set("url", body.url);
    const { siteUrl } = await resolveSearchConsoleRequest(req);
    const normalized = normalizeSiteOrigin(siteUrl) || siteUrl;

    const latest = await prisma.urlInspectionSnapshot.findFirst({
      where: { siteUrl: normalized, status: "completed" },
      orderBy: { runDate: "desc" },
    });
    if (!latest) {
      return new Response(
        JSON.stringify({
          error: "No completed daily inspection snapshot yet. Wait for the daily run or enable SEO_URL_INSPECT_DAILY.",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const sync = await syncIndexingTasksFromSnapshot(normalized, latest.id);
    const tasks = await listIndexingTasks(normalized, { status: "open" });
    return new Response(JSON.stringify({ ok: true, sync, tasks, total: tasks.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const status = error.status || 500;
    return new Response(
      JSON.stringify({ error: error.message || "Failed to sync indexing tasks." }),
      { status, headers: { "Content-Type": "application/json" } }
    );
  }
}
