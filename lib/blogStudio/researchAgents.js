import { chatCompletion } from "./providers.js";
import {
  DEFAULT_RESEARCHER_PROMPT,
  DEFAULT_SCOUT_PROMPT,
} from "./researchDefaults.js";
import { normKeyword } from "../seranking/keywordMetrics.js";

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function slugId(name, fallback) {
  const s = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return s || fallback;
}

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

export async function runResearcherAgent({ config, pack }) {
  const system = config.researcherPrompt || DEFAULT_RESEARCHER_PROMPT;
  const result = await chatCompletion({
    provider: config.researcherProvider,
    model: config.researcherModel,
    system,
    user: `Research this website and produce the site brief JSON.\n\n${pack}`,
    siteConfig: config,
    temperature: 0.3,
    maxTokens: 4000,
    jsonMode: true,
  });
  const data = result?.json && typeof result.json === "object" ? result.json : {};
  const seeds = asArray(data.seeds)
    .map((s) => {
      if (typeof s === "string") return { phrase: s.trim(), kind: "service" };
      return {
        phrase: String(s?.phrase || s?.keyword || "").trim(),
        kind: String(s?.kind || "service").trim() || "service",
      };
    })
    .filter((s) => s.phrase);
  const brief = {
    brandName: String(data.brandName || "").trim(),
    category: String(data.category || "").trim(),
    geo: String(data.geo || "").trim(),
    audience: String(data.audience || "").trim(),
    services: asArray(data.services)
      .map((s) =>
        typeof s === "string"
          ? { name: s, page: "", notes: "" }
          : {
              name: String(s?.name || "").trim(),
              page: String(s?.page || "").trim(),
              notes: String(s?.notes || "").trim(),
            }
      )
      .filter((s) => s.name),
    buyingQuestions: asArray(data.buyingQuestions).map((q) => String(q).trim()).filter(Boolean),
    differentiators: asArray(data.differentiators).map((q) => String(q).trim()).filter(Boolean),
    rankingThemes: asArray(data.rankingThemes).map((q) => String(q).trim()).filter(Boolean),
    publishedToAvoid: asArray(data.publishedToAvoid).map((q) => String(q).trim()).filter(Boolean),
    competitors: asArray(data.competitors).map((q) => String(q).trim()).filter(Boolean),
    notes: String(data.notes || "").trim(),
    seeds,
  };
  return {
    brief,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
    provider: config.researcherProvider,
    model: config.researcherModel,
  };
}

function postureFor(row) {
  const pos = row.position;
  const isQuestion =
    (row.researchTypes || []).includes("questions") || /\b(how|what|why|when|where|can|should|is)\b/i.test(row.keyword);
  if (isQuestion && (pos == null || pos > 10)) return "ask";
  if (pos != null && pos <= 10) return "defend";
  if (pos != null && pos <= 20) return "strike";
  return "gap";
}

function pickPrimary(members) {
  const ranked = [...members].sort((a, b) => {
    const av = Number(a.volume) || 0;
    const bv = Number(b.volume) || 0;
    const ad = a.difficulty == null ? 99 : Number(a.difficulty);
    const bd = b.difficulty == null ? 99 : Number(b.difficulty);
    return bv - av || ad - bd;
  });
  return ranked[0] || null;
}

function pickFeatured(members, primaryKey, n = 8) {
  return [...members]
    .filter((m) => m.key !== primaryKey)
    .sort((a, b) => {
      const ad = a.difficulty == null ? 99 : Number(a.difficulty);
      const bd = b.difficulty == null ? 99 : Number(b.difficulty);
      const av = Number(a.volume) || 0;
      const bv = Number(b.volume) || 0;
      return ad - bd || bv - av;
    })
    .slice(0, n);
}

/**
 * Assign the full universe into topics. The LLM labels a subset; leftover rows
 * fall to the nearest seed/topic by token overlap so bags stay fat.
 */
export function assembleTopics({ brief, llmTopics, universe }) {
  const byKey = new Map(universe.map((r) => [r.key, { ...r, posture: postureFor(r) }]));
  const assigned = new Set();
  const topics = [];

  for (const raw of asArray(llmTopics)) {
    const name = String(raw?.name || "").trim();
    if (!name) continue;
    const memberKeys = [...asArray(raw.members), ...asArray(raw.featured), raw.primary]
      .map((k) => normKeyword(k))
      .filter((k) => byKey.has(k) && !assigned.has(k));
    const members = memberKeys.map((k) => {
      assigned.add(k);
      return byKey.get(k);
    });
    if (!members.length) continue;
    const id = slugId(raw.id || name, `topic-${topics.length + 1}`);
    const primaryKey = normKeyword(raw.primary) || pickPrimary(members)?.key;
    topics.push({
      id,
      name,
      type: String(raw.type || "service").trim() || "service",
      why: String(raw.why || "").trim(),
      contentType: String(raw.contentType || "").trim(),
      primary: primaryKey && byKey.has(primaryKey) ? byKey.get(primaryKey).keyword : members[0].keyword,
      featured: [],
      keywords: members,
      tokenSet: tokens(`${name} ${(brief.seeds || []).map((s) => s.phrase).join(" ")} ${memberKeys.join(" ")}`),
    });
  }

  // Leftovers: nearest topic, or a new topic per originating seed, else "Other".
  const leftovers = universe.filter((r) => !assigned.has(r.key)).map((r) => byKey.get(r.key));
  for (const row of leftovers) {
    const rowTok = tokens(row.keyword);
    let best = null;
    let bestScore = 0.12;
    for (const topic of topics) {
      const score = jaccard(rowTok, topic.tokenSet);
      if (score > bestScore) {
        bestScore = score;
        best = topic;
      }
    }
    if (best) {
      best.keywords.push(row);
      assigned.add(row.key);
    }
  }

  const still = universe.filter((r) => !assigned.has(r.key)).map((r) => byKey.get(r.key));
  if (still.length) {
    const seedBuckets = new Map();
    for (const row of still) {
      const seed = (row.seeds || [])[0] || "other";
      if (!seedBuckets.has(seed)) seedBuckets.set(seed, []);
      seedBuckets.get(seed).push(row);
    }
    for (const [seed, rows] of seedBuckets) {
      const name = seed === "other" ? "Other relevant terms" : seed;
      const id = slugId(name, `other-${topics.length + 1}`);
      topics.push({
        id,
        name,
        type: seed === "other" ? "informational" : "service",
        why: seed === "other" ? "Terms that did not cluster cleanly with a service line." : `Expanded from seed “${seed}”.`,
        contentType: "",
        primary: pickPrimary(rows)?.keyword || rows[0].keyword,
        featured: [],
        keywords: rows,
      });
    }
  }

  return topics.map((t) => {
    const members = t.keywords.sort((a, b) => {
      const ad = a.difficulty == null ? 99 : Number(a.difficulty);
      const bd = b.difficulty == null ? 99 : Number(b.difficulty);
      return ad - bd || (Number(b.volume) || 0) - (Number(a.volume) || 0);
    });
    const primaryRow = members.find((m) => normKeyword(m.keyword) === normKeyword(t.primary)) || pickPrimary(members);
    const featured = pickFeatured(members, primaryRow?.key, 8).map((m) => m.keyword);
    return {
      id: t.id,
      name: t.name,
      type: t.type,
      why: t.why,
      contentType: t.contentType,
      primary: primaryRow?.keyword || members[0]?.keyword || "",
      featured,
      keywordCount: members.length,
      easiestKd: members.find((m) => m.difficulty != null)?.difficulty ?? null,
      keywords: members,
    };
  });
}

export async function runScoutAgent({ config, brief, compactKeywords }) {
  const system = config.scoutPrompt || DEFAULT_SCOUT_PROMPT;
  const result = await chatCompletion({
    provider: config.scoutProvider,
    model: config.scoutModel,
    system,
    user: JSON.stringify(
      {
        brief: {
          brandName: brief.brandName,
          category: brief.category,
          geo: brief.geo,
          audience: brief.audience,
          services: brief.services,
          seeds: brief.seeds,
          buyingQuestions: brief.buyingQuestions,
        },
        keywords: compactKeywords,
      },
      null,
      2
    ),
    siteConfig: config,
    temperature: 0.2,
    maxTokens: 8000,
    jsonMode: true,
  });
  const data = result?.json && typeof result.json === "object" ? result.json : {};
  return {
    topics: asArray(data.topics),
    discarded: asArray(data.discarded),
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
    provider: config.scoutProvider,
    model: config.scoutModel,
  };
}
