import { unlink } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { Prisma } from "@prisma/client";
import { requirePermission } from "../../../../../lib/middleware/auth";
import prisma from "../../../../../lib/prisma";
import { PERMISSIONS, ROLES } from "../../../../../lib/rbac";

export const runtime = "nodejs";

function publicPathToDisk(publicPath) {
  const rel = String(publicPath || "").replace(/^\/+/, "");
  if (!rel || rel.includes("..")) return null;
  // Support both /api/uploads/... and legacy /uploads/...
  const fileName = rel.replace(/^api\/uploads\//, "").replace(/^uploads\//, "");
  if (!fileName || fileName.includes("..") || fileName.includes("/")) return null;
  if (existsSync("/var/data")) {
    return path.join("/var/data", "uploads", "approvals", fileName);
  }
  return path.join(process.cwd(), "public", "uploads", "approvals", fileName);
}

/** PATCH — hide/show for assignee, or update/clear schedule */
export async function PATCH(req, { params }) {
  try {
    const session = await requirePermission(PERMISSIONS.VIEW_ALL_DATA);
    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.approval.findUnique({ where: { id } });
    if (!existing) {
      return new Response(JSON.stringify({ error: "Approval not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const updates = {};
    let touched = false;

    if (typeof body.hiddenFromAssignee === "boolean") {
      if (session.user.role !== ROLES.SUPER_ADMIN) {
        return new Response(JSON.stringify({ error: "Only super admins can hide/show approvals." }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
      await prisma.$executeRaw(
        Prisma.sql`UPDATE approvals SET hidden_from_assignee = ${body.hiddenFromAssignee ? 1 : 0} WHERE id = ${id}`
      );
      updates.hiddenFromAssignee = body.hiddenFromAssignee;
      touched = true;
    }

    if ("scheduledFor" in body) {
      const raw = body.scheduledFor;
      if (raw === null || raw === "" || raw === false) {
        await prisma.approval.update({
          where: { id },
          data: { scheduledFor: null },
        });
        updates.scheduledFor = null;
        touched = true;
      } else {
        const next = new Date(raw);
        if (Number.isNaN(next.getTime())) {
          return new Response(JSON.stringify({ error: "Invalid scheduledFor datetime." }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        await prisma.approval.update({
          where: { id },
          data: { scheduledFor: next },
        });
        updates.scheduledFor = next.toISOString();
        touched = true;
      }
    }

    if (!touched) {
      return new Response(
        JSON.stringify({
          error: "Provide hiddenFromAssignee (boolean) and/or scheduledFor (ISO string or null).",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ ok: true, ...updates }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error.message === "Unauthorized" || error.message.includes("Forbidden")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: error.message || "Failed to update approval" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/** DELETE — remove approval row and try to remove uploaded media */
export async function DELETE(req, { params }) {
  try {
    await requirePermission(PERMISSIONS.VIEW_ALL_DATA);
    const { id } = await params;

    const existing = await prisma.approval.findUnique({ where: { id } });
    if (!existing) {
      return new Response(JSON.stringify({ error: "Approval not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    await prisma.approval.delete({ where: { id } });

    const disk = publicPathToDisk(existing.imagePath);
    if (disk) {
      try {
        await unlink(disk);
      } catch {
        // ignore missing file
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error.message === "Unauthorized" || error.message.includes("Forbidden")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: error.message || "Failed to delete approval" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
