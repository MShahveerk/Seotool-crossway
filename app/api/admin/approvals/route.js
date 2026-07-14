import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { requireSuperAdmin, requirePermission } from "../../../../lib/middleware/auth";
import prisma from "../../../../lib/prisma";
import { ROLES, PERMISSIONS } from "../../../../lib/rbac";
import {
  fetchCaptionMapByApprovalIds,
  mergeCaptionFieldsIntoApprovals,
} from "../../../../lib/approvalCaptionMerge";

export const runtime = "nodejs";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
/** MP4/WebM/MOV broadly supported for in-browser playback. */
const VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);
const ALLOWED_TYPES = new Set([...IMAGE_TYPES, ...VIDEO_TYPES]);

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const VIDEO_MAX_BYTES = 100 * 1024 * 1024;

function normalizeSiteForMatch(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    const pathPart = u.pathname.replace(/\/+$/, "") || "";
    return `${u.hostname.toLowerCase()}${pathPart}`;
  } catch {
    return s.replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase();
  }
}

function extFromMime(mime) {
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/gif") return ".gif";
  if (mime === "video/mp4") return ".mp4";
  if (mime === "video/webm") return ".webm";
  if (mime === "video/quicktime") return ".mov";
  return "";
}

function mediaMaxBytes(mime) {
  return VIDEO_TYPES.has(mime) ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
}

/** GET — list approvals (optional ?countOnly=1 for unread badge) */
export async function GET(req) {
  try {
    await requirePermission(PERMISSIONS.VIEW_ALL_DATA);

    const countOnly = req.nextUrl.searchParams.get("countOnly") === "1";
    if (countOnly) {
      const count = await prisma.approval.count({
        where: { awaitingAdminReview: true },
      });
      return new Response(JSON.stringify({ count }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const rows = await prisma.approval.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        assignee: { select: { id: true, email: true, name: true, role: true } },
        createdBy: { select: { id: true, email: true, name: true } },
      },
    });

    const captionMap = await fetchCaptionMapByApprovalIds(
      prisma,
      rows.map((r) => r.id)
    );
    const approvals = mergeCaptionFieldsIntoApprovals(rows, captionMap);

    return new Response(JSON.stringify({ approvals }), {
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
    return new Response(JSON.stringify({ error: error.message || "Failed to list approvals" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/** POST — multipart: media file field `image` (legacy key), title, selectedSite, optional approveOnAssignment */
export async function POST(req) {
  try {
    const session = await requirePermission(PERMISSIONS.VIEW_ALL_DATA);

    const form = await req.formData();
    const image = form.get("image");
    const title = String(form.get("title") || "").trim();
    const captionRaw = String(form.get("caption") ?? "");
    const caption = captionRaw.trim();
    /** Posting instructions are assignee-only; new rows keep this column empty. */
    const instructions = "";
    const selectedSite = String(form.get("selectedSite") || "").trim();
    const approveOnAssignmentRaw = form.get("approveOnAssignment");
    const approveOnAssignment =
      approveOnAssignmentRaw === "1" ||
      approveOnAssignmentRaw === "true" ||
      approveOnAssignmentRaw === "on";
    const scheduledForRaw = form.get("scheduledFor");
    const scheduledFor = scheduledForRaw ? new Date(scheduledForRaw) : null;

    if (!title || title.length > 255) {
      return new Response(JSON.stringify({ error: "Title is required (max 255 characters)." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (caption.length > 2000) {
      return new Response(JSON.stringify({ error: "Caption must be 2000 characters or fewer." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!selectedSite) {
      return new Response(JSON.stringify({ error: "Selected site is required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!image || typeof image === "string" || !image.size) {
      return new Response(JSON.stringify({ error: "Image or video file is required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const mime = image.type || "";
    if (!ALLOWED_TYPES.has(mime)) {
      return new Response(
        JSON.stringify({
          error:
            "Invalid file type. Use JPEG, PNG, WebP, or GIF images, or MP4, WebM, or MOV video.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const ext = extFromMime(mime);
    if (!ext) {
      return new Response(JSON.stringify({ error: "Could not derive file extension for this MIME type." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const maxAllowed = mediaMaxBytes(mime);
    if (image.size > maxAllowed) {
      const mb = VIDEO_TYPES.has(mime) ? Math.round(VIDEO_MAX_BYTES / (1024 * 1024)) : 5;
      return new Response(
        JSON.stringify({
          error: VIDEO_TYPES.has(mime)
            ? `Video must be ${mb} MB or smaller.`
            : `Image must be ${mb} MB or smaller.`,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const normalizedSelectedSite = normalizeSiteForMatch(selectedSite);
    const candidateUsers = await prisma.user.findMany({
      where: { role: { not: ROLES.SUPER_ADMIN } },
      select: {
        id: true,
        role: true,
        siteLink: true,
        facebookPageId: true,
        instagramUserId: true,
        accessibleSites: { select: { siteLink: true } },
      },
    });

    const matchedUsers = candidateUsers.filter((u) => {
      const matchPrimarySite = u.siteLink && normalizeSiteForMatch(u.siteLink) === normalizedSelectedSite;
      const matchPrimaryFb = u.facebookPageId && String(u.facebookPageId).trim() === String(selectedSite).trim();
      const matchPrimaryIg = u.instagramUserId && String(u.instagramUserId).trim() === String(selectedSite).trim();

      const matchAccessible = (u.accessibleSites || []).some((entry) => {
        if (!entry.siteLink) return false;
        const entryVal = String(entry.siteLink).trim();
        const selectedVal = String(selectedSite).trim();
        return entryVal === selectedVal || normalizeSiteForMatch(entry.siteLink) === normalizedSelectedSite;
      });

      return matchPrimarySite || matchPrimaryFb || matchPrimaryIg || matchAccessible;
    });

    console.log(`[DEBUG] Selected Site for Approval: "${selectedSite}"`);
    console.log(`[DEBUG] Candidate Users count: ${candidateUsers.length}`);
    console.log("[DEBUG] Matched Users:", matchedUsers.map(u => ({ id: u.id, role: u.role, email: u.email })));

    if (matchedUsers.length === 0) {
      return new Response(
        JSON.stringify({ error: "No mapped user found for the selected site." }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    const assignee = matchedUsers.find(u => u.role === ROLES.APPROVER || u.role === ROLES.USER || u.role === "user") || matchedUsers[0];
    if (!assignee) {
      return new Response(JSON.stringify({ error: "Assignee user not found." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (assignee.role === ROLES.SUPER_ADMIN) {
      return new Response(JSON.stringify({ error: "Cannot assign approvals to a Super Admin account." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const buf = Buffer.from(await image.arrayBuffer());
    const fileName = `${crypto.randomBytes(20).toString("hex")}${ext}`;
    const isProductionDisk = existsSync("/var/data");
    const uploadsDir = isProductionDisk 
      ? "/var/data/uploads/approvals" 
      : path.join(process.cwd(), "public", "uploads", "approvals");
    await mkdir(uploadsDir, { recursive: true });
    const diskPath = path.join(uploadsDir, fileName);
    await writeFile(diskPath, buf);

    const imagePath = `/api/uploads/${fileName}`;

    const isMeta = !selectedSite.startsWith("http");
    const fbPageId = isMeta ? (selectedSite === assignee.facebookPageId ? selectedSite : (assignee.facebookPageId || selectedSite)) : null;
    const igUserId = isMeta ? (selectedSite === assignee.instagramUserId ? selectedSite : (assignee.instagramUserId || null)) : null;
    const siteUrlLink = isMeta ? (assignee.siteLink || null) : selectedSite;

    const now = new Date();
    const approval = await prisma.approval.create({
      data: {
        title,
        bodyText: "",
        imagePath,
        assigneeId: assignee.id,
        createdById: session.user.id,
        status: approveOnAssignment ? "approved" : "pending",
        lastAction: approveOnAssignment ? "approve" : null,
        respondedAt: approveOnAssignment ? now : null,
        awaitingAdminReview: false,
        scheduledFor: (!isNaN(scheduledFor) ? scheduledFor : null),
        facebookPageId: fbPageId,
        instagramUserId: igUserId,
        siteLink: siteUrlLink,
      },
      include: {
        assignee: { select: { id: true, email: true, name: true } },
      },
    });

    try {
      await prisma.$executeRaw(
        Prisma.sql`UPDATE approvals SET caption = ${caption}, instructions = ${instructions} WHERE id = ${approval.id}`
      );
    } catch {
      try {
        await prisma.$executeRaw(
          Prisma.sql`UPDATE approvals SET caption = ${caption} WHERE id = ${approval.id}`
        );
      } catch {
        // caption column missing
      }
      try {
        await prisma.$executeRaw(
          Prisma.sql`UPDATE approvals SET instructions = ${instructions} WHERE id = ${approval.id}`
        );
      } catch {
        // instructions column missing
      }
    }

    if (approveOnAssignment) {
      try {
        await prisma.$executeRaw(
          Prisma.sql`UPDATE approvals SET skipped_assignee_review = 1 WHERE id = ${approval.id}`
        );
      } catch {
        // DB column missing or client mismatch — row still created as approved
      }
    }

    // --- Send Email Notification ---
    let token = null;
    try {
      const crypto = await import("crypto");
      const secret = process.env.NEXTAUTH_SECRET || "default-secret";
      token = crypto.createHmac('sha256', secret).update(String(approval.id)).digest('hex');
    } catch(err) {
      console.error("Failed to generate HMAC token", err);
    }

    if (!approveOnAssignment) {
      try {
        const { sendPostApprovalNotification } = await import("../../../../lib/email.js");
        const emailApproval = { ...approval, caption };

        // 1. Send to the main Assignee (Approver)
        if (assignee.email) {
          console.log(`[INFO] Sending main approval email to Approver: ${assignee.email}`);
          await sendPostApprovalNotification(assignee.email, emailApproval, assignee, token);
        }

        // 2. Send copy to all active Super Admins
        const superAdmins = await prisma.user.findMany({
          where: { role: ROLES.SUPER_ADMIN, isActive: true },
          select: { email: true, name: true }
        });
        for (const admin of superAdmins) {
          if (admin.email && admin.email !== assignee.email) {
            console.log(`[INFO] Sending copy of approval email to Super Admin: ${admin.email}`);
            await sendPostApprovalNotification(admin.email, emailApproval, admin, token);
          }
        }

        // 3. Send copy to relevant SMMs (creator or mapped)
        const relevantSmms = await prisma.user.findMany({
          where: { role: ROLES.SMM, isActive: true },
          select: {
            id: true,
            email: true,
            name: true,
            siteLink: true,
            facebookPageId: true,
            instagramUserId: true,
            accessibleSites: { select: { siteLink: true } }
          }
        });

        for (const smm of relevantSmms) {
          const isCreator = smm.id === session.user.id;
          
          const primary = smm.siteLink ? String(smm.siteLink).toLowerCase().trim() : "";
          const normSelected = selectedSite ? String(selectedSite).toLowerCase().trim() : "";
          
          const isSiteMatch = (primary && primary === normSelected) || (smm.accessibleSites || []).some(
            (entry) => entry.siteLink && String(entry.siteLink).toLowerCase().trim() === normSelected
          );
          const isMetaMatch = (smm.facebookPageId && String(smm.facebookPageId).toLowerCase().trim() === normSelected) || 
                              (smm.instagramUserId && String(smm.instagramUserId).toLowerCase().trim() === normSelected);
          
          const isRelevant = isCreator || isSiteMatch || isMetaMatch;
          
          if (isRelevant && smm.email && smm.email !== assignee.email) {
            console.log(`[INFO] Sending copy of approval email to SMM: ${smm.email}`);
            await sendPostApprovalNotification(smm.email, emailApproval, smm, token);
          }
        }
      } catch (emailErr) {
        console.error("Failed to send approval email notifications", emailErr);
      }
    }

    const approvalOut = { ...approval, caption, instructions, skippedAssigneeReview: approveOnAssignment };

    return new Response(JSON.stringify({ approval: approvalOut }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error.message === "Unauthorized" || error.message.includes("Super admin")) {

      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: error.message || "Failed to create approval" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
