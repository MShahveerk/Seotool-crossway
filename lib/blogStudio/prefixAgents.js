/**
 * Draft prefix: Decider, Binder, Checker, Headings.
 * Binder keyword splits are deterministic; LLMs do not invent keywords.
 */
import prisma from "../prisma.js";
import { chatCompletion } from "./providers.js";
import { fetchGoogleSerp } from "../serpapi.js";
import { shouldCheckGoogleDuplicates } from "../dataSources.js";
import { collectTrendCandidates, collectDeciderPack } from "../googleTrends.js";
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
        .slice(0, 24)
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

function kdOf(row) {
  return row?.difficulty == null ? null : Number(row.difficulty);
}

function volOf(row) {
  return Number(row?.volume) || 0;
}

function sortEasyThenVolume(a, b) {
  const ad = kdOf(a) == null ? 99 : kdOf(a);
  const bd = kdOf(b) == null ? 99 : kdOf(b);
  return ad - bd || volOf(b) - volOf(a);
}

function pushUniqueMember(list, seen, row) {
  if (!row?.keyword) return;
  const k = normKeyword(row.keyword);
  if (!k || seen.has(k)) return;
  seen.add(k);
  list.push(row);
}

/**
 * Pull related universe / sibling-topic keywords when the matched cluster is thin.
 * Never invents phrases — only harvest rows.
 */
function expandClusterMembers(cluster, harvest, needleText) {
  const seen = new Set();
  const members = [];
  for (const row of cluster?.keywords || []) pushUniqueMember(members, seen, row);

  const needle = tokens(needleText);
  const siblingTopics = (harvest?.topics || []).filter((t) => t && t.id !== cluster?.id);
  if (members.length < 16) {
    const scored = siblingTopics
      .map((t) => ({
        t,
        score: jaccard(needle, tokens(`${t.name || ""} ${t.primary || ""} ${(t.featured || []).join(" ")}`)),
      }))
      .filter((x) => x.score >= 0.18)
      .sort((a, b) => b.score - a.score);
    for (const { t } of scored) {
      for (const row of t.keywords || []) {
        pushUniqueMember(members, seen, row);
        if (members.length >= 40) break;
      }
      if (members.length >= 40) break;
    }
  }

  if (members.length < 12 && Array.isArray(harvest?.universe)) {
    const ranked = harvest.universe
      .filter((r) => r?.keyword && !seen.has(normKeyword(r.keyword)))
      .map((r) => ({ r, score: jaccard(needle, tokens(r.keyword)) }))
      .filter((x) => x.score >= 0.16)
      .sort((a, b) => b.score - a.score || volOf(b.r) - volOf(a.r));
    for (const { r } of ranked) {
      pushUniqueMember(members, seen, r);
      if (members.length >= 40) break;
    }
  }

  if (!members.length && Array.isArray(harvest?.universe)) {
    for (const row of harvest.universe.slice(0, 40)) pushUniqueMember(members, seen, row);
  }
  return members;
}

function pickHeadingPool(members) {
  const easyVol = members.filter((m) => {
    const kd = kdOf(m);
    const vol = volOf(m);
    if (kd == null) return vol >= 20;
    return kd <= 35 && vol >= 20;
  });
  if (easyVol.length >= 4) return easyVol.sort(sortEasyThenVolume);
  const easy = members.filter((m) => kdOf(m) == null || kdOf(m) <= 40);
  if (easy.length >= 4) return easy.sort(sortEasyThenVolume);
  const mid = members.filter((m) => kdOf(m) == null || kdOf(m) <= 55);
  if (mid.length >= 4) return mid.sort(sortEasyThenVolume);
  return [...members].sort(sortEasyThenVolume);
}

/**
 * Low KD in headings, higher KD in body. Expands a thin cluster from the harvest
 * universe so a single-keyword topic still gets a real bag.
 */
export function bindKeywordBag(topic, harvest, { seed = "" } = {}) {
  const needleText = [seed, topic].filter(Boolean).join(" ");
  const cluster = nearestHarvestTopic(needleText, harvest);
  const withKd = expandClusterMembers(cluster, harvest, needleText).filter((m) => m && m.keyword);
  const headingPool = pickHeadingPool(withKd);

  const primaryRow =
    withKd.find((m) => normKeyword(m.keyword) === normKeyword(cluster?.primary)) ||
    headingPool[0] ||
    [...withKd].sort((a, b) => volOf(b) - volOf(a))[0] ||
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
  if (headingKeywords.length < 4) {
    for (const row of withKd.sort(sortEasyThenVolume)) {
      if (headingKeywords.length >= 8) break;
      pushHeading(row);
    }
  }

  const bodyKeywords = withKd
    .filter((m) => !headingKeys.has(normKeyword(m.keyword)))
    .sort((a, b) => {
      const ad = kdOf(a) == null ? 0 : kdOf(a);
      const bd = kdOf(b) == null ? 0 : kdOf(b);
      return bd - ad || volOf(b) - volOf(a);
    })
    .slice(0, 12)
    .map((m) => m.keyword);

  const featured = asArray(cluster?.featured).filter(Boolean).slice(0, 8);
  const secondary = [...new Set([...featured, ...headingKeywords.slice(1), ...bodyKeywords.slice(0, 6)])]
    .filter((k) => normKeyword(k) !== normKeyword(primaryRow?.keyword))
    .slice(0, 10);

  return {
    clusterId: cluster?.id || null,
    clusterName: cluster?.name || "",
    primary: primaryRow?.keyword || String(seed || topic || "").trim(),
    headingKeywords,
    bodyKeywords,
    featured,
    secondary,
    longTails: headingKeywords.filter((k) => k.split(/\s+/).length >= 3).slice(0, 8),
    keywordCount: withKd.length,
    easiestKd: cluster?.easiestKd ?? headingPool[0]?.difficulty ?? null,
    seed: String(seed || "").trim() || null,
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

function sentenceCaseTitle(s) {
  const t = String(s || "")
    .trim()
    .replace(/[.?!]+$/g, "")
    .replace(/\s+/g, " ");
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const GENERIC_TITLE = /\b(everything you need|complete guide|ultimate guide|in this article|all you need to know)\b/i;

function titleKeepsSeed(seed, proposed) {
  const prop = sentenceCaseTitle(proposed);
  if (!prop || prop.length > 78) return false;
  if (GENERIC_TITLE.test(prop)) return false;
  const seedN = normalizeTopicString(seed);
  const propN = normalizeTopicString(prop);
  if (!seedN || !propN) return false;
  if (propN === seedN || propN.includes(seedN) || seedN.includes(propN)) return true;
  const st = tokens(seed);
  const pt = tokens(prop);
  let inter = 0;
  for (const t of st) if (pt.has(t)) inter += 1;
  if (st.size >= 2 && inter < 2) return false;
  return inter >= 2 || jaccard(st, pt) >= 0.28;
}

export async function runDeciderAgent({ config, harvest, pack }) {
  const system = config.deciderPrompt || DEFAULT_DECIDER_PROMPT;
  const result = await chatCompletion({
    provider: config.deciderProvider,
    model: config.deciderModel,
    system,
    user: JSON.stringify(
      {
        source: pack.source || "trends",
        prefer: pack.source === "gsc" ? "search-console-overlap" : pack.source === "harvest" ? "gap-strike-low-kd" : "rising-trends",
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
  const candidates = pack.candidates || [];
  const byId = candidates.find((c) => String(c.id) === String(data.candidateId || "").trim());
  const allowed = new Map(candidates.map((c) => [normalizeTopicString(c.query), c]));
  const hit = byId || allowed.get(normalizeTopicString(data.topic)) || candidates[0];
  if (!hit) {
    throw new Error("Topic Decider had no candidates from the closed list. Re-run Research or add a topic.");
  }
  const proposed = String(data.topic || "").trim();
  const topic = titleKeepsSeed(hit.query, proposed)
    ? sentenceCaseTitle(proposed).slice(0, 70)
    : sentenceCaseTitle(hit.query).slice(0, 70);
  return {
    topic,
    seedQuery: hit.query,
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

export async function runHeadingsAgent({ config, topic, bind, harvest, angle, feedback = "" }) {
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
        ...(String(feedback || "").trim() ? { reviewer_feedback: String(feedback).trim() } : {}),
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

export { collectTrendCandidates, collectDeciderPack };
