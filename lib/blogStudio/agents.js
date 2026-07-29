import { chatCompletion } from "./providers.js";
import {
  DEFAULT_AGENT1_PROMPT,
  DEFAULT_AGENT2_PROMPT,
  DEFAULT_AGENT3_PROMPT,
} from "./defaults.js";

function linksBlock(config) {
  const internal = Array.isArray(config.internalLinksJson) ? config.internalLinksJson : [];
  const external = Array.isArray(config.externalLinksJson) ? config.externalLinksJson : [];
  return {
    internal_links_allowlist: internal,
    external_links_allowlist: external,
  };
}

function hardConstraints(config, topic) {
  const generalPrompt = String(config.seedPrompt || "").trim();
  return {
    MUST_FOLLOW_KEYWORDS: String(config.mustFollowKeywords || "").trim(),
    topic: String(topic || "").trim(),
    general_prompt: generalPrompt,
    seed_prompt: generalPrompt,
    secondary_keywords: String(config.secondaryKeywords || "").trim(),
    target_audience: String(config.targetAudience || "").trim(),
    location: String(config.location || "").trim(),
    cta_text: String(config.ctaText || "").trim(),
    cta_url: String(config.ctaUrl || "").trim(),
    word_count_range: String(config.wordCountRange || "1200-1800").trim(),
    content_type: String(config.contentType || "Blog post").trim(),
    brand_notes: String(config.brandNotes || "").trim(),
    serp_notes: String(config.serpNotes || "").trim(),
    image_guidelines: String(config.imagePrompt || "").trim(),
    topic_image_direction: String(config.topicImagePrompt || "").trim(),
    has_reference_image: Boolean(
      String(config.referenceImagePath || "").trim() ||
        (Array.isArray(config.referenceImagePaths) && config.referenceImagePaths.length)
    ),
    reference_image_count: Array.isArray(config.referenceImagePaths)
      ? config.referenceImagePaths.length
      : String(config.referenceImagePath || "").trim()
        ? 1
        : 0,
    ...linksBlock(config),
    HARD_RULES: [
      "Must-follow keywords are absolute. Do not replace or dilute them.",
      "Honor general_prompt / seed_prompt as standing brand and content instructions for every draft.",
      "Use only URLs from the allowlists. Never invent links.",
      "Return valid JSON only.",
    ],
  };
}

async function runAgentOnce({
  provider,
  model,
  system,
  user,
  siteConfig,
  requireJson = true,
  maxTokens = 8000,
}) {
  const result = await chatCompletion({
    provider,
    model,
    system,
    user,
    siteConfig,
    jsonMode: requireJson,
    maxTokens,
  });
  if (requireJson && !result.json) {
    const err = new Error("Agent returned non-JSON output.");
    err.status = 502;
    err.result = result;
    throw err;
  }
  return result;
}

async function runWithRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    // one retry for parse/transient failures (not auth / bad request)
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
      user: `Build Agent 1 SEO Keyword Intelligence from this input:\n\n${user}`,
      siteConfig: config,
    })
  );
}

export async function runAgent2({ config, topic, agent1 }) {
  const system = config.agent2Prompt || DEFAULT_AGENT2_PROMPT;
  const user = JSON.stringify(
    {
      ...hardConstraints(config, topic),
      agent1_intelligence: agent1,
    },
    null,
    2
  );
  return runWithRetry(() =>
    runAgentOnce({
      provider: config.agent2Provider,
      model: config.agent2Model,
      system,
      user: `Build the Agent 2 SEO article blueprint from this input:\n\n${user}`,
      siteConfig: config,
    })
  );
}

export async function runAgent3({ config, topic, agent1, agent2 }) {
  const system = config.agent3Prompt || DEFAULT_AGENT3_PROMPT;
  const user = JSON.stringify(
    {
      ...hardConstraints(config, topic),
      agent1_intelligence: agent1,
      agent2_blueprint: agent2,
      workflow_variables: {
        primary_keyword:
          agent1?.primary_keyword ||
          String(config.mustFollowKeywords || "")
            .split(/[\n,]+/)
            .map((s) => s.trim())
            .filter(Boolean)[0] ||
          topic,
        target_word_count:
          agent2?.article_blueprint?.total_word_count_target || config.wordCountRange || "1200-1800",
        internal_link_url: agent2?.internal_link?.url || "",
        internal_link_anchor: agent2?.internal_link?.anchor_text || "",
        internal_link_section_id: agent2?.internal_link?.section_id || "",
        cta_text: agent2?.article_blueprint?.conclusion?.primary_cta_text || config.ctaText || "",
        cta_link: agent2?.article_blueprint?.conclusion?.primary_cta_url || config.ctaUrl || "",
      },
    },
    null,
    2
  );
  return runWithRetry(() =>
    runAgentOnce({
      provider: config.agent3Provider,
      model: config.agent3Model,
      system,
      user: `Write the complete publication-ready article JSON from this approved context:\n\n${user}`,
      siteConfig: config,
      maxTokens: 12000,
    })
  );
}
