/**
 * Poll IMAP mailboxes and create post/blog approval rows from incoming email.
 *
 * SMM posts: subject must contain "SMM POST". Stored as status=draft (one per account).
 * A daily cron promotes the latest draft to pending approval; on approve it is scheduled.
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { Prisma } from "@prisma/client";
import prisma from "./prisma.js";
import { findAssigneesForSite, notifyBlogApprovers, createBlogQuickActionToken } from "./blogAssignee.js";
import { saveApprovalMediaFromUrl, saveApprovalMediaBuffer } from "./approvalMedia.js";
import { resolvePostTargetIds } from "./postPayload.js";
import { buildBlogPayload } from "./blogPayload.js";
import { BLOG_INCLUDE } from "./blogAccess.js";
import { recordBlogRevision } from "./blogRevisions.js";
import { createApprovalQuickActionToken } from "./approvalQuickAction.js";

const SMM_POST_SUBJECT_RE = /smm\s*post/i;

function imapSettingsFromConfig(config) {
  return {
    host: String(config.imapHost || "").trim(),
    port: Number(config.imapPort) || 993,
    user: String(config.imapUser || "").trim(),
    password: String(config.imapPassword || "").trim(),
    folder: String(config.imapFolder || "INBOX").trim() || "INBOX",
  };
}

function hasImapConfig(config) {
  const s = imapSettingsFromConfig(config);
  return Boolean(s.host && s.user && s.password);
}

function cleanSubject(subject = "") {
  return String(subject || "")
    .replace(/^(re|fwd):\s*/gi, "")
    .replace(/smm\s*post[:\-]?\s*/gi, "")
    .replace(/^\[(post|blog)\]\s*/i, "")
    .trim();
}

function subjectHasSmmPost(subject = "") {
  return SMM_POST_SUBJECT_RE.test(String(subject || ""));
}

async function saveAttachmentMedia(attachment) {
  if (!attachment?.content?.length) return null;
  const mime = attachment.contentType || "image/jpeg";
  const buf = Buffer.from(attachment.content);
  if (mime.startsWith("image/") || mime.startsWith("video/")) {
    return saveApprovalMediaBuffer(buf, mime);
  }
  return null;
}

async function getSystemUser() {
  return prisma.user.findFirst({
    where: { role: "super_admin", isActive: true },
    select: { id: true, email: true, name: true },
  });
}

function draftSiteFilter(siteKey, config) {
  const pageId = config?.facebookPageId || (/^\d+$/.test(String(siteKey || "").trim()) ? siteKey : null);
  const or = [{ siteLink: siteKey }];
  if (pageId) or.push({ facebookPageId: String(pageId) });
  if (config?.siteKey && config.siteKey !== siteKey) or.push({ siteLink: config.siteKey });
  return { OR: or };
}

export async function testImapConnection(config) {
  if (!hasImapConfig(config)) {
    const err = new Error("IMAP host, user, and password are required.");
    err.status = 400;
    throw err;
  }
  const s = imapSettingsFromConfig(config);
  const client = new ImapFlow({
    host: s.host,
    port: s.port,
    secure: s.port === 993,
    auth: { user: s.user, pass: s.password },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock(s.folder);
  try {
    const status = await client.status(s.folder, { messages: true, unseen: true });
    return {
      ok: true,
      folder: s.folder,
      messages: status.messages,
      unseen: status.unseen,
    };
  } finally {
    lock.release();
    await client.logout();
  }
}

async function pollImapOnce(config, handler) {
  if (!hasImapConfig(config)) return { processed: 0, skipped: 0 };

  const s = imapSettingsFromConfig(config);
  const client = new ImapFlow({
    host: s.host,
    port: s.port,
    secure: s.port === 993,
    auth: { user: s.user, pass: s.password },
    logger: false,
  });

  let processed = 0;
  let skipped = 0;

  await client.connect();
  const lock = await client.getMailboxLock(s.folder);
  try {
    for await (const msg of client.fetch({ seen: false }, { source: true, uid: true })) {
      try {
        const parsed = await simpleParser(msg.source);
        const ok = await handler(parsed, msg.uid);
        if (ok) {
          await client.messageFlagsAdd(msg.uid, ["\\Seen"]);
          processed += 1;
        } else {
          skipped += 1;
        }
      } catch (err) {
        console.warn("[emailInbound] message parse failed:", err.message);
        skipped += 1;
      }
    }
  } finally {
    lock.release();
    await client.logout();
  }

  return { processed, skipped };
}

/**
 * Poll unread mail, keep only the newest "SMM POST" message as a single draft for this account.
 */
async function pullLatestSmmPostDraft({ siteKey, config }) {
  if (!hasImapConfig(config)) return { processed: 0, skipped: 0, draftUpdated: false };

  const s = imapSettingsFromConfig(config);
  const client = new ImapFlow({
    host: s.host,
    port: s.port,
    secure: s.port === 993,
    auth: { user: s.user, pass: s.password },
    logger: false,
  });

  const candidates = [];
  let skipped = 0;

  await client.connect();
  const lock = await client.getMailboxLock(s.folder);
  try {
    for await (const msg of client.fetch({ seen: false }, { source: true, uid: true })) {
      try {
        const parsed = await simpleParser(msg.source);
        if (!subjectHasSmmPost(parsed.subject)) {
          skipped += 1;
          continue;
        }
        candidates.push({ parsed, uid: msg.uid });
      } catch (err) {
        console.warn("[emailInbound] message parse failed:", err.message);
        skipped += 1;
      }
    }

    if (!candidates.length) {
      return { processed: 0, skipped, draftUpdated: false };
    }

    // Newest last in typical IMAP order; prefer the last candidate.
    const latest = candidates[candidates.length - 1];
    const saved = await upsertPostDraftFromEmail({
      parsed: latest.parsed,
      siteKey,
      config,
    });

    for (const c of candidates) {
      try {
        await client.messageFlagsAdd(c.uid, ["\\Seen"]);
      } catch {
        /* ignore */
      }
    }

    return {
      processed: candidates.length,
      skipped,
      draftUpdated: Boolean(saved),
      message: saved
        ? `Kept 1 draft from ${candidates.length} SMM POST email(s) (older matches marked read).`
        : `Found ${candidates.length} SMM POST email(s) but none had usable media.`,
    };
  } finally {
    lock.release();
    await client.logout();
  }
}

async function upsertPostDraftFromEmail({ parsed, siteKey, config }) {
  const systemUser = await getSystemUser();
  if (!systemUser) return false;

  if (!subjectHasSmmPost(parsed.subject)) return false;

  const subject = cleanSubject(parsed.subject);
  const caption = String(parsed.text || parsed.textAsHtml || "").trim().slice(0, 2000);
  const title = (subject || caption.split("\n")[0] || "SMM post draft").slice(0, 255);

  let imagePath = null;
  for (const att of parsed.attachments || []) {
    if (att.contentType?.startsWith("image/") || att.contentType?.startsWith("video/")) {
      imagePath = await saveAttachmentMedia(att);
      if (imagePath) break;
    }
  }

  if (!imagePath) {
    const urlMatch = String(parsed.text || "").match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|webp|gif|mp4|mov)/i);
    if (urlMatch) {
      imagePath = await saveApprovalMediaFromUrl(urlMatch[0]);
    }
  }

  if (!imagePath) return false;

  const { assignee } = await findAssigneesForSite(siteKey);
  const { fbPageId, igUserId, siteUrlLink } = resolvePostTargetIds(siteKey, assignee, {
    publishFacebook: true,
    publishInstagram: true,
  });

  const externalId = parsed.messageId ? `email_${parsed.messageId}`.slice(0, 191) : null;
  const siteFilter = draftSiteFilter(siteKey, { ...config, facebookPageId: fbPageId || config.facebookPageId });

  // Only one draft slot per account — replace any existing draft.
  const existingDrafts = await prisma.approval.findMany({
    where: {
      status: "draft",
      source: "email_inbound",
      ...siteFilter,
    },
    select: { id: true },
  });

  for (const row of existingDrafts) {
    await prisma.approval.delete({ where: { id: row.id } });
  }

  if (externalId) {
    const existingSame = await prisma.approval.findFirst({
      where: { externalId, ...siteFilter },
    });
    if (existingSame && existingSame.status !== "draft") {
      // Already promoted/processed this message id.
      return false;
    }
  }

  const approval = await prisma.approval.create({
    data: {
      title,
      bodyText: "",
      imagePath,
      assigneeId: assignee.id,
      createdById: systemUser.id,
      status: "draft",
      facebookPageId: fbPageId,
      instagramUserId: igUserId,
      siteLink: siteUrlLink,
      source: "email_inbound",
      externalId,
      publishStatus: "unpublish",
      awaitingAdminReview: false,
      hiddenFromAssignee: true,
    },
  });

  try {
    await prisma.$executeRaw(Prisma.sql`UPDATE approvals SET caption = ${caption} WHERE id = ${approval.id}`);
  } catch {
    /* legacy */
  }

  return true;
}

async function createBlogFromEmail({ parsed, siteLink, config }) {
  const systemUser = await getSystemUser();
  if (!systemUser) return false;

  const subject = cleanSubject(parsed.subject);
  const text = String(parsed.text || "").trim();
  const html = String(parsed.html || parsed.textAsHtml || text || "").trim();
  const title = (subject || "Email blog").slice(0, 512);
  const content = html || `<p>${text.replace(/\n/g, "<br>")}</p>`;

  let featuredImagePath = null;
  for (const att of parsed.attachments || []) {
    if (att.contentType?.startsWith("image/")) {
      featuredImagePath = await saveAttachmentMedia(att);
      if (featuredImagePath) break;
    }
  }

  const externalId = parsed.messageId ? `email_${parsed.messageId}`.slice(0, 191) : null;
  if (externalId) {
    const existing = await prisma.blogPost.findFirst({ where: { siteLink, externalId } });
    if (existing) return false;
  }

  const { assignee, allApprovers } = await findAssigneesForSite(siteLink);
  const payload = buildBlogPayload({ title, content, status: "draft" });
  if (featuredImagePath) {
    payload.featured_media = { url: featuredImagePath, alt: "" };
  }

  const blog = await prisma.blogPost.create({
    data: {
      siteLink,
      assigneeId: assignee.id,
      createdById: systemUser.id,
      status: "pending",
      source: "email_inbound",
      externalId,
      title,
      content,
      payload,
      featuredImagePath,
      publishStatus: "unpublish",
    },
    include: BLOG_INCLUDE,
  });

  await recordBlogRevision(blog, { action: "email_inbound", actorId: systemUser.id });
  const token = createBlogQuickActionToken(blog.id);
  await notifyBlogApprovers({
    blog,
    approvers: allApprovers,
    creator: systemUser,
    token,
    skipped: false,
    operatorUser: systemUser,
  });

  return true;
}

export async function pullEmailPostsForSite(siteKey, opts = {}) {
  const { getSitePostConfig } = await import("./postPublishConfig.js");
  const config = await getSitePostConfig(siteKey);
  if (!config) {
    const err = new Error("Post config not found for this account.");
    err.status = 404;
    throw err;
  }
  if (!opts.force && !config.emailInboundEnabled) {
    return { processed: 0, message: "Email inbound is disabled." };
  }
  if (!hasImapConfig(config)) {
    const err = new Error("IMAP is not configured.");
    err.status = 400;
    throw err;
  }

  const result = await pullLatestSmmPostDraft({ siteKey, config });

  await prisma.sitePostConfig.update({
    where: { siteKey: config.siteKey },
    data: { lastEmailPullAt: new Date() },
  });

  return {
    processed: result.processed || 0,
    skipped: result.skipped || 0,
    draftUpdated: Boolean(result.draftUpdated),
    message:
      result.message ||
      `Processed ${result.processed || 0} email(s), skipped ${result.skipped || 0}. Subject must include "SMM POST".`,
  };
}

/**
 * Promote one email draft per account to pending approval (daily).
 */
export async function promoteEmailDraftsForApproval(logger = console) {
  const drafts = await prisma.approval.findMany({
    where: {
      status: "draft",
      source: "email_inbound",
      publishStatus: "unpublish",
    },
    orderBy: { createdAt: "desc" },
  });

  if (!drafts.length) {
    logger.info?.("No email drafts to promote.");
    return { promoted: 0 };
  }

  const byKey = new Map();
  for (const draft of drafts) {
    const key = draft.facebookPageId || draft.siteLink || draft.id;
    if (!byKey.has(key)) byKey.set(key, draft);
  }

  const systemUser = await getSystemUser();
  let promoted = 0;

  for (const draft of byKey.values()) {
    try {
      // Drop any older drafts for the same account (should already be one).
      const staleOr = [];
      if (draft.facebookPageId) staleOr.push({ facebookPageId: draft.facebookPageId });
      if (draft.siteLink) staleOr.push({ siteLink: draft.siteLink });
      if (staleOr.length) {
        await prisma.approval.deleteMany({
          where: {
            status: "draft",
            source: "email_inbound",
            id: { not: draft.id },
            OR: staleOr,
          },
        });
      }

      const updated = await prisma.approval.update({
        where: { id: draft.id },
        data: {
          status: "pending",
          hiddenFromAssignee: false,
          awaitingAdminReview: false,
        },
        include: {
          assignee: { select: { id: true, email: true, name: true } },
        },
      });

      let caption = "";
      try {
        const rows = await prisma.$queryRaw(Prisma.sql`SELECT caption FROM approvals WHERE id = ${updated.id}`);
        caption = String(rows?.[0]?.caption || "");
      } catch {
        caption = "";
      }

      if (systemUser) {
        try {
          const { sendPostApprovalNotification } = await import("./email.js");
          const { collectApprovalEmailRecipients } = await import("./approvalRecipients.js");
          const token = createApprovalQuickActionToken(updated.id);
          const siteKey = updated.facebookPageId || updated.siteLink || "";
          const { recipients } = await collectApprovalEmailRecipients({
            siteLink: updated.siteLink || siteKey,
            selectedSite: siteKey,
            creator: systemUser,
            creatorUserId: systemUser.id,
            operatorUser: systemUser,
          });
          for (const recipient of recipients) {
            await sendPostApprovalNotification(
              recipient.email,
              {
                ...updated,
                caption,
                selectedSite: siteKey,
                createdByName: "Daily draft promotion",
              },
              recipient,
              token
            );
          }
        } catch (err) {
          logger.error?.(`Draft promote notify failed ${draft.id}: ${err.message}`);
        }
      }

      promoted += 1;
      logger.info?.(`Promoted email draft ${draft.id} → pending approval.`);
    } catch (err) {
      logger.error?.(`Draft promote failed ${draft.id}: ${err.message}`);
    }
  }

  return { promoted };
}

export async function pullEmailBlogsForSite(siteLink, opts = {}) {
  const { getSitePublishConfig } = await import("./blogPublishConfig.js");
  const config = await getSitePublishConfig(siteLink);
  if (!config) {
    const err = new Error("Blog publish config not found.");
    err.status = 404;
    throw err;
  }
  if (!opts.force && !config.emailInboundEnabled) {
    return { processed: 0, message: "Email inbound is disabled." };
  }
  if (!hasImapConfig(config)) {
    const err = new Error("IMAP is not configured.");
    err.status = 400;
    throw err;
  }

  const result = await pollImapOnce(config, (parsed) => {
    const subj = String(parsed.subject || "");
    if (!/^\[blog\]/i.test(subj) && !opts.acceptAllSubjects) return Promise.resolve(false);
    return createBlogFromEmail({ parsed, siteLink: config.siteLink, config });
  });

  await prisma.sitePublishConfig.update({
    where: { siteLink: config.siteLink },
    data: { lastEmailPullAt: new Date() },
  });

  return {
    ...result,
    message: `Processed ${result.processed} blog email(s), skipped ${result.skipped}.`,
  };
}

export async function runEmailInboundForAllSites(logger = console) {
  const postConfigs = await prisma.sitePostConfig.findMany({ where: { emailInboundEnabled: true, enabled: true } });
  const blogConfigs = await prisma.sitePublishConfig.findMany({ where: { emailInboundEnabled: true, enabled: true } });

  for (const config of postConfigs) {
    try {
      const r = await pullEmailPostsForSite(config.siteKey, { force: true });
      logger.info?.(`Email post pull ${config.siteKey}: ${r.message}`);
    } catch (err) {
      logger.error?.(`Email post pull ${config.siteKey}: ${err.message}`);
    }
  }

  for (const config of blogConfigs) {
    try {
      const r = await pullEmailBlogsForSite(config.siteLink, { force: true });
      logger.info?.(`Email blog pull ${config.siteLink}: ${r.message}`);
    } catch (err) {
      logger.error?.(`Email blog pull ${config.siteLink}: ${err.message}`);
    }
  }
}
