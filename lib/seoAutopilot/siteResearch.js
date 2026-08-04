/**
 * Auto-fill Autopilot brand/profile fields from existing Crossway site data.
 * Uses the Diagnoser agent's provider/model/keys (niche + intent brain).
 */
import { chatCompletion } from "../blogStudio/providers.js";
import { getAutopilotConfig } from "./engine.js";
import { buildAutopilotContext } from "./context.js";
import { AGENT_DEFS } from "./defaults.js";

const SITE_RESEARCH_SYSTEM = `You are the Diagnoser agent doing a quick site-profile research pass for Crossway SEO Autopilot.

Using ONLY the supplied Crossway site data (Search Console, audit, opportunities, authority/backlinks, domain), infer brand setup fields.

Return ONLY one valid JSON object:
{
  "brandName": "",
  "category": "",
  "buyingQuestions": [],
  "competitors": [],
  "proofPoint": "",
  "brandNotes": ""
}

Rules:
- Prefer real signals from the data (queries, pages, domain, audit notes). Do not invent fake stats or awards.
- buyingQuestions: 5–8 questions real buyers ask in this niche (plain language), as an array of strings.
- competitors: 3–6 likely competitor brand/domain names if inferable; otherwise best-effort from niche, mark uncertainty in brandNotes.
- proofPoint: one honest, pitch-ready line grounded in available evidence (e.g. niche focus, content theme, authority hint). If weak evidence, keep it modest.
- brandName: human brand if clear from domain/site context; else a clean name from the hostname.
- category: short niche phrase (e.g. "B2B logistics software").`;

function asLines(value) {
  if (Array.isArray(value)) {
    return value
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .join("\n");
  }
  return String(value || "")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n");
}

export async function researchSiteProfile(siteLink) {
  const config = await getAutopilotConfig(siteLink);
  const diagnoser = AGENT_DEFS.find((a) => a.id === "diagnoser");
  const provider = config.diagnoserProvider || diagnoser?.defaultProvider || "openai";
  const model = config.diagnoserModel || diagnoser?.defaultModel || "gpt-5.4-mini";

  const context = await buildAutopilotContext(siteLink, config);
  const result = await chatCompletion({
    provider,
    model,
    siteConfig: config,
    system: SITE_RESEARCH_SYSTEM,
    user: `Research this site's Autopilot profile fields.\n\nSITE CONTEXT:\n${context.contextText}`,
    temperature: 0.35,
    maxTokens: 2500,
    jsonMode: true,
  });

  const data = result?.json || {};
  const profile = {
    brandName: String(data.brandName || "").trim().slice(0, 256),
    category: String(data.category || "").trim().slice(0, 512),
    buyingQuestions: asLines(data.buyingQuestions).slice(0, 8000),
    competitors: asLines(data.competitors).slice(0, 4000),
    proofPoint: String(data.proofPoint || "").trim().slice(0, 4000),
    brandNotes: String(data.brandNotes || "").trim().slice(0, 8000),
  };

  if (!profile.brandName && !profile.category && !profile.buyingQuestions) {
    const err = new Error(
      "Site research returned empty fields. Check Diagnoser API keys on the Agents tab, then try again."
    );
    err.status = 422;
    throw err;
  }

  return {
    profile,
    meta: {
      provider,
      model,
      costUsd: Number(result?.costUsd || 0),
      contextErrors: context.errors || [],
    },
  };
}
