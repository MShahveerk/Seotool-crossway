/**
 * End-of-pipeline Humanizer: LLM rewrite + deterministic scrub of em dashes
 * and stock AI phrasing. The pasted skill is injected verbatim.
 */
import { chatCompletion } from "./providers.js";
import { applyStudioCalendarToDraft } from "../studioClock.js";
import { DEFAULT_HUMANIZER_PROMPT, DEFAULT_HUMANIZER_SKILL } from "./prefixDefaults.js";
import { normalizeArticleHtml } from "./articleHtml.js";

const AI_PHRASES = [
  /\bin today'?s digital landscape\b/gi,
  /\bin the ever-evolving(?:\s+\w+){0,4}\b/gi,
  /\bin the realm of\b/gi,
  /\bit'?s important to note(?: that)?\b/gi,
  /\bit is worth noting(?: that)?\b/gi,
  /\bneedless to say,?\s*/gi,
  /\blet'?s dive in[.!]?\s*/gi,
  /\bwhen it comes to\b/gi,
  /\bin this article,?\s+we will\b/gi,
  /\beverything you need to know(?: about)?\b/gi,
  /\bthe (?:ultimate|comprehensive) guide(?: to)?\b/gi,
  /\bat the end of the day,?\s*/gi,
  /\bthe bottom line is(?: that)?\b/gi,
  /\ba (?:plethora|myriad) of\b/gi,
  /\bcutting-edge\b/gi,
  /\bgroundbreaking\b/gi,
  /\bgame-changer\b/gi,
  /\bunlock(?:s|ing)? the potential of\b/gi,
];

const AI_WORD_SWAPS = [
  [/\bdelve(?:s|d|ing)? into\b/gi, "look at"],
  [/\bdelve(?:s|d|ing)?\b/gi, "look"],
  [/\bleverage(?:s|d|ing)?\b/gi, "use"],
  [/\butilize(?:s|d|ing)?\b/gi, "use"],
  [/\bunpack(?:s|ed|ing)?\b/gi, "explain"],
  [/\brobust\b/gi, "solid"],
  [/\bseamless(?:ly)?\b/gi, "smooth"],
  [/\bmoreover,\s*/gi, ""],
  [/\bfurthermore,\s*/gi, ""],
  [/\badditionally,\s*/gi, ""],
];

/** Always-on cleanup so em dashes cannot survive even if the model ignores the skill. */
export function scrubAiTics(value) {
  if (value == null) return value;
  if (typeof value !== "string") return value;
  let s = value
    .replace(/&mdash;|&#8212;|&#x2014;/gi, ", ")
    .replace(/&ndash;|&#8211;|&#x2013;/gi, ", ")
    .replace(/\s*[\u2014\u2013]\s*/g, ", ");

  for (const re of AI_PHRASES) s = s.replace(re, " ");
  for (const [re, to] of AI_WORD_SWAPS) s = s.replace(re, to);

  return s
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/,\s*,+/g, ",")
    .replace(/>\s+,/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function firstNonEmpty(...candidates) {
  for (const c of candidates) {
    const s = typeof c === "string" ? c.trim() : "";
    if (s) return s;
  }
  return "";
}

/** Writer HTML can land under a few keys; models also echo the empty schema. */
export function pickArticleHtml(obj) {
  if (!obj || typeof obj !== "object") return "";
  const nested = obj.article && typeof obj.article === "object" ? obj.article : null;
  return firstNonEmpty(
    obj.article_html,
    obj.articleHtml,
    obj.html,
    obj.content,
    obj.body,
    nested?.article_html,
    nested?.articleHtml,
    nested?.html,
    nested?.content
  );
}

function scrubArticleJson(article) {
  const next = article && typeof article === "object" ? { ...article } : {};
  for (const key of ["title", "slug", "excerpt", "meta_title", "meta_description", "alt_text", "article_html"]) {
    if (typeof next[key] === "string") next[key] = scrubAiTics(next[key]);
  }
  if (typeof next.article_html === "string") next.article_html = normalizeArticleHtml(next.article_html);
  return next;
}

export async function runHumanizerAgent({ config, article, topic }) {
  const skill = String(config.humanizerSkill || DEFAULT_HUMANIZER_SKILL).trim() || DEFAULT_HUMANIZER_SKILL;
  const base = config.humanizerPrompt || DEFAULT_HUMANIZER_PROMPT;
  const system = `${base}

--- SKILL (operator-pasted, mandatory) ---
${skill}
--- END SKILL ---`;

  const source = article && typeof article === "object" ? article : {};
  const sourceHtml = pickArticleHtml(source);
  const fields = { ...source };
  delete fields.article_html;
  delete fields.articleHtml;
  delete fields.html;
  delete fields.content;
  delete fields.body;
  const result = await chatCompletion({
    provider: config.humanizerProvider || config.agent3Provider,
    model: config.humanizerModel || config.agent3Model,
    system,
    user: [
      `Topic: ${topic || source.title || ""}`,
      "Rewrite ARTICLE_HTML below. Keep real HTML tags. Never write the two characters backslash-n as visible text — use <p>, <h2>, <ul>, <li>.",
      "--- ARTICLE_HTML ---",
      sourceHtml,
      "--- END ARTICLE_HTML ---",
      "Other fields (JSON):",
      JSON.stringify(fields, null, 2),
    ].join("\n\n"),
    siteConfig: config,
    temperature: 0.4,
    maxTokens: 12000,
    jsonMode: true,
  });
  const data = result?.json && typeof result.json === "object" ? result.json : {};
  const modelHtml = pickArticleHtml(data);
  const html = modelHtml || sourceHtml;
  const usedWriterHtml = !modelHtml && Boolean(sourceHtml);

  let merged = applyStudioCalendarToDraft(
    scrubArticleJson({
      ...source,
      ...data,
      article_html: html,
      title: firstNonEmpty(data.title, source.title),
    }),
    { keepText: topic }
  );

  // Scrub can theoretically empty a whitespace-only rewrite. Restore the writer.
  if (!String(merged.article_html || "").trim() && sourceHtml) {
    merged = { ...merged, article_html: normalizeArticleHtml(scrubAiTics(sourceHtml)) };
  }

  if (!String(merged.article_html || "").trim()) {
    throw new Error("Humanizer returned empty article_html.");
  }

  return {
    json: merged,
    usedWriterHtml,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
    provider: config.humanizerProvider || config.agent3Provider,
    model: config.humanizerModel || config.agent3Model,
  };
}
