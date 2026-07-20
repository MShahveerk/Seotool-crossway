import prisma from "./prisma.js";
import { normalizeSiteForMatch } from "./blogPayload.js";

const DEFAULT_CHAIN = ["webhook", "wordpress", "api", "email"];

export async function getSitePublishConfig(siteLink) {
  const key = normalizeSiteForMatch(siteLink) || String(siteLink || "").trim();
  if (!key) return null;
  let config = await prisma.sitePublishConfig.findUnique({ where: { siteLink: key } });
  if (!config && key !== siteLink) {
    config = await prisma.sitePublishConfig.findUnique({ where: { siteLink: String(siteLink).trim() } });
  }
  return config;
}

export function parseDeliveryChain(config) {
  const raw = config?.deliveryChain;
  if (Array.isArray(raw) && raw.length) {
    return raw.map((m) => String(m).toLowerCase()).filter(Boolean);
  }
  return DEFAULT_CHAIN;
}

export async function upsertSitePublishConfig(siteLink, data) {
  const key = normalizeSiteForMatch(siteLink) || String(siteLink || "").trim();
  if (!key) {
    const err = new Error("siteLink is required.");
    err.status = 400;
    throw err;
  }

  const payload = {
    enabled: data.enabled !== false,
    inboundSecret: data.inboundSecret !== undefined ? String(data.inboundSecret || "").trim() || null : undefined,
    deliveryChain: Array.isArray(data.deliveryChain) ? data.deliveryChain : undefined,
    webhookUrl: data.webhookUrl !== undefined ? String(data.webhookUrl || "").trim() || null : undefined,
    webhookSecret: data.webhookSecret !== undefined ? String(data.webhookSecret || "").trim() || null : undefined,
    apiUrl: data.apiUrl !== undefined ? String(data.apiUrl || "").trim() || null : undefined,
    apiKey: data.apiKey !== undefined ? String(data.apiKey || "").trim() || null : undefined,
    apiHeaders: data.apiHeaders !== undefined ? data.apiHeaders : undefined,
    wordpressUrl: data.wordpressUrl !== undefined ? String(data.wordpressUrl || "").trim().replace(/\/+$/, "") || null : undefined,
    wordpressUsername: data.wordpressUsername !== undefined ? String(data.wordpressUsername || "").trim() || null : undefined,
    wordpressAppPassword:
      data.wordpressAppPassword !== undefined
        ? String(data.wordpressAppPassword || "").trim().replace(/\s+/g, "") || null
        : undefined,
    emailRecipients: data.emailRecipients !== undefined ? String(data.emailRecipients || "").trim() || null : undefined,
    defaultCategories: data.defaultCategories !== undefined ? data.defaultCategories : undefined,
    defaultTags: data.defaultTags !== undefined ? data.defaultTags : undefined,
    wordpressPullEnabled: data.wordpressPullEnabled !== undefined ? Boolean(data.wordpressPullEnabled) : undefined,
    wordpressPullStatuses:
      data.wordpressPullStatuses !== undefined
        ? Array.isArray(data.wordpressPullStatuses)
          ? data.wordpressPullStatuses
          : String(data.wordpressPullStatuses || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
        : undefined,
  };

  const cleaned = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));

  return prisma.sitePublishConfig.upsert({
    where: { siteLink: key },
    create: { siteLink: key, ...cleaned },
    update: cleaned,
  });
}

export function sanitizeConfigForClient(config) {
  if (!config) return null;
  return {
    siteLink: config.siteLink,
    enabled: config.enabled,
    inboundSecret: config.inboundSecret ? "••••••••" : "",
    deliveryChain: parseDeliveryChain(config),
    webhookUrl: config.webhookUrl || "",
    webhookSecret: config.webhookSecret ? "••••••••" : "",
    apiUrl: config.apiUrl || "",
    apiKey: config.apiKey ? "••••••••" : "",
    apiHeaders: config.apiHeaders || {},
    wordpressUrl: config.wordpressUrl || "",
    wordpressUsername: config.wordpressUsername || "",
    wordpressAppPassword: config.wordpressAppPassword ? "••••••••" : "",
    emailRecipients: config.emailRecipients || "",
    defaultCategories: config.defaultCategories || [],
    defaultTags: config.defaultTags || [],
    wordpressPullEnabled: Boolean(config.wordpressPullEnabled),
    wordpressPullStatuses: Array.isArray(config.wordpressPullStatuses)
      ? config.wordpressPullStatuses
      : ["draft", "future"],
    lastWordpressPullAt: config.lastWordpressPullAt || null,
  };
}
