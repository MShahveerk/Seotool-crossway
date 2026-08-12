/**
 * Turn a SERP Analysis result into 5 unique, ready-to-rank blog seed payloads for
 * the Blog Automation Studio. AI (secondary role) writes the angles/briefs; every
 * fact is grounded in the real SERP data — no invented stats, prices, or claims.
 */
import { chatCompletionJson } from "./aiProvider.js";

/** Compact, token-cheap snapshot of the SERP for the model to reason over. */
function buildSerpContext(analysis) {
  const km = analysis.keywordMetrics || {};
  const rankers = (analysis.topRankers || []).slice(0, 8).map((c) => ({
    rank: c.position,
    domain: c.domain,
    title: c.title,
    words: c.wordCount,
    h2: c.h2Count,
    schemas: (c.schemas || []).slice(0, 6),
    headings: (c.headings || []).filter((h) => h.tag !== "h1").slice(0, 8).map((h) => h.text),
    refdomains: c.backlinks?.refdomains ?? null,
  }));
  return {
    keyword: analysis.keyword,
    location: analysis.location || null,
    metrics: { volume: km.volume ?? null, difficulty: km.difficulty ?? null, cpc: km.cpc ?? null, intent: km.competitionLevel ?? null },
    yourRank: analysis.yourRank ?? null,
    yourWordCount: analysis.you?.wordCount ?? null,
    benchmark: {
      avgWordCount: analysis.summary?.avgWordCount ?? null,
      avgH2Count: analysis.summary?.avgH2Count ?? null,
      commonSchemas: analysis.summary?.commonSchemas ?? [],
      avgRefdomains: analysis.summary?.avgRefdomains ?? null,
    },
    topRankers: rankers,
    peopleAlsoAsk: (analysis.relatedQuestions || []).slice(0, 8),
    relatedSearches: (analysis.relatedSearches || []).slice(0, 10),
  };
}

const SYSTEM_PROMPT = `You are a senior SEO content strategist for a marketing agency.
From a live Google SERP analysis, propose FIVE distinct, non-overlapping blog article ideas that would help the client's site rank for (and around) the target keyword and out-position the current top results.

Return ONLY one valid JSON object (no markdown fences):
{
  "ideas": [
    {
      "topic": "specific working title / topic (<= 90 chars)",
      "angle": "the unique angle vs the pages already ranking",
      "primary_keyword": "the single primary keyword this article targets",
      "secondary_keywords": ["3-8 semantically related / long-tail keywords"],
      "content_type": "Guide | Listicle | Comparison | How-to | Local landing page | FAQ",
      "target_audience": "who this is for",
      "word_count_range": "e.g. 1600-2200 (aim to beat the leader average)",
      "outline_direction": "2-4 sentences: the H2 structure and what to cover, informed by the leaders' gaps and People Also Ask",
      "faq": ["2-4 question strings worth answering, drawn from People Also Ask / related searches"],
      "image_prompt": "one sentence describing an ideal 16:9 featured image (no text/logos)",
      "why": "1-2 sentences: why this idea can outrank the current results (the specific gap it exploits)"
    }
  ]
}

Rules:
- Exactly 5 ideas, each a genuinely different intent/angle (don't just reword the keyword 5 times).
- Ground everything in the supplied SERP data. Do NOT invent statistics, prices, brand claims, certifications, or client names.
- Prefer covering subtopics and questions the current top rankers MISS.
- Respect local intent: if a location is present, make at least some ideas locally-targeted.
- Keep keywords realistic to the niche; never fabricate search volumes.`;

/**
 * @param {object} args
 * @param {string} args.keyword
 * @param {object} args.analysis - a buildSerpAnalysis result
 * @returns {Promise<{ seeds: Array, provider: string, model: string }>}
 */
export async function generateCompetitorSeeds({ keyword, analysis }) {
  const context = buildSerpContext(analysis);
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Target keyword: "${keyword}"\n\nLive SERP analysis (JSON):\n${JSON.stringify(context, null, 2)}\n\nReturn the 5 blog ideas as specified.`,
    },
  ];

  const { data, provider, model } = await chatCompletionJson(messages, { temperature: 0.5, maxTokens: 2600 });
  const ideas = Array.isArray(data?.ideas) ? data.ideas : Array.isArray(data) ? data : [];
  if (!ideas.length) {
    const err = new Error("AI returned no blog ideas.");
    err.status = 502;
    throw err;
  }

  const benchmark = analysis.summary || {};
  const serpNotes = [
    `Target "${keyword}"${analysis.location ? ` (${analysis.location})` : ""}.`,
    benchmark.avgWordCount ? `Top rankers average ${benchmark.avgWordCount} words, ${benchmark.avgH2Count || 0} H2s.` : "",
    benchmark.commonSchemas?.length ? `Common schema: ${benchmark.commonSchemas.join(", ")}.` : "",
    benchmark.avgRefdomains ? `Avg referring domains among leaders: ${benchmark.avgRefdomains}.` : "",
    (analysis.relatedQuestions || []).length ? `People Also Ask: ${(analysis.relatedQuestions || []).slice(0, 6).join(" | ")}.` : "",
  ].filter(Boolean).join(" ");

  const seeds = ideas.slice(0, 5).map((idea) => {
    const primary = String(idea.primary_keyword || keyword).trim();
    const secondary = Array.isArray(idea.secondary_keywords) ? idea.secondary_keywords.map((s) => String(s).trim()).filter(Boolean) : [];
    const faq = Array.isArray(idea.faq) ? idea.faq.map((q) => String(q).trim()).filter(Boolean) : [];
    const seedPrompt = [
      idea.angle ? `Angle: ${idea.angle}` : "",
      idea.outline_direction ? `Outline: ${idea.outline_direction}` : "",
      faq.length ? `Answer these FAQs: ${faq.join(" | ")}` : "",
    ].filter(Boolean).join("\n\n");

    return {
      topic: String(idea.topic || primary).trim().slice(0, 180),
      title: String(idea.topic || primary).trim().slice(0, 200),
      seedPrompt,
      mustFollowKeywords: [primary, ...secondary].join("\n"),
      secondaryKeywords: secondary.join("\n"),
      targetAudience: String(idea.target_audience || "").trim(),
      location: String(analysis.location || "").trim(),
      wordCountRange: String(idea.word_count_range || (benchmark.avgWordCount ? `${benchmark.avgWordCount}-${benchmark.avgWordCount + 500}` : "1400-2000")).trim(),
      contentType: String(idea.content_type || "Blog post").trim(),
      serpNotes,
      imagePrompt: String(idea.image_prompt || "").trim(),
      why: String(idea.why || "").trim(),
    };
  });

  return { seeds, provider, model };
}
