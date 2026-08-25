/**
 * Pure Compass voice — no provider, no Prisma.
 * Mid-conversation must never fall back to a greeting or a blank brief prompt.
 */

const BANNED_BRIEF = /tell me what this article should do/i;
const HARVEST_LEADS =
  /research shows strong interest in|i see strong (?:local )?intent|local queries like|ranks for\s+["“]|what tone or angle should the article take|ready to help with/i;
const AUDIT_SPEAK =
  /favicon|orphan pages?|internal link(?:ing| map)?|pass(?:ing)? authority|crawl(?: errors?)?|broken links?|missing (?:meta |title|alt|favicon)|core web vitals|page ?speed|robots\.txt|xml sitemap|seo landers?|in the room/i;

export function lastUserText(messages) {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") return String(messages[i].content || "").trim();
  }
  return "";
}

export function sentenceCaseTitle(value) {
  const s = String(value || "")
    .replace(/[.?!]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function editorialTitleFromSeed(seed) {
  const raw = String(seed || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (/\bnear me\b/.test(lower)) {
    const core = lower.replace(/\bnear me\b/g, "").replace(/\s+/g, " ").trim();
    return sentenceCaseTitle(`How to book ${core || "a charter"} without the local-search runaround`).slice(0, 70);
  }
  if (/^(how much (?:does|do|is)|what does .* cost)/.test(lower)) {
    const core = lower
      .replace(/^how much (?:does|do|is)\s+/i, "")
      .replace(/^what does\s+/i, "")
      .replace(/\bcost\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return sentenceCaseTitle(`What ${core || raw} actually costs`).slice(0, 70);
  }
  if (/^(charter|book|hire|rent|fly)\b/.test(lower)) {
    return sentenceCaseTitle(`When it actually pays to ${lower}`).slice(0, 70);
  }
  if (/^(what is|what's)\b/.test(lower)) {
    const core = lower.replace(/^(what is|what's)\s+(an? |the )?/i, "").trim();
    return sentenceCaseTitle(`What ${core} actually means`).slice(0, 70);
  }
  return sentenceCaseTitle(raw).slice(0, 70);
}

function isJunkTitle(title) {
  const t = String(title || "").trim();
  if (!t) return true;
  if (t.length < 8) return true;
  if (AUDIT_SPEAK.test(t) || BANNED_BRIEF.test(t) || HARVEST_LEADS.test(t)) return true;
  if (/expanded from seed|did not cluster|featured terms?|keyword (?:cluster|bag|library)|seed query|people trying to/i.test(t)) {
    return true;
  }
  return false;
}

export function titleFromUserIdea(text, memory) {
  const raw = String(text || "")
    .replace(/[.?!]+$/g, "")
    .replace(/^(let'?s |please |maybe |how about |what about |write about |write |do )/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw || raw.length < 3) return "";
  let title = sentenceCaseTitle(raw).slice(0, 70);
  const category = String(memory?.category || memory?.whatTheySell?.[0] || "").trim();
  const catBit = category.split(/[,/]/)[0].trim();
  if (catBit && title.length < 48 && !title.toLowerCase().includes(catBit.toLowerCase().slice(0, 10))) {
    title = sentenceCaseTitle(`${raw} for ${catBit}`).slice(0, 70);
  }
  return title;
}

function uniqueTitles(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const title = sentenceCaseTitle(row?.title || "").slice(0, 70);
    if (!title || isJunkTitle(title)) continue;
    const key = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ title, seed: row.seed || null, blurb: String(row.blurb || "").trim() });
  }
  return out;
}

export function editorialPitches(memory, limit = 3) {
  const brand = memory?.brandName || "this site";
  const fromWhy = (memory?.opportunities || [])
    .map((why) => {
      const text = String(why || "").trim();
      if (!text || isJunkTitle(text)) return null;
      const seedHit = (memory?.seedBag || []).find((s) => s.toLowerCase() === text.toLowerCase());
      const looksLikeQuery =
        Boolean(seedHit) ||
        /\bnear me\b/i.test(text) ||
        /^(how much|how to|what is|charter|book|hire|rent)\b/i.test(text);
      const title = looksLikeQuery
        ? editorialTitleFromSeed(seedHit || text)
        : sentenceCaseTitle(text.replace(/^people trying to /i, "")).slice(0, 70);
      return { title, seed: seedHit || memory?.seedBag?.[0] || null, blurb: "" };
    })
    .filter(Boolean);

  const fromSeeds = (memory?.seedBag || []).map((seed) => ({
    title: editorialTitleFromSeed(seed),
    seed,
    blurb: "",
  }));

  const extras = [
    memory?.buyingQuestions?.[0]
      ? { title: sentenceCaseTitle(String(memory.buyingQuestions[0]).replace(/\?+$/, "")).slice(0, 70), seed: memory.seedBag?.[0] || null }
      : null,
    memory?.whatTheySell?.[0]
      ? {
          title: sentenceCaseTitle(`What to know before you book ${String(memory.whatTheySell[0]).toLowerCase()}`).slice(0, 70),
          seed: memory.seedBag?.[0] || null,
        }
      : null,
    {
      title: sentenceCaseTitle(`How ${brand} clients should think about the decision, not the brochure`).slice(0, 70),
      seed: memory.seedBag?.[0] || null,
    },
  ].filter(Boolean);

  return uniqueTitles([...fromWhy, ...fromSeeds, ...extras]).slice(0, limit);
}

export function classifyUserTurn(text) {
  const t = String(text || "").trim();
  const lower = t.toLowerCase();
  if (!lower) return { kind: "chat", pickIndex: null };

  if (
    /\b(change|revise|rewrite|redo|shorter|longer|intro|headline|image|thumbnail|photo|picture|hero)\b/.test(lower) &&
    /\b(please|can you|make|fix|too|don't like|not the|wrong)\b/.test(lower)
  ) {
    return { kind: "revise", pickIndex: null };
  }

  const numbered = lower.match(/^\s*(?:go with |pick |the )?#?\s*([123]|one|two|three|first|second|third)\b/);
  if (numbered) {
    const token = numbered[1];
    const pickIndex = ["1", "one", "first"].includes(token) ? 0 : ["2", "two", "second"].includes(token) ? 1 : 2;
    return { kind: "pick", pickIndex };
  }

  if (
    /\b(suggest|brainstorm|ideas?|topics?|pitches?|options?)\b/.test(lower) ||
    /what should we (write|publish|cover)/.test(lower) ||
    /what (to|should we) write about/.test(lower) ||
    /give me (a )?(few |some )?(ideas|topics)/.test(lower)
  ) {
    return { kind: "topic-ask", pickIndex: null };
  }

  if (
    /^(yes|yeah|yep|yup|sure|ok|okay|k|go|go ahead|do it|proceed|start|write it|lock it|ship it|let'?s go|lfg|whatever|anything|idk|idc|you pick|your call|just pick|just write|rank( it)?|seo( it)?|fulfill keywords|keywords|that one|sounds good|perfect|love it|love that|like that|i like that|i like it|i like this|that's it|thats it|that works|good|nice|cool|do that)[.!?]*$/i.test(
      t
    ) ||
    /\b(fulfill keywords|just pick|you (decide|choose|pick)|anything is fine|i don't (mind|care)|i like that|i like it)\b/.test(lower)
  ) {
    return { kind: "go-ahead", pickIndex: null };
  }

  if (t.split(/\s+/).filter(Boolean).length >= 2) {
    return { kind: "steer", pickIndex: null };
  }

  return { kind: "chat", pickIndex: null };
}

export function fallbackGreeting(memory) {
  const brand = memory?.brandName || memory?.domain || "this site";
  const pitches = editorialPitches(memory, 1);
  if (!memory?.hasResearch) {
    return `Research for ${brand} is empty. Run it from the dock once — then I’ll pitch the article.`;
  }
  if (!pitches[0]?.title) {
    return `I’ve got a point of view for ${brand}. Tell me the cut you want, or say suggest topics.`;
  }
  return `I’d write “${pitches[0].title}” first — a buyer piece, not another service page. Want that, or a different cut?`;
}

export function fallbackPitches(memory) {
  const brand = memory?.brandName || "this site";
  const pitches = editorialPitches(memory, 3);
  if (!pitches.length) {
    return {
      reply: `I need the research pack before I pitch titles for ${brand}. Hit Research in the dock, then ask me again.`,
      pitches: [],
    };
  }
  const lines = pitches.map((p, i) => `${i + 1}. ${p.title}`).join("\n");
  return {
    reply: `Three I'd actually publish for ${brand}:\n\n${lines}\n\nSay the number — or tell me the cut I'm missing.`,
    pitches,
  };
}

export function fallbackLock(memory, pickIndex = 0, preferredTitle = "") {
  const preferred = sentenceCaseTitle(preferredTitle || "").slice(0, 78);
  const pitches = editorialPitches(memory, 3);
  const chosen = !isJunkTitle(preferred)
    ? { title: preferred, seed: pickSeed(memory, preferred) || memory?.seedBag?.[0] || null, blurb: "" }
    : pitches[pickIndex] || pitches[0];
  if (!chosen || isJunkTitle(chosen.title)) {
    return {
      reply: fallbackGreeting(memory),
      ready: false,
      topic: null,
      seedQuery: null,
      angle: null,
      why: null,
    };
  }
  return {
    reply: `Then we're writing “${chosen.title}”. Specific, useful, not a service-page clone. I'll start in a few seconds — say wait if you want a different cut.`,
    ready: true,
    topic: chosen.title,
    seedQuery: chosen.seed || memory?.seedBag?.[0] || null,
    angle: chosen.blurb || `A practical buyer-side piece for ${memory?.brandName || "this site"}.`,
    why: `Best next article for ${memory?.brandName || "this site"}.`,
  };
}

function lastSteerIdea(history, memory) {
  if (!Array.isArray(history)) return "";
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]?.role !== "user") continue;
    const classified = classifyUserTurn(history[i].content);
    if (classified.kind === "steer") return titleFromUserIdea(history[i].content, memory);
  }
  return "";
}

export function scrubReply(reply, memory = {}) {
  let s = String(reply || "").trim();
  if (!s) return "";
  s = s.replace(/tell me what this article should do[.!?]*/gi, "");
  s = s.replace(/what tone or angle should the article take[^.?!\n]*[.?!]?/gi, "");
  s = s.replace(/hi!\s*i'?m ready to help with[^.?!\n]*[.?!]?/gi, "");
  if (AUDIT_SPEAK.test(s) || BANNED_BRIEF.test(s) || HARVEST_LEADS.test(s)) return "";
  s = s.replace(/the research shows strong interest in\s+["“][^"”]+["”]/gi, "");
  s = s.replace(/research shows strong interest in\s+["“][^"”]+["”]/gi, "");
  s = s.replace(/i see strong (?:local )?intent with\s+["“][^"”]+["”]/gi, "");
  s = s.replace(/local queries like\s+["“][^"”]+["”]/gi, "");
  s = s.replace(/ranks for\s+["“][^"”]+["”]/gi, "earns the search");
  s = s.replace(/targeting (?:the )?(?:keyword|query)\s+["“][^"”]+["”]/gi, "");
  for (const seed of memory.seedBag || []) {
    const q = String(seed || "").trim();
    if (q.length < 4) continue;
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(`[“"']${escaped}[”"']`, "gi"), "");
  }
  s = s.replace(/\s+([,.!?])/g, "$1").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (BANNED_BRIEF.test(s) || HARVEST_LEADS.test(s)) return "";
  if (s.length < 24) return "";
  return s;
}

export function isBrokenReply(reply) {
  const s = String(reply || "").trim();
  if (!s) return true;
  if (BANNED_BRIEF.test(s)) return true;
  if (HARVEST_LEADS.test(s)) return true;
  if (AUDIT_SPEAK.test(s)) return true;
  if (/expanded from seed/i.test(s)) return true;
  if (/^topic decider\b/i.test(s)) return true;
  return false;
}

function pickSeed(memory, proposed) {
  const bag = memory?.seedBag || [];
  const want = String(proposed || "").trim();
  if (want && bag.some((item) => item.toLowerCase() === want.toLowerCase())) return want;
  if (want) {
    const hit = bag.find(
      (item) =>
        item.toLowerCase() === want.toLowerCase() ||
        item.toLowerCase().includes(want.toLowerCase()) ||
        want.toLowerCase().includes(item.toLowerCase())
    );
    if (hit) return hit;
  }
  return bag[0] || want || null;
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

/**
 * Turn raw model JSON into a Compass turn that cannot stall.
 */
export function finalizeTurn(raw, { memory, greeting = false, lastUser = "", forceReady = false, history = [] } = {}) {
  const data = raw && typeof raw === "object" ? raw : {};
  const classified = greeting ? { kind: "greeting", pickIndex: null } : classifyUserTurn(lastUser);
  const pitches = editorialPitches(memory, 3);

  let topic = String(data.topic || data.title || "").trim() || null;
  if (topic && isJunkTitle(topic)) topic = null;
  let seedQuery = pickSeed(memory, data.seedQuery || data.seed_query || data.candidateQuery);
  let ready = Boolean(data.ready) && Boolean(topic);
  let reply = scrubReply(data.reply || data.message || data.text || "", memory);
  if (!reply && data.why && !data.candidateId) reply = scrubReply(data.why, memory);
  if (reply && isJunkTitle(reply)) reply = "";

  if (greeting) {
    return {
      reply: fallbackGreeting(memory),
      ready: false,
      topic: null,
      seedQuery: null,
      angle: null,
      why: null,
      intent: "chat",
      revisionTarget: null,
      remarks: null,
    };
  }

  if (classified.kind === "topic-ask") {
    const pack = fallbackPitches(memory);
    const looksLikeList = /\n\s*1[\).:]/.test(reply) || (reply.match(/\n/g) || []).length >= 2;
    return {
      reply: looksLikeList && !isBrokenReply(reply) && !/expanded from seed/i.test(reply) ? reply : pack.reply,
      ready: false,
      topic: null,
      seedQuery: null,
      angle: null,
      why: null,
      intent: "chat",
      revisionTarget: null,
      remarks: null,
    };
  }

  if (classified.kind === "steer") {
    const steered = titleFromUserIdea(lastUser, memory) || topic;
    const title = steered && !isJunkTitle(steered) ? steered : pitches[0]?.title || null;
    if (!title) {
      return {
        reply: fallbackPitches(memory).reply,
        ready: false,
        topic: null,
        seedQuery: null,
        angle: null,
        why: null,
        intent: "chat",
        revisionTarget: null,
        remarks: null,
      };
    }
    return {
      reply:
        reply && !isBrokenReply(reply)
          ? reply
          : `${title} — that's the piece. Say go and I'll write it, or tweak the cut.`,
      ready: false,
      topic: title,
      seedQuery: pickSeed(memory, seedQuery) || memory?.seedBag?.[0] || null,
      angle: String(data.angle || "").trim() || `Operator asked for ${lastUser}.`,
      why: String(data.why || "").trim() || `Follow the operator's brief: ${lastUser}.`,
      intent: "chat",
      revisionTarget: null,
      remarks: null,
    };
  }

  if (classified.kind === "pick" || classified.kind === "go-ahead" || forceReady) {
    const preferred = lastSteerIdea(history, memory) || topic || "";
    const locked = fallbackLock(memory, classified.pickIndex || 0, preferred);
    if (ready && topic && !titlesMatch(topic, seedQuery) && !isJunkTitle(topic)) {
      locked.topic = sentenceCaseTitle(topic).slice(0, 78);
      locked.seedQuery = seedQuery || locked.seedQuery;
      locked.reply =
        reply && !isBrokenReply(reply)
          ? reply
          : `Then we're writing “${locked.topic}”. I'll start in a few seconds — say wait if you want a different cut.`;
    }
    if (locked.topic && locked.seedQuery && titlesMatch(locked.topic, locked.seedQuery)) {
      locked.topic = editorialTitleFromSeed(locked.seedQuery);
    }
    const intent = String(data.intent || "").toLowerCase() === "revise" ? "revise" : "brief";
    return {
      reply: locked.reply,
      ready: Boolean(locked.topic),
      topic: locked.topic,
      seedQuery: locked.seedQuery,
      angle: String(data.angle || locked.angle || "").trim() || null,
      why: String(data.why || locked.why || "").trim() || null,
      intent,
      revisionTarget: intent === "revise" ? "both" : null,
      remarks: intent === "revise" ? String(data.remarks || reply || lastUser || "").trim() : null,
    };
  }

  if (ready && topic && seedQuery && titlesMatch(topic, seedQuery)) {
    topic = editorialTitleFromSeed(seedQuery);
  }
  if (topic) topic = sentenceCaseTitle(topic).slice(0, 78);
  if (topic && isJunkTitle(topic)) topic = null;

  const intent = String(data.intent || "").toLowerCase() === "revise" ? "revise" : ready ? "brief" : "chat";
  const target = String(data.revisionTarget || "").toLowerCase();
  const revisionTarget = target === "text" || target === "image" || target === "both" ? target : intent === "revise" ? "both" : null;

  if (!reply || isBrokenReply(reply) || /expanded from seed/i.test(reply)) {
    if (ready && topic) {
      reply = `Let's write “${topic}”. That's the one I'd actually want to read.`;
    } else if (pitches.length) {
      reply = `I'd write “${pitches[0].title}”. Want that, or a different cut?`;
    } else {
      reply = fallbackGreeting(memory);
    }
  }

  return {
    reply,
    ready: Boolean(ready && topic),
    topic: ready ? topic : null,
    seedQuery: ready ? seedQuery : null,
    angle: ready ? String(data.angle || "").trim() || null : null,
    why: ready ? String(data.why || "").trim() || null : null,
    intent,
    revisionTarget,
    remarks: intent === "revise" ? String(data.remarks || reply || lastUser || "").trim() : null,
  };
}
