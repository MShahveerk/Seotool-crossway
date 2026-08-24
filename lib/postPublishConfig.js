import prisma from "./prisma.js";
import { canonicalizeSiteKey, isMetaPageId } from "./siteAccess.js";
import { normalizeSiteForMatch } from "./blogPayload.js";

const DEFAULT_POST_CHAIN = ["meta", "webhook", "api", "email"];

export async function getSitePostConfig(siteKey) {
  const raw = String(siteKey || "").trim();
  if (!raw) return null;

  const keys = [raw];
  const canonical = canonicalizeSiteKey(raw);
  if (canonical && canonical !== raw) keys.push(canonical);
  const normalized = normalizeSiteForMatch(raw);
  if (normalized && !keys.includes(normalized)) keys.push(normalized);

  for (const key of keys) {
    const config = await prisma.sitePostConfig.findUnique({ where: { siteKey: key } });
    if (config) return config;
  }
  return null;
}

export function parsePostDeliveryChain(config) {
  const raw = config?.deliveryChain;
  if (Array.isArray(raw) && raw.length) {
    return raw.map((m) => String(m).toLowerCase()).filter(Boolean);
  }
  return DEFAULT_POST_CHAIN;
}

export async function getSitePostConfigForApproval(approval) {
  const candidates = [approval.facebookPageId, approval.siteLink, approval.instagramUserId].filter(Boolean);
  for (const key of candidates) {
    const config = await getSitePostConfig(key);
    if (config) return config;
  }
  return null;
}

export async function upsertSitePostConfig(siteKey, data) {
  const key = canonicalizeSiteKey(siteKey) || String(siteKey || "").trim();
  if (!key) {
    const err = new Error("siteKey is required.");
    err.status = 400;
    throw err;
  }

  const payload = {
    enabled: data.enabled !== undefined ? data.enabled !== false : undefined,
    inboundSecret: data.inboundSecret !== undefined ? String(data.inboundSecret || "").trim() || null : undefined,
    metaPageAccessToken:
      data.metaPageAccessToken !== undefined ? String(data.metaPageAccessToken || "").trim() || null : undefined,
    metaPullEnabled: data.metaPullEnabled !== undefined ? Boolean(data.metaPullEnabled) : undefined,
    facebookPageId: data.facebookPageId !== undefined ? String(data.facebookPageId || "").trim() || null : undefined,
    pageName: data.pageName !== undefined ? String(data.pageName || "").trim() || null : undefined,
    instagramUserId: data.instagramUserId !== undefined ? String(data.instagramUserId || "").trim() || null : undefined,
    emailInboundEnabled: data.emailInboundEnabled !== undefined ? Boolean(data.emailInboundEnabled) : undefined,
    imapHost: data.imapHost !== undefined ? String(data.imapHost || "").trim() || null : undefined,
    imapPort: data.imapPort !== undefined ? Number(data.imapPort) || 993 : undefined,
    imapUser: data.imapUser !== undefined ? String(data.imapUser || "").trim() || null : undefined,
    imapPassword: data.imapPassword !== undefined ? String(data.imapPassword || "").trim() || null : undefined,
    imapFolder: data.imapFolder !== undefined ? String(data.imapFolder || "INBOX").trim() || "INBOX" : undefined,
    deliveryChain: Array.isArray(data.deliveryChain) ? data.deliveryChain : undefined,
    webhookUrl: data.webhookUrl !== undefined ? String(data.webhookUrl || "").trim() || null : undefined,
    webhookSecret: data.webhookSecret !== undefined ? String(data.webhookSecret || "").trim() || null : undefined,
    apiUrl: data.apiUrl !== undefined ? String(data.apiUrl || "").trim() || null : undefined,
    apiKey: data.apiKey !== undefined ? String(data.apiKey || "").trim() || null : undefined,
    apiHeaders: data.apiHeaders !== undefined ? data.apiHeaders : undefined,
    emailRecipients: data.emailRecipients !== undefined ? String(data.emailRecipients || "").trim() || null : undefined,
    publishToFacebook: data.publishToFacebook !== undefined ? Boolean(data.publishToFacebook) : undefined,
    publishToInstagram: data.publishToInstagram !== undefined ? Boolean(data.publishToInstagram) : undefined,
  };

  if (payload.facebookPageId === undefined && isMetaPageId(key)) {
    payload.facebookPageId = key;
  }

  const cleaned = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));

  return prisma.sitePostConfig.upsert({
    where: { siteKey: key },
    create: { siteKey: key, ...cleaned },
    update: cleaned,
  });
}

export function sanitizePostConfigForClient(config) {
  if (!config) return null;
  return {
    siteKey: config.siteKey,
    enabled: config.enabled,
    inboundSecret: config.inboundSecret ? "••••••••" : "",
    metaPageAccessToken: config.metaPageAccessToken ? "••••••••" : "",
    metaPullEnabled: Boolean(config.metaPullEnabled),
    facebookPageId: config.facebookPageId || "",
    pageName: config.pageName || "",
    instagramUserId: config.instagramUserId || "",
    lastMetaPullAt: config.lastMetaPullAt || null,
    emailInboundEnabled: Boolean(config.emailInboundEnabled),
    imapHost: config.imapHost || "",
    imapPort: config.imapPort ?? 993,
    imapUser: config.imapUser || "",
    imapPassword: config.imapPassword ? "••••••••" : "",
    imapFolder: config.imapFolder || "INBOX",
    lastEmailPullAt: config.lastEmailPullAt || null,
    deliveryChain: parsePostDeliveryChain(config),
    webhookUrl: config.webhookUrl || "",
    webhookSecret: config.webhookSecret ? "••••••••" : "",
    apiUrl: config.apiUrl || "",
    apiKey: config.apiKey ? "••••••••" : "",
    apiHeaders: config.apiHeaders || {},
    emailRecipients: config.emailRecipients || "",
    publishToFacebook: config.publishToFacebook !== false,
    publishToInstagram: config.publishToInstagram !== false,
  };
}

/**
 * Resolve Meta access token for publishing: per-page config → env fallback.
 */
export async function resolveMetaAccessTokenForPost(post) {
  const candidates = [post.facebookPageId, post.siteLink, post.instagramUserId].filter(Boolean);
  for (const key of candidates) {
    const config = await getSitePostConfig(key);
    if (config?.metaPageAccessToken) return config.metaPageAccessToken;
  }
  return (process.env.META_PAGE_ACCESS_TOKEN || process.env.META_APP_ACCESS_TOKEN || "").trim() || null;
}
