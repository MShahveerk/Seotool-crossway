/**
 * Draft prefix: Decider, Binder, Checker, Headings.
 * Binder keyword splits are deterministic; LLMs do not invent keywords.
 */
import prisma from "../prisma.js";
import { chatCompletion } from "./providers.js";
import { fetchGoogleSerp } from "../serpapi.js";
import { shouldCheckGoogleDuplicates } from "../dataSources.js";
import { collectTrendCandidates } from "../googleTrends.js";
import {
  DEFAULT_BINDER_PROMPT,
  DEFAULT_CHECKER_PROMPT,
  DEFAULT_DECIDER_PROMPT,
  DEFAULT_HEADINGS_PROMPT,
} from "./prefixDefaults.js";
import { normKeyword } from "../seranking/keywordMetrics.js";

function tokens(s) {
  return new Set(
    String(s || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2)
  );
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

export function normalizeTopicString(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  return [v];
}

export function nearestHarvestTopic(topic, harvest) {
  const topics = Array.isArray(harvest?.topics) ? harvest.topics : [];
  if (!topics.length) return null;
  const needle = tokens(topic);
  let best = topics[0];
  let bestScore = -1;
  for (const t of topics) {
    const bag = tokens(
      `${t.name || ""} ${t.primary || ""} ${(t.featured || []).join(" ")} ${(t.keywords || [])
        .slice(0, 12)
        .map((k) => k.keyword)
        .join(" ")}`
    );
    const score = jaccard(needle, bag);
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

/**
 * Low KD in headings, higher KD in body. Full bag stays attached.
 */
export function bindKeywordBag(topic, harvest) {
  const cluster = nearestHarvestTopic(topic, harvest);
  const members = Array.isArray(cluster?.keywords) ? [...cluster.keywords] : [];
  if (!members.length && Array.isArray(harvest?.universe)) {
    members.push(...harvest.universe.slice(0, 80));
  }
  const withKd = members.filter((m) => m && m.keyword);
  const headingPool = withKd
    .filter((m) => {
      const kd = m.difficulty;
      const vol = Number(m.volume) || 0;
      if (kd == null) return vol >= 50;
      return Number(kd) <= 35 && vol >= 50;
    })
    .sort((a, b) => {
      const ad = a.difficulty == null ? 99 : Number(a.difficulty);
      const bd = b.difficulty == null ? 99 : Number(b.difficulty);
      return ad - bd || (Number(b.volume) || 0) - (Number(a.volume) || 0);
    });

  const primaryRow =
    withKd.find((m) => normKeyword(m.keyword) === normKeyword(cluster?.primary)) ||
    headingPool[0] ||
    withKd.sort((a, b) => (Number(b.volume) || 0) - (Number(a.volume) || 0))[0] ||
    null;

  const headingKeys = new Set();
  const headingKeywords = [];
  const pushHeading = (row) => {
    if (!row?.keyword) return;
    const k = normKeyword(row.keyword);
    if (headingKeys.has(k)) return;
    headingKeys.add(k);
    headingKeywords.push(row.keyword);
  };
  pushHeading(primaryRow);
  for (const row of headingPool) {
    if (headingKeywords.length >= 8) break;
    pushHeading(row);
  }

  const bodyKeywords = withKd
    .filter((m) => !headingKeys.has(normKeyword(m.keyword)))
    .sort((a, b) => {
      const ad = a.difficulty == null ? 0 : Number(a.difficulty);
      const bd = b.difficulty == null ? 0 : Number(b.difficulty);
      return bd - ad || (Number(b.volume) || 0) - (Number(a.volume) || 0);
    })
    .slice(0, 12)
    .map((m) => m.keyword);

  const featured = asArray(cluster?.featured).filter(Boolean).slice(0, 8);
  const secondary = [...new Set([...featured, ...headingKeywords.slice(1), ...bodyKeywords.slice(0, 4)])]
    .filter((k) => normKeyword(k) !== normKeyword(primaryRow?.keyword))
    .slice(0, 10);

  return {
    clusterId: cluster?.id || null,
    clusterName: cluster?.name || "",
    primary: primaryRow?.keyword || String(topic || "").trim(),
    headingKeywords,
    bodyKeywords,
    featured,
    secondary,
    longTails: headingKeywords.filter((k) => k.split(/\s+/).length >= 3).slice(0, 8),
    keywordCount: withKd.length,
    easiestKd: cluster?.easiestKd ?? headingPool[0]?.difficulty ?? null,
  };
}

export function synthesizeAgent1Json({ topic, bind, angle = {}, headings = null }) {
  return {
    primary_keyword: bind.primary,
    secondary_keywords: bind.secondary,
    long_tail_opportunities: bind.longTails,
    confirmed_search_intent: angle.confirmed_search_intent || "Informational",
    decision_stage: angle.decision_stage || "Consideration",
    recommended_title: headings?.h1 || topic,
    recommended_h1: headings?.h1 || topic,
    recommended_angle: angle.recommended_angle || "",
    faq_candidates: asArray(headings?.faq).map((q) => ({
      question: typeof q === "string" ? q : q.question || "",
      priority: "Medium",
    })).filter((q) => q.question),
    claims_to_avoid: asArray(angle.claims_to_avoid),
    outline_direction: headings
      ? asArray(headings.sections)
          .map((s) => s.heading_h2)
          .filter(Boolean)
          .join(" → ")
      : "",
    word_count_target: "",
    slug_suggestion: String(topic || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60),
    internal_link_pick: { url: "", anchor_text: "" },
    external_link_pick: { url: "", usage: "" },
    heading_keywords: bind.headingKeywords,
    body_keywords: bind.bodyKeywords,
  };
}

export async function runDeciderAgent({ config, harvest, pack }) {
  const system = config.deciderPrompt || DEFAULT_DECIDER_PROMPT;
  const result = await chatCompletion({
    provider: config.deciderProvider,
    model: config.deciderModel,
    system,
    user: JSON.stringify(
      {
        brief: {
          brandName: harvest?.brief?.brandName,
          category: harvest?.brief?.category,
          audience: harvest?.brief?.audience,
          services: harvest?.brief?.services,
          publishedToAvoid: harvest?.brief?.publishedToAvoid,
        },
        candidates: pack.candidates,
      },
      null,
      2
    ),
    siteConfig: config,
    temperature: 0.3,
    maxTokens: 1200,
    jsonMode: true,
  });
  const data = result?.json && typeof result.json === "object" ? result.json : {};
  const allowed = new Map((pack.candidates || []).map((c) => [normalizeTopicString(c.query), c]));
  const pickedRaw = String(data.topic || "").trim();
  const hit = allowed.get(normalizeTopicString(pickedRaw)) || pack.candidates?.[0];
  if (!hit) {
    throw new Error("Topic Decider had no overlapping Trends × harvest candidates. Re-run Research or add a topic.");
  }
  return {
    topic: hit.query,
    candidateId: hit.id,
    why: String(data.why || "").trim(),
    angle: String(data.angle || "").trim(),
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
    provider: config.deciderProvider,
    model: config.deciderModel,
  };
}

export async function runBinderAngle({ config, topic, bind, harvest }) {
  try {
    const system = config.binderPrompt || DEFAULT_BINDER_PROMPT;
    const result = await chatCompletion({
      provider: config.binderProvider,
      model: config.binderModel,
      system,
      user: JSON.stringify(
        {
          topic,
          primary: bind.primary,
          headingKeywords: bind.headingKeywords,
          bodyKeywords: bind.bodyKeywords,
          cluster: bind.clusterName,
          audience: harvest?.brief?.audience,
          services: harvest?.brief?.services,
        },
        null,
        2
      ),
      siteConfig: config,
      temperature: 0.2,
      maxTokens: 800,
      jsonMode: true,
    });
    const data = result?.json && typeof result.json === "object" ? result.json : {};
    return {
      json: data,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
      provider: config.binderProvider,
      model: config.binderModel,
    };
  } catch {
    return { json: {}, inputTokens: 0, outputTokens: 0, costUsd: 0 };
  }
}

export async function findInAppDuplicate(siteLink, topic, extraTitles = []) {
  const norm = normalizeTopicString(topic);
  if (!norm) return null;
  const extras = extraTitles.map(normalizeTopicString).filter(Boolean);
  if (extras.includes(norm)) {
    return { source: "research", title: topic };
  }
  const rows = await prisma.blogPost.findMany({
    where: { siteLink: String(siteLink).trim() },
    select: { title: true, slug: true, publishStatus: true, wpStatus: true },
    take: 400,
    orderBy: { updatedAt: "desc" },
  });
  for (const row of rows) {
    if (normalizeTopicString(row.title) === norm) {
      return { source: "app", title: row.title };
    }
  }
  return null;
}

export async function findWebDuplicate(topic, { gl = "us" } = {}) {
  const q = `"${String(topic || "").trim()}"`;
  const res = await fetchGoogleSerp(q, { gl, num: 10 });
  const want = normalizeTopicString(topic);
  for (const row of res.organic || []) {
    if (normalizeTopicString(row.title) === want) {
      return { source: "google", title: row.title, url: row.link };
    }
  }
  return null;
}

export async function checkTopicUniqueness({ siteLink, topic, harvest, gl = "us" }) {
  const extra = asArray(harvest?.brief?.publishedToAvoid);
  const appHit = await findInAppDuplicate(siteLink, topic, extra);
  if (appHit) return { duplicate: true, hit: appHit };
  if (await shouldCheckGoogleDuplicates()) {
    try {
      const webHit = await findWebDuplicate(topic, { gl });
      if (webHit) return { duplicate: true, hit: webHit };
    } catch (err) {
      return { duplicate: false, hit: null, webError: err.message };
    }
  }
  return { duplicate: false, hit: null };
}

export async function runCheckerRephrase({ config, topic, primary, hit }) {
  const system = config.checkerPrompt || DEFAULT_CHECKER_PROMPT;
  const result = await chatCompletion({
    provider: config.checkerProvider,
    model: config.checkerModel,
    system,
    user: JSON.stringify({ topic, primary_keyword: primary, collision: hit }, null, 2),
    siteConfig: config,
    temperature: 0.4,
    maxTokens: 600,
    jsonMode: true,
  });
  const data = result?.json && typeof result.json === "object" ? result.json : {};
  const next = String(data.topic || "").trim();
  if (!next || normalizeTopicString(next) === normalizeTopicString(topic)) {
    throw new Error("Topic Checker could not rephrase the colliding title. Change the topic and retry.");
  }
  return {
    topic: next,
    why: String(data.why || "").trim(),
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
    provider: config.checkerProvider,
    model: config.checkerModel,
  };
}

export async function runHeadingsAgent({ config, topic, bind, harvest, angle }) {
  const system = config.headingsPrompt || DEFAULT_HEADINGS_PROMPT;
  const result = await chatCompletion({
    provider: config.headingsProvider,
    model: config.headingsModel,
    system,
    user: JSON.stringify(
      {
        topic,
        primary: bind.primary,
        heading_keywords: bind.headingKeywords,
        body_keywords: bind.bodyKeywords,
        buyingQuestions: harvest?.brief?.buyingQuestions,
        angle: angle?.recommended_angle,
        word_count_range: config.wordCountRange,
      },
      null,
      2
    ),
    siteConfig: config,
    temperature: 0.35,
    maxTokens: 4000,
    jsonMode: true,
  });
  const data = result?.json && typeof result.json === "object" ? result.json : {};
  const sections = asArray(data.sections).filter((s) => s && (s.heading_h2 || s.heading));
  return {
    json: {
      h1: String(data.h1 || topic).trim(),
      sections: sections.map((s, i) => ({
        section_id: `h2_${i + 1}`,
        heading_h2: String(s.heading_h2 || s.heading || "").trim(),
        heading_keywords: asArray(s.heading_keywords),
        body_keywords: asArray(s.body_keywords),
        key_points: asArray(s.key_points),
        subsections: asArray(s.subsections).map((sub) => ({
          heading_h3: String(sub.heading_h3 || "").trim(),
          writing_instruction: String(sub.writing_instruction || "").trim(),
        })),
      })),
      faq: asArray(data.faq)
        .map((q) => (typeof q === "string" ? { question: q } : { question: String(q.question || "").trim() }))
        .filter((q) => q.question),
    },
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
    provider: config.headingsProvider,
    model: config.headingsModel,
  };
}

export { collectTrendCandidates };
