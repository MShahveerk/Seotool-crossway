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

const CONTENT_STOP = new Set([
  "how",
  "much",
  "does",
  "the",
  "and",
  "for",
  "with",
  "what",
  "when",
  "why",
  "who",
  "that",
  "this",
  "from",
  "into",
  "your",
  "you",
]);

/** True when two phrases share a real content word (not how/much/does). Closed-list only. */
function sharesContent(aText, bText) {
  const content = [...tokens(aText)].filter((t) => t.length >= 4 && !CONTENT_STOP.has(t));
  if (!content.length) return false;
  const other = tokens(bText);
  return content.some((t) => other.has(t));
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
      .map((t) => {
        const bag = `${t.name || ""} ${t.primary || ""} ${(t.featured || []).join(" ")}`;
        return {
          t,
          score: jaccard(needle, tokens(bag)),
          share: sharesContent(needleText, bag),
        };
      })
      .filter((x) => x.score >= 0.12 || x.share)
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
      .map((r) => ({
        r,
        score: jaccard(needle, tokens(r.keyword)),
        share: sharesContent(needleText, r.keyword),
      }))
      .filter((x) => x.score >= 0.12 || x.share)
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
export function bindKeywordBag(topic, harvest, { seed = "", extraKeywords = [] } = {}) {
  const needleText = [seed, topic].filter(Boolean).join(" ");
  const cluster = harvest ? nearestHarvestTopic(needleText, harvest) : null;
  const fromHarvest = harvest ? expandClusterMembers(cluster, harvest, needleText).filter((m) => m && m.keyword) : [];
  const withKd = [...fromHarvest];
  const seen = new Set(withKd.map((m) => normKeyword(m.keyword)));
  for (const row of asArray(extraKeywords)) {
    const keyword = String(typeof row === "string" ? row : row?.keyword || "").trim();
    if (!keyword) continue;
    const k = normKeyword(keyword);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    withKd.push({
      keyword,
      volume: typeof row === "object" ? row.volume : null,
      difficulty: typeof row === "object" ? row.kd ?? row.difficulty : null,
    });
  }
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

function titleCaseHeading(s) {
  const small = new Set(["a", "an", "and", "as", "at", "for", "in", "of", "on", "or", "the", "to", "vs"]);
  const words = String(s || "")
    .trim()
    .replace(/[.?!]+$/g, "")
    .split(/\s+/)
    .filter(Boolean);
  return words
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (i > 0 && i < words.length - 1 && small.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

const GENERIC_TITLE = /\b(everything you need|complete guide|ultimate guide|in this article|all you need to know)\b/i;
const STALE_DECIDER_COPY = /MUST be copied from one candidate\.query|topic MUST be copied/i;

function titlesDiffer(seed, proposed) {
  return Boolean(normalizeTopicString(seed) && normalizeTopicString(proposed) !== normalizeTopicString(seed));
}

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

function isEnhancedTitle(seed, proposed) {
  return titleKeepsSeed(seed, proposed) && titlesDiffer(seed, proposed);
}

/** Deterministic rewrite when the model copies the seed. Keeps the same subject. */
export function beautifySeedTitle(seed) {
  const raw = String(seed || "").trim();
  const s = raw.replace(/[.?!]+$/g, "").replace(/\s+/g, " ");
  const lower = s.toLowerCase();
  let out = s;
  const doesCost = lower.match(/^how much does (.+) cost$/);
  const doCost = lower.match(/^how much do (.+) cost$/);
  const doMake = lower.match(/^how much (?:do|does) (.+) make$/);
  const whatIs = lower.match(/^what is (?:an? |the )?(.+)$/);
  if (doesCost) out = `What ${doesCost[1]} actually costs`;
  else if (doCost) out = `What ${doCost[1]} actually cost`;
  else if (doMake) out = `What ${doMake[1]} typically earn`;
  else if (whatIs) out = `What ${whatIs[1]} actually means`;
  else if (!titlesDiffer(s, out) && /^(how much|how to|what is|why do)\b/i.test(s)) {
    out = s.replace(/^(how much does|how much do|what is|how to)\s+/i, "").trim();
    if (out) out = `What ${out}`.replace(/\bcost$/i, "actually costs");
  }
  const polished = sentenceCaseTitle(out).slice(0, 70);
  return polished || sentenceCaseTitle(s).slice(0, 70);
}

function deciderSystemPrompt(config) {
  const custom = String(config?.deciderPrompt || "").trim();
  if (!custom || STALE_DECIDER_COPY.test(custom) || !/trendHook/i.test(custom)) return DEFAULT_DECIDER_PROMPT;
  return custom;
}

async function polishDeciderTitle({ config, seed, harvest }) {
  const result = await chatCompletion({
    provider: config.deciderProvider,
    model: config.deciderModel,
    system: `Rewrite this search phrase into a specific blog title.
Return ONLY JSON: {"topic":""}
Rules: 45–70 characters, sentence case, no trailing punctuation, no colon spam.
Keep the same subject. Do not copy the seed verbatim. No "complete guide" or "ultimate".`,
    user: JSON.stringify(
      {
        seed,
        brandName: harvest?.brief?.brandName,
        category: harvest?.brief?.category,
        audience: harvest?.brief?.audience,
      },
      null,
      2
    ),
    siteConfig: config,
    temperature: 0.5,
    maxTokens: 400,
    jsonMode: true,
  });
  const data = result?.json && typeof result.json === "object" ? result.json : {};
  return {
    topic: String(data.topic || "").trim(),
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
  };
}

export async function runDeciderAgent({ config, harvest, pack }) {
  const system = deciderSystemPrompt(config);
  const result = await chatCompletion({
    provider: config.deciderProvider,
    model: config.deciderModel,
    system,
    user: JSON.stringify(
      {
        source: pack.source || "library",
        prefer: "world-trends-then-overlap-then-library",
        brief: {
          brandName: harvest?.brief?.brandName,
          category: harvest?.brief?.category,
          audience: harvest?.brief?.audience,
          services: harvest?.brief?.services,
          publishedToAvoid: harvest?.brief?.publishedToAvoid,
        },
        candidates: pack.candidates,
        trendHooks: pack.trendHooks || [],
        instruction:
          "Pick candidateId in order: lane world if on-niche, else library×trend or gsc, else library. Optionally set trendHookId. Never copy candidate.query.",
      },
      null,
      2
    ),
    siteConfig: config,
    temperature: 0.45,
    maxTokens: 1200,
    jsonMode: true,
  });
  let inputTokens = result.inputTokens || 0;
  let outputTokens = result.outputTokens || 0;
  let costUsd = result.costUsd || 0;
  const data = result?.json && typeof result.json === "object" ? result.json : {};
  const all = pack.candidates || [];
  const pool = all;
  const hooks = pack.trendHooks || [];
  const byId = pool.find((c) => String(c.id) === String(data.candidateId || "").trim());
  const allowed = new Map(pool.map((c) => [normalizeTopicString(c.query), c]));
  const hit = byId || allowed.get(normalizeTopicString(data.topic)) || pool[0];
  if (!hit) {
    throw new Error("Topic Decider had no candidates from the closed list. Re-run Research, import keywords, or type a topic.");
  }
  const hook =
    hooks.find((h) => String(h.id) === String(data.trendHookId || "").trim()) ||
    (hit.trendHook ? hooks.find((h) => normalizeTopicString(h.query) === normalizeTopicString(hit.trendHook)) : null);
  let proposed = String(data.topic || "").trim();
  if (!isEnhancedTitle(hit.query, proposed)) {
    try {
      const polish = await polishDeciderTitle({ config, seed: hit.query, harvest });
      inputTokens += polish.inputTokens || 0;
      outputTokens += polish.outputTokens || 0;
      costUsd += polish.costUsd || 0;
      if (isEnhancedTitle(hit.query, polish.topic)) proposed = polish.topic;
    } catch {
      /* fall through to deterministic beautify */
    }
  }
  const topic = isEnhancedTitle(hit.query, proposed)
    ? sentenceCaseTitle(proposed).slice(0, 70)
    : beautifySeedTitle(hit.query);
  const whyBits = [String(data.why || "").trim(), hook?.query ? `World hook: ${hook.query}` : ""]
    .filter(Boolean)
    .join(" ");
  return {
    topic,
    seedQuery: hit.query,
    candidateId: hit.id,
    trendHook: hook?.query || hit.trendHook || null,
    why: whyBits,
    angle: String(data.angle || "").trim(),
    inputTokens,
    outputTokens,
    costUsd,
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
  const res = await fetchGoogleSerp(q, { gl, num: 10, skipDuckDuckGo: true });
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
    } catch {
      // CSE/SerpAPI/Brave can be down or restricted. Never fail the draft.
      return { duplicate: false, hit: null, webSkipped: true };
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

function headingFromSection(s) {
  if (!s || typeof s !== "object") return "";
  return String(s.heading_h2 || s.heading || s.h2 || s.title || "").trim();
}

function coerceSectionList(data) {
  if (!data || typeof data !== "object") return [];
  const raw = data.sections ?? data.outline ?? data.h2s ?? data.body_sections;
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function allowedKeywordSet(bind) {
  return new Set(
    [...asArray(bind?.headingKeywords), ...asArray(bind?.bodyKeywords)]
      .map((k) => normKeyword(k))
      .filter(Boolean)
  );
}

function subsetKeywords(list, allowed) {
  return asArray(list)
    .map((k) => String(k || "").trim())
    .filter((k) => k && (!allowed.size || allowed.has(normKeyword(k))));
}

function normalizeHeadingsJson(data, topic, bind) {
  const allowed = allowedKeywordSet(bind);
  const sections = coerceSectionList(data)
    .map((s) => {
      const heading = headingFromSection(s);
      if (!heading) return null;
      return {
        heading_h2: heading,
        heading_keywords: subsetKeywords(s.heading_keywords || s.keywords, allowed),
        body_keywords: subsetKeywords(s.body_keywords, allowed),
        key_points: asArray(s.key_points).map((p) => String(p || "").trim()).filter(Boolean),
        subsections: asArray(s.subsections).map((sub) => ({
          heading_h3: String(sub.heading_h3 || sub.heading || "").trim(),
          writing_instruction: String(sub.writing_instruction || sub.instruction || "").trim(),
        })),
      };
    })
    .filter(Boolean)
    .slice(0, 7)
    .map((s, i) => ({ ...s, section_id: `h2_${i + 1}` }));

  const faq = asArray(data?.faq)
    .map((q) => (typeof q === "string" ? { question: q } : { question: String(q?.question || "").trim() }))
    .filter((q) => q.question)
    .slice(0, 8);

  return {
    h1: String(data?.h1 || topic).trim() || sentenceCaseTitle(topic),
    sections,
    faq,
  };
}

function fallbackHeadingsJson({ topic, bind, harvest }) {
  const h1 = sentenceCaseTitle(topic);
  const heads = [...new Set(asArray(bind?.headingKeywords).filter(Boolean))];
  const body = asArray(bind?.bodyKeywords).filter(Boolean);
  const pool = [...heads];
  for (const k of body) {
    if (pool.length >= 6) break;
    if (!pool.some((p) => normKeyword(p) === normKeyword(k))) pool.push(k);
  }
  const editorial = [
    "What actually changes the number",
    "Where teams usually overspend",
    "What to budget for first",
    "How operators decide the next step",
    "The comparison that matters",
    "Mistakes that quietly inflate the bill",
  ];
  const used = new Set([normalizeTopicString(h1)]);
  const sections = [];
  for (const heading of editorial) {
    if (sections.length >= 5) break;
    if (used.has(normalizeTopicString(heading))) continue;
    used.add(normalizeTopicString(heading));
    const kw = pool[sections.length] || heads[0] || "";
    sections.push({
      section_id: `h2_${sections.length + 1}`,
      heading_h2: heading,
      heading_keywords: kw && heads.includes(kw) ? [kw] : [],
      body_keywords: kw && body.includes(kw) ? [kw] : [],
      key_points: kw
        ? [`Cover ${kw} with concrete numbers, ranges, or examples.`]
        : [`Stay on ${topic} with specifics, not filler.`],
      subsections: [
        {
          heading_h3: "",
          writing_instruction: kw
            ? `Use “${kw}” naturally in the body. Do not repeat the H1. Stay on ${topic}.`
            : `Stay on ${topic}.`,
        },
      ],
    });
  }
  const faq = asArray(harvest?.brief?.buyingQuestions)
    .map((q) => (typeof q === "string" ? { question: q } : { question: String(q?.question || q || "").trim() }))
    .filter((q) => q.question)
    .slice(0, 5);
  return { h1, sections, faq, repaired: true };
}

const STALE_HEADINGS_COPY = /At least half of H2s must include a heading_keywords term/i;

function headingsSystemPrompt(config) {
  const custom = String(config?.headingsPrompt || "").trim();
  if (!custom || STALE_HEADINGS_COPY.test(custom)) return DEFAULT_HEADINGS_PROMPT;
  return custom;
}

export async function runHeadingsAgent({ config, topic, bind, harvest, angle, feedback = "" }) {
  const system = headingsSystemPrompt(config);
  const payload = {
    topic,
    primary: bind.primary,
    heading_keywords: bind.headingKeywords,
    body_keywords: bind.bodyKeywords,
    buyingQuestions: harvest?.brief?.buyingQuestions,
    angle: angle?.recommended_angle,
    word_count_range: config.wordCountRange,
    ...(String(feedback || "").trim() ? { reviewer_feedback: String(feedback).trim() } : {}),
    requirement:
      "Return 4–7 sections with heading_h2. Empty sections is a failure. H2s must be distinct editorial headings — never stacked paraphrases of the topic or primary keyword.",
  };

  const call = async (extra = "") =>
    chatCompletion({
      provider: config.headingsProvider,
      model: config.headingsModel,
      system,
      user: JSON.stringify(extra ? { ...payload, retry: extra } : payload, null, 2),
      siteConfig: config,
      temperature: extra ? 0.2 : 0.35,
      maxTokens: 8000,
      jsonMode: true,
    });

  let result = await call();
  let inputTokens = result.inputTokens || 0;
  let outputTokens = result.outputTokens || 0;
  let costUsd = result.costUsd || 0;
  let json = normalizeHeadingsJson(result?.json, topic, bind);

  if (json.sections.length < 4) {
    try {
      const retry = await call(
        "Previous JSON had fewer than 4 H2s. Return 4–7 sections now, each with heading_h2."
      );
      inputTokens += retry.inputTokens || 0;
      outputTokens += retry.outputTokens || 0;
      costUsd += retry.costUsd || 0;
      const retried = normalizeHeadingsJson(retry?.json, topic, bind);
      if (retried.sections.length > json.sections.length) json = retried;
    } catch {
      /* keep first pass, then fallback */
    }
  }

  if (json.sections.length < 4) {
    json = fallbackHeadingsJson({ topic, bind, harvest });
  }

  if (!json.sections.length) {
    throw new Error("Headings returned an empty outline. Retry the draft.");
  }

  return {
    json,
    inputTokens,
    outputTokens,
    costUsd,
    provider: config.headingsProvider,
    model: config.headingsModel,
  };
}

export { collectTrendCandidates, collectDeciderPack };
