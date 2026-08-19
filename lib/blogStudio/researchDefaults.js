/** Depth presets and default prompts for Blog Studio keyword research. */

export const RESEARCH_TRIGGER = "research";
export const RESEARCH_KIND = "keyword_research";

export const RESEARCH_MARKETS = [
  { id: "us", label: "United States" },
  { id: "uk", label: "United Kingdom" },
  { id: "ca", label: "Canada" },
  { id: "au", label: "Australia" },
  { id: "pk", label: "Pakistan" },
];

/** Per-row SE Ranking credit for /keywords/{similar|related|questions|longtail}. */
export const RESEARCH_ROW_CREDITS = 10;
export const DOMAIN_KEYWORDS_CREDITS = 100;

export const RESEARCH_DEPTH = {
  deep: {
    id: "deep",
    label: "Deep",
    maxSeeds: 12,
    similarLimit: 50,
    relatedLimit: 50,
    questionsLimit: 50,
    longtailLimit: 50,
    longtailSeedCap: 6,
    questionsSeedCap: 12,
    rivalCap: 3,
    concurrency: 3,
  },
  standard: {
    id: "standard",
    label: "Standard",
    maxSeeds: 5,
    similarLimit: 25,
    relatedLimit: 0,
    questionsLimit: 25,
    longtailLimit: 0,
    longtailSeedCap: 0,
    questionsSeedCap: 2,
    rivalCap: 0,
    concurrency: 3,
  },
};

export function depthConfig(id) {
  return RESEARCH_DEPTH[String(id || "").toLowerCase()] || RESEARCH_DEPTH.deep;
}

/** Honest cold-cache estimate shown on the Research button. */
export function estimateResearchCredits(depthId, seedCount = null) {
  const d = depthConfig(depthId);
  const seeds = seedCount != null ? seedCount : d.maxSeeds;
  const similar = seeds * d.similarLimit * RESEARCH_ROW_CREDITS;
  const related = seeds * d.relatedLimit * RESEARCH_ROW_CREDITS;
  const questions = Math.min(seeds, d.questionsSeedCap) * d.questionsLimit * RESEARCH_ROW_CREDITS;
  const longtail = Math.min(seeds, d.longtailSeedCap) * d.longtailLimit * RESEARCH_ROW_CREDITS;
  const own = DOMAIN_KEYWORDS_CREDITS;
  const rivals = d.rivalCap * DOMAIN_KEYWORDS_CREDITS;
  const competitorsList = d.rivalCap > 0 ? DOMAIN_KEYWORDS_CREDITS : 0;
  return own + competitorsList + rivals + similar + related + questions + longtail;
}

export const DEFAULT_RESEARCHER_PROMPT = `You are the Site Researcher for Crossway Blog Automation Studio.

You receive a pack of REAL evidence about one website: scraped pages, Search Console, SE Ranking overview/audit, published posts, and competitor domains. Infer a thorough site brief for keyword research.

Return ONLY one valid JSON object:
{
  "brandName": "",
  "category": "",
  "geo": "",
  "audience": "",
  "services": [{"name": "", "page": "", "notes": ""}],
  "buyingQuestions": [],
  "differentiators": [],
  "rankingThemes": [],
  "publishedToAvoid": [],
  "competitors": [],
  "notes": "",
  "seeds": [{"phrase": "", "kind": "service|informational|comparison|local|branded"}]
}

Rules:
- Use ONLY the supplied evidence. Do not invent awards, clients, stats, or services that do not appear.
- services: every distinct offering you can name from pages, nav, schema, or GSC landing pages. 4–12 items.
- seeds: 8–12 search phrases Agent 2 will expand in SE Ranking. Cover every service, 2–3 informational/buying-question seeds, 1–2 comparison seeds if the niche uses them, and geo+service seeds when geo is real. Phrases must be things a human would type into Google — not brand slogans.
- competitors: only domains present in the pack.
- publishedToAvoid: titles/slugs already shipped so we do not recommend a duplicate cluster.
- Keep strings short. buyingQuestions max 8. differentiators max 6.`;

export const DEFAULT_SCOUT_PROMPT = `You are the Keyword Scout for Crossway Blog Automation Studio.

You receive (1) the Site Researcher brief and (2) a compact list of REAL keywords already fetched from SE Ranking. You do not invent keywords.

Return ONLY one valid JSON object:
{
  "topics": [
    {
      "id": "slug-id",
      "name": "",
      "type": "service|local|informational|comparison|branded",
      "why": "",
      "contentType": "service page|guide|faq|comparison|hub",
      "primary": "",
      "featured": [],
      "members": []
    }
  ],
  "discarded": [{"keyword": "", "reason": ""}]
}

Rules:
- 12–20 topics. Each topic is a selector key for a later content calendar — not a short article outline.
- members: assign as many supplied keywords as honestly belong. Do not trim to a handful. A service topic should keep commercial variants, questions, long-tails, and local modifiers.
- primary must be one of members. featured is 6–10 of the most useful members (prefer lower difficulty with real volume).
- type: service maps to an offering; local only if geo is real; informational for guides/questions; comparison for vs/alternative/best; branded for own-name queries.
- discarded: off-niche noise only, with a reason. When unsure, keep the keyword in a topic.
- Every member string MUST appear in the supplied keyword list. Never invent terms.
- A keyword belongs to one primary topic. Do not duplicate the same string across topics.`;
