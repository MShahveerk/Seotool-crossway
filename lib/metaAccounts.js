/**
 * Shared Meta (Facebook / Instagram) account loading for admin pickers.
 * Handles page tokens (empty /me/accounts), field-permission failures, and DB fallback.
 */
import axios from "axios";
import prisma from "./prisma.js";

const GRAPH = "https://graph.facebook.com/v20.0";
const FIELDS_CORE = "id,name,website";
const FIELDS_WITH_IG = "id,name,website,instagram_business_account";

function extractFirstUrl(text) {
  if (!text) return "";
  const match = String(text).match(/https?:\/\/[^\s,;]+/i);
  if (match) return match[0];
  const domainMatch = String(text).match(
    /[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/[^\s,;]*)?/i
  );
  if (domainMatch) return `https://${domainMatch[0]}`;
  return text;
}

export function metaTokensFromEnv() {
  const page = String(process.env.META_PAGE_ACCESS_TOKEN || "").trim();
  const app = String(process.env.META_APP_ACCESS_TOKEN || "").trim();
  const out = [];
  if (page) out.push(page);
  if (app && app !== page) out.push(app);
  return out;
}

export function normalizeMetaAccount(page, { source = "graph" } = {}) {
  const id = String(page?.id || page?.facebookPageId || "").trim();
  if (!id) return null;
  const ig =
    page?.instagram_business_account?.id ||
    page?.instagramBusinessAccount?.id ||
    page?.instagramUserId ||
    null;
  return {
    id,
    name: page.name || page.userName || `Facebook Page ${id}`,
    facebookPageId: id,
    instagramUserId: ig ? String(ig).trim() : null,
    siteLink: page.website ? extractFirstUrl(page.website) : page.siteLink || "",
    source,
  };
}

async function graphGet(path, token, fields) {
  const url = `${GRAPH}${path}?fields=${encodeURIComponent(fields)}&limit=100&access_token=${encodeURIComponent(token)}`;
  const response = await axios.get(url, { timeout: 20000 });
  return response.data;
}

/**
 * Fetch pages for one token. Retries without Instagram field if Graph rejects it.
 * Page tokens often return empty /me/accounts — falls back to /me.
 */
export async function fetchAccountsForToken(token) {
  const accounts = [];
  const errors = [];

  const tryAccounts = async (fields) => {
    const data = await graphGet("/me/accounts", token, fields);
    const rows = Array.isArray(data?.data) ? data.data : [];
    for (const page of rows) {
      const acc = normalizeMetaAccount(page);
      if (acc) accounts.push(acc);
    }
    // Paginate a couple of pages if needed
    let next = data?.paging?.next;
    let hops = 0;
    while (next && hops < 5 && accounts.length < 500) {
      hops += 1;
      const pageRes = await axios.get(next, { timeout: 20000 });
      const more = Array.isArray(pageRes.data?.data) ? pageRes.data.data : [];
      for (const page of more) {
        const acc = normalizeMetaAccount(page);
        if (acc) accounts.push(acc);
      }
      next = pageRes.data?.paging?.next;
    }
  };

  try {
    await tryAccounts(FIELDS_WITH_IG);
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message || "me/accounts failed";
    errors.push(msg);
    try {
      await tryAccounts(FIELDS_CORE);
      errors.pop();
    } catch (err2) {
      errors.push(err2.response?.data?.error?.message || err2.message || "me/accounts (core) failed");
    }
  }

  // Page / system-user page tokens often cannot list /me/accounts — resolve /me.
  if (accounts.length === 0) {
    try {
      const data = await graphGet("/me", token, FIELDS_WITH_IG);
      const acc = normalizeMetaAccount(data);
      if (acc) accounts.push(acc);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || "me failed";
      errors.push(msg);
      try {
        const data = await graphGet("/me", token, FIELDS_CORE);
        const acc = normalizeMetaAccount(data);
        if (acc) accounts.push(acc);
        if (accounts.length) errors.pop();
      } catch (err2) {
        errors.push(err2.response?.data?.error?.message || err2.message || "me (core) failed");
      }
    }
  }

  return { accounts, errors };
}

export async function accountsFromDatabase() {
  const [sites, users] = await Promise.all([
    prisma.site.findMany({
      where: { facebookPageId: { not: null } },
      select: { siteUrl: true, facebookPageId: true, instagramUserId: true },
    }),
    prisma.user.findMany({
      where: { facebookPageId: { not: null }, isActive: true },
      select: {
        name: true,
        email: true,
        siteLink: true,
        facebookPageId: true,
        instagramUserId: true,
      },
    }),
  ]);

  const byId = new Map();
  for (const s of sites) {
    const id = String(s.facebookPageId || "").trim();
    if (!id || byId.has(id)) continue;
    byId.set(id, {
      id,
      name: s.siteUrl || `Facebook Page ${id}`,
      facebookPageId: id,
      instagramUserId: s.instagramUserId || null,
      siteLink: s.siteUrl || "",
      source: "database",
    });
  }
  for (const u of users) {
    const id = String(u.facebookPageId || "").trim();
    if (!id || byId.has(id)) continue;
    byId.set(id, {
      id,
      name: u.name || u.email || `Facebook Page ${id}`,
      facebookPageId: id,
      instagramUserId: u.instagramUserId || null,
      siteLink: u.siteLink || "",
      source: "database",
    });
  }
  return [...byId.values()];
}

/**
 * Load Meta accounts from env tokens + DB merge.
 * @returns {{ accounts: object[], tokensConfigured: boolean, graphErrors: string[], error: string|null }}
 */
export async function loadMetaAccounts({ includeDatabase = true } = {}) {
  const tokens = metaTokensFromEnv();
  const byId = new Map();
  const graphErrors = [];

  for (const token of tokens) {
    const { accounts, errors } = await fetchAccountsForToken(token);
    for (const acc of accounts) {
      if (!byId.has(acc.facebookPageId)) byId.set(acc.facebookPageId, acc);
    }
    graphErrors.push(...errors);
    // Keep trying other tokens if this one yielded nothing
    if (byId.size > 0) break;
  }

  if (includeDatabase) {
    for (const acc of await accountsFromDatabase()) {
      const existing = byId.get(acc.facebookPageId);
      if (!existing) {
        byId.set(acc.facebookPageId, acc);
      } else {
        // Fill missing IG / site link from DB
        if (!existing.instagramUserId && acc.instagramUserId) {
          existing.instagramUserId = acc.instagramUserId;
        }
        if (!existing.siteLink && acc.siteLink) existing.siteLink = acc.siteLink;
        if ((!existing.name || existing.name.startsWith("Facebook Page")) && acc.name) {
          existing.name = acc.name;
        }
      }
    }
  }

  const accounts = [...byId.values()];
  let error = null;
  if (!tokens.length && accounts.length === 0) {
    error =
      "No META_PAGE_ACCESS_TOKEN (or META_APP_ACCESS_TOKEN) is set in the server environment.";
  } else if (accounts.length === 0) {
    error = `Could not load Meta pages: ${
      graphErrors.filter(Boolean)[0] || "Meta Graph returned no pages for this token."
    }`;
  }

  return {
    accounts,
    tokensConfigured: tokens.length > 0,
    graphErrors,
    error,
  };
}
