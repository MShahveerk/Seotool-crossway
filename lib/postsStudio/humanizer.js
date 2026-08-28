/**
 * Post Studio Humanizer: LLM rewrite of caption JSON + deterministic scrub.
 * The pasted skill is injected verbatim.
 */
import { chatCompletion } from "../blogStudio/providers.js";
import { applyStudioCalendarToDraft } from "../studioClock.js";
import { DEFAULT_POST_HUMANIZER_PROMPT, DEFAULT_POST_HUMANIZER_SKILL } from "./defaults.js";
import { mergeHumanizedPost, pickCaption } from "./humanizerText.js";

export async function runPostHumanizerAgent({ config, post, topic }) {
  const skill = String(config.humanizerSkill || DEFAULT_POST_HUMANIZER_SKILL).trim() || DEFAULT_POST_HUMANIZER_SKILL;
  const base = config.humanizerPrompt || DEFAULT_POST_HUMANIZER_PROMPT;
  const system = `${base}

--- SKILL (operator-pasted, mandatory) ---
${skill}
--- END SKILL ---`;

  const source = post && typeof post === "object" ? post : {};
  const sourceCaption = pickCaption(source);
  const result = await chatCompletion({
    provider: config.humanizerProvider || config.agent2Provider,
    model: config.humanizerModel || config.agent2Model,
    system,
    user: [
      `Topic: ${topic || source.title || ""}`,
      "Rewrite the social post JSON. Keep hashtags, CTA copy, and every URL.",
      "Never write the two characters backslash-n as visible text. Use real line breaks in caption.",
      "--- POST_JSON ---",
      JSON.stringify(source, null, 2),
      "--- END POST_JSON ---",
    ].join("\n\n"),
    siteConfig: config,
    temperature: 0.4,
    maxTokens: 4000,
    jsonMode: true,
  });
  const data = result?.json && typeof result.json === "object" ? result.json : {};
  const modelCaption = pickCaption(data);
  const usedCopywriterCaption = !modelCaption && Boolean(sourceCaption);

  let merged = applyStudioCalendarToDraft(mergeHumanizedPost(source, data), {
    keepText: topic,
  });

  if (!String(merged.caption || "").trim() && sourceCaption) {
    merged = mergeHumanizedPost(source, { ...data, caption: sourceCaption });
  }

  if (!String(merged.caption || "").trim()) {
    throw new Error("Humanizer returned empty caption.");
  }

  return {
    json: merged,
    usedCopywriterCaption,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
    provider: config.humanizerProvider || config.agent2Provider,
    model: config.humanizerModel || config.agent2Model,
  };
}
