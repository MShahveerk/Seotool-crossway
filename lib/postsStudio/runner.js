/**
 * Orchestrate Post Automation Studio → pending Approval.
 */
import prisma from "../prisma.js";
import { sumStageCosts } from "../blogStudio/costs.js";
import { hasProviderKey } from "../blogStudio/providers.js";
import { getSiteStudioConfig, ENGINE_INTERNAL, getEngineMode } from "./engine.js";
import { runAgent1, runAgent2 } from "./agents.js";
import { runImageAgent } from "./imageAgent.js";
import { createPendingApprovalFromStudio } from "./createApproval.js";

function previewFromJson(obj, max = 900) {
  try {
    return JSON.stringify(obj, null, 2).slice(0, max);
  } catch {
    return String(obj || "").slice(0, max);
  }
}

function pickTopic(config, topicOverride) {
  const explicit = String(topicOverride || "").trim();
  if (explicit) return explicit;
  const lines = String(config.hooksOrKeywords || "")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length) {
    const idx = Math.abs(Math.floor(Date.now() / 86400000)) % lines.length;
    return lines[idx];
  }
  const seed = String(config.seedPrompt || "").trim();
  if (seed) {
    const firstLine = seed.split(/\n+/).map((s) => s.trim()).filter(Boolean)[0] || seed;
    return firstLine.slice(0, 180);
  }
  return "Social post angle";
}

function assertKeysReady(config) {
  const checks = [
    ["agent1", config.agent1Provider],
    ["agent2", config.agent2Provider],
    ["image", config.imageProvider || "openai"],
  ];
  const missing = checks
    .filter(([, provider]) => !hasProviderKey(provider, config))
    .map(([agent, provider]) => `${agent} (${provider})`);
  if (missing.length) {
    const err = new Error(
      `Missing API keys for: ${missing.join(", ")}. Open Agents tab, paste keys, and Save.`
    );
    err.status = 400;
    throw err;
  }
}

function configFromRun(baseConfig, run) {
  const meta = Array.isArray(run.stagesJson)
    ? run.stagesJson.find((s) => s?.agent === "_context")
    : null;
  const overrides = meta?.overrides && typeof meta.overrides === "object" ? meta.overrides : {};
  return {
    ...baseConfig,
    ...overrides,
    siteLink: baseConfig.siteLink,
    seedPrompt:
      overrides.seedPrompt !== undefined
        ? overrides.seedPrompt
        : run.seedPromptSnapshot || baseConfig.seedPrompt,
    hooksOrKeywords:
      overrides.hooksOrKeywords !== undefined
        ? overrides.hooksOrKeywords
        : run.keywordsSnapshot || baseConfig.hooksOrKeywords,
  };
}

async function isCancelled(runId) {
  const row = await prisma.postAutomationRun.findUnique({
    where: { id: runId },
    select: { cancelRequested: true, status: true },
  });
  return Boolean(row?.cancelRequested) || row?.status === "cancelled";
}

async function patchRun(runId, data) {
  return prisma.postAutomationRun.update({ where: { id: runId }, data });
}

async function pushStage(runId, stages, stage) {
  stages.push(stage);
  await patchRun(runId, { stagesJson: stages, totalCostUsd: sumStageCosts(stages) });
  return stages;
}

async function updateStage(runId, stages, index, patch) {
  stages[index] = { ...stages[index], ...patch };
  await patchRun(runId, { stagesJson: stages, totalCostUsd: sumStageCosts(stages) });
  return stages;
}

export async function enqueueStudioRun({
  siteLink,
  topic = "",
  trigger = "manual",
  triggeredById = null,
  generateImage = true,
  overrides = null,
  revision = null,
} = {}) {
  const mode = await getEngineMode();
  if (mode !== ENGINE_INTERNAL) {
    const err = new Error("Internal Post Studio is not the active engine.");
    err.status = 409;
    throw err;
  }

  let config = await getSiteStudioConfig(siteLink);
  if (overrides && typeof overrides === "object") {
    config = { ...config, ...overrides, siteLink: config.siteLink };
  }
  assertKeysReady(config);

  if (trigger === "auto" && String(config.autoSource || "seed") !== "excel") {
    const hasSeed = Boolean(String(config.seedPrompt || "").trim());
    const hasHooks = Boolean(String(config.hooksOrKeywords || "").trim());
    if (!hasSeed && !hasHooks) {
      const err = new Error(
        "Auto seed mode needs a General prompt and/or hooks/keywords. Set them on Seeds or Schedule, then Save."
      );
      err.status = 400;
      throw err;
    }
  }

  const resolvedTopic = pickTopic(config, topic);
  const hasOverrides = overrides && typeof overrides === "object";
  const hasRevision = revision && typeof revision === "object";
  const contextStage =
    hasOverrides || hasRevision
      ? [
          {
            agent: "_context",
            status: "meta",
            ...(hasOverrides ? { overrides } : {}),
            ...(hasRevision ? { revision } : {}),
          },
        ]
      : [];

  const run = await prisma.postAutomationRun.create({
    data: {
      siteLink: String(siteLink).trim(),
      trigger,
      status: "queued",
      topic: resolvedTopic,
      seedPromptSnapshot: config.seedPrompt || "",
      keywordsSnapshot: config.hooksOrKeywords || "",
      stagesJson: contextStage,
      triggeredById: triggeredById || null,
    },
  });

  setImmediate(() => {
    executeStudioRun(run.id, { generateImage }).catch((err) => {
      console.error(`[postsStudio] run ${run.id} crashed:`, err.message);
    });
  });

  return run;
}

export async function executeStudioRun(runId, { generateImage = true } = {}) {
  let stages = [];
  const run = await prisma.postAutomationRun.findUnique({ where: { id: runId } });
  if (!run) return null;

  await patchRun(runId, { status: "running", startedAt: new Date(), errorMessage: null });

  try {
    if (await isCancelled(runId)) throw Object.assign(new Error("Cancelled."), { cancelled: true });

    const baseConfig = await getSiteStudioConfig(run.siteLink);
    const config = configFromRun(baseConfig, run);
    const topic = run.topic || pickTopic(config);

    // Internal meta stage carries overrides + optional rejection-revision context
    const metaStage = Array.isArray(run.stagesJson)
      ? run.stagesJson.find((s) => s?.agent === "_context")
      : null;
    const revision =
      metaStage?.revision && typeof metaStage.revision === "object" ? metaStage.revision : null;

    stages = Array.isArray(run.stagesJson)
      ? run.stagesJson.filter((s) => s?.agent !== "_context")
      : [];
    await patchRun(runId, { stagesJson: stages });

    // On a revision run, only rebuild what the reviewer flagged.
    const regenText = revision ? revision.target === "text" || revision.target === "both" : true;
    const regenImage = revision
      ? revision.target === "image" || revision.target === "both"
      : generateImage !== false;

    // Route rejection remarks to the agent(s) that must act on them.
    if (revision?.remarks) {
      if (regenText) {
        config.reviewerFeedback = revision.remarks;
        config.previousDraft = revision.priorPost || null;
      }
      if (regenImage) {
        config.imageRevisionNote = revision.remarks;
      }
    }

    assertKeysReady(config);

    let a1 = null;
    let a2 = null;
    let post;
    let title;
    let caption;

    if (regenText) {
      stages = await pushStage(runId, stages, {
        agent: "agent1",
        role: "Strategist",
        status: "running",
        startedAt: new Date().toISOString(),
        provider: config.agent1Provider,
        model: config.agent1Model,
      });
      try {
        a1 = await runAgent1({ config, topic });
      } catch (err) {
        await updateStage(runId, stages, stages.length - 1, {
          status: "failed",
          finishedAt: new Date().toISOString(),
          error: err.message,
        });
        throw err;
      }
      if (await isCancelled(runId)) throw Object.assign(new Error("Cancelled."), { cancelled: true });
      stages = await updateStage(runId, stages, stages.length - 1, {
        status: "succeeded",
        finishedAt: new Date().toISOString(),
        inputTokens: a1.inputTokens,
        outputTokens: a1.outputTokens,
        costUsd: a1.costUsd,
        model: a1.model,
        provider: a1.provider,
        preview: previewFromJson(a1.json),
      });

      stages = await pushStage(runId, stages, {
        agent: "agent2",
        role: revision ? "Copywriter — Revision (reviewer feedback)" : "Copywriter",
        status: "running",
        startedAt: new Date().toISOString(),
        provider: config.agent2Provider,
        model: config.agent2Model,
      });
      try {
        a2 = await runAgent2({ config, topic, agent1: a1.json });
      } catch (err) {
        await updateStage(runId, stages, stages.length - 1, {
          status: "failed",
          finishedAt: new Date().toISOString(),
          error: err.message,
        });
        throw err;
      }
      if (await isCancelled(runId)) throw Object.assign(new Error("Cancelled."), { cancelled: true });
      stages = await updateStage(runId, stages, stages.length - 1, {
        status: "succeeded",
        finishedAt: new Date().toISOString(),
        inputTokens: a2.inputTokens,
        outputTokens: a2.outputTokens,
        costUsd: a2.costUsd,
        model: a2.model,
        provider: a2.provider,
        preview: previewFromJson({
          title: a2.json?.title,
          caption: a2.json?.caption,
          platform: a2.json?.platform,
        }),
      });

      post = a2.json || {};
      title = String(post.title || topic).trim().slice(0, 255);
      caption = String(post.caption || "").trim().slice(0, 2000);
      if (!caption) throw new Error("Copywriter did not return a caption.");
      if (Array.isArray(post.hashtags) && post.hashtags.length && !/#\w/.test(caption)) {
        const tags = post.hashtags
          .map((h) => String(h || "").trim())
          .filter(Boolean)
          .map((h) => (h.startsWith("#") ? h : `#${h.replace(/^#+/, "")}`));
        if (tags.length) caption = `${caption}\n\n${tags.join(" ")}`.slice(0, 2000);
      }
    } else {
      // Reviewer flagged only the image — carry the approved caption/text over unchanged.
      post = revision?.priorPost ? { ...revision.priorPost } : {};
      title = String(post.title || topic).trim().slice(0, 255);
      caption = String(post.caption || "").trim().slice(0, 2000);
      if (!caption) throw new Error("No previous caption available to reuse for this revision.");
      stages = await pushStage(runId, stages, {
        agent: "agent2",
        role: "Copywriter — kept from previous draft",
        status: "succeeded",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        note: "Reviewer flagged only the image — the approved caption/text was reused as-is.",
        preview: previewFromJson({ title, caption }),
      });
    }

    let img = null;
    if (regenImage) {
      stages = await pushStage(runId, stages, {
        agent: "image",
        role: revision ? "Image — Revision (reviewer feedback)" : "Image — Feed Creative",
        status: "running",
        startedAt: new Date().toISOString(),
        provider: config.imageProvider,
        model: config.imageModel,
      });
      try {
        if (await isCancelled(runId)) throw Object.assign(new Error("Cancelled."), { cancelled: true });
        img = await runImageAgent({
          config: {
            ...config,
            runTopic: topic,
            topicImagePrompt: config.topicImagePrompt || post.image_prompt || a1?.json?.image_direction || "",
          },
          post: { ...post, title, caption },
          topic,
        });
      } catch (err) {
        if (err.cancelled) throw err;
        await updateStage(runId, stages, stages.length - 1, {
          status: "failed",
          finishedAt: new Date().toISOString(),
          error: err.message,
        });
        throw err;
      }
      if (await isCancelled(runId)) throw Object.assign(new Error("Cancelled."), { cancelled: true });
      stages = await updateStage(runId, stages, stages.length - 1, {
        status: "succeeded",
        finishedAt: new Date().toISOString(),
        costUsd: img.costUsd,
        model: img.model,
        provider: img.provider,
        preview: img.preview,
        usedReference: img.usedReference,
        referenceCount: img.referenceCount || 0,
        promptPreview: img.promptPreview || null,
      });
    } else if (revision?.priorImage?.imagePath) {
      // Reviewer flagged only the text — carry the approved image over unchanged.
      img = {
        imagePath: revision.priorImage.imagePath,
        backupImagePaths: Array.isArray(revision.priorImage.backupImagePaths)
          ? revision.priorImage.backupImagePaths
          : [],
      };
      stages = await pushStage(runId, stages, {
        agent: "image",
        role: "Image — kept from previous draft",
        status: "succeeded",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        note: "Reviewer flagged only the text — the approved image was reused as-is.",
      });
    } else {
      throw new Error("Image generation is required for Post Studio runs.");
    }

    const platform = String(post.platform || config.defaultPlatform || "both").toLowerCase();
    const approval = await createPendingApprovalFromStudio({
      siteLink: run.siteLink,
      title,
      caption,
      bodyText: String(post.body_text || post.bodyText || "").trim(),
      imagePath: img.imagePath,
      backupImagePaths: img.backupImagePaths || [],
      platform,
      assigneeInstructions: String(post.assignee_instructions || "").trim(),
      createdById: run.triggeredById,
    });

    if (run.trigger === "auto") {
      await prisma.postAutomationSiteConfig.updateMany({
        where: { siteLink: run.siteLink },
        data: { lastAutoAt: new Date() },
      });
    }

    const draftPreview = {
      title,
      caption,
      platform,
      imagePath: img.imagePath,
      backupImagePaths: img.backupImagePaths || [],
      approvalId: approval.id,
    };

    if (await isCancelled(runId)) throw Object.assign(new Error("Cancelled."), { cancelled: true });

    const finished = await prisma.postAutomationRun.updateMany({
      where: {
        id: runId,
        cancelRequested: false,
        status: { in: ["queued", "running"] },
      },
      data: {
        status: "succeeded",
        finishedAt: new Date(),
        approvalId: approval.id,
        draftPreviewJson: draftPreview,
        stagesJson: stages,
        totalCostUsd: sumStageCosts(stages),
      },
    });
    if (!finished.count) throw Object.assign(new Error("Cancelled."), { cancelled: true });

    await syncQueueRowForRun(runId, { status: "done", approvalId: approval.id });
    return prisma.postAutomationRun.findUnique({ where: { id: runId } });
  } catch (err) {
    const cancelled = Boolean(err.cancelled) || /cancelled/i.test(String(err.message || ""));
    const current = await prisma.postAutomationRun.findUnique({
      where: { id: runId },
      select: { status: true, cancelRequested: true },
    });
    if (current?.status !== "cancelled") {
      await patchRun(runId, {
        status: cancelled || current?.cancelRequested ? "cancelled" : "failed",
        finishedAt: new Date(),
        errorMessage: err.message || "Run failed.",
        stagesJson: stages,
        totalCostUsd: sumStageCosts(stages),
      });
    }
    await syncQueueRowForRun(runId, {
      status: cancelled || current?.cancelRequested ? "pending" : "failed",
      errorMessage: err.message || "Run failed.",
    });
    return prisma.postAutomationRun.findUnique({ where: { id: runId } });
  }
}

async function syncQueueRowForRun(runId, { status, approvalId, errorMessage } = {}) {
  try {
    const row = await prisma.postAutomationQueueRow.findFirst({
      where: { runId },
      select: { id: true },
    });
    if (!row) return;
    const { markQueueRowResult } = await import("./excelQueue.js");
    await markQueueRowResult(row.id, {
      status,
      runId,
      approvalId: approvalId || null,
      errorMessage: errorMessage || null,
    });
  } catch (err) {
    console.warn(`[postsStudio] queue row sync failed for run ${runId}: ${err.message}`);
  }
}

export async function cancelStudioRun(runId, { hard = true } = {}) {
  const run = await prisma.postAutomationRun.findUnique({ where: { id: runId } });
  if (!run) {
    const err = new Error("Run not found.");
    err.status = 404;
    throw err;
  }
  if (["succeeded", "failed", "cancelled"].includes(run.status)) return run;

  const stages = Array.isArray(run.stagesJson) ? [...run.stagesJson] : [];
  for (let i = 0; i < stages.length; i += 1) {
    if (stages[i]?.status === "running") {
      stages[i] = {
        ...stages[i],
        status: "cancelled",
        finishedAt: new Date().toISOString(),
        error: "Cancelled by user.",
      };
    }
  }

  const updated = await prisma.postAutomationRun.update({
    where: { id: runId },
    data: hard
      ? {
          cancelRequested: true,
          status: "cancelled",
          finishedAt: new Date(),
          errorMessage: "Cancelled by user.",
          stagesJson: stages,
        }
      : { cancelRequested: true, stagesJson: stages.length ? stages : undefined },
  });

  try {
    await prisma.postAutomationQueueRow.updateMany({
      where: { runId, status: { in: ["processing"] } },
      data: {
        status: "pending",
        runId: null,
        errorMessage: "Previous run cancelled — row returned to pending.",
        processedAt: null,
      },
    });
  } catch (err) {
    console.warn(`[postsStudio] queue unlock after cancel failed: ${err.message}`);
  }
  return updated;
}

export async function cancelActiveStudioRunsForSite(siteLink) {
  const link = String(siteLink || "").trim();
  if (!link) {
    const err = new Error("siteLink is required.");
    err.status = 400;
    throw err;
  }
  const active = await prisma.postAutomationRun.findMany({
    where: { siteLink: link, status: { in: ["queued", "running"] } },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  const cancelled = [];
  for (const row of active) cancelled.push(await cancelStudioRun(row.id, { hard: true }));
  return { count: cancelled.length, runs: cancelled };
}

export async function runScheduledInternalPostStudio(logger = console) {
  const mode = await getEngineMode();
  if (mode !== ENGINE_INTERNAL) return { processed: 0 };

  const { listDueAutoSites } = await import("./engine.js");
  const due = await listDueAutoSites();
  if (!due.length) return { processed: 0 };

  const site = due[0];
  const running = await prisma.postAutomationRun.count({
    where: { siteLink: site.siteLink, status: { in: ["queued", "running"] } },
  });
  if (running > 0) {
    logger.info?.(`[postsStudio] skip auto for ${site.siteLink} — run already in progress`);
    return { processed: 0 };
  }

  await prisma.postAutomationSiteConfig.update({
    where: { siteLink: site.siteLink },
    data: { lastAutoAt: new Date() },
  });

  const source = String(site.autoSource || "seed").toLowerCase();
  try {
    if (source === "excel") {
      const { claimNextQueueRow, markQueueRowResult } = await import("./excelQueue.js");
      const row = await claimNextQueueRow(site.siteLink);
      if (!row) {
        logger.info?.(`[postsStudio] no pending excel rows for ${site.siteLink}`);
        return { processed: 0 };
      }
      // Standing Seeds stay in play; Excel row layers topic brief on top (does not wipe Seeds).
      const { postExcelOverrides } = await import("../studioSeedMerge.js");
      const overrides = postExcelOverrides(site, row);
      try {
        const run = await enqueueStudioRun({
          siteLink: site.siteLink,
          trigger: "auto",
          topic: row.topic || "",
          generateImage: true,
          overrides,
        });
        await markQueueRowResult(row.id, { status: "processing", runId: run.id });
        logger.info?.(`[postsStudio] excel row #${row.rowIndex + 1} queued as run ${run.id}`);
        return { processed: 1, runId: run.id, queueRowId: row.id };
      } catch (err) {
        await markQueueRowResult(row.id, { status: "failed", errorMessage: err.message });
        throw err;
      }
    }

    const run = await enqueueStudioRun({
      siteLink: site.siteLink,
      trigger: "auto",
      topic: "",
      generateImage: true,
    });
    logger.info?.(`[postsStudio] auto run queued ${run.id} for ${site.siteLink}`);
    return { processed: 1, runId: run.id };
  } catch (err) {
    logger.error?.(`[postsStudio] auto run failed for ${site.siteLink}: ${err.message}`);
    return { processed: 0, error: err.message };
  }
}
