import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import prisma from "../../../../lib/prisma";
import { ROLES } from "../../../../lib/rbac";
import {
  fetchCaptionMapByApprovalIds,
  mergeCaptionFieldsIntoApprovals,
} from "../../../../lib/approvalCaptionMerge";
import { resolveScheduleOnApprove } from "../../../../lib/approvalSchedule.js";
import { userCanAccessApproval } from "../../../../lib/siteAccess.js";
import { canAccessSection } from "../../../../lib/modulePermissions";
import { saveApprovalMediaBuffer } from "../../../../lib/approvalMedia.js";
import { parseRunStudioRevision } from "../../../../lib/studioRevisionChoice.js";

export const runtime = "nodejs";

const OPEN_STATUSES = new Set(["pending", "edited"]);
const TEXT_MAX = 20000;
const CAPTION_MAX = 2000;
const INSTRUCTIONS_MAX = 5000;
const TITLE_MAX = 255;

/** PATCH — assignee: approve | decline | edit | save_image | promote_backup. */
export async function PATCH(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!canAccessSection(session.user, "my-approvals")) {
      return new Response(JSON.stringify({ error: "Forbidden: Approvals access not granted." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { id } = await params;
    const ct = req.headers.get("content-type") || "";
    let body = {};
    let imageFile = null;
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      for (const [key, value] of form.entries()) {
        if (typeof value === "string") body[key] = value;
      }
      const raw = form.get("image") || form.get("featuredImage");
      if (raw && typeof raw !== "string") imageFile = raw;
    } else {
      body = await req.json();
    }
    const action = String(body.action || "").toLowerCase();

    const approval = await prisma.approval.findUnique({ where: { id } });
    if (!approval) {
      return new Response(JSON.stringify({ error: "Approval not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const hasAccess = await userCanAccessApproval(prisma, session.user, approval);
    if (!hasAccess) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!OPEN_STATUSES.has(approval.status) && action !== "promote_backup") {
      return new Response(
        JSON.stringify({ error: "This approval is already closed (approved or declined)." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const now = new Date();

    if (action === "promote_backup") {
      if (!OPEN_STATUSES.has(approval.status)) {
        return new Response(
          JSON.stringify({ error: "Can only switch images before approval is closed." }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      const backups = Array.isArray(approval.backupImagePaths)
        ? approval.backupImagePaths.map((p) => String(p || "").trim()).filter(Boolean)
        : [];
      const idx = Number(body.backupIndex);
      if (!Number.isInteger(idx) || idx < 0 || idx >= backups.length) {
        return new Response(JSON.stringify({ error: "Invalid backupIndex." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      const chosen = backups[idx];
      const nextBackups = [approval.imagePath, ...backups.filter((_, i) => i !== idx)]
        .map((p) => String(p || "").trim())
        .filter((p) => p && p !== chosen)
        .slice(0, 3);
      await prisma.approval.update({
        where: { id },
        data: {
          imagePath: chosen,
          backupImagePaths: nextBackups,
          lastAction: "promote_backup",
        },
      });
    } else if (action === "save_image") {
      if (!OPEN_STATUSES.has(approval.status)) {
        return new Response(
          JSON.stringify({ error: "Can only replace the image before approval is closed." }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      if (!imageFile || !imageFile.size) {
        return new Response(
          JSON.stringify({ error: "Choose a JPEG, PNG, WebP, or GIF, then save." }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      const mime = imageFile.type || "image/jpeg";
      const buf = Buffer.from(await imageFile.arrayBuffer());
      const imagePath = await saveApprovalMediaBuffer(buf, mime);
      const backups = [approval.imagePath, ...(Array.isArray(approval.backupImagePaths) ? approval.backupImagePaths : [])]
        .map((p) => String(p || "").trim())
        .filter((p) => p && p !== imagePath)
        .slice(0, 3);
      await prisma.approval.update({
        where: { id },
        data: {
          imagePath,
          backupImagePaths: backups,
          lastAction: "save_image",
        },
      });
    } else if (action === "approve") {
      const approveData = {
        status: "approved",
        lastAction: "approve",
        respondedAt: now,
        awaitingAdminReview: true,
        scheduledFor: resolveScheduleOnApprove(approval.scheduledFor),
        publishStatus: approval.publishStatus === "published" ? approval.publishStatus : "unpublish",
      };
      if (body.editedText !== undefined) {
        const editedTextForApprove = String(body.editedText ?? "").trim();
        if (editedTextForApprove.length > TEXT_MAX) {
          return new Response(JSON.stringify({ error: "Accompanying text is too long (max 20000 characters)." }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        approveData.userEditedText = editedTextForApprove || null;
      }
      if (body.editedCaption !== undefined) {
        const editedCap = String(body.editedCaption ?? "").trim();
        if (editedCap.length > CAPTION_MAX) {
          return new Response(JSON.stringify({ error: "Caption is too long (max 2000 characters)." }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        approveData.userEditedCaption = editedCap || null;
      }
      if (body.editedTitle !== undefined) {
        const editedTitle = String(body.editedTitle ?? "").trim();
        if (editedTitle.length > TITLE_MAX) {
          return new Response(JSON.stringify({ error: "Heading is too long (max 255 characters)." }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        approveData.userEditedTitle = editedTitle || null;
      }
      if (body.editedInstructions !== undefined) {
        const editedIns = String(body.editedInstructions ?? "").trim();
        if (editedIns.length > INSTRUCTIONS_MAX) {
          return new Response(
            JSON.stringify({ error: "Instructions / suggestions are too long (max 5000 characters)." }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        approveData.userEditedInstructions = editedIns || null;
      }
      await prisma.approval.update({
        where: { id },
        data: approveData,
      });
    } else if (action === "decline") {
      const declineReason = String(body.declineReason ?? body.reason ?? "").trim();
      if (!declineReason) {
        return new Response(JSON.stringify({ error: "A reason for declining is required." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (declineReason.length > INSTRUCTIONS_MAX) {
        return new Response(
          JSON.stringify({ error: `Decline reason must be ${INSTRUCTIONS_MAX} characters or fewer.` }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      await prisma.approval.update({
        where: { id },
        data: {
          status: "declined",
          lastAction: "decline",
          respondedAt: now,
          awaitingAdminReview: true,
          userEditedInstructions: declineReason,
        },
      });
      if (parseRunStudioRevision({ body })) {
        try {
          const { enqueuePostRevisionFromDecline } = await import("../../../../lib/studioRevision.js");
          await enqueuePostRevisionFromDecline({
            approvalId: id,
            remarks: declineReason,
            target: body.revisionTarget,
            triggeredById: session.user.id,
          });
        } catch (err) {
          console.warn(`[approvals] revision run enqueue failed for ${id}: ${err.message}`);
        }
      }
    } else if (action === "edit") {
      const editedText = String(body.editedText ?? "").trim();
      const editedCaption = String(body.editedCaption ?? "").trim();
      const editedInstructions = String(body.editedInstructions ?? "").trim();
      const editedTitle = String(body.editedTitle ?? "").trim();
      if (editedTitle.length > TITLE_MAX) {
        return new Response(JSON.stringify({ error: "Heading is too long (max 255 characters)." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      const prevTitle =
        approval.userEditedTitle != null
          ? String(approval.userEditedTitle).trim()
          : String(approval.title || "").trim();
      const titleChanged = editedTitle !== prevTitle;
      if (!editedText && !editedCaption && !editedInstructions && !titleChanged) {
        return new Response(
          JSON.stringify({
            error:
              "Change the heading, caption, instructions, and/or accompanying text before saving your edit.",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      if (editedText.length > TEXT_MAX) {
        return new Response(JSON.stringify({ error: "Accompanying text is too long (max 20000 characters)." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (editedCaption.length > CAPTION_MAX) {
        return new Response(JSON.stringify({ error: "Caption is too long (max 2000 characters)." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (editedInstructions.length > INSTRUCTIONS_MAX) {
        return new Response(
          JSON.stringify({ error: "Instructions / suggestions are too long (max 5000 characters)." }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      const editData = {
        status: "edited",
        userEditedText: editedText || null,
        userEditedCaption: editedCaption || null,
        userEditedInstructions: editedInstructions || null,
        lastAction: "edit",
        respondedAt: now,
        awaitingAdminReview: true,
      };
      if (titleChanged) {
        editData.userEditedTitle = editedTitle || null;
      }
      await prisma.approval.update({
        where: { id },
        data: editData,
      });
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid action. Use approve, decline, edit, save_image, or promote_backup." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const updated = await prisma.approval.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, email: true, name: true, role: true } },
        createdBy: { select: { id: true, email: true, name: true } },
      },
    });

    if (!updated) {
      return new Response(JSON.stringify({ error: "Approval not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Trigger status change email notification asynchronously
    try {
      const { sendPostStatusChangeNotification } = await import("../../../../lib/email");
      let detailText = "";
      if (action === "decline") {
        detailText = `Rejection reason:\n${String(body.declineReason ?? body.reason ?? "").trim()}`;
      } else if (action === "edit" || action === "approve") {
        const parts = [];
        if (body.editedTitle) parts.push(`Heading: ${body.editedTitle}`);
        if (body.editedCaption) parts.push(`Caption: ${body.editedCaption}`);
        if (body.editedText) parts.push(`Accompanying Text: ${body.editedText}`);
        if (body.editedInstructions) parts.push(`Instructions: ${body.editedInstructions}`);
        detailText = parts.join("\n\n");
      }
      // Trigger status notification
      await sendPostStatusChangeNotification(updated, session.user, updated.status, detailText);
    } catch (err) {
      console.error("Failed to send status change notification email", err);
    }

    const capMap = await fetchCaptionMapByApprovalIds(prisma, [id]);
    const [withCaptions] = mergeCaptionFieldsIntoApprovals([updated], capMap);

    return new Response(JSON.stringify({ approval: withCaptions }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Failed to update approval" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
