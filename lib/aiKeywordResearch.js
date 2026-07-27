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

  return `You are an expert SEO keyword strategist like Ahrefs or Google Keyword Planner.

Seed keyword: "${seed}"
Market / country: ${geoLabel}
${siteLine}

Return ONLY valid JSON (no markdown) with this exact shape:
{
  "seedAnalysis": {
    "keyword": "${seed}",
    "intent": "informational|commercial|transactional|navigational",
    "difficultyEstimate": 0-100,
    "volumeEstimate": integer monthly searches or null,
    "cpcEstimate": number USD or null,
    "summary": "2-3 sentences of strategic insight for this keyword",
    "contentAngles": ["angle 1", "angle 2", "angle 3"],
    "serpFeatures": ["featured snippet", "people also ask", etc]
  },
  "keywords": [
    {
      "keyword": "related phrase",
      "intent": "informational|commercial|transactional|navigational",
      "difficultyEstimate": 0-100,
      "relevanceScore": 0-100,
      "volumeEstimate": integer or null,
      "type": "related|question|long_tail|commercial"
    }
  ]
}

Rules:
- Generate 28-35 unique keywords including questions (type=question), long-tail (type=long_tail), and commercial variants (type=commercial).
- volumeEstimate should be realistic for ${geoLabel} (rough monthly Google searches).
- difficultyEstimate reflects organic ranking difficulty (0=easy, 100=very hard).
- Do not duplicate the seed keyword in the keywords array.`;
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
          "You are a senior SEO analyst. Respond with strict JSON only. Be realistic with volume and difficulty estimates.",
      },
      { role: "user", content: buildResearchPrompt({ seed: trimmedSeed, geoLabel: geoTarget.label, siteUrl, siteHost }) },
    ],
    { temperature: 0.35, provider }
  );

  const seedAnalysis = aiPayload?.seedAnalysis || { keyword: trimmedSeed };
  const aiKeywords = Array.isArray(aiPayload?.keywords) ? aiPayload.keywords : [];

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
