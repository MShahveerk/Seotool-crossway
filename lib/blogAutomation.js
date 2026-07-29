/**
 * Blog automation via external n8n webhook.
 *
 * Stores config + run history in AppSetting (key/value JSON), triggers the
 * webhook manually or on a recurring interval (see lib/cron.js), and can
 * generate a blog prompt with OpenRouter.
 */
import axios from "axios";
import prisma from "./prisma.js";
import { getOpenrouterConfig } from "./openrouter.js";

const CONFIG_KEY = "blog_automation_config";
const HISTORY_KEY = "blog_automation_history";
const HISTORY_LIMIT = 20;
const SECRET_MASK = "••••••••";

const DEFAULT_CONFIG = {
  engineMode: "external", // "external" (n8n) | "internal" (Studio)
  webhookUrl: "",
  webhookSecret: "",
  defaultPrompt: "",
  scheduleEnabled: false,
  intervalMinutes: 1440,
  lastScheduledAt: null,
};

async function readSetting(key) {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } });
    if (!row?.value) return null;
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

async function writeSetting(key, value) {
  const serialized = JSON.stringify(value);
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: serialized },
    update: { value: serialized },
  });
}

export async function getBlogAutomationConfig() {
  const stored = await readSetting(CONFIG_KEY);
  return { ...DEFAULT_CONFIG, ...(stored || {}) };
}

export function sanitizeConfigForClient(config) {
  const { webhookSecret, ...rest } = config;
  return { ...rest, webhookSecret: webhookSecret ? SECRET_MASK : "" };
}

export async function saveBlogAutomationConfig(input = {}) {
  const existing = await getBlogAutomationConfig();
  const next = { ...existing };

  if (input.engineMode !== undefined) {
    const mode = String(input.engineMode || "").toLowerCase() === "internal" ? "internal" : "external";
    const prevMode = String(existing.engineMode || "external").toLowerCase();
    next.engineMode = mode;
    // Mutual exclusivity: internal engine pauses external schedule
    if (mode === "internal") next.scheduleEnabled = false;
    // Switching to external pauses all Internal Studio auto schedules
    if (mode === "external" && prevMode === "internal") {
      try {
        await prisma.blogAutomationSiteConfig.updateMany({
          where: { autoEnabled: true },
          data: { autoEnabled: false },
        });
      } catch {
        /* tables may not exist yet on first deploy */
      }
    }
  }

  if (input.webhookUrl !== undefined) {
    const url = String(input.webhookUrl || "").trim();
    if (url && !/^https?:\/\//i.test(url)) {
      const err = new Error("Webhook URL must start with http:// or https://");
      err.status = 400;
      throw err;
    }
    next.webhookUrl = url;
  }

  if (input.webhookSecret !== undefined && input.webhookSecret !== SECRET_MASK) {
    next.webhookSecret = String(input.webhookSecret || "").trim();
  }

  if (input.defaultPrompt !== undefined) {
    next.defaultPrompt = String(input.defaultPrompt || "").trim().slice(0, 8000);
  }

  if (input.scheduleEnabled !== undefined) {
    next.scheduleEnabled = Boolean(input.scheduleEnabled);
  }

  if (input.intervalMinutes !== undefined) {
    const minutes = Math.round(Number(input.intervalMinutes));
    if (!Number.isFinite(minutes) || minutes < 5) {
      const err = new Error("Interval must be at least 5 minutes.");
      err.status = 400;
      throw err;
    }
    next.intervalMinutes = minutes;
  }

  if (next.engineMode === "internal") {
    next.scheduleEnabled = false;
  }

  if (next.scheduleEnabled && next.engineMode !== "external") {
    const err = new Error("External schedule requires Engine mode = External.");
    err.status = 409;
    throw err;
  }

  if (next.scheduleEnabled && !next.webhookUrl) {
    const err = new Error("Set a webhook URL before enabling the schedule.");
    err.status = 400;
    throw err;
  }

  // Restart the interval clock when the schedule is (re)enabled
  if (next.scheduleEnabled && !existing.scheduleEnabled) {
    next.lastScheduledAt = new Date().toISOString();
  }

  await writeSetting(CONFIG_KEY, next);
  return next;
}

export async function getBlogAutomationHistory() {
  const history = await readSetting(HISTORY_KEY);
  return Array.isArray(history) ? history : [];
}

async function recordRun(entry) {
  const history = await getBlogAutomationHistory();
  history.unshift(entry);
  await writeSetting(HISTORY_KEY, history.slice(0, HISTORY_LIMIT));
}

/**
 * POST to the configured n8n webhook. `source` is "manual" or "schedule".
 * Records the run in history and returns the run entry.
 */
export async function triggerBlogWebhook({ prompt = "", source = "manual", triggeredBy = null } = {}) {
  const config = await getBlogAutomationConfig();
  if (String(config.engineMode || "external") === "internal") {
    const err = new Error("External n8n triggers are disabled while Internal Studio is active.");
    err.status = 409;
    throw err;
  }
  if (!config.webhookUrl) {
    const err = new Error("No webhook URL configured. Save one in Blog Automation settings first.");
    err.status = 400;
    throw err;
  }

  const cleanPrompt = String(prompt || "").trim();
  const payload = {
    source,
    prompt: cleanPrompt || null,
    triggeredAt: new Date().toISOString(),
    triggeredBy: triggeredBy || null,
    app: "crossway-seo-tool",
  };

  const headers = { "Content-Type": "application/json" };
  if (config.webhookSecret) headers["X-Automation-Secret"] = config.webhookSecret;

  const startedAt = Date.now();
  const entry = {
    at: payload.triggeredAt,
    source,
    triggeredBy: triggeredBy || null,
    prompt: cleanPrompt ? cleanPrompt.slice(0, 500) : null,
    ok: false,
    status: null,
    error: null,
    durationMs: 0,
  };

  try {
    const res = await axios.post(config.webhookUrl, payload, {
      headers,
      timeout: 60000,
      // n8n may return non-2xx while still having received the trigger; keep the status
      validateStatus: () => true,
    });
    entry.status = res.status;
    entry.ok = res.status >= 200 && res.status < 300;
    if (!entry.ok) {
      const detail =
        typeof res.data === "string"
          ? res.data.slice(0, 300)
          : res.data?.message || res.data?.error || JSON.stringify(res.data || {}).slice(0, 300);
      entry.error = `Webhook responded with HTTP ${res.status}${detail ? `: ${detail}` : ""}`;
    }
  } catch (error) {
    entry.error =
      error.code === "ECONNABORTED"
        ? "Webhook request timed out after 60s."
        : error.message || "Webhook request failed.";
  }

  entry.durationMs = Date.now() - startedAt;
  await recordRun(entry);

  if (!entry.ok) {
    const err = new Error(entry.error || "Webhook trigger failed.");
    err.status = 502;
    err.run = entry;
    throw err;
  }

  return entry;
}

/**
 * Cron entrypoint (runs every minute). Fires the webhook when the configured
 * interval has elapsed, using the saved default prompt if any.
 */
export async function runScheduledBlogAutomation(logger = console) {
  const config = await getBlogAutomationConfig();

  // Internal Studio auto-runs (mutually exclusive with n8n webhook schedule)
  if (String(config.engineMode || "external") === "internal") {
    try {
      const { runScheduledInternalStudio } = await import("./blogStudio/runner.js");
      await runScheduledInternalStudio(logger);
    } catch (err) {
      logger.error?.(`Internal blog studio schedule failed: ${err.message}`);
    }
    return;
  }

  if (!config.scheduleEnabled || !config.webhookUrl) return;

  const intervalMs = Math.max(5, Number(config.intervalMinutes) || 0) * 60000;
  const last = config.lastScheduledAt ? new Date(config.lastScheduledAt).getTime() : 0;
  if (last && Date.now() - last < intervalMs) return;

  // Claim this slot before firing so overlapping cron ticks don't double-trigger
  await writeSetting(CONFIG_KEY, { ...config, lastScheduledAt: new Date().toISOString() });

  try {
    const run = await triggerBlogWebhook({
      prompt: config.defaultPrompt,
      source: "schedule",
      triggeredBy: "scheduler",
    });
    logger.info?.(`Blog automation webhook triggered on schedule (HTTP ${run.status}).`);
  } catch (error) {
    logger.error?.(`Scheduled blog automation trigger failed: ${error.message}`);
  }
}

/**
 * Generate a blog prompt with OpenRouter. `topic` and `notes` are optional
 * hints; without them the model invents a fresh angle.
 */
export async function generateBlogPrompt({ topic = "", notes = "" } = {}) {
  const { apiKey, siteUrl, appName } = getOpenrouterConfig();
  const model =
    process.env.OPENROUTER_MODEL_PROMPT ||
    process.env.OPENROUTER_MODEL_CAPTION ||
    "google/gemini-3.1-flash-lite";

  const systemPrompt =
    "You write a single, detailed prompt that will be fed to an automated blog-writing workflow. " +
    "The prompt must describe one specific blog post: working title, target audience, angle, key points to cover, " +
    "suggested structure, tone, and 3-5 SEO keywords to target. Be concrete and specific, not generic. " +
    "Return only the prompt text itself — no preamble, headings, quotes, or markdown fences.";

  const userParts = [];
  if (String(topic).trim()) userParts.push(`Topic or theme: ${String(topic).trim().slice(0, 500)}`);
  if (String(notes).trim()) userParts.push(`Additional context: ${String(notes).trim().slice(0, 1000)}`);
  if (!userParts.length) {
    userParts.push(
      "No topic was provided. Pick a timely, search-friendly topic suitable for a business blog and write the prompt for it."
    );
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (siteUrl) {
    headers["HTTP-Referer"] = siteUrl;
    headers["X-Title"] = appName;
  }

  let res;
  try {
    res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model,
        temperature: 0.9,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userParts.join("\n\n") },
        ],
      },
      { headers, timeout: 60000 }
    );
  } catch (error) {
    const message = error?.response?.data?.error?.message || error?.response?.data?.message || error.message;
    const err = new Error(message || "OpenRouter request failed.");
    err.status = error?.response?.status || 502;
    throw err;
  }

  const output = String(res.data?.choices?.[0]?.message?.content || "")
    .trim()
    .replace(/^```(?:text|markdown)?\s*\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();

  if (!output) {
    const err = new Error("OpenRouter returned an empty prompt.");
    err.status = 502;
    throw err;
  }

  return { prompt: output, model };
}

export { SECRET_MASK };
