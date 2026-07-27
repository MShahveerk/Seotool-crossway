/**
 * AI keyword research — LLM ideation enriched with Google Keyword Planner metrics.
 */
import { chatCompletionJson, getAiKeywordProviderStatus } from "./aiProvider.js";
import { isGoogleAdsConfigured } from "./googleAds.js";
import {
  fetchHistoricalMetrics,
  resolveGeoTarget,
  DEFAULT_LANGUAGE_ID,
} from "./keywordPlanner.js";

const INTENT_COLORS = {
  informational: "sky",
  commercial: "amber",
  transactional: "emerald",
  navigational: "violet",
};

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function trendDirection(trend) {
  const pts = (trend || []).filter((t) => t.searches != null).slice(-6);
  if (pts.length < 2) return "stable";
  const first = pts.slice(0, Math.floor(pts.length / 2)).reduce((s, p) => s + p.searches, 0);
  const second = pts.slice(Math.floor(pts.length / 2)).reduce((s, p) => s + p.searches, 0);
  const avgFirst = first / Math.max(1, Math.floor(pts.length / 2));
  const avgSecond = second / Math.max(1, pts.length - Math.floor(pts.length / 2));
  if (avgSecond > avgFirst * 1.15) return "rising";
  if (avgSecond < avgFirst * 0.85) return "declining";
  return "stable";
}

function computeKeywordDifficulty(row) {
  if (row.competitionIndex != null) {
    return clamp(Math.round(Number(row.competitionIndex)), 0, 100);
  }
  const comp = String(row.competition || "").toUpperCase();
  if (comp === "LOW") return clamp(Number(row.difficultyEstimate) || 25, 0, 100);
  if (comp === "HIGH") return clamp(Number(row.difficultyEstimate) || 75, 0, 100);
  if (comp === "MEDIUM") return clamp(Number(row.difficultyEstimate) || 50, 0, 100);
  return clamp(Number(row.difficultyEstimate) || 50, 0, 100);
}

function computeOpportunityScore(row) {
  const vol = Number(row.avgMonthlySearches ?? row.volumeEstimate) || 0;
  const kd = computeKeywordDifficulty(row);
  const rel = Number(row.relevanceScore) || 50;
  const volScore = vol > 0 ? Math.log10(vol + 1) * 20 : 10;
  const kdBonus = (100 - kd) * 0.35;
  return Math.round(volScore + kdBonus + rel * 0.25);
}

function mergePlannerMetrics(keyword, metricsMap, aiRow = {}) {
  const key = String(keyword || "").trim().toLowerCase();
  const planner = metricsMap.get(key) || null;
  const hasPlanner = Boolean(planner?.avgMonthlySearches != null || planner?.competition);

  return {
    keyword: String(keyword || "").trim(),
    intent: aiRow.intent || "informational",
    type: aiRow.type || "related",
    relevanceScore: clamp(Number(aiRow.relevanceScore) || 50, 0, 100),
    difficultyEstimate: aiRow.difficultyEstimate ?? null,
    volumeEstimate: aiRow.volumeEstimate ?? null,
    avgMonthlySearches: planner?.avgMonthlySearches ?? aiRow.volumeEstimate ?? null,
    competition: planner?.competition ?? null,
    competitionIndex: planner?.competitionIndex ?? null,
    lowTopOfPageBid: planner?.lowTopOfPageBid ?? null,
    highTopOfPageBid: planner?.highTopOfPageBid ?? null,
    monthlyTrend: planner?.monthlyTrend?.length ? planner.monthlyTrend : [],
    plannerAvailable: hasPlanner,
    metricsSource: hasPlanner ? "google_ads" : aiRow.volumeEstimate != null ? "ai_estimate" : "unknown",
  };
}

function enrichRow(row) {
  const kd = computeKeywordDifficulty(row);
  const opportunity = computeOpportunityScore(row);
  const trend = trendDirection(row.monthlyTrend);
  return {
    ...row,
    keywordDifficulty: kd,
    opportunityScore: opportunity,
    trendDirection: trend,
    intentColor: INTENT_COLORS[row.intent] || "gray",
  };
}

function buildResearchPrompt({ seed, geoLabel, siteUrl, siteHost }) {
  const siteLine = siteUrl
    ? `Website context: ${siteHost || siteUrl}. Tailor suggestions to this niche when relevant.`
    : "No specific website — suggest broadly relevant keywords.";

  return `SEO keyword research for seed "${seed}" in ${geoLabel}.
${siteLine}

Output ONE JSON object only (no markdown):
{"seedAnalysis":{"keyword":"${seed}","intent":"informational","difficultyEstimate":45,"volumeEstimate":1200,"cpcEstimate":2.5,"summary":"brief insight","contentAngles":["a","b","c"]},"keywords":[{"keyword":"phrase","intent":"informational","difficultyEstimate":40,"relevanceScore":80,"volumeEstimate":500,"type":"related"}]}

Rules:
- Exactly 18-22 keywords in "keywords" array
- Mix types: related, question, long_tail, commercial
- Keep summary under 280 characters
- Do not repeat the seed in keywords`;
}

function normalizeResearchPayload(payload, seed) {
  const seedAnalysis =
    payload?.seedAnalysis ||
    payload?.seed ||
    (typeof payload?.analysis === "object" ? payload.analysis : {}) ||
    {};
  let keywords = payload?.keywords || payload?.keywordIdeas || payload?.ideas || [];
  if (!Array.isArray(keywords)) keywords = [];
  keywords = keywords
    .map((k) => (typeof k === "string" ? { keyword: k, type: "related", relevanceScore: 50 } : k))
    .filter((k) => String(k?.keyword || "").trim());

  return {
    seedAnalysis: { keyword: seed, ...seedAnalysis },
    keywords,
  };
}

function normalizeBriefPayload(payload) {
  return {
    overview: String(payload?.overview || payload?.summary || "").trim(),
    topPriorities: Array.isArray(payload?.topPriorities)
      ? payload.topPriorities
      : Array.isArray(payload?.priorities)
        ? payload.priorities
        : [],
    contentClusters: Array.isArray(payload?.contentClusters) ? payload.contentClusters : [],
    gaps: Array.isArray(payload?.gaps) ? payload.gaps : Array.isArray(payload?.topicGaps) ? payload.topicGaps : [],
    quickWins: Array.isArray(payload?.quickWins) ? payload.quickWins : [],
  };
}

export async function buildAiKeywordResearch({
  seed,
  geo = "us",
  siteUrl = "",
  provider,
} = {}) {
  const trimmedSeed = String(seed || "").trim();
  if (!trimmedSeed) {
    const err = new Error("Enter a seed keyword to research.");
    err.status = 400;
    throw err;
  }
  if (trimmedSeed.length > 120) {
    const err = new Error("Seed keyword is too long (max 120 characters).");
    err.status = 400;
    throw err;
  }

  const geoTarget = resolveGeoTarget(geo);
  let siteHost = "";
  if (siteUrl) {
    try {
      const u = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
      siteHost = new URL(u).hostname.replace(/^www\./, "");
    } catch {
      siteHost = String(siteUrl).replace(/^https?:\/\//, "").split("/")[0] || "";
    }
  }

  const providerStatus = getAiKeywordProviderStatus();
  const { data: aiPayload, provider: usedProvider, model } = await chatCompletionJson(
    [
      {
        role: "system",
        content:
          "You are a senior SEO analyst. Output must be a single valid JSON object. No markdown, no prose outside JSON.",
      },
      { role: "user", content: buildResearchPrompt({ seed: trimmedSeed, geoLabel: geoTarget.label, siteUrl, siteHost }) },
    ],
    { temperature: 0.35, provider }
  );

  const normalized = normalizeResearchPayload(aiPayload, trimmedSeed);
  const seedAnalysis = normalized.seedAnalysis;
  const aiKeywords = normalized.keywords;

  if (!aiKeywords.length) {
    const err = new Error("AI returned no keyword ideas. Try again or switch model.");
    err.status = 502;
    throw err;
  }

  const allKeywordStrings = [
    trimmedSeed,
    ...aiKeywords.map((k) => String(k.keyword || "").trim()).filter(Boolean),
  ];
  const uniqueKeywords = [...new Set(allKeywordStrings.map((k) => k.toLowerCase()))].map((lower) => {
    const original = allKeywordStrings.find((k) => k.toLowerCase() === lower);
    return original || lower;
  });

  let metricsMap = new Map();
  let plannerConfigured = isGoogleAdsConfigured();
  if (plannerConfigured) {
    try {
      metricsMap = await fetchHistoricalMetrics(uniqueKeywords, {
        geoTargetId: geoTarget.id,
        languageId: DEFAULT_LANGUAGE_ID,
      });
    } catch (error) {
      console.warn("AI keyword research: Planner enrichment failed:", error.message);
      plannerConfigured = false;
    }
  }

  const seedAi = {
    intent: seedAnalysis.intent,
    difficultyEstimate: seedAnalysis.difficultyEstimate,
    volumeEstimate: seedAnalysis.volumeEstimate,
    type: "seed",
    relevanceScore: 100,
  };
  const seedMerged = mergePlannerMetrics(trimmedSeed, metricsMap, seedAi);
  const seedEnriched = enrichRow({
    ...seedMerged,
    cpcEstimate: seedAnalysis.cpcEstimate ?? null,
    summary: seedAnalysis.summary || "",
    contentAngles: Array.isArray(seedAnalysis.contentAngles) ? seedAnalysis.contentAngles : [],
    serpFeatures: Array.isArray(seedAnalysis.serpFeatures) ? seedAnalysis.serpFeatures : [],
    lowTopOfPageBid: seedMerged.lowTopOfPageBid,
    highTopOfPageBid: seedMerged.highTopOfPageBid,
  });

  const keywordRows = aiKeywords
    .map((row) => mergePlannerMetrics(row.keyword, metricsMap, row))
    .map(enrichRow)
    .sort((a, b) => b.opportunityScore - a.opportunityScore);

  const withVolume = keywordRows.filter((r) => r.avgMonthlySearches != null).length;
  const questions = keywordRows.filter((r) => r.type === "question").length;
  const commercial = keywordRows.filter((r) => r.type === "commercial" || r.intent === "commercial" || r.intent === "transactional").length;
  const easyWins = keywordRows.filter((r) => r.keywordDifficulty <= 35 && (r.avgMonthlySearches ?? 0) >= 50).length;

  return {
    seed: seedEnriched,
    keywords: keywordRows,
    summary: {
      total: keywordRows.length,
      withVolume,
      questions,
      commercial,
      easyWins,
      avgDifficulty: keywordRows.length
        ? Math.round(keywordRows.reduce((s, r) => s + r.keywordDifficulty, 0) / keywordRows.length)
        : 0,
    },
    geo: { key: geo, id: geoTarget.id, label: geoTarget.label },
    planner: { configured: plannerConfigured, enrichedCount: withVolume + (seedEnriched.plannerAvailable ? 1 : 0) },
    ai: {
      provider: usedProvider,
      model,
      preferred: providerStatus.preferred,
      available: providerStatus.available,
    },
    generatedAt: new Date().toISOString(),
  };
}

export { getAiKeywordProviderStatus };

function buildSiteBriefPrompt({ siteHost, geoLabel, rows, summary, strikingDistance }) {
  const snapshot = rows.slice(0, 18).map((r) => ({
    query: r.query,
    position: r.position,
    clicks: r.clicks,
    impressions: r.impressions,
    volume: r.avgMonthlySearches,
    tags: r.tags,
  }));

  return `Analyze keyword portfolio for ${siteHost || "site"} (${geoLabel}).
Stats: total=${summary.total ?? 0}, worthFighting=${summary.worthFighting ?? 0}, hiddenGems=${summary.hiddenGems ?? 0}, ctrFixes=${summary.ctrFixes ?? 0}
Keywords: ${JSON.stringify(snapshot)}

Return ONE JSON object only:
{"overview":"2-3 sentences","topPriorities":[{"query":"...","action":"...","reason":"...","impact":"high"}],"contentClusters":[{"theme":"...","keywords":["a"],"recommendation":"..."}],"gaps":[{"topic":"...","reason":"..."}],"quickWins":["win1","win2","win3"]}
Limit: 5 priorities, 3 clusters, 3 gaps, 3 quick wins. Use real queries from data.`;
}

/**
 * AI strategy brief for keywords the site already ranks for (GSC + Planner data).
 */
export async function buildAiSiteKeywordBrief({
  siteUrl = "",
  rankedPayload,
  provider,
} = {}) {
  if (!rankedPayload?.rows?.length) {
    const err = new Error("No keyword data to analyze. Load your rankings first.");
    err.status = 400;
    throw err;
  }

  let siteHost = "";
  if (siteUrl) {
    try {
      const u = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
      siteHost = new URL(u).hostname.replace(/^www\./, "");
    } catch {
      siteHost = String(siteUrl).replace(/^https?:\/\//, "").split("/")[0] || "";
    }
  }

  const geoLabel = rankedPayload.geo?.label || "United States";
  const providerStatus = getAiKeywordProviderStatus();

  const { data: aiPayload, provider: usedProvider, model } = await chatCompletionJson(
    [
      {
        role: "system",
        content: "You are an expert SEO consultant. Output one valid JSON object only. No markdown fences.",
      },
      {
        role: "user",
        content: buildSiteBriefPrompt({
          siteHost,
          geoLabel,
          rows: rankedPayload.rows,
          summary: rankedPayload.summary || {},
          strikingDistance: rankedPayload.strikingDistance || [],
        }),
      },
    ],
    { temperature: 0.35, provider }
  );

  const brief = normalizeBriefPayload(aiPayload);
  if (!brief.overview && !brief.topPriorities.length && !brief.quickWins.length) {
    const err = new Error("AI brief was empty. Try again or switch model.");
    err.status = 502;
    throw err;
  }

  return {
    brief,
    ai: {
      provider: usedProvider,
      model,
      preferred: providerStatus.preferred,
      available: providerStatus.available,
    },
    generatedAt: new Date().toISOString(),
  };
}
