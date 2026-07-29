/**
 * Orchestrate Blog Automation Studio pipeline → pending BlogPost (+ optional WP draft).
 */
import prisma from "../prisma.js";
import { buildBlogPayload } from "../blogPayload.js";
import { findAssigneesForSite, notifyBlogApprovers, createBlogQuickActionToken } from "../blogAssignee.js";
import { recordBlogRevision } from "../blogRevisions.js";
import { getSitePublishConfig } from "../blogPublishConfig.js";
import { upsertWordpressPost } from "../wordpressClient.js";
import { sumStageCosts } from "./costs.js";
import { getSiteStudioConfig, ENGINE_INTERNAL, getEngineMode } from "./engine.js";
import { hasProviderKey } from "./providers.js";
import { runAgent1, runAgent2, runAgent3 } from "./agents.js";
import { runImageAgent } from "./imageAgent.js";

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
  const lines = String(config.mustFollowKeywords || "")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length) {
    // rotate by lastAutoAt day index
    const idx = Math.abs(Math.floor(Date.now() / 86400000)) % lines.length;
    return lines[idx];
  }
  const seed = String(config.seedPrompt || "").trim();
  if (seed) {
    // First line or first sentence as topic when no keyword list
    const firstLine = seed.split(/\n+/).map((s) => s.trim()).filter(Boolean)[0] || seed;
    return firstLine.slice(0, 180);
  }
  return "SEO blog topic";
}

function assertKeysReady(config) {
  const checks = [
    ["agent1", config.agent1Provider],
    ["agent2", config.agent2Provider],
    ["agent3", config.agent3Provider],
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
    mustFollowKeywords:
      overrides.mustFollowKeywords !== undefined
        ? overrides.mustFollowKeywords
        : run.keywordsSnapshot || baseConfig.mustFollowKeywords,
  };
}

async function isCancelled(runId) {
  const row = await prisma.blogAutomationRun.findUnique({
    where: { id: runId },
    select: { cancelRequested: true, status: true },
  });
  return Boolean(row?.cancelRequested);
}

async function patchRun(runId, data) {
  return prisma.blogAutomationRun.update({ where: { id: runId }, data });
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

/**
 * Queue a run and execute asynchronously (fire-and-forget from API).
 */
export async function enqueueStudioRun({
  siteLink,
  topic = "",
  trigger = "manual",
  triggeredById = null,
  generateImage = true,
  overrides = null,
} = {}) {
  const mode = await getEngineMode();
  if (mode !== ENGINE_INTERNAL) {
    const err = new Error("Internal Studio is not the active engine.");
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
    const hasKeywords = Boolean(String(config.mustFollowKeywords || "").trim());
    if (!hasSeed && !hasKeywords) {
      const err = new Error(
        "Auto seed mode needs a General auto prompt and/or must-follow keywords. Set them on Schedule or Run, then Save."
      );
      err.status = 400;
      throw err;
    }
  }

  const resolvedTopic = pickTopic(config, topic);
  const contextStage =
    overrides && typeof overrides === "object"
      ? [{ agent: "_context", status: "meta", overrides }]
      : [];

  const run = await prisma.blogAutomationRun.create({
    data: {
      siteLink: String(siteLink).trim(),
      trigger,
      status: "queued",
      topic: resolvedTopic,
      seedPromptSnapshot: config.seedPrompt || "",
      keywordsSnapshot: config.mustFollowKeywords || "",
      stagesJson: contextStage,
      triggeredById: triggeredById || null,
    },
  });

  // Kick off without blocking the HTTP response
  setImmediate(() => {
    executeStudioRun(run.id, { generateImage }).catch((err) => {
      console.error(`[blogStudio] run ${run.id} crashed:`, err.message);
    });
  });

  return run;
}

export async function executeStudioRun(runId, { generateImage = true } = {}) {
  let stages = [];
  const run = await prisma.blogAutomationRun.findUnique({ where: { id: runId } });
  if (!run) return null;

  await patchRun(runId, { status: "running", startedAt: new Date(), errorMessage: null });

  try {
    if (await isCancelled(runId)) throw Object.assign(new Error("Cancelled."), { cancelled: true });

    const baseConfig = await getSiteStudioConfig(run.siteLink);
    const config = configFromRun(baseConfig, run);
    const topic = run.topic || pickTopic(config);

    // Drop internal meta stage from the visible timeline
    stages = Array.isArray(run.stagesJson)
      ? run.stagesJson.filter((s) => s?.agent !== "_context")
      : [];
    await patchRun(runId, { stagesJson: stages });

    assertKeysReady(config);

    // --- Agent 1 ---
    stages = await pushStage(runId, stages, {
      agent: "agent1",
      role: "Strategist — Keyword Intelligence",
      status: "running",
      startedAt: new Date().toISOString(),
      provider: config.agent1Provider,
      model: config.agent1Model,
    });
    let a1;
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

    // --- Agent 2 ---
    stages = await pushStage(runId, stages, {
      agent: "agent2",
      role: "Architect — Content Blueprint",
      status: "running",
      startedAt: new Date().toISOString(),
      provider: config.agent2Provider,
      model: config.agent2Model,
    });
    let a2;
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
      preview: previewFromJson(a2.json),
    });

    // --- Agent 3 ---
    stages = await pushStage(runId, stages, {
      agent: "agent3",
      role: "Writer — Publication Draft",
      status: "running",
      startedAt: new Date().toISOString(),
      provider: config.agent3Provider,
      model: config.agent3Model,
    });
    let a3;
    try {
      a3 = await runAgent3({ config, topic, agent1: a1.json, agent2: a2.json });
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
      inputTokens: a3.inputTokens,
      outputTokens: a3.outputTokens,
      costUsd: a3.costUsd,
      model: a3.model,
      provider: a3.provider,
      preview: previewFromJson({
        title: a3.json?.title,
        slug: a3.json?.slug,
        excerpt: a3.json?.excerpt,
        word_count: a3.json?.qa_report?.word_count,
      }),
    });

    const article = a3.json || {};
    const title = String(article.title || a2.json?.seo_metadata?.final_title || topic).trim();
    const content = String(article.article_html || "").trim();
    if (!title || !content) {
      throw new Error("Writer agent did not return title/article_html.");
    }

    let featuredImagePath = null;
    let featuredImageAlt = String(article.alt_text || "").trim() || null;

    if (generateImage !== false) {
      stages = await pushStage(runId, stages, {
        agent: "image",
        role: "Image — Featured Visual",
        status: "running",
        startedAt: new Date().toISOString(),
      });
      try {
        const img = await runImageAgent({ config, article });
        featuredImagePath = img.featuredImagePath;
        featuredImageAlt = img.altText || featuredImageAlt;
        stages = await updateStage(runId, stages, stages.length - 1, {
          status: "succeeded",
          finishedAt: new Date().toISOString(),
          costUsd: img.costUsd,
          model: img.model,
          provider: img.provider,
          preview: img.preview,
        });
      } catch (imgErr) {
        stages = await updateStage(runId, stages, stages.length - 1, {
          status: "failed",
          finishedAt: new Date().toISOString(),
          error: imgErr.message,
        });
        // Image failure is non-fatal — continue without featured image
      }
    }

    const slug = String(article.slug || a2.json?.seo_metadata?.url_slug || "").trim() || undefined;
    const excerpt = String(article.excerpt || article.meta_description || "").trim();
    const payload = buildBlogPayload({
      title,
      content,
      excerpt,
      slug,
      status: "draft",
      featuredImageAlt,
      featuredImageUrl: featuredImagePath,
      seoTitle: article.meta_title || a2.json?.seo_metadata?.seo_title_tag || title,
      metaDescription: article.meta_description || a2.json?.seo_metadata?.meta_description || excerpt,
      focusKeyword:
        a1.json?.primary_keyword ||
        String(config.mustFollowKeywords || "")
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean)[0] ||
        "",
      tags: Array.isArray(article.tags) ? article.tags : [],
    });

    const { assignee, allApprovers, siteUrlLink } = await findAssigneesForSite(run.siteLink);
    const creatorId = run.triggeredById || assignee.id;

    const blog = await prisma.blogPost.create({
      data: {
        siteLink: siteUrlLink || run.siteLink,
        assigneeId: assignee.id,
        createdById: creatorId,
        status: "pending",
        source: "blog_studio",
        title,
        slug: payload.slug,
        excerpt: payload.excerpt,
        content,
        wpStatus: "draft",
        featuredImagePath,
        featuredImageAlt,
        payload,
        publishStatus: "unpublish",
        externalId: `studio-${runId}`,
      },
    });

    await recordBlogRevision(blog, { action: "studio_create", actorId: creatorId });

    try {
      const token = createBlogQuickActionToken(blog.id);
      await notifyBlogApprovers({
        blog,
        approvers: allApprovers,
        creator: { id: creatorId, name: "Blog Studio", email: "" },
        token,
        skipped: false,
      });
    } catch (notifyErr) {
      console.warn(`[blogStudio] notify failed for ${blog.id}: ${notifyErr.message}`);
    }

    // Optional WP draft write
    let wpExternalId = null;
    try {
      const pub = await getSitePublishConfig(blog.siteLink);
      if (pub?.wordpressUrl && pub?.wordpressUsername && pub?.wordpressAppPassword) {
        const wpResult = await upsertWordpressPost(
          pub,
          {
            title,
            content,
            excerpt: payload.excerpt,
            slug: payload.slug,
            status: "draft",
            featuredImageUrl: featuredImagePath,
            featuredImageAlt,
            meta: payload.meta,
            tags: payload.tags,
            categories: payload.categories,
          },
          null,
          { mode: "draft" }
        );
        wpExternalId = wpResult?.externalId || null;
        if (wpExternalId) {
          await prisma.blogPost.update({
            where: { id: blog.id },
            data: { externalPostId: String(wpExternalId), externalId: String(wpExternalId) },
          });
        }
      }
    } catch (wpErr) {
      console.warn(`[blogStudio] WP draft upsert failed for ${blog.id}: ${wpErr.message}`);
    }

    const draftPreview = {
      title,
      slug: payload.slug,
      excerpt: payload.excerpt,
      html: content.slice(0, 12000),
      seoTitle: payload.meta?.seo_title || "",
      metaDescription: payload.meta?.meta_description || "",
      featuredImagePath,
      blogPostId: blog.id,
      wordpressId: wpExternalId,
    };

    if (run.trigger === "auto") {
      await prisma.blogAutomationSiteConfig.updateMany({
        where: { siteLink: run.siteLink },
        data: { lastAutoAt: new Date() },
      });
    }

    await patchRun(runId, {
      status: "succeeded",
      finishedAt: new Date(),
      blogPostId: blog.id,
      draftPreviewJson: draftPreview,
      stagesJson: stages,
      totalCostUsd: sumStageCosts(stages),
    });

    await syncQueueRowForRun(runId, {
      status: "done",
      blogPostId: blog.id,
    });

    return prisma.blogAutomationRun.findUnique({ where: { id: runId } });
  } catch (err) {
    const cancelled = Boolean(err.cancelled);
    await patchRun(runId, {
      status: cancelled ? "cancelled" : "failed",
      finishedAt: new Date(),
      errorMessage: err.message || "Run failed.",
      stagesJson: stages,
      totalCostUsd: sumStageCosts(stages),
    });
    await syncQueueRowForRun(runId, {
      status: cancelled ? "pending" : "failed",
      errorMessage: err.message || "Run failed.",
    });
    return prisma.blogAutomationRun.findUnique({ where: { id: runId } });
  }
}

async function syncQueueRowForRun(runId, { status, blogPostId, errorMessage } = {}) {
  try {
    const { markQueueRowResult } = await import("./excelQueue.js");
    const row = await prisma.blogAutomationQueueRow.findFirst({
      where: { runId },
      select: { id: true },
    });
    if (!row) return;
    await markQueueRowResult(row.id, {
      status,
      runId,
      blogPostId: blogPostId || null,
      errorMessage: errorMessage || null,
    });
  } catch (err) {
    console.warn(`[blogStudio] queue row sync failed for run ${runId}: ${err.message}`);
  }
}

export async function cancelStudioRun(runId) {
  const run = await prisma.blogAutomationRun.findUnique({ where: { id: runId } });
  if (!run) {
    const err = new Error("Run not found.");
    err.status = 404;
    throw err;
  }
  if (["succeeded", "failed", "cancelled"].includes(run.status)) {
    return run;
  }
  return prisma.blogAutomationRun.update({
    where: { id: runId },
    data: { cancelRequested: true },
  });
}

export async function runScheduledInternalStudio(logger = console) {
  const mode = await getEngineMode();
  if (mode !== ENGINE_INTERNAL) return { processed: 0 };

  const { listDueAutoSites } = await import("./engine.js");
  const due = await listDueAutoSites();
  if (!due.length) return { processed: 0 };

  // Global concurrency: one site at a time per cron tick
  const site = due[0];
  const running = await prisma.blogAutomationRun.count({
    where: { siteLink: site.siteLink, status: { in: ["queued", "running"] } },
  });
  if (running > 0) {
    logger.info?.(`[blogStudio] skip auto for ${site.siteLink} — run already in progress`);
    return { processed: 0 };
  }

  // Claim slot
  await prisma.blogAutomationSiteConfig.update({
    where: { siteLink: site.siteLink },
    data: { lastAutoAt: new Date() },
  });

  const source = String(site.autoSource || "seed").toLowerCase();

  try {
    if (source === "excel") {
      const { claimNextQueueRow, markQueueRowResult } = await import("./excelQueue.js");
      const row = await claimNextQueueRow(site.siteLink);
      if (!row) {
        logger.info?.(`[blogStudio] no pending excel rows for ${site.siteLink}`);
        return { processed: 0 };
      }

      const overrides = {
        seedPrompt: [row.seedContext, row.notes].filter(Boolean).join("\n\n"),
        mustFollowKeywords: row.keywords || row.topic || "",
        targetAudience: row.audience || site.targetAudience,
        ctaText: row.ctaText || site.ctaText,
        ctaUrl: row.ctaUrl || site.ctaUrl,
        imagePrompt: row.imagePrompt || site.imagePrompt,
      };

      try {
        const run = await enqueueStudioRun({
          siteLink: site.siteLink,
          trigger: "auto",
          topic: row.topic || "",
          generateImage: true,
          overrides,
        });
        await markQueueRowResult(row.id, { status: "processing", runId: run.id });
        logger.info?.(`[blogStudio] excel row #${row.rowIndex + 1} queued as run ${run.id}`);
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
    logger.info?.(`[blogStudio] auto run queued ${run.id} for ${site.siteLink}`);
    return { processed: 1, runId: run.id };
  } catch (err) {
    logger.error?.(`[blogStudio] auto run failed for ${site.siteLink}: ${err.message}`);
    return { processed: 0, error: err.message };
  }
}
