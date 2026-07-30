import { requireGlobalSiteAccess } from "../../../../lib/adminAuth";
import prisma from "../../../../lib/prisma";
import axios from "axios";

export const runtime = "nodejs";

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

function metaTokens() {
  const page = String(process.env.META_PAGE_ACCESS_TOKEN || "").trim();
  const app = String(process.env.META_APP_ACCESS_TOKEN || "").trim();
  const out = [];
  if (page) out.push(page);
  if (app && app !== page) out.push(app);
  return out;
}

function normalizeAccount(page) {
  const id = String(page?.id || page?.facebookPageId || "").trim();
  if (!id) return null;
  return {
    id,
    name: page.name || page.userName || `Facebook Page ${id}`,
    facebookPageId: id,
    instagramUserId: page.instagram_business_account?.id || page.instagramUserId || null,
    siteLink: page.website ? extractFirstUrl(page.website) : page.siteLink || "",
  };
}

async function fetchAccountsForToken(token) {
  const accounts = [];
  const errors = [];

  try {
    const url = `https://graph.facebook.com/v20.0/me/accounts?fields=id,name,website,instagram_business_account&limit=100&access_token=${encodeURIComponent(token)}`;
    const response = await axios.get(url);
    const rows = Array.isArray(response.data?.data) ? response.data.data : [];
    for (const page of rows) {
      const acc = normalizeAccount(page);
      if (acc) accounts.push(acc);
    }
  } catch (err) {
    errors.push(err.response?.data?.error?.message || err.message || "me/accounts failed");
  }

  // Page tokens / single-page tokens often cannot list /me/accounts — resolve /me instead.
  if (accounts.length === 0) {
    try {
      const url = `https://graph.facebook.com/v20.0/me?fields=id,name,website,instagram_business_account&access_token=${encodeURIComponent(token)}`;
      const response = await axios.get(url);
      const acc = normalizeAccount(response.data);
      if (acc) accounts.push(acc);
    } catch (err) {
      errors.push(err.response?.data?.error?.message || err.message || "me failed");
    }
  }

  return { accounts, errors };
}

async function accountsFromDatabase() {
  const [sites, users] = await Promise.all([
    prisma.site.findMany({
      where: { facebookPageId: { not: null } },
      select: { siteUrl: true, facebookPageId: true, instagramUserId: true },
    }),
    prisma.user.findMany({
      where: { facebookPageId: { not: null }, isActive: true },
      select: { name: true, email: true, siteLink: true, facebookPageId: true, instagramUserId: true },
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

export async function GET() {
  try {
    await requireGlobalSiteAccess();

    const tokens = metaTokens();
    const byId = new Map();
    const graphErrors = [];

    for (const token of tokens) {
      const { accounts, errors } = await fetchAccountsForToken(token);
      for (const acc of accounts) {
        if (!byId.has(acc.facebookPageId)) byId.set(acc.facebookPageId, acc);
      }
      graphErrors.push(...errors);
      if (byId.size > 0) break;
    }

    // Always merge known pages from DB so User Management stays usable if Graph is down.
    for (const acc of await accountsFromDatabase()) {
      if (!byId.has(acc.facebookPageId)) byId.set(acc.facebookPageId, acc);
    }

    const accounts = [...byId.values()];

    if (!tokens.length && accounts.length === 0) {
      return Response.json(
        {
          accounts: [],
          error:
            "No META_PAGE_ACCESS_TOKEN (or META_APP_ACCESS_TOKEN) is set in the server environment.",
        },
        { status: 200 }
      );
    }

    if (accounts.length === 0) {
      const detail = graphErrors.filter(Boolean)[0] || "Meta Graph returned no pages for this token.";
      return Response.json(
        {
          accounts: [],
          error: `Could not load Meta pages: ${detail}`,
        },
        { status: 200 }
      );
    }

    return Response.json({ accounts });
  } catch (error) {
    const msg = error.message || "Failed to fetch Meta accounts";
    const forbidden =
      msg === "Unauthorized" ||
      msg.includes("Forbidden") ||
      msg.includes("Insufficient permissions") ||
      msg.includes("Super admin");
    return Response.json({ error: msg, accounts: [] }, { status: forbidden ? 403 : 500 });
  }
}
