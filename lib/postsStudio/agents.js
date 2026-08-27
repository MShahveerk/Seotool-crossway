import { chatCompletion } from "../blogStudio/providers.js";
import { studioClockFields } from "../studioClock.js";
import { DEFAULT_AGENT1_PROMPT, DEFAULT_AGENT2_PROMPT } from "./defaults.js";

function hardConstraints(config, topic) {
  const fields = {
    topic: String(topic || "").trim(),
    general_prompt: String(config.seedPrompt || "").trim(),
    hooks_or_keywords: String(config.hooksOrKeywords || "").trim(),
    tone: String(config.tone || "").trim(),
    hashtag_policy: String(config.hashtagPolicy || "").trim(),
    platform: String(config.defaultPlatform || config.platform || "both").trim(),
    cta_text: String(config.ctaText || "").trim(),
    cta_url: String(config.ctaUrl || "").trim(),
    brand_notes: String(config.brandNotes || "").trim(),
    image_guidelines: String(config.imagePrompt || "").trim(),
    topic_image_direction: String(config.topicImagePrompt || "").trim(),
  };
  const reviewerFeedback = String(config.reviewerFeedback || "").trim();
  if (reviewerFeedback) fields.reviewer_feedback = reviewerFeedback;
  const filled = Object.entries(fields)
    .filter(([k, v]) => k !== "topic" && String(v || "").trim())
    .map(([k]) => k);
  const clock = studioClockFields();
  return {
    ...fields,
    today: clock.today,
    current_year: clock.current_year,
    HARD_RULES: [
      clock.HARD_CALENDAR,
      "Every non-empty Seeds / Assets field in this JSON is mandatory for this draft — do not ignore any of them.",
      filled.length
        ? `Fields that MUST be reflected: ${filled.join(", ")}.`
        : "Use topic plus any available standing brief fields.",
      "Honor general_prompt as standing brand instructions (manual and auto runs share the same Seeds).",
      "Respect hashtag_policy and platform limits.",
      "Never invent URLs, prices, or claims.",
      ...(reviewerFeedback
        ? [
            "reviewer_feedback lists changes a human reviewer requested after rejecting the previous post. You MUST fully address every point while keeping everything that was NOT criticized. Treat it as the top priority for this rewrite.",
          ]
        : []),
      "Return valid JSON only.",
    ],
  };
}

async function runAgentOnce({ provider, model, system, user, siteConfig, maxTokens = 4000 }) {
  const result = await chatCompletion({
    provider,
    model,
    system,
    user,
    siteConfig,
    jsonMode: true,
    maxTokens,
  });
  if (!result.json) {
    const err = new Error("Agent returned non-JSON output.");
    err.status = 502;
    throw err;
  }
  return result;
}

async function runWithRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    const msg = String(err.message || "");
    if (/non-JSON|ECONN|ETIMEDOUT|HTTP 429|HTTP 503|HTTP 502|rate limit/i.test(msg)) {
      await new Promise((r) => setTimeout(r, 1500));
      return fn();
    }
    throw err;
  }
}

export async function runAgent1({ config, topic }) {
  const system = config.agent1Prompt || DEFAULT_AGENT1_PROMPT;
  const user = JSON.stringify(hardConstraints(config, topic), null, 2);
  return runWithRetry(() =>
    runAgentOnce({
      provider: config.agent1Provider,
      model: config.agent1Model,
      system,
      user: `Build Strategist social intelligence from this input:\n\n${user}`,
      siteConfig: config,
    })
  );
}

export async function runAgent2({ config, topic, agent1 }) {
  const system = config.agent2Prompt || DEFAULT_AGENT2_PROMPT;
  const previousDraft =
    config.previousDraft && typeof config.previousDraft === "object" ? config.previousDraft : null;
  const user = JSON.stringify(
    {
      ...hardConstraints(config, topic),
      ...(previousDraft ? { previous_draft: previousDraft } : {}),
      strategist: agent1,
    },
    null,
    2
  );
  return runWithRetry(() =>
    runAgentOnce({
      provider: config.agent2Provider,
      model: config.agent2Model,
      system,
      user: `Write the final social post JSON from this context:\n\n${user}`,
      siteConfig: config,
      maxTokens: 6000,
    })
  );
}
