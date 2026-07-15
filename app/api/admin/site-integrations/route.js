import { requireSuperAdmin, requirePermission } from "../../../../lib/middleware/auth";
import { assignAccessibleSites, assignSiteLink, getAllUsers, getUserById } from "../../../../lib/auth";
import { getSearchAnalyticsTimeSeries } from "../../../../lib/searchconsole";
import { normalizeSiteOrigin } from "../../../../lib/validation";
import { PERMISSIONS, ROLES } from "../../../../lib/rbac";
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
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();
    const globalSites = await prisma.site.findMany();

    // Fetch Meta accounts from token
    const metaToken = process.env.META_PAGE_ACCESS_TOKEN || process.env.META_APP_ACCESS_TOKEN;
    let metaAccounts = [];
    if (metaToken) {
      try {
        const url = `https://graph.facebook.com/v20.0/me/accounts?fields=id,name,instagram_business_account&access_token=${metaToken}`;
        const res = await axios.get(url);
        if (res.data?.data) {
          metaAccounts = res.data.data.map(page => ({
            userId: null,
            userName: page.name,
            userEmail: "",
            siteLink: "",
            facebookPageId: page.id,
            instagramUserId: page.instagram_business_account?.id || "",
            isSuperAdminSite: false,
          }));
        }
      } catch (err) {
        try {
          const url = `https://graph.facebook.com/v20.0/me?fields=id,name,instagram_business_account&access_token=${metaToken}`;
          const res = await axios.get(url);
          if (res.data?.id) {
            metaAccounts = [{
              userId: null,
              userName: res.data.name || "Configured Page",
              userEmail: "",
              siteLink: "",
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

    const siteEntries = [
      ...users
        .filter((u) => Boolean(u.siteLink) || Boolean(u.facebookPageId) || Boolean(u.instagramUserId))
        .map((u) => ({
          userId: u.id,
          userName: u.name || u.email,
          userEmail: u.email,
          siteLink: u.siteLink || "",
          facebookPageId: u.facebookPageId || "",
          instagramUserId: u.instagramUserId || "",
          isSuperAdminSite: u.id === session.user.id,
        })),
      ...globalSites.map((s) => ({
          userId: null,
          userName: s.siteUrl,
          userEmail: "",
          siteLink: s.siteUrl,
          facebookPageId: s.facebookPageId || "",
          instagramUserId: s.instagramUserId || "",
          isSuperAdminSite: false,
      })),
      ...metaAccounts
    ];

    let filteredEntries = siteEntries;
    if (session.user.role === ROLES.SMM) {
      const allowed = new Set(
        (session.user.accessibleSites || []).map((s) => s.toLowerCase().trim()).filter(Boolean)
      );
      const ownLink = (session.user.siteLink || "").toLowerCase().trim();
      if (ownLink) allowed.add(ownLink);

      filteredEntries = siteEntries.filter((entry) => {
        const link = (entry.siteLink || "").toLowerCase().trim();
        const fb = (entry.facebookPageId || "").toLowerCase().trim();
        const ig = (entry.instagramUserId || "").toLowerCase().trim();
        return (link && allowed.has(link)) || (fb && allowed.has(fb)) || (ig && allowed.has(ig));
      });
    }

    const uniqueEntries = [];
    const seen = new Set();
    for (const entry of filteredEntries) {
      const key = entry.facebookPageId || entry.siteLink;
      if (key && !seen.has(key)) {
        seen.add(key);
        uniqueEntries.push(entry);
      }
    }

    uniqueEntries.sort((a, b) => {
      if (a.isSuperAdminSite && !b.isSuperAdminSite) return -1;
      if (!a.isSuperAdminSite && b.isSuperAdminSite) return 1;
      const nameA = a.facebookPageId || a.siteLink;
      const nameB = b.facebookPageId || b.siteLink;
      return nameA.localeCompare(nameB);
    });

    return new Response(
      JSON.stringify({
        sites: uniqueEntries,
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

