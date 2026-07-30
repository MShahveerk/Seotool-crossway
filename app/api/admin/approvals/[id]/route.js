import { unlink } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { Prisma } from "@prisma/client";
import { requireAdminRoute } from "../../../../../lib/adminAuth";
import prisma from "../../../../../lib/prisma";
import { PERMISSIONS, ROLES } from "../../../../../lib/rbac";

export const runtime = "nodejs";

const APPROVAL_INCLUDE = {
  assignee: { select: { id: true, email: true, name: true } },
  createdBy: { select: { id: true, email: true, name: true } },
};

function publicPathToDisk(publicPath) {
  const rel = String(publicPath || "").replace(/^\/+/, "");
  if (!rel || rel.includes("..")) return null;
  const fileName = rel.replace(/^api\/uploads\//, "").replace(/^uploads\//, "");
  if (!fileName || fileName.includes("..") || fileName.includes("/")) return null;
  if (existsSync("/var/data")) {
    return path.join("/var/data", "uploads", "approvals", fileName);
  }
  return path.join(process.cwd(), "public", "uploads", "approvals", fileName);
}

/** PATCH — schedule / visibility / content edits from board or admin UI */
export async function PATCH(req, { params }) {
  try {
    const session = await requireAdminRoute(req, "admin-approvals");
    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.approval.findUnique({ where: { id } });
    if (!existing) {
      return Response.json({ error: "Approval not found" }, { status: 404 });
    }

    const data = {};

    if (typeof body.hiddenFromAssignee === "boolean") {
      if (session.user.role !== ROLES.SUPER_ADMIN) {
        return Response.json({ error: "Only super admins can hide/show approvals." }, { status: 403 });
      }
      await prisma.$executeRaw(
        Prisma.sql`UPDATE approvals SET hidden_from_assignee = ${body.hiddenFromAssignee ? 1 : 0} WHERE id = ${id}`
      );
      data.hiddenFromAssignee = body.hiddenFromAssignee;
    }

    if ("scheduledFor" in body) {
      const raw = body.scheduledFor;
      if (raw === null || raw === "" || raw === false) {
        data.scheduledFor = null;
      } else {
        const next = new Date(raw);
        if (Number.isNaN(next.getTime())) {
          return Response.json({ error: "Invalid scheduledFor datetime." }, { status: 400 });
        }
        data.scheduledFor = next;
      }
    }

    if (body.title !== undefined) data.title = String(body.title || "").trim().slice(0, 255);
    if (body.caption !== undefined) data.caption = String(body.caption || "").slice(0, 2000);
    if (body.bodyText !== undefined) data.bodyText = String(body.bodyText || "");
    if (body.userEditedTitle !== undefined) {
      const v = String(body.userEditedTitle || "").trim();
      data.userEditedTitle = v ? v.slice(0, 255) : null;
    }
    if (body.userEditedCaption !== undefined) {
      const v = String(body.userEditedCaption || "").trim();
      data.userEditedCaption = v || null;
    }
    if (body.userEditedText !== undefined) {
      const v = String(body.userEditedText || "").trim();
      data.userEditedText = v || null;
    }
    if (body.userEditedInstructions !== undefined) {
      const v = String(body.userEditedInstructions || "").trim();
      data.userEditedInstructions = v || null;
    }

    // Board "Save" with title/caption syncs both admin + edited fields for consistent preview.
    if (body.syncEditedFields === true) {
      if (body.title !== undefined) {
        data.userEditedTitle = data.title || null;
      }
      if (body.caption !== undefined) {
        data.userEditedCaption = data.caption || null;
      }
      if (body.bodyText !== undefined) {
        data.userEditedText = data.bodyText || null;
      }
    }

    const keys = Object.keys(data);
    if (!keys.length && typeof body.hiddenFromAssignee !== "boolean") {
      return Response.json(
        { error: "Provide content fields, scheduledFor, and/or hiddenFromAssignee." },
        { status: 400 }
      );
    }

    let approval = existing;
    if (keys.length) {
      approval = await prisma.approval.update({
        where: { id },
        data,
        include: APPROVAL_INCLUDE,
      });
    } else {
      approval = await prisma.approval.findUnique({ where: { id }, include: APPROVAL_INCLUDE });
    }

    return Response.json({ ok: true, approval });
  } catch (error) {
    if (error.message === "Unauthorized" || error.message?.includes("Forbidden")) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    return Response.json({ error: error.message || "Failed to update approval" }, { status: error.status || 500 });
  }
}

/** DELETE — remove approval row and try to remove uploaded media */
export async function DELETE(req, { params }) {
  try {
    await requireAdminRoute(req, "admin-approvals");
    const { id } = await params;

    const existing = await prisma.approval.findUnique({ where: { id } });
    if (!existing) {
      return Response.json({ error: "Approval not found" }, { status: 404 });
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

    return Response.json({ ok: true });
  } catch (error) {
    if (error.message === "Unauthorized" || error.message?.includes("Forbidden")) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    return Response.json({ error: error.message || "Failed to delete approval" }, { status: 500 });
  }
}
