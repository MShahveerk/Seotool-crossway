/**
 * Autopilot Writer → Blog Automation Studio payload bridge.
 */
import prisma from "../prisma.js";
import { enqueueStudioRun } from "../blogStudio/runner.js";

const PAYLOAD_KEYS = [
  "seedPrompt",
  "mustFollowKeywords",
  "secondaryKeywords",
  "targetAudience",
  "location",
  "ctaText",
  "ctaUrl",
  "wordCountRange",
  "contentType",
  "brandNotes",
  "serpNotes",
  "imagePrompt",
];

export function normalizeWriterPayload(raw = {}) {
  const topic = String(raw.topic || raw.title || "").trim().slice(0, 180);
  const title = String(raw.title || topic || "Writer send").trim().slice(0, 512);
  const payload = {
    topic,
    seedPrompt: String(raw.seedPrompt || "").trim(),
    mustFollowKeywords: String(raw.mustFollowKeywords || "").trim(),
    secondaryKeywords: String(raw.secondaryKeywords || "").trim(),
    targetAudience: String(raw.targetAudience || "").trim(),
    location: String(raw.location || "").trim(),
    ctaText: String(raw.ctaText || "").trim(),
    ctaUrl: String(raw.ctaUrl || "").trim(),
    wordCountRange: String(raw.wordCountRange || "1200-1800").trim().slice(0, 64),
    contentType: String(raw.contentType || "Blog post").trim().slice(0, 128),
    brandNotes: String(raw.brandNotes || "").trim(),
    serpNotes: String(raw.serpNotes || "").trim(),
    imagePrompt: String(raw.imagePrompt || "").trim(),
    why: String(raw.why || "").trim(),
  };
  return { title, topic, payload };
}

export function blogStudioOverridesFromPayload(payload = {}) {
  const overrides = {};
  for (const key of PAYLOAD_KEYS) {
    if (payload[key] !== undefined && payload[key] !== null && String(payload[key]).trim() !== "") {
      overrides[key] = payload[key];
    }
  }
  // Blog Studio image agent reads imagePrompt on config in some paths; also topicImagePrompt for excel.
  if (payload.imagePrompt) {
    overrides.imagePrompt = payload.imagePrompt;
    overrides.topicImagePrompt = payload.imagePrompt;
  }
  return overrides;
}

export async function persistWriterSends({ siteLink, runId, sends }) {
  const list = Array.isArray(sends) ? sends : [];
  const created = [];
  for (const raw of list) {
    const { title, topic, payload } = normalizeWriterPayload(raw);
    if (!payload.seedPrompt && !payload.mustFollowKeywords && !topic) continue;
    const row = await prisma.seoAutopilotWriterSend.create({
      data: {
        siteLink,
        runId: runId || null,
        title,
        topic: topic || title,
        payloadJson: payload,
        status: "ready",
      },
    });
    created.push(row);
  }
  return created;
}

/** Competitor Analysis seeds are stored with a `competitor:` runId prefix. */
const COMPETITOR_RUN_PREFIX = "competitor:";

export async function listWriterSends(siteLink, { take = 80, source } = {}) {
  const rows = await prisma.seoAutopilotWriterSend.findMany({
    where: { siteLink: String(siteLink || "").trim() },
    orderBy: { createdAt: "desc" },
    take: source ? 200 : take,
  });
  if (source === "competitor") {
    return rows.filter((r) => String(r.runId || "").startsWith(COMPETITOR_RUN_PREFIX)).slice(0, take);
  }
  if (source === "autopilot") {
    return rows.filter((r) => !String(r.runId || "").startsWith(COMPETITOR_RUN_PREFIX)).slice(0, take);
  }
  return rows;
}

export async function markWriterSendCompleted(id) {
  return prisma.seoAutopilotWriterSend.update({
    where: { id },
    data: { status: "completed", completedAt: new Date(), errorMessage: null },
  });
}

export async function runWriterSendInBlogStudio(id, { triggeredById = null } = {}) {
  const send = await prisma.seoAutopilotWriterSend.findUnique({ where: { id } });
  if (!send) {
    const err = new Error("Writer send not found.");
    err.status = 404;
    throw err;
  }
  const payload = send.payloadJson && typeof send.payloadJson === "object" ? send.payloadJson : {};
  const overrides = blogStudioOverridesFromPayload(payload);
  const topic = String(send.topic || payload.topic || send.title || "").trim();

  try {
    const run = await enqueueStudioRun({
      siteLink: send.siteLink,
      topic,
      trigger: "manual",
      triggeredById,
      generateImage: true,
      overrides,
    });

    const updated = await prisma.seoAutopilotWriterSend.update({
      where: { id: send.id },
      data: {
        status: "queued",
        blogRunId: run.id,
        lastRunAt: new Date(),
        errorMessage: null,
        completedAt: null,
      },
    });
    return { send: updated, run };
  } catch (err) {
    await prisma.seoAutopilotWriterSend.update({
      where: { id: send.id },
      data: {
        status: "failed",
        errorMessage: err.message || "Failed to enqueue Blog Studio run",
      },
    });
    throw err;
  }
}
