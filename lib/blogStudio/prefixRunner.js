/**
 * Run Decider → Binder → Checker → Headings, then return agent-1 JSON + locked headings.
 */
import { loadLatestResearchForSite } from "./researchRunner.js";
import {
  bindKeywordBag,
  checkTopicUniqueness,
  runBinderAngle,
  runCheckerRephrase,
  runDeciderAgent,
  runHeadingsAgent,
  synthesizeAgent1Json,
} from "./prefixAgents.js";
import { collectDeciderPack, marketToTrendsGeo } from "../googleTrends.js";
import { getDeciderFallback, isSerpApiReady } from "../dataSources.js";
import { hasProviderKey } from "./providers.js";

export function assertPrefixKeys(config, { needDecider = true, needHumanizer = false } = {}) {
  const missing = [];
  if (needDecider && !hasProviderKey(config.deciderProvider, config)) {
    missing.push(`decider (${config.deciderProvider})`);
  }
  if (!hasProviderKey(config.binderProvider, config)) missing.push(`binder (${config.binderProvider})`);
  if (!hasProviderKey(config.checkerProvider, config)) missing.push(`checker (${config.checkerProvider})`);
  if (!hasProviderKey(config.headingsProvider, config)) missing.push(`headings (${config.headingsProvider})`);
  if (needHumanizer && !hasProviderKey(config.humanizerProvider || config.agent3Provider, config)) {
    missing.push(`humanizer (${config.humanizerProvider || config.agent3Provider})`);
  }
  if (missing.length) {
    const err = new Error(
      `Missing API keys for: ${missing.join(", ")}. Open Setup → Agents, paste keys, and Save.`
    );
    err.status = 400;
    throw err;
  }
}

/**
 * @returns {{ topic, a1, lockedHeadings, bind, harvest }}
 */
export async function runDraftPrefix({
  runId,
  siteLink,
  config,
  topic,
  skipDecider = false,
  skipBinder = false,
  stages,
  pushStage,
  updateStage,
  isCancelled,
  patchRun,
}) {
  let currentTopic = String(topic || "").trim();
  const harvest = await loadLatestResearchForSite(siteLink);
  if (!harvest && !skipBinder) {
    const err = new Error(
      "Run keyword research first (Compose → Research). The draft prefix needs that keyword library."
    );
    err.status = 400;
    throw err;
  }

  let seedQuery = String(currentTopic || "").trim();
  let pack = { candidates: [], geo: marketToTrendsGeo(harvest?.market), source: "harvest" };
  let decider = null;

  if (!skipDecider) {
    const useTrends = await isSerpApiReady();
    const fallback = useTrends ? null : await getDeciderFallback();
    stages = await pushStage(runId, stages, {
      agent: "decider",
      role: "Topic Decider",
      status: "running",
      startedAt: new Date().toISOString(),
      provider: config.deciderProvider,
      model: config.deciderModel,
    });
    try {
      pack = await collectDeciderPack(harvest, {
        siteLink,
        useTrends,
        fallback: fallback || "harvest",
      });
      if (!pack.candidates.length) {
        throw new Error(
          pack.source === "trends"
            ? "No Trends overlapped this project’s keyword library. Re-run Research or type a topic."
            : "The keyword library has no topic phrases. Re-run Research or type a topic."
        );
      }
      if (await isCancelled(runId)) throw Object.assign(new Error("Cancelled."), { cancelled: true });
      decider = await runDeciderAgent({ config, harvest, pack });
      currentTopic = decider.topic;
      seedQuery = decider.seedQuery || decider.topic;
      await patchRun(runId, { topic: currentTopic });
    } catch (err) {
      await updateStage(runId, stages, stages.length - 1, {
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: err.message,
      });
      throw err;
    }
    stages = await updateStage(runId, stages, stages.length - 1, {
      status: "succeeded",
      finishedAt: new Date().toISOString(),
      inputTokens: decider.inputTokens,
      outputTokens: decider.outputTokens,
      costUsd: decider.costUsd,
      preview: currentTopic,
      data: {
        topic: currentTopic,
        seedQuery,
        why: decider.why,
        source: pack.source,
        gscStatus: pack.gscStatus || null,
        candidates: pack.candidates.slice(0, 12),
        geo: pack.geo,
      },
    });
  }

  if (!currentTopic) {
    const err = new Error("No topic to bind. Type one or let the Decider pick from the closed list.");
    err.status = 400;
    throw err;
  }

  let bind;
  let angle = {};
  let binderMeta = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

  stages = await pushStage(runId, stages, {
    agent: "binder",
    role: "Keyword Binder",
    status: "running",
    startedAt: new Date().toISOString(),
    provider: config.binderProvider,
    model: config.binderModel,
  });
  try {
    if (skipBinder) {
      if (harvest) {
        bind = bindKeywordBag(currentTopic, harvest, { seed: seedQuery });
      } else {
        const lines = String(config.mustFollowKeywords || "")
          .split(/\n+/)
          .map((s) => s.trim())
          .filter(Boolean);
        bind = {
          clusterId: null,
          clusterName: "",
          primary: lines[0] || currentTopic,
          headingKeywords: lines.slice(0, 8),
          bodyKeywords: lines.slice(1, 12),
          featured: lines.slice(1, 6),
          secondary: lines.slice(1, 8),
          longTails: lines.filter((k) => k.split(/\s+/).length >= 3).slice(0, 8),
          keywordCount: lines.length,
          easiestKd: null,
        };
      }
      angle = { recommended_angle: "", confirmed_search_intent: "Informational" };
    } else {
      bind = bindKeywordBag(currentTopic, harvest, { seed: seedQuery });
      binderMeta = await runBinderAngle({ config, topic: currentTopic, bind, harvest });
      angle = binderMeta.json || {};
    }
    config.mustFollowKeywords = [
      bind.primary,
      ...bind.headingKeywords,
      ...String(config.mustFollowKeywords || "")
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ]
      .filter((v, i, a) => a.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i)
      .slice(0, 16)
      .join("\n");
  } catch (err) {
    await updateStage(runId, stages, stages.length - 1, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      error: err.message,
    });
    throw err;
  }
  stages = await updateStage(runId, stages, stages.length - 1, {
    status: "succeeded",
    finishedAt: new Date().toISOString(),
    inputTokens: binderMeta.inputTokens,
    outputTokens: binderMeta.outputTokens,
    costUsd: binderMeta.costUsd,
    preview: `${bind.primary} · ${bind.headingKeywords.length} heading / ${bind.bodyKeywords.length} body`,
    data: {
      cluster: bind.clusterName,
      primary: bind.primary,
      headingKeywords: bind.headingKeywords,
      bodyKeywords: bind.bodyKeywords,
      keywordCount: bind.keywordCount,
    },
  });

  if (await isCancelled(runId)) throw Object.assign(new Error("Cancelled."), { cancelled: true });

  const gl = String(harvest?.market || "us").toLowerCase() === "uk" ? "uk" : String(harvest?.market || "us").toLowerCase();
  let checkMeta = { inputTokens: 0, outputTokens: 0, costUsd: 0, rephrased: false, hit: null };
  stages = await pushStage(runId, stages, {
    agent: "checker",
    role: "Topic Checker",
    status: "running",
    startedAt: new Date().toISOString(),
    provider: config.checkerProvider,
    model: config.checkerModel,
  });
  try {
    let verdict = await checkTopicUniqueness({ siteLink, topic: currentTopic, harvest, gl });
    if (verdict.duplicate) {
      const re = await runCheckerRephrase({
        config,
        topic: currentTopic,
        primary: bind.primary,
        hit: verdict.hit,
      });
      checkMeta = { ...re, rephrased: true, hit: verdict.hit };
      currentTopic = re.topic;
      await patchRun(runId, { topic: currentTopic });
      if (harvest) bind = bindKeywordBag(currentTopic, harvest, { seed: seedQuery });
      const second = await checkTopicUniqueness({ siteLink, topic: currentTopic, harvest, gl });
      if (second.duplicate) {
        throw new Error(
          `That topic still collides after a rephrase (“${second.hit?.title || currentTopic}”). Pick a different topic.`
        );
      }
    } else {
      checkMeta.webError = verdict.webError || null;
    }
  } catch (err) {
    await updateStage(runId, stages, stages.length - 1, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      error: err.message,
    });
    throw err;
  }
  stages = await updateStage(runId, stages, stages.length - 1, {
    status: "succeeded",
    finishedAt: new Date().toISOString(),
    inputTokens: checkMeta.inputTokens,
    outputTokens: checkMeta.outputTokens,
    costUsd: checkMeta.costUsd,
    preview: checkMeta.rephrased ? `Rephrased → ${currentTopic}` : "Unique",
    data: {
      topic: currentTopic,
      verdict: checkMeta.rephrased ? "rephrased" : "pass",
      hit: checkMeta.hit || null,
      webError: checkMeta.webError || null,
    },
  });

  if (await isCancelled(runId)) throw Object.assign(new Error("Cancelled."), { cancelled: true });

  stages = await pushStage(runId, stages, {
    agent: "headings",
    role: "Headings",
    status: "running",
    startedAt: new Date().toISOString(),
    provider: config.headingsProvider,
    model: config.headingsModel,
  });
  let headings;
  try {
    headings = await runHeadingsAgent({ config, topic: currentTopic, bind, harvest, angle });
  } catch (err) {
    await updateStage(runId, stages, stages.length - 1, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      error: err.message,
    });
    throw err;
  }
  stages = await updateStage(runId, stages, stages.length - 1, {
    status: "succeeded",
    finishedAt: new Date().toISOString(),
    inputTokens: headings.inputTokens,
    outputTokens: headings.outputTokens,
    costUsd: headings.costUsd,
    preview: headings.json.h1,
    data: headings.json,
  });

  const a1 = {
    json: synthesizeAgent1Json({ topic: currentTopic, bind, angle, headings: headings.json }),
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    provider: "binder",
    model: "deterministic",
  };

  return {
    topic: currentTopic,
    seedQuery,
    a1,
    lockedHeadings: headings.json,
    bind,
    angle,
    harvest,
    stages,
  };
}
