import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { findAssigneesForSite } from "@/lib/blogAssignee.js";
import { getSitePostConfig } from "@/lib/postPublishConfig.js";
import { saveApprovalMediaFromUrl } from "@/lib/approvalMedia.js";
import {
  normalizeInboundPostPayload,
  resolveInboundSiteKey,
  resolvePostTargetIds,
} from "@/lib/postPayload.js";
import { createApprovalQuickActionToken } from "@/lib/approvalQuickAction.js";

export const runtime = "nodejs";

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,x-post-secret,x-site-key,x-meta-page-id",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

async function verifyInboundSecret(req, siteKey) {
  const incoming = (req.headers.get("x-post-secret") || "").trim();
  const globalSecret = (process.env.POST_INBOUND_SECRET || "").trim();
  const config = await getSitePostConfig(siteKey);
  const siteSecret = String(config?.inboundSecret || "").trim();

  if (siteSecret && incoming === siteSecret) return true;
  if (globalSecret && incoming === globalSecret) return true;
  if (!siteSecret && !globalSecret && process.env.NODE_ENV !== "production") return true;
  return false;
}

export async function POST(req) {
  try {
    const body = await req.json();
    const siteKey = resolveInboundSiteKey(body, req.headers);

    if (!siteKey) {
      return Response.json({ error: "siteKey or facebookPageId is required." }, { status: 400, headers: CORS });
    }

    if (!(await verifyInboundSecret(req, siteKey))) {
      return Response.json({ error: "Unauthorized inbound request." }, { status: 401, headers: CORS });
    }

    const config = await getSitePostConfig(siteKey);
    if (config && !config.enabled) {
      return Response.json({ error: "Post ingestion is disabled for this account." }, { status: 403, headers: CORS });
    }

    const normalized = normalizeInboundPostPayload(body);

    if (!normalized.title || normalized.title.length > 255) {
      return Response.json({ error: "title is required (max 255 characters)." }, { status: 400, headers: CORS });
    }
    if (normalized.caption.length > 2000) {
      return Response.json({ error: "caption must be 2000 characters or fewer." }, { status: 400, headers: CORS });
    }
    if (!normalized.mediaUrl) {
      return Response.json({ error: "mediaUrl is required." }, { status: 400, headers: CORS });
    }

    const { assignee } = await findAssigneesForSite(siteKey);
    const { fbPageId, igUserId, siteUrlLink } = resolvePostTargetIds(siteKey, assignee, normalized);

    if (normalized.externalId) {
      const existing = await prisma.approval.findFirst({
        where: {
          externalId: normalized.externalId,
          OR: [
            fbPageId ? { facebookPageId: fbPageId } : undefined,
            siteUrlLink ? { siteLink: siteUrlLink } : undefined,
            { facebookPageId: siteKey },
            { siteLink: siteKey },
          ].filter(Boolean),
        },
      });
      if (existing) {
        const imagePath = await saveApprovalMediaFromUrl(normalized.mediaUrl);
        const updated = await prisma.approval.update({
          where: { id: existing.id },
          data: {
            title: normalized.title,
            imagePath,
            scheduledFor: normalized.scheduledFor ?? existing.scheduledFor,
            facebookPageId: fbPageId ?? existing.facebookPageId,
            instagramUserId: igUserId ?? existing.instagramUserId,
            status: existing.publishStatus === "published" ? existing.status : "pending",
          },
          include: {
            assignee: { select: { id: true, email: true, name: true } },
          },
        });
        try {
          await prisma.$executeRaw(
            Prisma.sql`UPDATE approvals SET caption = ${normalized.caption} WHERE id = ${updated.id}`
          );
        } catch {
          /* caption column */
        }
        return Response.json({ approval: { ...updated, caption: normalized.caption }, updated: true }, { headers: CORS });
      }
    }

    const systemUser = await prisma.user.findFirst({
      where: { role: "super_admin", isActive: true },
      select: { id: true, email: true, name: true },
    });
    if (!systemUser) {
      return Response.json({ error: "No system user available to own inbound post." }, { status: 503, headers: CORS });
    }

    const imagePath = await saveApprovalMediaFromUrl(normalized.mediaUrl);
    const now = new Date();
    const approveOnAssignment = normalized.approveOnAssignment;

    const approval = await prisma.approval.create({
      data: {
        title: normalized.title,
        bodyText: "",
        imagePath,
        assigneeId: assignee.id,
        createdById: systemUser.id,
        status: approveOnAssignment ? "approved" : "pending",
        lastAction: approveOnAssignment ? "approve" : null,
        respondedAt: approveOnAssignment ? now : null,
        awaitingAdminReview: false,
        skippedAssigneeReview: approveOnAssignment,
        scheduledFor: normalized.scheduledFor,
        facebookPageId: fbPageId,
        instagramUserId: igUserId,
        siteLink: siteUrlLink,
        source: "inbound",
        externalId: normalized.externalId,
        publishStatus: "unpublish",
      },
      include: {
        assignee: { select: { id: true, email: true, name: true } },
      },
    });

    try {
      await prisma.$executeRaw(
        Prisma.sql`UPDATE approvals SET caption = ${normalized.caption}, skipped_assignee_review = ${approveOnAssignment ? 1 : 0} WHERE id = ${approval.id}`
      );
    } catch {
      try {
        await prisma.$executeRaw(Prisma.sql`UPDATE approvals SET caption = ${normalized.caption} WHERE id = ${approval.id}`);
      } catch {
        /* legacy schema */
      }
    }

    if (!approveOnAssignment) {
      try {
        const { sendPostApprovalNotification } = await import("@/lib/email.js");
        const { collectApprovalEmailRecipients } = await import("@/lib/approvalRecipients.js");
        const token = createApprovalQuickActionToken(approval.id);
        const { recipients } = await collectApprovalEmailRecipients({
          siteLink: siteUrlLink || siteKey,
          selectedSite: siteKey,
          creator: systemUser,
          creatorUserId: systemUser.id,
          operatorUser: systemUser,
        });
        const emailApproval = {
          ...approval,
          caption: normalized.caption,
          selectedSite: siteKey,
          createdByName: systemUser.name || "Inbound API",
          createdByEmail: systemUser.email || "",
        };
        for (const recipient of recipients) {
          await sendPostApprovalNotification(recipient.email, emailApproval, recipient, token);
        }
      } catch (err) {
        console.error("[posts/inbound] approval email failed:", err.message);
      }
    }

    return Response.json(
      { approval: { ...approval, caption: normalized.caption } },
      { status: 201, headers: CORS }
    );
  } catch (error) {
    return Response.json(
      { error: error.message || "Inbound post failed." },
      { status: error.status || 500, headers: CORS }
    );
  }
}
