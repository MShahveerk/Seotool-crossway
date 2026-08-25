/**
 * Composer briefing chat with the Topic Decider.
 * Grounded in the latest keyword harvest plus in-domain trends/news.
 * Search failures never fail the chat — they just omit live SERP context.
 */
import { loadLatestResearchForSite } from "./researchRunner.js";
import { getSiteStudioConfig } from "./engine.js";
import { chatCompletion, hasProviderKey } from "./providers.js";
import { beautifySeedTitle } from "./prefixAgents.js";
import { DEFAULT_DECIDER_PROMPT } from "./prefixDefaults.js";
import { collectTrendCandidates } from "../googleTrends.js";
import { isSerpApiReady, resolveBraveSearchKey, resolveGoogleCseCredentials } from "../dataSources.js";
import { fetchGoogleSerp, isSerpApiQuotaExhausted } from "../serpapi.js";

const MAX_USER_TURNS_BEFORE_PROPOSAL = 6;

function compactHarvest(harvest) {
  if (!harvest) return null;
  const brief = harvest.brief || {};
  const topics = (harvest.topics || []).slice(0, 14).map((t) => ({
    name: t.name,
    primary: t.primary,
    featured: (t.featured || []).slice(0, 6),
    easiestKd: t.easiestKd ?? null,
    keywordCount: t.keywordCount ?? (t.keywords || []).length,
  }));
  return {
    brandName: brief.brandName || "",
    category: brief.category || "",
    audience: brief.audience || "",
    geo: brief.geo || harvest.market || "",
    services: (brief.services || []).slice(0, 10).map((s) => (typeof s === "string" ? s : s.name || "")).filter(Boolean),
    buyingQuestions: (brief.buyingQuestions || []).slice(0, 8).map((q) => (typeof q === "string" ? q : q.question || "")).filter(Boolean),
    publishedToAvoid: (brief.publishedToAvoid || []).slice(0, 14),
    topics,
  };
}

function titlesMatch(a, b) {
  const na = String(a || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const nb = String(b || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return Boolean(na) && na === nb;
}

async function collectTrendHints(harvest) {
  if (!harvest) return { geo: null, trends: [], error: null };
  try {
    if (!(await isSerpApiReady()) || isSerpApiQuotaExhausted()) {
      return { geo: null, trends: [], error: null };
    }
    const pack = await collectTrendCandidates(harvest, {
      market: harvest.market,
      related: false,
    });
    return {
      geo: pack.geo || null,
      trends: (pack.candidates || []).slice(0, 12).map((c) => ({
        query: c.query,
        source: c.source,
        score: c.score,
      })),
      error: null,
    };
  } catch (err) {
    return { geo: null, trends: [], error: err.message };
  }
}

async function collectNewsHints(harvest) {
  try {
    const cse = await resolveGoogleCseCredentials();
    const brave = await resolveBraveSearchKey();
    const serpOk = (await isSerpApiReady()) && !isSerpApiQuotaExhausted();
    if (!cse && !brave && !serpOk) return [];
    const bits = [harvest?.brief?.category, harvest?.brief?.brandName].map((s) => String(s || "").trim()).filter(Boolean);
    if (!bits.length) return [];
    const q = `${bits.join(" ")} news`;
    const res = await fetchGoogleSerp(q, { num: 5, skipDuckDuckGo: true });
    return (res.organic || []).slice(0, 5).map((row) => ({
      title: row.title || "",
      snippet: row.snippet || "",
      link: row.link || "",
    }));
  } catch {
    return [];
  }
}

function chatSystemPrompt(config) {
  const custom = String(config?.deciderPrompt || "").trim();
  const operator = custom && custom !== DEFAULT_DECIDER_PROMPT ? `\nOperator notes:\n${custom.slice(0, 2500)}\n` : "";
  return `You are the Topic Decider for Crossway Blog Automation Studio, talking to the operator in a short briefing chat.

You already have this project's keyword research (the Researcher harvest) and any in-domain trends/news we could fetch. Use them. Do not invent a different niche.

Your job in chat:
- 2–4 short turns. Learn what they want (audience, angle, urgency, what to avoid).
- Then propose ONE editorial article idea. Not a keyword dump.
- topic is a title a practitioner would click: sentence case, 45–70 characters, specific, on-niche.
- Copying a harvest primary / featured keyword / trend query verbatim as the title is a failure. Rewrite it. Keep the seed's core meaning.
- seedQuery MUST be one phrase from the harvest (a topic primary, featured term, or a close harvest keyword) so the Keyword Binder can attach a real bag. Never invent seedQuery.
- When you are ready, set ready:true. Until then ready:false and leave topic/seedQuery null unless you are proposing.

Return ONLY one valid JSON object:
{
  "reply": "",
  "ready": false,
  "topic": null,
  "seedQuery": null,
  "angle": null,
  "why": null
}

reply is 2–5 sentences, conversational, no markdown headings. Mention a harvest insight or a live trend when it helps. Ask at most one question per turn.
${operator}`;
}

function normalizeTurn(raw, { harvest, forceReady }) {
  const data = raw && typeof raw === "object" ? raw : {};
  let topic = String(data.topic || "").trim() || null;
  let seedQuery = String(data.seedQuery || data.seed_query || "").trim() || null;
  let ready = Boolean(data.ready) && Boolean(topic);
  if (forceReady && !ready) {
    const fallbackSeed =
      seedQuery ||
      harvest?.topics?.[0]?.primary ||
      harvest?.topics?.[0]?.name ||
      null;
    seedQuery = fallbackSeed;
    topic = topic || (fallbackSeed ? beautifySeedTitle(fallbackSeed) : "A sharper take on this week's demand");
    ready = Boolean(topic);
  }
  if (ready && topic && seedQuery && titlesMatch(topic, seedQuery)) {
    const lifted = beautifySeedTitle(seedQuery);
    if (lifted && !titlesMatch(lifted, seedQuery)) topic = lifted;
  }
  if (topic) topic = topic.replace(/[.?!]+$/g, "").slice(0, 78);
  return {
    reply: String(data.reply || "").trim() || (ready ? `Let's go with “${topic}”.` : "Tell me what this article should do."),
    ready,
    topic: ready ? topic : null,
    seedQuery: ready ? seedQuery : null,
    angle: ready ? String(data.angle || "").trim() || null : null,
    why: ready ? String(data.why || "").trim() || null : null,
  };
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((m) => ({
      role: m?.role === "assistant" ? "assistant" : "user",
      content: String(m?.content || "").trim(),
    }))
    .filter((m) => m.content)
    .slice(-16);
}

export async function runDeciderChatTurn({ siteLink, messages = [] }) {
  const config = await getSiteStudioConfig(siteLink);
  if (!hasProviderKey(config.deciderProvider, config)) {
    const err = new Error(
      "Topic Decider has no API key. Open Setup → Agents, paste a key for the Decider provider, and Save."
    );
    err.status = 400;
    err.code = "NO_DECIDER";
    throw err;
  }

  const harvest = await loadLatestResearchForSite(siteLink);
  const compact = compactHarvest(harvest);
  const [trends, news] = await Promise.all([collectTrendHints(harvest), collectNewsHints(harvest)]);
  const history = sanitizeMessages(messages);
  const userTurns = history.filter((m) => m.role === "user").length;
  const forceReady = userTurns >= MAX_USER_TURNS_BEFORE_PROPOSAL;

  const grounding = {
    project: compact,
    trends: trends.trends,
    trendGeo: trends.geo,
    news,
    instruction: !compact
      ? "There is no keyword harvest yet. Tell them to open Research (bottom dock) and run it before you propose a title. Do not set ready:true."
      : history.length
        ? forceReady
          ? "The operator has talked enough. Set ready:true now with your best editorial title and a harvest seedQuery."
          : "Continue the briefing. If you already know the article, set ready:true. Otherwise ask one sharp question."
        : "The operator just opened Blog Studio. Greet them in 2–3 sentences. Name the brand/category if you have it. Mention one harvest or trend insight. Ask what they want this article to do. Do not set ready:true yet unless they already sent a clear brief.",
  };

  const result = await chatCompletion({
    provider: config.deciderProvider,
    model: config.deciderModel,
    system: chatSystemPrompt(config),
    user: JSON.stringify(
      {
        grounding,
        conversation: history,
      },
      null,
      2
    ),
    siteConfig: config,
    temperature: history.length ? 0.55 : 0.6,
    maxTokens: 900,
    jsonMode: true,
  });

  const turn = normalizeTurn(result?.json, { harvest, forceReady });
  return {
    ...turn,
    usage: {
      inputTokens: result.inputTokens || 0,
      outputTokens: result.outputTokens || 0,
      costUsd: result.costUsd || 0,
    },
    grounding: {
      hasHarvest: Boolean(compact),
      brandName: compact?.brandName || "",
      category: compact?.category || "",
      topicCount: compact?.topics?.length || 0,
      trendCount: trends.trends.length,
      newsCount: news.length,
    },
  };
}
