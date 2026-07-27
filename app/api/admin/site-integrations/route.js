import { requireSuperAdmin, requirePermission } from "../../../../lib/middleware/auth";
import { assignAccessibleSites, assignSiteLink, getAllUsers, getUserById } from "../../../../lib/auth";
import { getSearchAnalyticsTimeSeries } from "../../../../lib/searchconsole";
import { normalizeSiteOrigin } from "../../../../lib/validation";
import { PERMISSIONS, ROLES } from "../../../../lib/rbac";
import { isMetaPageId, pickClientDisplayName, canonicalizeSiteKey } from "../../../../lib/siteAccess";
import { mergeClientAccountEntries } from "../../../../lib/clientAccountList";
import prisma from "../../../../lib/prisma";
import axios from "axios";

function resolveSiteProperty(siteUrl, propertyId) {
  const rawProperty = String(propertyId || "").trim();
  if (rawProperty) {
    if (rawProperty.startsWith("sc-domain:")) {
      return rawProperty;
    }
    const normalized = normalizeSiteOrigin(rawProperty);
    if (normalized) return normalized;
  }

  const rawUrl = String(siteUrl || "").trim();
  if (!rawUrl) return null;
  return normalizeSiteOrigin(rawUrl);
}

function extractVerificationValue(code) {
  const raw = String(code || "").trim();
  if (!raw) return "";
  if (raw.startsWith("google-site-verification=")) {
    return raw.split("=").slice(1).join("=").trim();
  }
  return raw;
}

function isEmailLike(value) {
  const raw = String(value || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
}

async function verifySiteOwnershipToken(siteUrl, verificationCode) {
  const token = extractVerificationValue(verificationCode);
  if (!token) return { ok: false, reason: "Verification code is required." };
  const normalized = normalizeSiteOrigin(siteUrl);
  if (!normalized) return { ok: false, reason: "A valid site URL is required for verification." };

  try {
    const res = await fetch(normalized, { method: "GET", cache: "no-store" });
    if (!res.ok) {
      return { ok: false, reason: "Could not fetch site homepage to verify ownership." };
    }
    const html = await res.text();
    const hasToken =
      html.includes(`google-site-verification=${token}`) ||
      html.includes(`content="${token}"`) ||
      html.includes(`content='${token}'`) ||
      html.includes(token);
    if (!hasToken) {
      return { ok: false, reason: "Verification token was not found on site homepage." };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "Failed to validate verification token from site." };
  }
}

function getLast28Days() {
  const endDate = new Date();
  const startDate = new Date();
  const offset = 28;
  startDate.setDate(startDate.getDate() - offset);

  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  return {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
  };
}

// GET /api/admin/site-integrations - Return integrated sites for current super admin or SMM
export async function GET() {
  try {
    const session = await requirePermission(PERMISSIONS.VIEW_ALL_DATA);
    const users = await getAllUsers(true);
    const currentSuperAdmin = users.find((u) => u.id === session.user.id) || null;

    // Fetch Global Sites
    const globalSites = await prisma.site.findMany();

    // Fetch Meta accounts from token
    const metaToken = process.env.META_PAGE_ACCESS_TOKEN || process.env.META_APP_ACCESS_TOKEN;
    let metaAccounts = [];

    const extractFirstUrl = (text) => {
      if (!text) return "";
      const match = String(text).match(/https?:\/\/[^\s,;]+/i);
      if (match) return match[0];
      const domainMatch = String(text).match(/[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/[^\s,;]*)?/i);
      if (domainMatch) return `https://${domainMatch[0]}`;
      return text;
    };

    if (metaToken) {
      try {
        const url = `https://graph.facebook.com/v20.0/me/accounts?fields=id,name,website,instagram_business_account&access_token=${metaToken}`;
        const res = await axios.get(url);
        if (res.data?.data) {
          metaAccounts = res.data.data.map(page => ({
            userId: null,
            userName: page.name,
            userEmail: "",
            siteLink: page.website ? extractFirstUrl(page.website) : "",
            facebookPageId: page.id,
            instagramUserId: page.instagram_business_account?.id || "",
            isSuperAdminSite: false,
          }));
        }
      } catch (err) {
        try {
          const url = `https://graph.facebook.com/v20.0/me?fields=id,name,website,instagram_business_account&access_token=${metaToken}`;
          const res = await axios.get(url);
          if (res.data?.id) {
            metaAccounts = [{
              userId: null,
              userName: res.data.name || "Configured Page",
              userEmail: "",
              siteLink: res.data.website ? extractFirstUrl(res.data.website) : "",
              facebookPageId: res.data.id,
              instagramUserId: res.data.instagram_business_account?.id || "",
              isSuperAdminSite: false,
            }];
          }
        } catch (innerErr) {
          console.error("Failed to fetch meta accounts for site integrations", innerErr.message);
        }
      }
    }

    // 1. Build Websites List
    const websitesList = [];
    const seenWebsites = new Set();

    for (const s of globalSites) {
      if (s.siteUrl) {
        const norm = canonicalizeSiteKey(s.siteUrl);
        if (norm && !seenWebsites.has(norm)) {
          seenWebsites.add(norm);
          websitesList.push({
            userId: null,
            userName: s.siteUrl,
            userEmail: "",
            siteLink: s.siteUrl,
            facebookPageId: s.facebookPageId || "",
            instagramUserId: s.instagramUserId || "",
            isSuperAdminSite: false,
            type: "website"
          });
        }
      }
    }

    for (const u of users) {
      if (u.siteLink) {
        const norm = canonicalizeSiteKey(u.siteLink);
        if (norm && !seenWebsites.has(norm)) {
          seenWebsites.add(norm);
          websitesList.push({
            userId: u.id,
            userName: u.siteLink,
            userEmail: u.email,
            siteLink: u.siteLink,
            facebookPageId: u.facebookPageId || "",
            instagramUserId: u.instagramUserId || "",
            isSuperAdminSite: u.id === session.user.id,
            type: "website"
          });
        }
      }
    }

    // 2. Build Meta Pages List
    const metaPagesList = [];
    const seenMetaPages = new Set();

    for (const page of metaAccounts) {
      if (page.facebookPageId) {
        const pageId = String(page.facebookPageId).trim();
        if (!seenMetaPages.has(pageId)) {
          seenMetaPages.add(pageId);
          metaPagesList.push({
            userId: null,
            userName: page.userName || page.name,
            userEmail: "",
            siteLink: page.siteLink || "",
            facebookPageId: page.facebookPageId,
            instagramUserId: page.instagramUserId || "",
            isSuperAdminSite: false,
            type: "meta_page"
          });
        }
      }
    }

    // 3. Filter lists by role — SMM sees ONLY explicitly assigned client accounts
    if (session.user.role === ROLES.SMM) {
      const smmUser = await getUserById(session.user.id);
      const assignedKeys = Array.from(
        new Set(
          (smmUser?.accessibleSites || [])
            .map((s) => String(s || "").trim())
            .filter(Boolean)
        )
      );

      const lookupByFbId = new Map(
        metaAccounts
          .filter((m) => m.facebookPageId)
          .map((m) => [String(m.facebookPageId).trim(), m])
      );
      const lookupBySiteUrl = new Map(
        [...websitesList, ...metaPagesList]
          .filter((e) => e.siteLink)
          .map((e) => [String(e.siteLink).toLowerCase().trim(), e])
      );

      const smmEntries = [];
      const seenValues = new Set();

      for (const key of assignedKeys) {
        const val = isMetaPageId(key) ? String(key).trim() : key;
        if (seenValues.has(val)) continue;
        seenValues.add(val);

        let entry;
        if (isMetaPageId(val)) {
          const meta = lookupByFbId.get(val);
          entry = {
            userId: null,
            userName: meta?.userName || "",
            userEmail: "",
            siteLink: meta?.siteLink || "",
            facebookPageId: val,
            instagramUserId: meta?.instagramUserId || "",
            isSuperAdminSite: false,
            type: "meta_page",
          };
        } else {
          const norm = val.toLowerCase().trim();
          const known = lookupBySiteUrl.get(norm);
          entry = known
            ? { ...known, type: known.type || "website" }
            : {
                userId: null,
                userName: val,
                userEmail: "",
                siteLink: val,
                facebookPageId: "",
                instagramUserId: "",
                isSuperAdminSite: false,
                type: "website",
              };
        }

        const metaMatch = lookupByFbId.get(String(entry.facebookPageId || "").trim());
        const displayName = pickClientDisplayName({
          userName: entry.userName,
          siteLink: entry.siteLink,
          facebookPageId: entry.facebookPageId,
          metaName: metaMatch?.userName,
        });
        smmEntries.push({ ...entry, userName: displayName, displayName });
      }

      smmEntries.sort((a, b) =>
        (a.displayName || a.userName || "").localeCompare(b.displayName || b.userName || "")
      );

      const dedupedSmm = mergeClientAccountEntries(smmEntries);

      return new Response(
        JSON.stringify({
          sites: dedupedSmm,
          superAdminSite: null,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    let filteredWebsites = websitesList;
    let filteredMetaPages = metaPagesList;

    const uniqueEntries = [...filteredWebsites, ...filteredMetaPages].map((entry) => {
      const metaMatch = metaAccounts.find(
        (a) =>
          a.facebookPageId &&
          entry.facebookPageId &&
          String(a.facebookPageId).trim() === String(entry.facebookPageId).trim()
      );
      const displayName = pickClientDisplayName({
        userName: entry.userName,
        siteLink: entry.siteLink,
        facebookPageId: entry.facebookPageId,
        metaName: metaMatch?.userName || metaMatch?.name,
      });
      return {
        ...entry,
        userName: displayName,
        displayName,
      };
    });

    // Sort to keep super admin site first, then websites, then meta pages
    uniqueEntries.sort((a, b) => {
      if (a.isSuperAdminSite && !b.isSuperAdminSite) return -1;
      if (!a.isSuperAdminSite && b.isSuperAdminSite) return 1;
      if (a.type === "website" && b.type === "meta_page") return -1;
      if (a.type === "meta_page" && b.type === "website") return 1;
      const nameA = a.displayName || a.userName || "";
      const nameB = b.displayName || b.userName || "";
      return nameA.localeCompare(nameB);
    });

    const dedupedEntries = mergeClientAccountEntries(uniqueEntries);

    return new Response(
      JSON.stringify({
        sites: dedupedEntries,
        superAdminSite: currentSuperAdmin?.facebookPageId || currentSuperAdmin?.siteLink || null,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    if (error.message === "Unauthorized" || error.message.includes("Super admin")) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Super admin access required" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: error.message || "Failed to fetch integrations" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// POST /api/admin/site-integrations - Add site integration and validate by fetching live stats
export async function POST(req) {
  try {
    await requireSuperAdmin();
    const body = await req.json();
    const { userId, siteUrl, propertyId, verificationCode, emailOrVerification } = body || {};

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId is required." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const targetUser = await getUserById(userId);
    if (!targetUser) {
      return new Response(
        JSON.stringify({ error: "User not found." }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const resolvedProperty = resolveSiteProperty(siteUrl, propertyId);
    if (!resolvedProperty) {
      return new Response(
        JSON.stringify({
          error: "Provide a valid Property ID (for example sc-domain:example.com) or Site URL.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const optionalVerificationInput = String(
      emailOrVerification !== undefined ? emailOrVerification : verificationCode || ""
    ).trim();

    if (optionalVerificationInput) {
      if (isEmailLike(optionalVerificationInput)) {
        if (optionalVerificationInput.toLowerCase() !== String(targetUser.email || "").toLowerCase()) {
          return new Response(
            JSON.stringify({
              error: "Email verification failed.",
              details: "Provided email must match the selected user email.",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
      } else {
        const ownership = await verifySiteOwnershipToken(siteUrl || resolvedProperty, optionalVerificationInput);
        if (!ownership.ok) {
          return new Response(
            JSON.stringify({
              error: "Site ownership verification failed.",
              details: ownership.reason,
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
      }
    }

    // Validate integration by fetching live Search Console data immediately
    const { startDate, endDate } = getLast28Days();
    const report = await getSearchAnalyticsTimeSeries(resolvedProperty, startDate, endDate);

    await assignSiteLink(userId, resolvedProperty);
    await assignAccessibleSites(userId, [resolvedProperty]);

    return new Response(
      JSON.stringify({
        message: "Site integrated successfully. Live stats fetched.",
        userId,
        site: resolvedProperty,
        preview: {
          totalClicks: report?.totals?.clicks || 0,
          totalImpressions: report?.totals?.impressions || 0,
          averageCtr: report?.totals?.averageCtr || 0,
          averagePosition: report?.totals?.averagePosition || 0,
          dateRange: { startDate, endDate },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    if (error.message === "Unauthorized" || error.message.includes("Super admin")) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Super admin access required" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        error: "Site integration failed.",
        details: error.message || "Unable to validate credentials/property.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// PATCH /api/admin/site-integrations - Edit an existing integrated site
export async function PATCH(req) {
  try {
    await requireSuperAdmin();
    const body = await req.json();
    const { userId, siteUrl, propertyId, verificationCode, emailOrVerification } = body || {};

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId is required for editing integration." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const targetUser = await getUserById(userId);
    if (!targetUser) {
      return new Response(
        JSON.stringify({ error: "User not found." }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const resolvedProperty = resolveSiteProperty(siteUrl, propertyId);
    if (!resolvedProperty) {
      return new Response(
        JSON.stringify({ error: "Provide a valid Property ID or Site URL." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const optionalVerificationInput = String(
      emailOrVerification !== undefined ? emailOrVerification : verificationCode || ""
    ).trim();

    if (optionalVerificationInput) {
      if (isEmailLike(optionalVerificationInput)) {
        if (optionalVerificationInput.toLowerCase() !== String(targetUser.email || "").toLowerCase()) {
          return new Response(
            JSON.stringify({
              error: "Email verification failed.",
              details: "Provided email must match the selected user email.",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
      } else {
        const ownership = await verifySiteOwnershipToken(siteUrl || resolvedProperty, optionalVerificationInput);
        if (!ownership.ok) {
          return new Response(
            JSON.stringify({
              error: "Site ownership verification failed.",
              details: ownership.reason,
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
      }
    }

    const { startDate, endDate } = getLast28Days();
    const report = await getSearchAnalyticsTimeSeries(resolvedProperty, startDate, endDate);

    await assignSiteLink(userId, resolvedProperty);
    await assignAccessibleSites(userId, [resolvedProperty]);

    return new Response(
      JSON.stringify({
        message: "Site integration updated successfully.",
        userId,
        site: resolvedProperty,
        preview: {
          totalClicks: report?.totals?.clicks || 0,
          totalImpressions: report?.totals?.impressions || 0,
          averageCtr: report?.totals?.averageCtr || 0,
          averagePosition: report?.totals?.averagePosition || 0,
          dateRange: { startDate, endDate },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    if (error.message === "Unauthorized" || error.message.includes("Super admin")) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Super admin access required" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        error: "Site integration update failed.",
        details: error.message || "Unable to validate credentials/property.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

