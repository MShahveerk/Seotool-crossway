/**
 * AI keyword research — autocomplete + Planner first, AI enrichment in parallel.
 */
import { chatCompletionJson, getAiKeywordProviderStatus } from "./aiProvider.js";
import { isGoogleAdsConfigured } from "./googleAds.js";
import { discoverAutocompleteKeywords } from "./keywordAutocomplete.js";
import { getTopQueries } from "./searchconsole.js";
import { getDateRangeForPresetId } from "./searchConsoleDateRanges.js";
import {
  fetchHistoricalMetrics,
  resolveGeoTarget,
  DEFAULT_LANGUAGE_ID,
} from "./keywordPlanner.js";
import { expectedCtrForPosition } from "./keywordResearchHelpers.js";
const INTENT_COLORS = {
  informational: "sky",
  commercial: "amber",
  transactional: "emerald",
  navigational: "violet",
};

const RESEARCH_CACHE_TTL_MS = 45 * 60 * 1000;
const researchCache = new Map();

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function normKeyword(k) {
  return String(k || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
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
  if (row.difficultyEstimate != null && Number.isFinite(Number(row.difficultyEstimate))) {
    return clamp(Math.round(Number(row.difficultyEstimate)), 0, 100);
  }
  const comp = String(row.competition || "").toUpperCase();
  if (comp === "LOW") return clamp(Number(row.difficultyEstimate) || 25, 0, 100);
  if (comp === "HIGH") return clamp(Number(row.difficultyEstimate) || 75, 0, 100);
  if (comp === "MEDIUM") return clamp(Number(row.difficultyEstimate) || 50, 0, 100);
  return clamp(Number(row.difficultyEstimate) || 50, 0, 100);
}

function formatAiCpc(low, high) {
  const lo = Number(low);
  const hi = Number(high);
  if (Number.isFinite(lo) && Number.isFinite(hi) && lo > 0 && hi > 0) {
    return { low: `$${lo.toFixed(2)}`, high: `$${hi.toFixed(2)}` };
  }
  if (Number.isFinite(lo) && lo > 0) return { low: `$${lo.toFixed(2)}`, high: `$${lo.toFixed(2)}` };
  const single = String(low || high || "").trim();
  if (single.startsWith("$")) return { low: single, high: single };
  return { low: null, high: null };
}

function computeEstMonthlyClicks(row) {
  const vol = Number(row.avgMonthlySearches ?? row.volumeEstimate) || 0;
  if (vol <= 0) return null;
  const kd = computeKeywordDifficulty(row);
  const targetPos = Math.max(3, Math.min(15, 3 + Math.round(kd / 8)));
  return Math.round(vol * expectedCtrForPosition(targetPos));
}

/** Ahrefs-style: est. monthly traffic of the top-ranking page (AI estimate or volume-based fallback). */
function resolveTrafficPotential(row, aiEstimate) {
  const fromAi = Number(aiEstimate ?? row.trafficPotential ?? row.trafficPotentialEstimate);
  if (Number.isFinite(fromAi) && fromAi > 0) return Math.round(fromAi);
  const vol = Number(row.avgMonthlySearches ?? row.volumeEstimate) || 0;
  if (vol <= 0) return null;
  return Math.round(vol * expectedCtrForPosition(1) * 2.5);
}

function mergePlannerMetrics(keyword, metricsMap, aiRow = {}, autocompleteRow = {}) {
  const key = normKeyword(keyword);
  const planner = metricsMap.get(key) || null;
  const hasPlanner = Boolean(planner?.avgMonthlySearches != null || planner?.competitionIndex != null);

  const aiCpc = formatAiCpc(aiRow.cpcLow ?? aiRow.cpc_low, aiRow.cpcHigh ?? aiRow.cpc_high);
  const aiTrend = Array.isArray(aiRow.monthlyVolumeTrend)
    ? aiRow.monthlyVolumeTrend.map((t) => ({
        month: t.month,
        year: t.year,
        searches: t.searches != null ? Number(t.searches) : null,
      }))
    : [];

  let metricsSource = "unknown";
  if (hasPlanner) metricsSource = "google_ads";
  else if (aiRow.volumeEstimate != null) metricsSource = "ai_estimate";

  const avgMonthlySearches = planner?.avgMonthlySearches ?? aiRow.volumeEstimate ?? null;
  const competitionIndex = planner?.competitionIndex ?? aiRow.difficultyEstimate ?? null;
  const monthlyTrend = planner?.monthlyTrend?.length ? planner.monthlyTrend : aiTrend;

  const merged = {
    keyword: String(keyword || "").trim(),
    intent: aiRow.intent || inferIntent(keyword),
    type: aiRow.type || inferKeywordType(keyword),
    relevanceScore: clamp(Number(aiRow.relevanceScore ?? autocompleteRow.relevance) || 50, 0, 100),
    difficultyEstimate: aiRow.difficultyEstimate ?? null,
    volumeEstimate: aiRow.volumeEstimate ?? null,
    avgMonthlySearches,
    competition: planner?.competition ?? null,
    competitionIndex,
    lowTopOfPageBid: planner?.lowTopOfPageBid ?? aiCpc.low,
    highTopOfPageBid: planner?.highTopOfPageBid ?? aiCpc.high,
    monthlyTrend,
    plannerAvailable: hasPlanner,
    metricsSource,
    contentAngle: aiRow.contentAngle || "",
    recommendation: aiRow.recommendation || "",
    funnelStage: aiRow.funnelStage || "",
    priorityTier: aiRow.priorityTier || "",
    cluster: aiRow.cluster || "",
    sources: autocompleteRow.sources || [],
    existingPosition: autocompleteRow.existingPosition ?? null,
    isNewTopic: autocompleteRow.isNewTopic ?? autocompleteRow.existingPosition == null,
    tags: autocompleteRow.tags || [],
  };

  merged.estimatedMonthlyClicks = computeEstMonthlyClicks(merged);
  merged.trafficPotential = resolveTrafficPotential(merged, aiRow.trafficPotential ?? aiRow.trafficPotentialEstimate);
  return merged;
}

function computeOpportunityScore(row) {
  const vol = Number(row.avgMonthlySearches ?? row.volumeEstimate) || 0;
  const kd = computeKeywordDifficulty(row);
  const rel = Number(row.relevanceScore) || 50;
  const volScore = vol > 0 ? Math.log10(vol + 1) * 20 : 10;
  const kdBonus = (100 - kd) * 0.35;
  const tierBoost =
    row.priorityTier === "quick_win" ? 12 : row.priorityTier === "strategic" ? 6 : 0;
  const rankBoost = row.existingPosition != null && row.existingPosition <= 20 ? 8 : 0;
  return Math.round(volScore + kdBonus + rel * 0.25 + tierBoost + rankBoost);
}

function enrichRow(row) {
  const kd = computeKeywordDifficulty(row);
  const opportunity = computeOpportunityScore(row);
  const trend = trendDirection(row.monthlyTrend);
  return {
    ...row,
    keywordDifficulty: kd,
    opportunityScore: opportunity,
    trendDirection: row.trendDirection || trend,
    intentColor: INTENT_COLORS[row.intent] || "gray",
  };
}

function inferIntent(keyword) {
  const k = normKeyword(keyword);
  if (/^(how|what|why|when|where|who|can|does|is|are)\b/.test(k) || k.includes("?")) return "informational";
  if (/\b(buy|price|cost|cheap|deal|coupon|order|near me|hire|book)\b/.test(k)) return "transactional";
  if (/\b(best|top|review|vs|compare|alternative|software|tool|service)\b/.test(k)) return "commercial";
  if (/\b(login|sign in|official|website)\b/.test(k)) return "navigational";
  return "informational";
}

function inferKeywordType(keyword) {
  const k = normKeyword(keyword);
  if (/^(how|what|why|when|where|who|can|does|is|are)\b/.test(k)) return "question";
  if (k.split(/\s+/).length >= 5) return "long_tail";
  if (/\b(best|top|review|vs|compare|buy|price|cost)\b/.test(k)) return "commercial";
  return "related";
}

function inferHeuristicRecommendation(row) {
  if (row.existingPosition != null && row.existingPosition <= 15) {
    return `Already ranking ~#${Math.round(row.existingPosition)} — improve title/meta CTR and internal links.`;
  }
  if (row.existingPosition != null && row.existingPosition <= 30) {
    return `Striking distance (~#${Math.round(row.existingPosition)}) — expand content depth and build links to this URL.`;
  }
  if (row.isNewTopic) {
    return "New topic for your site — create a focused page or section targeting this query.";
  }
  return "Support with internal links from related pages; match search intent in H1 and intro.";
}

async function fetchSiteQueryMap(siteUrl, range = "28d") {
  if (!siteUrl) return new Map();
  try {
    const { startDate, endDate } = getDateRangeForPresetId(range);
    const { queries } = await getTopQueries(siteUrl, startDate, endDate, 250);
    const map = new Map();
    for (const q of queries || []) {
      const key = normKeyword(q.query);
      if (key) map.set(key, q.position);
    }
    return map;
  } catch {
    return new Map();
  }
}

function buildEnrichmentPrompt({ seed, geoLabel, siteHost, candidates }) {
  const list = candidates.slice(0, 32).map((c) => c.keyword);
  return `You are a senior SEO strategist. Analyze REAL autocomplete keywords for seed "${seed}" (${geoLabel}).
${siteHost ? `Website: ${siteHost} — prioritize terms this site can rank for.` : ""}

Keywords to analyze (pick 22-28 from this list; add max 2 gap terms only if critical):
${JSON.stringify(list)}

Return ONE JSON object (no markdown):
{"seedAnalysis":{"summary":"2 sentences max","intent":"informational|commercial|transactional","parentTopic":"...","volumeEstimate":1200,"difficultyEstimate":45,"cpcLow":1.2,"cpcHigh":3.5,"trafficPotential":8500,"trendDirection":"rising|stable|declining","monthlyVolumeTrend":[{"month":"JANUARY","year":2025,"searches":1100},{"month":"FEBRUARY","year":2025,"searches":1200}],"contentAngles":["angle1","angle2","angle3"],"serpFeatures":["featured snippet|PAA|video|local pack"]},"clusters":[{"name":"cluster theme","keywords":["kw1","kw2"],"contentType":"guide|comparison|landing|faq","priority":"high|medium|low","recommendation":"one line"}],"keywords":[{"keyword":"exact phrase from list","intent":"informational|commercial|transactional|navigational","type":"question|long_tail|commercial|related","relevanceScore":85,"volumeEstimate":800,"difficultyEstimate":38,"cpcLow":0.5,"cpcHigh":2.1,"trafficPotential":4200,"contentAngle":"specific page angle","recommendation":"actionable SEO step","funnelStage":"awareness|consideration|decision","priorityTier":"quick_win|growth|strategic","cluster":"cluster name"}],"gaps":[{"keyword":"optional gap","reason":"why"}]}

REQUIRED: seedAnalysis MUST include volumeEstimate, difficultyEstimate (0-100), cpcLow, cpcHigh, trafficPotential (est. monthly organic traffic of the #1 ranking page — Ahrefs-style, usually much higher than search volume), and monthlyVolumeTrend (6-12 months) for "${seed}". Each keyword MUST include volumeEstimate, difficultyEstimate, and trafficPotential. Use realistic market estimates for ${geoLabel}. Be specific to the niche. relevanceScore 0-100.`;
}

function buildResearchPromptLegacy({ seed, geoLabel, siteUrl, siteHost }) {
  const siteLine = siteUrl
    ? `Website: ${siteHost || siteUrl}. Tailor to this niche.`
    : "No website context.";
  return `SEO keyword research for "${seed}" (${geoLabel}). ${siteLine}
Return ONE JSON: {"seedAnalysis":{"keyword":"${seed}","intent":"informational","summary":"brief","volumeEstimate":1000,"difficultyEstimate":50,"cpcLow":1,"cpcHigh":3,"trafficPotential":7500,"monthlyVolumeTrend":[{"month":"JANUARY","year":2025,"searches":900}],"contentAngles":["a","b"]},"keywords":[{"keyword":"phrase","intent":"informational","type":"related","relevanceScore":80,"volumeEstimate":500,"difficultyEstimate":40,"trafficPotential":3000}]}
Include 18-22 keywords with volumeEstimate, difficultyEstimate, and trafficPotential on each. Seed must have full metrics.`;
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

  const clusters = Array.isArray(payload?.clusters) ? payload.clusters : [];
  const gaps = Array.isArray(payload?.gaps) ? payload.gaps : [];

  return { seedAnalysis: { keyword: seed, ...seedAnalysis }, keywords, clusters, gaps };
}

function buildHeuristicRows(candidates, seed) {
  return candidates.slice(0, 28).map((c) => ({
    keyword: c.keyword,
    intent: inferIntent(c.keyword),
    type: inferKeywordType(c.keyword),
    relevanceScore: c.relevance || 60,
    contentAngle: "",
    recommendation: inferHeuristicRecommendation(c),
    funnelStage: inferIntent(c.keyword) === "transactional" ? "decision" : "awareness",
    priorityTier: c.existingPosition != null && c.existingPosition <= 20 ? "quick_win" : "growth",
    cluster: "",
    autocomplete: c,
  }));
}

function dedupeKeywordStrings(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const k = String(raw || "").trim();
    if (!k) continue;
    const lower = normKeyword(k);
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(k);
  }
  return out;
}

function mergeAiWithCandidates(aiKeywords, candidates, gaps = []) {
  const byNorm = new Map(candidates.map((c) => [normKeyword(c.keyword), c]));
  const rows = [];

  for (const aiRow of aiKeywords) {
    const key = normKeyword(aiRow.keyword);
    if (!key) continue;
    rows.push({ ...aiRow, autocomplete: byNorm.get(key) || null });
  }

  for (const gap of gaps) {
    const kw = String(gap.keyword || gap.topic || "").trim();
    if (!kw) continue;
    if (rows.some((r) => normKeyword(r.keyword) === normKeyword(kw))) continue;
    rows.push({
      keyword: kw,
      intent: inferIntent(kw),
      type: inferKeywordType(kw),
      relevanceScore: 55,
      contentAngle: gap.reason || "",
      recommendation: gap.reason || "Fill content gap with dedicated page.",
      priorityTier: "strategic",
      autocomplete: byNorm.get(normKeyword(kw)) || null,
    });
  }

  if (rows.length >= 12) return rows;

  for (const c of candidates) {
    if (rows.length >= 28) break;
    if (rows.some((r) => normKeyword(r.keyword) === normKeyword(c.keyword))) continue;
    rows.push(...buildHeuristicRows([c], "").map((h) => ({ ...h, autocomplete: c })));
  }

  return rows.slice(0, 32);
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
    technicalNotes: Array.isArray(payload?.technicalNotes) ? payload.technicalNotes : [],
  };
}

function buildSiteBriefPrompt({ siteHost, geoLabel, rows, summary }) {
  const snapshot = rows.slice(0, 12).map((r) => ({
    q: r.query,
    pos: Math.round(r.position * 10) / 10,
    imp: r.impressions,
    vol: r.avgMonthlySearches,
    tags: (r.tags || []).slice(0, 2),
  }));

  return `SEO portfolio review: ${siteHost || "site"} (${geoLabel}).
Worth fighting=${summary.worthFighting ?? 0}, hidden gems=${summary.hiddenGems ?? 0}, CTR fixes=${summary.ctrFixes ?? 0}
Top queries: ${JSON.stringify(snapshot)}

Return ONE JSON (no markdown):
{"overview":"2-3 sentences","topPriorities":[{"query":"from data","action":"specific SEO task","reason":"why","impact":"high|medium|low","effort":"low|medium|high"}],"contentClusters":[{"theme":"...","keywords":["..."],"recommendation":"page type + angle","priority":"high|medium|low"}],"gaps":[{"topic":"...","reason":"..."}],"quickWins":["actionable win"],"technicalNotes":["optional index/CWV note"]}
Max: 6 priorities, 4 clusters, 3 gaps, 4 quick wins. Use real queries only.`;
}

export async function buildAiKeywordResearch({
  seed,
  geo = "us",
  siteUrl = "",
  provider,
  range = "28d",
} = {}) {
  const started = Date.now();
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

  const cacheKey = `${normKeyword(trimmedSeed)}|${geo}|${siteUrl || ""}`;
  const cached = researchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < RESEARCH_CACHE_TTL_MS) {
    return { ...cached.payload, cached: true };
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
  const timings = { autocompleteMs: 0, plannerMs: 0, aiMs: 0 };

  const t0 = Date.now();
  const existingQueries = await fetchSiteQueryMap(siteUrl, range);
  const autocompleteResult = await discoverAutocompleteKeywords([trimmedSeed], {
    geoKey: geo,
    existingQueries,
  });
  timings.autocompleteMs = Date.now() - t0;

  const candidates = autocompleteResult.keywords.filter((c) => c.relevance >= 45).slice(0, 40);
  if (!candidates.length) {
    candidates.push({
      keyword: trimmedSeed,
      relevance: 100,
      sources: ["seed"],
      existingPosition: existingQueries.get(normKeyword(trimmedSeed)) ?? null,
      isNewTopic: existingQueries.get(normKeyword(trimmedSeed)) == null,
      tags: [],
    });
  }

  const candidateMap = new Map(candidates.map((c) => [normKeyword(c.keyword), c]));
  const allKeywordStrings = dedupeKeywordStrings([
    trimmedSeed,
    ...candidates.map((c) => c.keyword),
  ]);

  const plannerConfigured = isGoogleAdsConfigured();
  let plannerError = null;
  const plannerPromise = plannerConfigured
    ? (async () => {
        const pt0 = Date.now();
        try {
          const map = await fetchHistoricalMetrics(allKeywordStrings, {
            geoTargetId: geoTarget.id,
            languageId: DEFAULT_LANGUAGE_ID,
          });
          timings.plannerMs = Date.now() - pt0;
          return map;
        } catch (error) {
          plannerError = error.message;
          console.warn("AI keyword research: Planner enrichment failed:", error.message);
          timings.plannerMs = Date.now() - pt0;
          return new Map();
        }
      })()
    : Promise.resolve(new Map());

  let aiPayload = null;
  let usedProvider = null;
  let model = null;
  let aiEnriched = false;

  const aiPromise = (async () => {
    const at0 = Date.now();
    try {
      const result = await chatCompletionJson(
        [
          {
            role: "system",
            content:
              "Senior SEO analyst. Output one valid JSON object only. Be specific and actionable — no generic marketing fluff.",
          },
          {
            role: "user",
            content: buildEnrichmentPrompt({
              seed: trimmedSeed,
              geoLabel: geoTarget.label,
              siteHost,
              candidates,
            }),
          },
        ],
        { temperature: 0.25, provider, maxTokens: 3072, timeoutMs: 90000 }
      );
      timings.aiMs = Date.now() - at0;
      return result;
    } catch (error) {
      timings.aiMs = Date.now() - at0;
      console.warn("AI enrichment failed, using autocomplete + Planner:", error.message);
      try {
        const fallback = await chatCompletionJson(
          [
            {
              role: "system",
              content: "SEO analyst. Output one valid JSON object only.",
            },
            {
              role: "user",
              content: buildResearchPromptLegacy({
                seed: trimmedSeed,
                geoLabel: geoTarget.label,
                siteUrl,
                siteHost,
              }),
            },
          ],
          { temperature: 0.2, provider, maxTokens: 2048, timeoutMs: 60000 }
        );
        return fallback;
      } catch {
        return null;
      }
    }
  })();

  const [metricsMap, aiResult] = await Promise.all([plannerPromise, aiPromise]);

  if (aiResult?.data) {
    aiPayload = normalizeResearchPayload(aiResult.data, trimmedSeed);
    usedProvider = aiResult.provider;
    model = aiResult.model;
    aiEnriched = true;
  }

  const seedAnalysis = aiPayload?.seedAnalysis || {
    keyword: trimmedSeed,
    summary: `Autocomplete found ${candidates.length} related terms for "${trimmedSeed}" in ${geoTarget.label}.`,
    contentAngles: [],
    intent: inferIntent(trimmedSeed),
  };

  let mergedRows;
  if (aiPayload?.keywords?.length) {
    mergedRows = mergeAiWithCandidates(aiPayload.keywords, candidates, aiPayload.gaps);
  } else {
    mergedRows = buildHeuristicRows(candidates, trimmedSeed).map((h) => ({
      ...h,
      autocomplete: candidateMap.get(normKeyword(h.keyword)) || null,
    }));
  }

  const seedAi = {
    intent: seedAnalysis.intent,
    difficultyEstimate: seedAnalysis.difficultyEstimate,
    volumeEstimate: seedAnalysis.volumeEstimate,
    cpcLow: seedAnalysis.cpcLow ?? seedAnalysis.cpc_low,
    cpcHigh: seedAnalysis.cpcHigh ?? seedAnalysis.cpc_high,
    monthlyVolumeTrend: seedAnalysis.monthlyVolumeTrend || seedAnalysis.monthly_volume_trend || [],
    trafficPotential: seedAnalysis.trafficPotential ?? seedAnalysis.trafficPotentialEstimate,
    type: "seed",
    relevanceScore: 100,
  };
  const seedAutocomplete = candidateMap.get(normKeyword(trimmedSeed)) || {
    keyword: trimmedSeed,
    relevance: 100,
    existingPosition: existingQueries.get(normKeyword(trimmedSeed)) ?? null,
    isNewTopic: existingQueries.get(normKeyword(trimmedSeed)) == null,
  };

  const seedMerged = mergePlannerMetrics(trimmedSeed, metricsMap, seedAi, seedAutocomplete);
  const seedEnriched = enrichRow({
    ...seedMerged,
    cpcEstimate: seedAnalysis.cpcEstimate ?? null,
    summary: seedAnalysis.summary || "",
    contentAngles: Array.isArray(seedAnalysis.contentAngles) ? seedAnalysis.contentAngles : [],
    serpFeatures: Array.isArray(seedAnalysis.serpFeatures) ? seedAnalysis.serpFeatures : [],
    parentTopic: seedAnalysis.parentTopic || "",
    trendDirection: seedAnalysis.trendDirection || trendDirection(seedMerged.monthlyTrend),
  });

  const keywordRows = mergedRows
    .map((row) => {
      const ac = row.autocomplete || candidateMap.get(normKeyword(row.keyword)) || {};
      const merged = mergePlannerMetrics(row.keyword, metricsMap, row, ac);
      return merged;
    })
    .filter((r) => normKeyword(r.keyword) !== normKeyword(trimmedSeed))
    .map((row) =>
      enrichRow({
        ...row,
        recommendation: row.recommendation || inferHeuristicRecommendation(row),
      })
    )
    .sort((a, b) => b.opportunityScore - a.opportunityScore);

  const withVolume = keywordRows.filter((r) => r.avgMonthlySearches != null).length;
  const withAiMetrics = keywordRows.filter((r) => r.metricsSource === "ai_estimate").length;
  const questions = keywordRows.filter((r) => r.type === "question").length;
  const commercial = keywordRows.filter(
    (r) => r.type === "commercial" || r.intent === "commercial" || r.intent === "transactional"
  ).length;
  const easyWins = keywordRows.filter(
    (r) => r.keywordDifficulty <= 35 && (r.avgMonthlySearches ?? 0) >= 50
  ).length;
  const alreadyRanking = keywordRows.filter((r) => r.existingPosition != null && r.existingPosition <= 20).length;

  const payload = {
    seed: seedEnriched,
    keywords: keywordRows,
    clusters: aiPayload?.clusters || [],
    summary: {
      total: keywordRows.length,
      withVolume,
      questions,
      commercial,
      easyWins,
      alreadyRanking,
      avgDifficulty: keywordRows.length
        ? Math.round(keywordRows.reduce((s, r) => s + r.keywordDifficulty, 0) / keywordRows.length)
        : 0,
      autocompleteCandidates: candidates.length,
    },
    geo: { key: geo, id: geoTarget.id, label: geoTarget.label },
    planner: {
      configured: plannerConfigured,
      enrichedCount: withVolume + (seedEnriched.avgMonthlySearches != null ? 1 : 0),
      error: plannerError,
    },
    ai: {
      provider: usedProvider,
      model,
      preferred: providerStatus.preferred,
      available: providerStatus.available,
      enriched: aiEnriched,
      method: aiEnriched ? "autocomplete+ai" : "autocomplete",
    },
    autocomplete: autocompleteResult.meta,
    timings: { ...timings, totalMs: Date.now() - started },
    generatedAt: new Date().toISOString(),
  };

  researchCache.set(cacheKey, { at: Date.now(), payload });
  return payload;
}

export { getAiKeywordProviderStatus };

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
  const topRows = [...rankedPayload.rows].sort((a, b) => (b.priority || 0) - (a.priority || 0)).slice(0, 12);

  const { data: aiPayload, provider: usedProvider, model } = await chatCompletionJson(
    [
      {
        role: "system",
        content:
          "Expert SEO consultant for agencies. Output one valid JSON object. Prioritize revenue impact and crawl/index fixes.",
      },
      {
        role: "user",
        content: buildSiteBriefPrompt({
          siteHost,
          geoLabel,
          rows: topRows,
          summary: rankedPayload.summary || {},
        }),
      },
    ],
    { temperature: 0.3, provider, maxTokens: 2048, timeoutMs: 75000 }
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
