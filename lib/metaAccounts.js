/**
 * Shared Meta (Facebook / Instagram) account loading for admin pickers.
 * Handles page tokens (empty /me/accounts), field-permission failures,
 * per-page Graph enrichment of known IDs, and DB fallback that never drops live data.
 */
import axios from "axios";
import prisma from "./prisma.js";
import { isMetaPageId } from "./siteAccess.js";
import { upsertSitePostConfig } from "./postPublishConfig.js";

const GRAPH = "https://graph.facebook.com/v20.0";
const FIELDS_CORE = "id,name,website,access_token";
const FIELDS_WITH_IG = "id,name,website,instagram_business_account,access_token";
const FIELDS_ME_PAGE = "id,name,website,category,fan_count,instagram_business_account,access_token";

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

function graphErrorMessage(err, fallback) {
  return err?.response?.data?.error?.message || err?.message || fallback;
}

export function metaTokensFromEnv() {
  const page = String(process.env.META_PAGE_ACCESS_TOKEN || "").trim();
  const app = String(process.env.META_APP_ACCESS_TOKEN || "").trim();
  const out = [];
  if (page) out.push(page);
  if (app && app !== page) out.push(app);
  return out;
}

function uniqueTokens(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list || []) {
    const token = String(raw || "").trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

async function tokensFromSitePostConfigs() {
  try {
    const rows = await prisma.sitePostConfig.findMany({
      where: { AND: [{ metaPageAccessToken: { not: null } }, { metaPageAccessToken: { not: "" } }] },
      select: { metaPageAccessToken: true },
    });
    return rows.map((r) => r.metaPageAccessToken);
  } catch {
    return [];
  }
}

function isPlaceholderPageName(name) {
  const s = String(name || "").trim();
  if (!s) return true;
  if (isMetaPageId(s)) return true;
  if (/^facebook\s*page\s*\d*$/i.test(s)) return true;
  if (/^meta\s*page/i.test(s)) return true;
  if (s.startsWith("http")) return true;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return true;
  return false;
}

function looksLikeFacebookPage(data) {
  if (!data || typeof data !== "object") return false;
  if (data.fan_count != null || data.category) return true;
  if (data.instagram_business_account?.id) return true;
  return false;
}

export function normalizeMetaAccount(page, { source = "graph" } = {}) {
  const id = String(page?.id || page?.facebookPageId || "").trim();
  if (!id || !/^\d+$/.test(id)) return null;
  const ig =
    page?.instagram_business_account?.id ||
    page?.instagramBusinessAccount?.id ||
    page?.instagramUserId ||
    null;
  return {
    id,
    name: page.name || page.userName || "",
    facebookPageId: id,
    instagramUserId: ig ? String(ig).trim() : null,
    siteLink: page.website ? extractFirstUrl(page.website) : page.siteLink || "",
    accessToken: page.access_token || page.accessToken || null,
    source,
  };
}

async function graphGet(path, token, fields, { withLimit = false } = {}) {
  const params = new URLSearchParams();
  params.set("fields", fields);
  params.set("access_token", token);
  if (withLimit) params.set("limit", "100");
  const url = `${GRAPH}${path}?${params.toString()}`;
  const response = await axios.get(url, { timeout: 20000 });
  return response.data;
}

async function graphGetWithFieldFallback(path, token, { withLimit = false } = {}) {
  try {
    return { data: await graphGet(path, token, FIELDS_WITH_IG, { withLimit }), error: null };
  } catch (err) {
    try {
      return { data: await graphGet(path, token, FIELDS_CORE, { withLimit }), error: null };
    } catch (err2) {
      return {
        data: null,
        error: graphErrorMessage(err2, graphErrorMessage(err, `${path} failed`)),
      };
    }
  }
}

/**
 * Fetch pages for one token. Retries without Instagram field if Graph rejects it.
 * Page tokens often cannot list /me/accounts — falls back to /me.
 */
export async function fetchAccountsForToken(token) {
  const accounts = [];
  const errors = [];

  const { data: accountsData, error: accountsError } = await graphGetWithFieldFallback(
    "/me/accounts",
    token,
    { withLimit: true }
  );
  if (accountsError) errors.push(accountsError);

  const rows = Array.isArray(accountsData?.data) ? accountsData.data : [];
  for (const page of rows) {
    const acc = normalizeMetaAccount(page, { source: "graph" });
    if (acc) accounts.push(acc);
  }

  let next = accountsData?.paging?.next;
  let hops = 0;
  while (next && hops < 20 && accounts.length < 500) {
    hops += 1;
    try {
      const pageRes = await axios.get(next, { timeout: 20000 });
      const more = Array.isArray(pageRes.data?.data) ? pageRes.data.data : [];
      for (const page of more) {
        const acc = normalizeMetaAccount(page, { source: "graph" });
        if (acc) accounts.push(acc);
      }
      next = pageRes.data?.paging?.next;
    } catch (err) {
      errors.push(graphErrorMessage(err, "accounts pagination failed"));
      break;
    }
  }

  // Page tokens cannot list /me/accounts. /me is the page itself.
  // User tokens must NOT fall through to /me — that is the person, not a page.
  try {
    const meData = await graphGet("/me", token, FIELDS_ME_PAGE, { withLimit: false });
    if (looksLikeFacebookPage(meData)) {
      const acc = normalizeMetaAccount(meData, { source: "graph" });
      if (acc && !accounts.some((a) => a.facebookPageId === acc.facebookPageId)) {
        accounts.push(acc);
      }
    }
  } catch (err) {
    if (accounts.length === 0) errors.push(graphErrorMessage(err, "/me failed"));
  }

  return { accounts, errors };
}

/** Hydrate known page IDs (from DB) via Graph — works when /me/accounts is empty. */
async function enrichPageIdsFromGraph(pageIds, tokens, byId) {
  const errors = [];
  const ids = [...new Set((pageIds || []).map((id) => String(id || "").trim()).filter((id) => /^\d+$/.test(id)))].slice(
    0,
    200
  );
  if (!ids.length || !tokens.length) return errors;

  for (const id of ids) {
    const existing = byId.get(id);
    const alreadyLive =
      existing?.source === "graph" && existing?.name && !isPlaceholderPageName(existing.name);
    if (alreadyLive && existing?.instagramUserId) continue;

    let hydrated = null;
    for (const token of tokens) {
      const { data, error } = await graphGetWithFieldFallback(`/${id}`, token, { withLimit: false });
      if (error) {
        errors.push(`${id}: ${error}`);
        continue;
      }
      const acc = normalizeMetaAccount(
        {
          ...data,
          website: data?.website || existing?.siteLink || "",
          siteLink: existing?.siteLink || "",
        },
        { source: "graph" }
      );
      if (acc) {
        hydrated = acc;
        if (existing?.siteLink && !hydrated.siteLink) hydrated.siteLink = existing.siteLink;
        break;
      }
    }
    if (hydrated) byId.set(id, hydrated);
  }

  return errors;
}

function rememberDbPage(byId, { id, name, instagramUserId, siteLink }) {
  const pageId = String(id || "").trim();
  if (!isMetaPageId(pageId) || byId.has(pageId)) return;
  const storedName = name && !isPlaceholderPageName(name) ? String(name).trim() : "";
  byId.set(pageId, {
    id: pageId,
    name: storedName,
    facebookPageId: pageId,
    instagramUserId: instagramUserId ? String(instagramUserId).trim() : null,
    siteLink: siteLink && !isMetaPageId(siteLink) ? siteLink : "",
    source: "database",
  });
}

export async function accountsFromDatabase() {
  const [sites, users, accessible, statKeys] = await Promise.all([
    prisma.site.findMany({
      where: {
        AND: [{ facebookPageId: { not: null } }, { facebookPageId: { not: "" } }],
      },
      select: { siteUrl: true, facebookPageId: true, instagramUserId: true },
    }),
    prisma.user.findMany({
      where: {
        isActive: true,
        AND: [{ facebookPageId: { not: null } }, { facebookPageId: { not: "" } }],
      },
      select: {
        name: true,
        email: true,
        siteLink: true,
        facebookPageId: true,
        instagramUserId: true,
      },
    }),
    prisma.userAccessibleSite.findMany({
      select: { siteLink: true },
    }),
    prisma.socialMediaDailyStat.groupBy({
      by: ["siteLink"],
    }),
  ]);

  let configs = [];
  try {
    configs = await prisma.sitePostConfig.findMany({
      select: { siteKey: true, facebookPageId: true, pageName: true, instagramUserId: true },
    });
  } catch {
    configs = await prisma.sitePostConfig.findMany({
      select: { siteKey: true, facebookPageId: true, instagramUserId: true },
    });
  }

  const byId = new Map();
  for (const s of sites) {
    rememberDbPage(byId, {
      id: s.facebookPageId,
      instagramUserId: s.instagramUserId,
      siteLink: s.siteUrl,
    });
  }
  for (const u of users) {
    rememberDbPage(byId, {
      id: u.facebookPageId,
      instagramUserId: u.instagramUserId,
      siteLink: u.siteLink,
    });
  }
  for (const c of configs) {
    rememberDbPage(byId, {
      id: c.facebookPageId || (isMetaPageId(c.siteKey) ? c.siteKey : ""),
      name: c.pageName,
      instagramUserId: c.instagramUserId,
      siteLink: isMetaPageId(c.siteKey) ? "" : c.siteKey,
    });
  }
  for (const row of accessible) {
    rememberDbPage(byId, { id: row.siteLink });
  }
  for (const row of statKeys) {
    rememberDbPage(byId, { id: row.siteLink });
  }
  return [...byId.values()];
}

function mergeAccount(existing, incoming) {
  if (!existing) return incoming;
  return {
    ...existing,
    name:
      incoming.source === "graph" && incoming.name && !isPlaceholderPageName(incoming.name)
        ? incoming.name
        : existing.name && !isPlaceholderPageName(existing.name)
          ? existing.name
          : incoming.name || existing.name,
    instagramUserId: incoming.instagramUserId || existing.instagramUserId || null,
    siteLink: existing.siteLink || incoming.siteLink || "",
    source: incoming.source === "graph" || existing.source === "graph" ? "graph" : existing.source,
  };
}

/**
 * Load Meta accounts from env tokens + DB merge + per-page Graph enrichment.
 * @returns {{ accounts: object[], tokensConfigured: boolean, graphErrors: string[], error: string|null, warning: string|null, stats: object }}
 */
export async function loadMetaAccounts({ includeDatabase = true } = {}) {
  const tokens = uniqueTokens([...metaTokensFromEnv(), ...(await tokensFromSitePostConfigs())]);
  const byId = new Map();
  const graphErrors = [];

  // 1) Live list from every configured token (do not stop after the first hit)
  for (const token of tokens) {
    try {
      const { accounts, errors } = await fetchAccountsForToken(token);
      graphErrors.push(...errors);
      for (const acc of accounts) {
        byId.set(acc.facebookPageId, mergeAccount(byId.get(acc.facebookPageId), acc));
      }
    } catch (err) {
      graphErrors.push(graphErrorMessage(err, "token fetch failed"));
    }
  }

  // 2) Known pages from DB — never throw away Graph results if DB fails
  let dbAccounts = [];
  if (includeDatabase) {
    try {
      dbAccounts = await accountsFromDatabase();
      for (const acc of dbAccounts) {
        byId.set(acc.facebookPageId, mergeAccount(byId.get(acc.facebookPageId), acc));
      }
    } catch (err) {
      graphErrors.push(`database: ${graphErrorMessage(err, "DB lookup failed")}`);
    }
  }

  // 3) Hydrate DB / sparse rows via GET /{page-id} (works when /me/accounts is empty)
  if (tokens.length && byId.size > 0) {
    try {
      const enrichErrors = await enrichPageIdsFromGraph([...byId.keys()], tokens, byId);
      graphErrors.push(...enrichErrors.slice(0, 8));
    } catch (err) {
      graphErrors.push(graphErrorMessage(err, "page enrichment failed"));
    }
  }

  const accounts = [...byId.values()]
    .filter((a) => a.facebookPageId)
    .map((a) => ({
      ...a,
      name: isPlaceholderPageName(a.name) ? "" : a.name,
    }))
    .sort((a, b) =>
      String(a.name || a.facebookPageId || "").localeCompare(String(b.name || b.facebookPageId || ""))
    );
  const graphCount = accounts.filter((a) => a.source === "graph").length;
  const databaseCount = accounts.filter((a) => a.source === "database").length;

  let error = null;
  let warning = null;
  if (!tokens.length && accounts.length === 0) {
    error =
      "No META_PAGE_ACCESS_TOKEN (or META_APP_ACCESS_TOKEN) is set in the server environment.";
  } else if (accounts.length === 0) {
    error = `Could not load Meta pages: ${
      graphErrors.filter(Boolean)[0] || "Meta Graph returned no pages for this token."
    }`;
  } else if (tokens.length && graphCount === 0) {
    warning = `Showing ${databaseCount} page(s) from the database only. Graph live lookup failed${
      graphErrors[0] ? `: ${graphErrors[0]}` : "."
    }`;
  }

  return {
    accounts,
    tokensConfigured: tokens.length > 0,
    graphErrors: graphErrors.filter(Boolean).slice(0, 12),
    error,
    warning,
    stats: {
      total: accounts.length,
      graph: graphCount,
      database: databaseCount,
      tokens: tokens.length,
    },
  };
}

/**
 * Write Graph (or hydrated) pages into SitePostConfig so they remain projects
 * even when the next live lookup returns nothing.
 */
export async function persistFetchedMetaPages(accounts) {
  const list = Array.isArray(accounts) ? accounts : [];
  let persisted = 0;
  for (const acc of list) {
    const id = String(acc?.facebookPageId || acc?.id || "").trim();
    if (!isMetaPageId(id)) continue;
    const pageName = acc?.name && !isPlaceholderPageName(acc.name) ? String(acc.name).trim() : undefined;
    const instagramUserId = acc?.instagramUserId ? String(acc.instagramUserId).trim() : undefined;
    const token = acc?.accessToken ? String(acc.accessToken).trim() : undefined;
    const data = {
      facebookPageId: id,
      ...(pageName ? { pageName } : {}),
      ...(instagramUserId ? { instagramUserId } : {}),
      ...(token ? { metaPageAccessToken: token } : {}),
    };
    try {
      await upsertSitePostConfig(id, data);
      persisted += 1;
    } catch {
      try {
        const { pageName: _ignored, ...withoutName } = data;
        await upsertSitePostConfig(id, withoutName);
        persisted += 1;
      } catch (err) {
        console.warn("Could not persist Meta page", id, err?.message || err);
      }
    }
  }
  return persisted;
}

/** Live Graph fetch, persist page IDs/names, then reload so All projects can list them. */
export async function fetchAndPersistMetaPages() {
  const loaded = await loadMetaAccounts({ includeDatabase: true });
  const persisted = await persistFetchedMetaPages(loaded.accounts);
  const reloaded = await loadMetaAccounts({ includeDatabase: true });
  return { ...reloaded, persisted };
}
