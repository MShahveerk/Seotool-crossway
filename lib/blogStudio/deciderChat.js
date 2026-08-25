/**
 * Compass briefing chat. Speaks as someone who already knows the website.
 * Never dumps keyword metrics. Search/trend failures never fail the chat.
 */
import { loadLatestResearchForSite } from "./researchRunner.js";
import { getSiteStudioConfig } from "./engine.js";
import { chatCompletion, hasProviderKey } from "./providers.js";
import { CHAT_PERSONA } from "./chatPersona.js";
import { classifyUserTurn, finalizeTurn, lastUserText } from "./deciderChatVoice.js";

export { fallbackGreeting } from "./deciderChatVoice.js";

const MAX_USER_TURNS_BEFORE_PROPOSAL = 6;
const BRIEF_TTL_MS = 12 * 60 * 1000;
const briefCache = new Map();

function domainFromSiteLink(siteLink) {
  const raw = String(siteLink || "").trim();
  if (!raw) return "";
  try {
    if (raw.startsWith("sc-domain:")) return raw.slice("sc-domain:".length);
    if (/^https?:\/\//i.test(raw)) return new URL(raw).hostname.replace(/^www\./i, "");
    if (raw.includes(".")) return raw.replace(/^www\./i, "").split("/")[0];
  } catch {
    /* fall through */
  }
  return raw;
}

function asList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") return String(item.name || item.phrase || item.question || "").trim();
      return "";
    })
    .filter(Boolean);
}

function opportunityLine(topic) {
  const name = String(topic?.name || "").trim();
  const why = String(topic?.why || "").trim();
  const primary = String(topic?.primary || "").trim();
  if (why) return why;
  if (name && primary && name.toLowerCase() !== primary.toLowerCase()) {
    return `${name} — people trying to ${primary.toLowerCase()}`;
  }
  return "";
}

function editorialOnly(text) {
  const s = String(text || "").trim();
  if (!s) return "";
  if (
    /favicon|orphan pages?|internal link(?:ing| map)?|pass(?:ing)? authority|crawl(?: errors?)?|broken links?|core web vitals|page ?speed|robots\.txt|xml sitemap|seo landers?/i.test(
      s
    )
  ) {
    return "";
  }
  return s.slice(0, 800);
}

function buildSiteMemory({ siteLink, harvest, config }) {
  const brief = harvest?.brief || {};
  const domain = domainFromSiteLink(siteLink);
  const brand = String(brief.brandName || "").trim() || domain || "this project";
  const opportunities = (harvest?.topics || [])
    .slice(0, 10)
    .map((t) => opportunityLine(t))
    .filter(Boolean);
  const seedBag = (harvest?.topics || [])
    .slice(0, 12)
    .flatMap((t) => [t.primary, ...(t.featured || []).slice(0, 3)])
    .map((s) => String(s || "").trim())
    .filter(Boolean);
  return {
    domain,
    brandName: brand,
    category: String(brief.category || "").trim(),
    audience: String(brief.audience || config?.targetAudience || "").trim(),
    geo: String(brief.geo || harvest?.market || config?.location || "").trim(),
    whatTheySell: asList(brief.services).slice(0, 8),
    differentiators: asList(brief.differentiators).slice(0, 6),
    rankingThemes: asList(brief.rankingThemes).slice(0, 6),
    buyingQuestions: asList(brief.buyingQuestions).slice(0, 6),
    alreadyCovered: asList(brief.publishedToAvoid).slice(0, 10),
    standingBrief: editorialOnly(config?.seedPrompt || ""),
    brandNotes: editorialOnly(config?.brandNotes || ""),
    opportunities,
    seedBag: [...new Set(seedBag)].slice(0, 24),
    hasResearch: Boolean(harvest),
  };
}

async function loadSiteMemory(siteLink) {
  const key = String(siteLink || "").trim();
  const hit = briefCache.get(key);
  if (hit && Date.now() - hit.at < BRIEF_TTL_MS) return hit.memory;

  const [config, harvest] = await Promise.all([getSiteStudioConfig(siteLink), loadLatestResearchForSite(siteLink)]);
  const memory = buildSiteMemory({ siteLink, harvest, config });
  memory._config = config;
  memory._harvest = harvest;
  briefCache.set(key, { at: Date.now(), memory });
  return memory;
}

function chatSystemPrompt(memory) {
  return `You are ${CHAT_PERSONA}, the in-studio editor sitting with the operator. You already know this website. You write articles. You are not a technical SEO auditor and you never call yourself Topic Decider.

VOICE
- Fun, sharp, slightly teasing — a good editor who did the homework.
- Talk about the next article: the reader, the angle, the title.
- BAN forever: favicon, orphan pages, internal link maps, passing authority, crawl issues, sitemaps, "in the room", "Tell me what this article should do", "What tone or angle", "research shows strong interest in", KD, harvest, seedQuery, quoting raw search phrases.
- Do not recap the website's fleet/service menu as if you just discovered it. Do not recommend technical SEO chores. This chat only decides what to write.

LENGTH
- Yes/go: 2–3 sentences. One question max.
- Topics: one-line intro, exactly 3 numbered titles, then "Say the number."

YOU ALREADY KNOW
- Brand: ${memory.brandName}
- Domain: ${memory.domain || "unknown"}
- What they are: ${memory.category || "see services"}
- Who it's for: ${memory.audience || "see notes"}
- Where: ${memory.geo || "not specified"}
- What they sell: ${(memory.whatTheySell || []).join("; ") || "see brief"}
- Why they win: ${(memory.differentiators || []).join("; ") || "not listed"}
- Standing operator brief: ${memory.standingBrief || memory.brandNotes || "none"}
- Already covered (do not repeat): ${(memory.alreadyCovered || []).slice(0, 8).join("; ") || "none listed"}
- Live opportunities, in English: ${(memory.opportunities || []).join(" | ") || "none yet"}

JOB
- "suggest topics" / what should we write: 3 editorial titles. ready:false.
- "yes" / "anything" / "fulfill keywords" / "ok" / "go": pick the strongest title, ready:true. Do not ask another scoping question.
- A number (1/2/3): lock that title, ready:true.
- If a draft already shipped and they want changes: intent=revise, revisionTarget text|image|both, remarks = the instruction.
- topic = clickable editorial title, sentence case, 45–70 chars. Never the raw keyword.
- seedQuery = one phrase from the closed seed bag. Never say it out loud.

Return ONLY one valid JSON object:
{
  "reply": "",
  "ready": false,
  "topic": null,
  "seedQuery": null,
  "angle": null,
  "why": null,
  "intent": "brief|revise|chat",
  "revisionTarget": "text|image|both|null",
  "remarks": null
}`;
}

function instructionForTurn({ memory, hasDraft, threadStatus, forceReady, classified }) {
  if (!memory.hasResearch) {
    return "No research pack yet. Tell them to run Research from the dock. Do not fake a title.";
  }
  if (hasDraft || threadStatus === "done" || threadStatus === "revising") {
    return "A draft from this chat already exists. If they want changes, intent=revise with remarks and revisionTarget. If they want a brand-new article, brief a new title instead.";
  }
  if (classified.kind === "topic-ask") {
    return "They asked for topics. Pitch exactly 3 editorial titles in a numbered list. ready:false. Ask them to pick a number.";
  }
  if (classified.kind === "go-ahead" || classified.kind === "pick" || forceReady) {
    return "They said go. Lock one editorial title. ready:true. Do not ask another scoping question.";
  }
  return "Stay in character. If they want topics, pitch three. If they are ready, lock a title with ready:true.";
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && (m.role === "assistant" || m.role === "user") && String(m.content || "").trim())
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "").trim(),
    }))
    .slice(-20);
}

export async function runDeciderChatTurn({
  siteLink,
  messages = [],
  greeting = false,
  threadStatus = "briefing",
  hasDraft = false,
} = {}) {
  const memory = await loadSiteMemory(siteLink);
  const config = memory._config;
  const grounding = {
    hasHarvest: memory.hasResearch,
    brandName: memory.brandName,
    domain: memory.domain,
    category: memory.category,
  };

  if (greeting) {
    return {
      ...finalizeTurn({}, { memory, greeting: true }),
      persona: CHAT_PERSONA,
      grounding,
    };
  }

  if (!hasProviderKey(config.deciderProvider, config)) {
    const err = new Error(
      `${CHAT_PERSONA} has no API key. Open Setup → Agents, paste a key for the Decider provider, and Save.`
    );
    err.status = 400;
    err.code = "NO_DECIDER";
    throw err;
  }

  const history = sanitizeMessages(messages);
  const userTurns = history.filter((m) => m.role === "user").length;
  const lastUser = lastUserText(history);
  const classified = classifyUserTurn(lastUser);
  const forceReady =
    userTurns >= MAX_USER_TURNS_BEFORE_PROPOSAL || classified.kind === "go-ahead" || classified.kind === "pick";
  const publicMemory = { ...memory };
  delete publicMemory._config;
  delete publicMemory._harvest;
  delete publicMemory.seedBag;

  const turnOpts = { memory, greeting: false, lastUser, forceReady };
  let turn;
  try {
    const result = await chatCompletion({
      provider: config.deciderProvider,
      model: config.deciderModel,
      system: chatSystemPrompt(memory),
      user: JSON.stringify(
        {
          you_already_read_this: publicMemory,
          conversation: history,
          instruction: instructionForTurn({
            memory,
            hasDraft,
            threadStatus,
            forceReady,
            classified,
          }),
        },
        null,
        2
      ),
      siteConfig: config,
      temperature: classified.kind === "topic-ask" ? 0.75 : 0.6,
      maxTokens: 1100,
      jsonMode: true,
    });
    turn = finalizeTurn(result?.json, turnOpts);
    turn.usage = {
      inputTokens: result.inputTokens || 0,
      outputTokens: result.outputTokens || 0,
      costUsd: result.costUsd || 0,
    };
  } catch {
    turn = finalizeTurn({ reply: "", ready: false }, turnOpts);
  }

  return {
    ...turn,
    persona: CHAT_PERSONA,
    grounding,
  };
}
