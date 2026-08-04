import { getServerSession } from "next-auth";
import { authOptions } from "../../../auth/[...nextauth]/route";
import { ROLES } from "../../../../../lib/rbac";
import { canAccessSection } from "../../../../../lib/modulePermissions";
import prisma from "../../../../../lib/prisma";
import { updateIndexingTaskStatus } from "../../../../../lib/indexingTasks";
import { sessionCanAccessSiteAsync, resolveSiteEquivalents } from "../../../../../lib/siteAccess";
import { normalizeSiteOrigin } from "../../../../../lib/validation";

export const runtime = "nodejs";

/**
 * PATCH /api/searchconsole/indexing-tasks/:id
 * Body: { status: "open" | "done" | "dismissed" }
 */
export async function PATCH(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!canAccessSection(session.user, "url-inspection")) {
      return new Response(JSON.stringify({ error: "Forbidden: URL Inspection access not granted." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const status = String(body.status || "").trim();

    const task = await prisma.seoIndexingTask.findUnique({ where: { id } });
    if (!task) {
      return new Response(JSON.stringify({ error: "Task not found." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const role = session.user.role || ROLES.USER;
    if (role === ROLES.VIEWER || role === ROLES.SMM || role === ROLES.APPROVER) {
      const equivalents = await resolveSiteEquivalents(prisma, task.siteUrl);
      if (!(await sessionCanAccessSiteAsync(prisma, session.user, equivalents))) {
        return new Response(JSON.stringify({ error: "Access denied for this site." }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    } else if (role === ROLES.USER) {
      const own = normalizeSiteOrigin(session.user.siteLink || "");
      if (!own || own !== normalizeSiteOrigin(task.siteUrl)) {
        return new Response(JSON.stringify({ error: "Access denied." }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    const updated = await updateIndexingTaskStatus(id, status);
    return new Response(JSON.stringify({ ok: true, task: updated }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const status = error.status || 500;
    return new Response(
      JSON.stringify({ error: error.message || "Failed to update task." }),
      { status, headers: { "Content-Type": "application/json" } }
    );
  }
}
