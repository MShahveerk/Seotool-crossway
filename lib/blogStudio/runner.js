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
import { runAgent2, runAgent3 } from "./agents.js";
import { runImageAgent } from "./imageAgent.js";
import { assertPrefixKeys, runDraftPrefix } from "./prefixRunner.js";
import { loadLatestResearchForSite } from "./researchRunner.js";
import { runHumanizerAgent } from "./humanizer.js";
import {
  findHeadingsApprovers,
  findHeadingsCheckpoint,
  HEADINGS_APPROVAL_AGENT,
  HEADINGS_CHECKPOINT,
  HEADINGS_MAX_ROUNDS,
  sendHeadingsApprovalEmails,
  verifyHeadingsApprovalToken,
} from "./headingsApproval.js";
import { runHeadingsAgent, synthesizeAgent1Json } from "./prefixAgents.js";

function previewFromJson(obj, max = 900) {
  try {
    return JSON.stringify(obj, null, 2).slice(0, max);
  } catch {
    return String(obj || "").slice(0, max);
  }
}

function assertKeysReady(config) {
  const checks = [
    ["architect", config.agent2Provider],
    ["writer", config.agent3Provider],
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
  return Boolean(row?.cancelRequested) || row?.status === "cancelled";
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
  revision = null,
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

  const topicExplicit = Boolean(String(topic || "").trim());
  const isRevision = revision && typeof revision === "object";
  const skipDecider = topicExplicit || isRevision;
  const skipBinder = Boolean(isRevision && String(config.mustFollowKeywords || "").trim());

  if (!isRevision) {
    const harvest = await loadLatestResearchForSite(siteLink);
    if (!harvest) {
      const err = new Error(
        "Run keyword research first (Compose → Research). Drafts bind topics to that keyword library."
      );
      err.status = 400;
      throw err;
    }
  }

  assertPrefixKeys(config, { needDecider: !skipDecider, needHumanizer: Boolean(config.humanizerEnabled) });

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

  const resolvedTopic = topicExplicit ? String(topic).trim() : "";
  const hasOverrides = overrides && typeof overrides === "object";
  const contextStage = [
    {
      agent: "_context",
      status: "meta",
      topicExplicit,
      skipDecider,
      skipBinder,
      humanizerEnabled: Boolean(config.humanizerEnabled),
      headingsApprovalEnabled: Boolean(config.headingsApprovalEnabled),
      ...(hasOverrides ? { overrides } : {}),
      ...(isRevision ? { revision } : {}),
    },
  ];

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

export async function executeStudioRun(runId, { generateImage = true, fromCheckpoint = false } = {}) {
  let stages = [];
  const run = await prisma.blogAutomationRun.findUnique({ where: { id: runId } });
  if (!run) return null;
  if (run.trigger === "research") return run;

  await patchRun(runId, { status: "running", startedAt: new Date(), errorMessage: null });

  try {
    if (await isCancelled(runId)) throw Object.assign(new Error("Cancelled."), { cancelled: true });

    const baseConfig = await getSiteStudioConfig(run.siteLink);
    const config = configFromRun(baseConfig, run);
    let topic = run.topic || "";

    // Internal meta stage carries overrides + optional rejection-revision context
    const metaStage = Array.isArray(run.stagesJson)
      ? run.stagesJson.find((s) => s?.agent === "_context")
      : null;
    const revision =
      metaStage?.revision && typeof metaStage.revision === "object" ? metaStage.revision : null;
    const skipDecider = Boolean(metaStage?.skipDecider);
    const skipBinder = Boolean(metaStage?.skipBinder);
    const resumeHeadings = Boolean(fromCheckpoint) || Boolean(metaStage?.skipPrefix);

    // Keep `_context` on the run so optional agents (Humanizer, Review) stay
    // on the live rail. The cockpit already hides `_` stages from the chips.
    stages = Array.isArray(run.stagesJson) ? [...run.stagesJson] : [];
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
        config.previousDraft = revision.priorArticle || null;
      }
      if (regenImage) {
        config.imageRevisionNote = revision.remarks;
      }
    }

    assertKeysReady(config);

    let a1 = null;
    let a2 = null;
    let a3 = null;
    let article;
    let lockedHeadings = null;

    if (regenText) {
      if (resumeHeadings) {
        const cp = findHeadingsCheckpoint(stages);
        if (!cp?.lockedHeadings || !cp?.a1) {
          throw new Error("Missing headings checkpoint. Re-run the draft.");
        }
        topic = cp.topic || topic;
        a1 = cp.a1;
        lockedHeadings = cp.lockedHeadings;
        stages = stages.map((s) =>
          s?.agent === HEADINGS_APPROVAL_AGENT && s.status === "waiting"
            ? {
                ...s,
                status: "succeeded",
                finishedAt: new Date().toISOString(),
                preview: "Approved",
                data: { ...(s.data || {}), approved: true },
              }
            : s
        );
        await patchRun(runId, { stagesJson: stages, topic });
      } else {
        const prefix = await runDraftPrefix({
          runId,
          siteLink: run.siteLink,
          config,
          topic,
          skipDecider,
          skipBinder,
          stages,
          pushStage,
          updateStage,
          isCancelled,
          patchRun,
        });
        topic = prefix.topic;
        a1 = prefix.a1;
        lockedHeadings = prefix.lockedHeadings;
        stages = prefix.stages;
        if (await isCancelled(runId)) throw Object.assign(new Error("Cancelled."), { cancelled: true });

        if (config.headingsApprovalEnabled) {
          await pauseForHeadingsApproval({
            runId,
            siteLink: run.siteLink,
            stages,
            topic,
            seedQuery: prefix.seedQuery,
            a1,
            lockedHeadings,
            bind: prefix.bind,
            angle: prefix.angle,
            generateImage: regenImage,
            revision,
          });
          return prisma.blogAutomationRun.findUnique({ where: { id: runId } });
        }
      }

      // --- Architect (locked headings from prefix) ---
      stages = await pushStage(runId, stages, {
        agent: "agent2",
        role: "Architect — Content Blueprint",
        status: "running",
        startedAt: new Date().toISOString(),
        provider: config.agent2Provider,
        model: config.agent2Model,
      });
      try {
        a2 = await runAgent2({ config, topic, agent1: a1.json, lockedHeadings });
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
        role: revision ? "Writer — Revision (reviewer feedback)" : "Writer — Publication Draft",
        status: "running",
        startedAt: new Date().toISOString(),
        provider: config.agent3Provider,
        model: config.agent3Model,
      });
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

      article = a3.json || {};

      if (config.humanizerEnabled) {
        stages = await pushStage(runId, stages, {
          agent: "humanizer",
          role: "Humanizer",
          status: "running",
          startedAt: new Date().toISOString(),
          provider: config.humanizerProvider || config.agent3Provider,
          model: config.humanizerModel || config.agent3Model,
        });
        try {
          const hum = await runHumanizerAgent({ config, article, topic });
          article = hum.json;
          stages = await updateStage(runId, stages, stages.length - 1, {
            status: "succeeded",
            finishedAt: new Date().toISOString(),
            inputTokens: hum.inputTokens,
            outputTokens: hum.outputTokens,
            costUsd: hum.costUsd,
            model: hum.model,
            provider: hum.provider,
            preview: previewFromJson({
              title: article.title,
              excerpt: article.excerpt,
              word_count: article.qa_report?.word_count,
            }),
          });
        } catch (err) {
          await updateStage(runId, stages, stages.length - 1, {
            status: "failed",
            finishedAt: new Date().toISOString(),
            error: err.message,
          });
          throw err;
        }
      }
    } else {
      // Reviewer flagged only the image — carry the approved article text over unchanged.
      article = revision?.priorArticle ? { ...revision.priorArticle } : {};
      stages = await pushStage(runId, stages, {
        agent: "agent3",
        role: "Writer — kept from previous draft",
        status: "succeeded",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        note: "Reviewer flagged only the image — the approved article text was reused as-is.",
        preview: previewFromJson({
          title: article.title,
          slug: article.slug,
          excerpt: article.excerpt,
        }),
      });
    }

    const title = String(article.title || a2?.json?.seo_metadata?.final_title || topic).trim();
    const content = String(article.article_html || "").trim();
    if (!title || !content) {
      throw new Error("Writer agent did not return title/article_html.");
    }

    let featuredImagePath = null;
    let backupImagePaths = [];
    let featuredImageAlt = String(article.alt_text || "").trim() || null;

    if (await isCancelled(runId)) throw Object.assign(new Error("Cancelled."), { cancelled: true });

    if (regenImage) {
      stages = await pushStage(runId, stages, {
        agent: "image",
        role: revision ? "Image — Revision (reviewer feedback)" : "Image — Featured Visual",
        status: "running",
        startedAt: new Date().toISOString(),
      });
      try {
        if (await isCancelled(runId)) throw Object.assign(new Error("Cancelled."), { cancelled: true });
        const img = await runImageAgent({
          config: { ...config, runTopic: topic },
          article: { ...article, title, excerpt: String(article.excerpt || article.meta_description || "").trim() },
          topic,
        });
        if (await isCancelled(runId)) throw Object.assign(new Error("Cancelled."), { cancelled: true });
        featuredImagePath = img.featuredImagePath;
        backupImagePaths = Array.isArray(img.backupImagePaths) ? img.backupImagePaths : [];
        featuredImageAlt = img.altText || featuredImageAlt;
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
          note: img.usedReference
            ? `Used ${img.referenceCount || 1} Assets reference image(s) as style lock + subject from topic/title`
            : "No Assets reference on disk — generated from topic/title + visual guidelines only",
        });
      } catch (imgErr) {
        if (imgErr.cancelled) throw imgErr;
        stages = await updateStage(runId, stages, stages.length - 1, {
          status: "failed",
          finishedAt: new Date().toISOString(),
          error: imgErr.message,
        });
        // Image failure is non-fatal — continue without featured image
      }
    } else if (revision?.priorImage) {
      // Reviewer flagged only the text — carry the approved image over unchanged.
      featuredImagePath = revision.priorImage.featuredImagePath || null;
      backupImagePaths = Array.isArray(revision.priorImage.backupImagePaths)
        ? revision.priorImage.backupImagePaths
        : [];
      featuredImageAlt = revision.priorImage.featuredImageAlt || featuredImageAlt;
      stages = await pushStage(runId, stages, {
        agent: "image",
        role: "Image — kept from previous draft",
        status: "succeeded",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        note: "Reviewer flagged only the text — the approved image was reused as-is.",
      });
    }

    if (await isCancelled(runId)) throw Object.assign(new Error("Cancelled."), { cancelled: true });

    const slug = String(article.slug || a2?.json?.seo_metadata?.url_slug || "").trim() || undefined;
    const excerpt = String(article.excerpt || article.meta_description || "").trim();
    const payload = buildBlogPayload({
      title,
      content,
      excerpt,
      slug,
      status: "draft",
      featuredImageAlt,
      featuredImageUrl: featuredImagePath,
      seoTitle: article.meta_title || a2?.json?.seo_metadata?.seo_title_tag || title,
      metaDescription: article.meta_description || a2?.json?.seo_metadata?.meta_description || excerpt,
      focusKeyword:
        a1?.json?.primary_keyword ||
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
        backupImagePaths: backupImagePaths.length ? backupImagePaths : undefined,
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

    // Don't overwrite a hard-cancel that landed while we were finishing
    if (await isCancelled(runId)) throw Object.assign(new Error("Cancelled."), { cancelled: true });

    const finished = await prisma.blogAutomationRun.updateMany({
      where: {
        id: runId,
        cancelRequested: false,
        status: { in: ["queued", "running"] },
      },
      data: {
        status: "succeeded",
        finishedAt: new Date(),
        blogPostId: blog.id,
        draftPreviewJson: draftPreview,
        stagesJson: stages,
        totalCostUsd: sumStageCosts(stages),
      },
    });
    if (!finished.count) {
      throw Object.assign(new Error("Cancelled."), { cancelled: true });
    }

    await syncQueueRowForRun(runId, {
      status: "done",
      blogPostId: blog.id,
    });

    return prisma.blogAutomationRun.findUnique({ where: { id: runId } });
  } catch (err) {
    const cancelled = Boolean(err.cancelled) || /cancelled/i.test(String(err.message || ""));
    // Preserve hard-cancel status if already written by cancelStudioRun
    const current = await prisma.blogAutomationRun.findUnique({
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
    return prisma.blogAutomationRun.findUnique({ where: { id: runId } });
  }
}

async function pauseForHeadingsApproval({
  runId,
  siteLink,
  stages,
  topic,
  seedQuery,
  a1,
  lockedHeadings,
  bind,
  angle,
  generateImage,
  revision,
}) {
  const recipients = await findHeadingsApprovers(siteLink);
  if (!recipients.length) {
    const err = new Error(
      "Headings approval is on, but no User-role account is assigned to this project. Assign a User or turn the toggle off in Setup → Agents."
    );
    err.status = 400;
    throw err;
  }
  const round = 1;
  const mailed = await sendHeadingsApprovalEmails({
    runId,
    siteLink,
    topic,
    headings: lockedHeadings,
    round,
    recipients,
  });
  if (!mailed.sent) {
    const err = new Error("Could not send headings approval emails. Check SMTP (nodemailer) in the server environment.");
    err.status = 500;
    throw err;
  }
  stages = await pushStage(runId, stages, {
    agent: HEADINGS_APPROVAL_AGENT,
    role: "Headings review",
    status: "waiting",
    startedAt: new Date().toISOString(),
    preview: `Emailed ${recipients.length} User-role reviewer${recipients.length === 1 ? "" : "s"}`,
    data: {
      topic,
      round,
      recipientCount: recipients.length,
      h1: lockedHeadings?.h1,
    },
  });
  const checkpoint = {
    agent: HEADINGS_CHECKPOINT,
    status: "meta",
    phase: "headings",
    round,
    topic,
    seedQuery: seedQuery || topic,
    a1,
    lockedHeadings,
    bind,
    angle: angle || {},
    generateImage: generateImage !== false,
    revision: revision || null,
  };
  stages = [...stages.filter((s) => s?.agent !== HEADINGS_CHECKPOINT), checkpoint];
  await patchRun(runId, {
    status: "waiting",
    topic,
    stagesJson: stages,
    totalCostUsd: sumStageCosts(stages),
    errorMessage: null,
  });
}

export async function approveHeadingsAndContinue(runId, token) {
  const run = await prisma.blogAutomationRun.findUnique({ where: { id: runId } });
  if (!run) {
    const err = new Error("Run not found.");
    err.status = 404;
    throw err;
  }
  if (run.status !== "waiting") {
    const err = new Error("This outline is not waiting for approval.");
    err.status = 409;
    throw err;
  }
  const cp = findHeadingsCheckpoint(run.stagesJson);
  const expectedRound = Number(cp?.round) || 1;
  if (!verifyHeadingsApprovalToken(runId, expectedRound, token)) {
    const err = new Error("This headings link is invalid or was replaced by a newer outline.");
    err.status = 403;
    throw err;
  }
  setImmediate(() => {
    executeStudioRun(runId, {
      generateImage: cp?.generateImage !== false,
      fromCheckpoint: true,
    }).catch((err) => {
      console.error(`[blogStudio] headings resume ${runId} crashed:`, err.message);
    });
  });
  return run;
}

export async function declineHeadingsAndRevise(runId, token, reason) {
  const run = await prisma.blogAutomationRun.findUnique({ where: { id: runId } });
  if (!run) {
    const err = new Error("Run not found.");
    err.status = 404;
    throw err;
  }
  if (run.status !== "waiting") {
    const err = new Error("This outline is not waiting for approval.");
    err.status = 409;
    throw err;
  }
  const stages = Array.isArray(run.stagesJson) ? [...run.stagesJson] : [];
  const cp = findHeadingsCheckpoint(stages);
  const expectedRound = Number(cp?.round) || 1;
  if (!verifyHeadingsApprovalToken(runId, expectedRound, token)) {
    const err = new Error("This headings link is invalid or was replaced by a newer outline.");
    err.status = 403;
    throw err;
  }
  const nextRound = expectedRound + 1;
  if (nextRound > HEADINGS_MAX_ROUNDS) {
    const err = new Error("This outline was declined too many times. Cancel the run and start a new draft.");
    err.status = 400;
    throw err;
  }
  const config = await getSiteStudioConfig(run.siteLink);
  const harvest = await loadLatestResearchForSite(run.siteLink);
  stages.push({
    agent: "headings",
    role: `Headings — revision ${nextRound}`,
    status: "running",
    startedAt: new Date().toISOString(),
    provider: config.headingsProvider,
    model: config.headingsModel,
  });
  await patchRun(runId, { status: "running", stagesJson: stages });
  let headings;
  try {
    headings = await runHeadingsAgent({
      config,
      topic: cp.topic,
      bind: cp.bind,
      harvest,
      angle: cp.angle,
      feedback: reason,
    });
  } catch (err) {
    stages[stages.length - 1] = {
      ...stages[stages.length - 1],
      status: "failed",
      finishedAt: new Date().toISOString(),
      error: err.message,
    };
    await patchRun(runId, { status: "failed", errorMessage: err.message, stagesJson: stages, finishedAt: new Date() });
    throw err;
  }
  stages[stages.length - 1] = {
    ...stages[stages.length - 1],
    status: "succeeded",
    finishedAt: new Date().toISOString(),
    inputTokens: headings.inputTokens,
    outputTokens: headings.outputTokens,
    costUsd: headings.costUsd,
    preview: headings.json.h1,
    data: headings.json,
  };
  const a1 = {
    json: synthesizeAgent1Json({
      topic: cp.topic,
      bind: cp.bind,
      angle: cp.angle,
      headings: headings.json,
    }),
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    provider: "binder",
    model: "deterministic",
  };
  const recipients = await findHeadingsApprovers(run.siteLink);
  if (!recipients.length) {
    const err = new Error("No User-role account is assigned to this project, so the revised outline cannot be emailed.");
    err.status = 400;
    throw err;
  }
  await sendHeadingsApprovalEmails({
    runId,
    siteLink: run.siteLink,
    topic: cp.topic,
    headings: headings.json,
    round: nextRound,
    recipients,
  });
  stages.push({
    agent: HEADINGS_APPROVAL_AGENT,
    role: "Headings review",
    status: "waiting",
    startedAt: new Date().toISOString(),
    preview: `Revision ${nextRound} emailed to ${recipients.length} User-role reviewer${recipients.length === 1 ? "" : "s"}`,
    data: { topic: cp.topic, round: nextRound, recipientCount: recipients.length, h1: headings.json.h1, reason },
  });
  const checkpoint = {
    ...cp,
    round: nextRound,
    lockedHeadings: headings.json,
    a1,
    lastDeclineReason: reason,
  };
  const nextStages = [...stages.filter((s) => s?.agent !== HEADINGS_CHECKPOINT), checkpoint];
  await patchRun(runId, {
    status: "waiting",
    stagesJson: nextStages,
    totalCostUsd: sumStageCosts(nextStages),
  });
  return prisma.blogAutomationRun.findUnique({ where: { id: runId } });
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

/**
 * Cancel a queued/running studio automation.
 * Soft-stop: sets cancelRequested so the worker exits between stages.
 * Hard-stop: also marks the run cancelled immediately so UI/queue unblock.
 */
export async function cancelStudioRun(runId, { hard = true } = {}) {
  const run = await prisma.blogAutomationRun.findUnique({ where: { id: runId } });
  if (!run) {
    const err = new Error("Run not found.");
    err.status = 404;
    throw err;
  }
  if (["succeeded", "failed", "cancelled"].includes(run.status)) {
    return run;
  }

  const stages = Array.isArray(run.stagesJson) ? [...run.stagesJson] : [];
  for (let i = 0; i < stages.length; i += 1) {
    if (stages[i]?.status === "running" || stages[i]?.status === "waiting") {
      stages[i] = {
        ...stages[i],
        status: "cancelled",
        finishedAt: new Date().toISOString(),
        error: "Cancelled by user.",
      };
    }
  }

  const updated = await prisma.blogAutomationRun.update({
    where: { id: runId },
    data: hard
      ? {
          cancelRequested: true,
          status: "cancelled",
          finishedAt: new Date(),
          errorMessage: "Cancelled by user.",
          stagesJson: stages,
        }
      : {
          cancelRequested: true,
          stagesJson: stages.length ? stages : undefined,
        },
  });

  // Release any Excel queue row locked to this run so it can be retried
  try {
    await prisma.blogAutomationQueueRow.updateMany({
      where: { runId, status: { in: ["processing"] } },
      data: {
        status: "pending",
        runId: null,
        errorMessage: "Previous run cancelled — row returned to pending.",
        processedAt: null,
      },
    });
  } catch (err) {
    console.warn(`[blogStudio] queue unlock after cancel failed: ${err.message}`);
  }

  return updated;
}

/** Cancel every queued/running automation for a site (manual or auto). */
export async function cancelActiveStudioRunsForSite(siteLink) {
  const link = String(siteLink || "").trim();
  if (!link) {
    const err = new Error("siteLink is required.");
    err.status = 400;
    throw err;
  }
  const active = await prisma.blogAutomationRun.findMany({
    where: { siteLink: link, status: { in: ["queued", "running", "waiting"] } },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  const cancelled = [];
  for (const row of active) {
    cancelled.push(await cancelStudioRun(row.id, { hard: true }));
  }
  return { count: cancelled.length, runs: cancelled };
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
    where: { siteLink: site.siteLink, status: { in: ["queued", "running", "waiting"] } },
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

      // Standing Seeds stay in play; Excel row layers topic brief on top (does not wipe Seeds).
      const { blogExcelOverrides } = await import("../studioSeedMerge.js");
      const overrides = blogExcelOverrides(site, row);

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
