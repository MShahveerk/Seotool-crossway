/**
 * Manual Site Researcher → Keyword Scout orchestration.
 * Does not create a BlogPost. Trigger is "research".
 */
import prisma from "../prisma.js";
import { toDomain } from "../authority.js";
import { isMetaPageId } from "../siteAccess.js";
import { normalizeSiteOrigin } from "../validation.js";
import { buildAutopilotContext } from "../seoAutopilot/context.js";
import { getAutopilotConfig } from "../seoAutopilot/engine.js";
import { isSerankingConfigured } from "../seranking/config.js";
import { hasProviderKey } from "./providers.js";
import { sumStageCosts } from "./costs.js";
import { ENGINE_INTERNAL, getEngineMode, getSiteStudioConfig } from "./engine.js";
import { loadOwnSitePages, pagesBriefForLlm } from "./ownSitePages.js";
import { compactUniverseForLlm, harvestKeywords } from "./keywordHarvest.js";
import { assembleTopics, runResearcherAgent, runScoutAgent } from "./researchAgents.js";
import { RESEARCH_KIND, RESEARCH_TRIGGER, depthConfig, estimateResearchCredits } from "./researchDefaults.js";

function siteOrigin(siteLink) {
  const raw = String(siteLink || "").trim();
  if (!raw) return "";
  if (raw.startsWith("sc-domain:")) return `https://${raw.slice("sc-domain:".length)}`;
  return normalizeSiteOrigin(raw) || (raw.startsWith("http") ? raw : `https://${raw}`);
}

export function isWebsiteProject(siteLink) {
  const raw = String(siteLink || "").trim();
  if (!raw || isMetaPageId(raw)) return false;
  return (
    raw.startsWith("http") ||
    raw.startsWith("sc-domain:") ||
    (raw.includes(".") && !/^\d+$/.test(raw))
  );
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

function assertResearchKeys(config) {
  const missing = [];
  if (!hasProviderKey(config.researcherProvider, config)) {
    missing.push(`researcher (${config.researcherProvider})`);
  }
  if (!hasProviderKey(config.scoutProvider, config)) {
    missing.push(`scout (${config.scoutProvider})`);
  }
  if (missing.length) {
    const err = new Error(
      `Missing API keys for: ${missing.join(", ")}. Open Setup → Agents, paste keys, and Save.`
    );
    err.status = 400;
    throw err;
  }
}

async function loadPublishedTitles(siteLink) {
  try {
    const rows = await prisma.blogPost.findMany({
      where: {
        siteLink,
        OR: [{ publishStatus: "publish" }, { wpStatus: "publish" }],
      },
      orderBy: { updatedAt: "desc" },
      take: 40,
      select: { title: true, slug: true },
    });
    return rows.map((r) => r.title || r.slug).filter(Boolean);
  } catch {
    return [];
  }
}

function harvestPreview(p) {
  if (!p) return "";
  if (p.phase === "expand") {
    return `Harvesting keywords ${p.done || 0}/${p.total || 0}`;
  }
  if (p.phase === "own-keywords") return "Loading this domain’s ranking keywords…";
  if (p.phase === "rivals") return "Loading rival keyword lists…";
  return String(p.phase || "Harvesting…");
}

function packForResearcher({ origin, pagesPack, context, published, studio }) {
  const gsc = context?.gsc || {};
  const overview = context?.overview || {};
  const audit = context?.audit || {};
  const parts = [
    `SITE: ${origin}`,
    studio?.seedPrompt ? `STUDIO SEED PROMPT:\n${String(studio.seedPrompt).slice(0, 2000)}` : null,
    studio?.mustFollowKeywords ? `EXISTING MUST-FOLLOW KEYWORDS:\n${studio.mustFollowKeywords}` : null,
    studio?.targetAudience ? `CONFIGURED AUDIENCE: ${studio.targetAudience}` : null,
    studio?.location ? `CONFIGURED LOCATION: ${studio.location}` : null,
    `OWN PAGES:\n${pagesBriefForLlm(pagesPack)}`,
    published.length ? `ALREADY PUBLISHED:\n${published.join("\n")}` : null,
    context?.contextText ? `CROSSWAY SEO PACK:\n${String(context.contextText).slice(0, 10000)}` : null,
    gsc?.topQueries ? `GSC QUERIES: ${JSON.stringify(gsc.topQueries).slice(0, 2500)}` : null,
    overview ? `OVERVIEW: ${JSON.stringify({ keywords: overview.keywords, traffic: overview.traffic, competitors: (overview.competitors || []).slice?.(0, 6) }).slice(0, 2000)}` : null,
    audit?.score != null ? `AUDIT SCORE: ${audit.score}` : null,
  ];
  return parts.filter(Boolean).join("\n\n");
}

export async function enqueueResearchRun({
  siteLink,
  triggeredById = null,
  depth = "deep",
  market = "us",
} = {}) {
  const mode = await getEngineMode();
  if (mode !== ENGINE_INTERNAL) {
    const err = new Error("Internal Studio is not the active engine.");
    err.status = 409;
    throw err;
  }
  if (!isWebsiteProject(siteLink)) {
    const err = new Error("Select a website project. Keyword research needs a real domain, not a Meta-only page.");
    err.status = 400;
    throw err;
  }
  if (!isSerankingConfigured()) {
    const err = new Error("SE Ranking is not configured. Add credentials in Admin → Data sources.");
    err.status = 400;
    throw err;
  }

  const config = await getSiteStudioConfig(siteLink);
  assertResearchKeys(config);

  const live = await prisma.blogAutomationRun.count({
    where: { siteLink: String(siteLink).trim(), status: { in: ["queued", "running"] } },
  });
  if (live > 0) {
    const err = new Error("A studio run is already in progress for this project. Wait for it to finish or cancel it.");
    err.status = 409;
    throw err;
  }

  const d = depthConfig(depth);
  const topic = `Keyword research (${d.label})`;
  const run = await prisma.blogAutomationRun.create({
    data: {
      siteLink: String(siteLink).trim(),
      trigger: RESEARCH_TRIGGER,
      status: "queued",
      topic,
      seedPromptSnapshot: config.seedPrompt || "",
      keywordsSnapshot: config.mustFollowKeywords || "",
      stagesJson: [
        {
          agent: "_context",
          status: "meta",
          kind: RESEARCH_KIND,
          depth: d.id,
          market: String(market || "us").toLowerCase(),
        },
      ],
      triggeredById: triggeredById || null,
    },
  });

  setImmediate(() => {
    executeResearchRun(run.id).catch((err) => {
      console.error(`[blogStudio] research ${run.id} crashed:`, err.message);
    });
  });

  return run;
}

export async function executeResearchRun(runId) {
  let stages = [];
  const run = await prisma.blogAutomationRun.findUnique({ where: { id: runId } });
  if (!run) return null;

  await patchRun(runId, { status: "running", startedAt: new Date(), errorMessage: null });

  try {
    if (await isCancelled(runId)) throw Object.assign(new Error("Cancelled."), { cancelled: true });

    const config = await getSiteStudioConfig(run.siteLink);
    assertResearchKeys(config);

    const meta = Array.isArray(run.stagesJson)
      ? run.stagesJson.find((s) => s?.agent === "_context")
      : null;
    const depth = meta?.depth || "deep";
    const market = meta?.market || "us";
    const origin = siteOrigin(run.siteLink);
    const domain = toDomain(origin);

    stages = [];
    await patchRun(runId, { stagesJson: stages });

    stages = await pushStage(runId, stages, {
      agent: "researcher",
      role: "Site Researcher",
      status: "running",
      startedAt: new Date().toISOString(),
      provider: config.researcherProvider,
      model: config.researcherModel,
    });

    const [pagesPack, published, autoConfig] = await Promise.all([
      loadOwnSitePages(run.siteLink),
      loadPublishedTitles(run.siteLink),
      getAutopilotConfig(run.siteLink).catch(() => ({})),
    ]);
    const context = await buildAutopilotContext(run.siteLink, autoConfig || {}).catch(() => null);
    if (await isCancelled(runId)) throw Object.assign(new Error("Cancelled."), { cancelled: true });

    const pack = packForResearcher({
      origin,
      pagesPack,
      context,
      published,
      studio: config,
    });
    const researcher = await runResearcherAgent({ config, pack });
    if (!researcher.brief.seeds.length) {
      throw new Error("Site Researcher returned no keyword seeds. Check the site pages loaded and try again.");
    }

    stages = await updateStage(runId, stages, stages.length - 1, {
      status: "succeeded",
      finishedAt: new Date().toISOString(),
      inputTokens: researcher.inputTokens,
      outputTokens: researcher.outputTokens,
      costUsd: researcher.costUsd,
      preview: `${researcher.brief.seeds.length} seeds · ${researcher.brief.services.length} services${
        researcher.brief.brandName ? ` · ${researcher.brief.brandName}` : ""
      }`,
      data: {
        brandName: researcher.brief.brandName,
        category: researcher.brief.category,
        services: researcher.brief.services,
        seeds: researcher.brief.seeds,
        pagesFetched: pagesPack.pages?.length || 0,
      },
    });

    if (await isCancelled(runId)) throw Object.assign(new Error("Cancelled."), { cancelled: true });

    stages = await pushStage(runId, stages, {
      agent: "scout",
      role: "Keyword Scout",
      status: "running",
      startedAt: new Date().toISOString(),
      provider: config.scoutProvider,
      model: config.scoutModel,
    });

    const harvest = await harvestKeywords({
      siteUrl: origin,
      domain,
      seeds: researcher.brief.seeds,
      depth,
      market,
      onProgress: async (p) => {
        await updateStage(runId, stages, stages.length - 1, {
          harvest: p,
          preview: harvestPreview(p),
        });
      },
    });
    if (await isCancelled(runId)) throw Object.assign(new Error("Cancelled."), { cancelled: true });

    const scout = await runScoutAgent({
      config,
      brief: researcher.brief,
      compactKeywords: compactUniverseForLlm(harvest.universe),
    });
    const topics = assembleTopics({
      brief: researcher.brief,
      llmTopics: scout.topics,
      universe: harvest.universe,
    });

    const preview = {
      kind: RESEARCH_KIND,
      depth,
      market,
      unique: harvest.unique,
      topicCount: topics.length,
      creditsSpent: harvest.creditsSpent,
      cacheHits: harvest.cacheHits,
      liveCalls: harvest.liveCalls,
      title: `${researcher.brief.brandName || domain || "Project"} · ${harvest.unique} keywords`,
    };

    stages = await updateStage(runId, stages, stages.length - 1, {
      status: "succeeded",
      finishedAt: new Date().toISOString(),
      inputTokens: scout.inputTokens,
      outputTokens: scout.outputTokens,
      costUsd: scout.costUsd,
      preview: `${harvest.unique} keywords · ${topics.length} topics · ${harvest.creditsSpent} credits`,
      data: {
        unique: harvest.unique,
        topicCount: topics.length,
        creditsSpent: harvest.creditsSpent,
        cacheHits: harvest.cacheHits,
        liveCalls: harvest.liveCalls,
        errors: harvest.errors.slice(0, 8),
      },
    });

    const result = {
      kind: RESEARCH_KIND,
      depth,
      market,
      brief: researcher.brief,
      universe: harvest.universe,
      topics,
      discarded: scout.discarded || [],
      creditsSpent: harvest.creditsSpent,
      cacheHits: harvest.cacheHits,
      liveCalls: harvest.liveCalls,
      harvestErrors: harvest.errors,
      rivals: harvest.rivals,
    };

    const finished = await prisma.blogAutomationRun.updateMany({
      where: {
        id: runId,
        cancelRequested: false,
        status: { in: ["queued", "running"] },
      },
      data: {
        status: "succeeded",
        finishedAt: new Date(),
        draftPreviewJson: preview,
        stagesJson: [...stages, { agent: "_result", status: "meta", result }],
        totalCostUsd: sumStageCosts(stages),
      },
    });
    if (!finished.count) throw Object.assign(new Error("Cancelled."), { cancelled: true });
    return prisma.blogAutomationRun.findUnique({ where: { id: runId } });
  } catch (err) {
    const cancelled = Boolean(err.cancelled) || /cancelled/i.test(String(err.message || ""));
    const current = await prisma.blogAutomationRun.findUnique({
      where: { id: runId },
      select: { status: true, cancelRequested: true },
    });
    if (current?.status !== "cancelled") {
      await patchRun(runId, {
        status: cancelled || current?.cancelRequested ? "cancelled" : "failed",
        finishedAt: new Date(),
        errorMessage: err.message || "Research run failed.",
        stagesJson: stages,
        totalCostUsd: sumStageCosts(stages),
      });
    }
    return prisma.blogAutomationRun.findUnique({ where: { id: runId } });
  }
}

export function extractResearchResult(run) {
  const stages = Array.isArray(run?.stagesJson) ? run.stagesJson : [];
  const resultStage = stages.find((s) => s?.agent === "_result");
  if (resultStage?.result) return resultStage.result;
  const preview = run?.draftPreviewJson;
  if (preview?.kind === RESEARCH_KIND && preview.topics) return preview;
  return null;
}

export async function loadLatestResearchForSite(siteLink, { requireSucceeded = true } = {}) {
  const link = String(siteLink || "").trim();
  if (!link) return null;
  const run = await prisma.blogAutomationRun.findFirst({
    where: {
      siteLink: link,
      trigger: RESEARCH_TRIGGER,
      ...(requireSucceeded ? { status: "succeeded" } : {}),
    },
    orderBy: [{ finishedAt: "desc" }, { createdAt: "desc" }],
  });
  return run ? extractResearchResult(run) : null;
}

export async function loadLatestResearchSummary(siteLink) {
  const link = String(siteLink || "").trim();
  if (!link) return null;
  const run = await prisma.blogAutomationRun.findFirst({
    where: { siteLink: link, trigger: RESEARCH_TRIGGER, status: "succeeded" },
    orderBy: [{ finishedAt: "desc" }, { createdAt: "desc" }],
    select: { draftPreviewJson: true, finishedAt: true, createdAt: true, id: true },
  });
  if (!run) return null;
  const preview = run.draftPreviewJson && typeof run.draftPreviewJson === "object" ? run.draftPreviewJson : {};
  return {
    ...preview,
    runId: run.id,
    finishedAt: run.finishedAt || run.createdAt,
  };
}

export { estimateResearchCredits };
