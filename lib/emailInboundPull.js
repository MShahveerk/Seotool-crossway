/**
 * Poll IMAP mailboxes and create post/blog approval rows from incoming email.
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
    .replace(/^\[(post|blog)\]\s*/i, "")
    .trim();
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

async function createPostFromEmail({ parsed, siteKey, config }) {
  const systemUser = await getSystemUser();
  if (!systemUser) return false;

  const subject = cleanSubject(parsed.subject);
  const caption = String(parsed.text || parsed.textAsHtml || "").trim().slice(0, 2000);
  const title = (subject || caption.split("\n")[0] || "Email post").slice(0, 255);

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

  const externalId = parsed.messageId ? `email_${parsed.messageId}`.slice(0, 191) : null;
  if (externalId) {
    const existing = await prisma.approval.findFirst({
      where: { externalId, OR: [{ siteLink: siteKey }, { facebookPageId: config.facebookPageId || siteKey }] },
    });
    if (existing) return false;
  }

  const { assignee } = await findAssigneesForSite(siteKey);
  const { fbPageId, igUserId, siteUrlLink } = resolvePostTargetIds(siteKey, assignee, {
    publishFacebook: true,
    publishInstagram: true,
  });

  const approval = await prisma.approval.create({
    data: {
      title,
      bodyText: "",
      imagePath,
      assigneeId: assignee.id,
      createdById: systemUser.id,
      status: "pending",
      facebookPageId: fbPageId,
      instagramUserId: igUserId,
      siteLink: siteUrlLink,
      source: "email_inbound",
      externalId,
      publishStatus: "unpublish",
    },
  });

  try {
    await prisma.$executeRaw(Prisma.sql`UPDATE approvals SET caption = ${caption} WHERE id = ${approval.id}`);
  } catch {
    /* legacy */
  }

  try {
    const { sendPostApprovalNotification } = await import("./email.js");
    const { collectApprovalEmailRecipients } = await import("./approvalRecipients.js");
    const token = createApprovalQuickActionToken(approval.id);
    const { recipients } = await collectApprovalEmailRecipients({
      siteLink: siteUrlLink || siteKey,
      selectedSite: siteKey,
      creator: systemUser,
      creatorUserId: systemUser.id,
      operatorUser: systemUser,
    });
    for (const recipient of recipients) {
      await sendPostApprovalNotification(
        recipient.email,
        { ...approval, caption, selectedSite: siteKey, createdByName: "Email inbound" },
        recipient,
        token
      );
    }
  } catch {
    /* optional */
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

  const result = await pollImapOnce(config, (parsed) => createPostFromEmail({ parsed, siteKey, config }));

  await prisma.sitePostConfig.update({
    where: { siteKey: config.siteKey },
    data: { lastEmailPullAt: new Date() },
  });

  return {
    ...result,
    message: `Processed ${result.processed} email(s), skipped ${result.skipped}.`,
  };
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
