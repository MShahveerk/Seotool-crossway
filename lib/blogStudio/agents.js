import { chatCompletion } from "./providers.js";
import { studioClockFields } from "../studioClock.js";
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

function operatorFacts(harvest) {
  const brief = harvest?.brief && typeof harvest.brief === "object" ? harvest.brief : {};
  const pick = (v) => {
    if (Array.isArray(v)) {
      return v
        .map((item) => {
          if (typeof item === "string") return item.trim();
          if (item && typeof item === "object") return String(item.name || item.phrase || item.question || "").trim();
          return "";
        })
        .filter(Boolean)
        .slice(0, 12);
    }
    return String(v || "").trim();
  };
  const facts = {
    brandName: pick(brief.brandName),
    category: pick(brief.category),
    audience: pick(brief.audience),
    geo: pick(brief.geo || harvest?.market),
    services: pick(brief.services),
    buyingQuestions: pick(brief.buyingQuestions),
    differentiators: pick(brief.differentiators || brief.whatTheySell),
  };
  const empty = Object.values(facts).every((v) => (Array.isArray(v) ? !v.length : !v));
  return empty ? null : facts;
}

const STALE_AGENT3_COPY = /Allowed tags only: h1,h2,h3,p,ul,ol,li,a/;

function architectSystem(config) {
  return String(config.agent2Prompt || "").trim() || DEFAULT_AGENT2_PROMPT;
}

function writerSystem(config) {
  const custom = String(config.agent3Prompt || "").trim();
  if (!custom || (STALE_AGENT3_COPY.test(custom) && !/\btable\b/i.test(custom))) {
    return DEFAULT_AGENT3_PROMPT;
  }
  return custom;
}

function writerMaxTokens(config) {
  const max = Number(String(config.wordCountRange || "").split(/[-–]/).pop()) || 1800;
  if (max >= 2400) return 16000;
  if (max >= 1800) return 14000;
  return 12000;
}

function hardConstraints(config, topic) {
  const generalPrompt = String(config.seedPrompt || "").trim();
  const fields = {
    MUST_FOLLOW_KEYWORDS: String(config.mustFollowKeywords || "").trim(),
    topic: String(topic || "").trim(),
    general_prompt: generalPrompt,
    seed_prompt: generalPrompt,
    secondary_keywords: String(config.secondaryKeywords || "").trim(),
    target_audience: String(config.targetAudience || "").trim(),
    location: String(config.location || "").trim(),
    cta_text: String(config.ctaText || "").trim(),
    cta_url: String(config.ctaUrl || "").trim(),
    word_count_range: String(config.wordCountRange || "1800-2400").trim(),
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
  };
  const reviewerFeedback = String(config.reviewerFeedback || "").trim();
  if (reviewerFeedback) fields.reviewer_feedback = reviewerFeedback;
  const filled = Object.entries(fields)
    .filter(([k, v]) => {
      if (k === "topic" || k === "has_reference_image" || k === "reference_image_count") return false;
      if (k.endsWith("_allowlist")) return Array.isArray(v) && v.length > 0;
      return String(v || "").trim();
    })
    .map(([k]) => k);
  const clock = studioClockFields();
  return {
    ...fields,
    today: clock.today,
    current_year: clock.current_year,
    HARD_RULES: [
      clock.HARD_CALENDAR,
      "Every non-empty Seeds / Links / Assets field in this JSON is mandatory for this draft — do not ignore any of them.",
      filled.length
        ? `Fields that MUST be reflected: ${filled.join(", ")}.`
        : "Use topic plus any available standing brief fields.",
      "Must-follow keywords are absolute. Do not replace or dilute them.",
      "Honor general_prompt / seed_prompt as standing brand and content instructions for every draft (manual and auto share the same Seeds).",
      "Use only URLs from the allowlists. Never invent links.",
      ...(reviewerFeedback
        ? [
            "reviewer_feedback lists changes a human reviewer requested after rejecting the previous draft. You MUST fully address every point in it while keeping everything that was NOT criticized. Treat it as the top priority for this rewrite.",
          ]
        : []),
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

export async function runAgent2({ config, topic, agent1, lockedHeadings = null, serpCompete = null, harvest = null }) {
  const system = architectSystem(config);
  const facts = operatorFacts(harvest);
  const user = JSON.stringify(
    {
      ...hardConstraints(config, topic),
      agent1_intelligence: agent1,
      ...(lockedHeadings ? { locked_headings: lockedHeadings } : {}),
      ...(serpCompete ? { serp_compete: serpCompete } : {}),
      ...(facts ? { operator_facts: facts } : {}),
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

export async function runAgent3({ config, topic, agent1, agent2, serpCompete = null, harvest = null }) {
  const system = writerSystem(config);
  const previousDraft =
    config.previousDraft && typeof config.previousDraft === "object" ? config.previousDraft : null;
  const facts = operatorFacts(harvest);
  const user = JSON.stringify(
    {
      ...hardConstraints(config, topic),
      ...(previousDraft ? { previous_draft: previousDraft } : {}),
      agent1_intelligence: agent1,
      agent2_blueprint: agent2,
      ...(serpCompete ? { serp_compete: serpCompete } : {}),
      ...(facts ? { operator_facts: facts } : {}),
      workflow_variables: {
        primary_keyword:
          agent1?.primary_keyword ||
          String(config.mustFollowKeywords || "")
            .split(/[\n,]+/)
            .map((s) => s.trim())
            .filter(Boolean)[0] ||
          topic,
        target_word_count:
          agent2?.article_blueprint?.total_word_count_target ||
          serpCompete?.suggestedWordCountRange ||
          config.wordCountRange ||
          "1800-2400",
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
      maxTokens: writerMaxTokens(config),
    })
  );
}
