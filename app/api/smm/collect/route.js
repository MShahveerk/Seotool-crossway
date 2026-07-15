import prisma from "../../../../lib/prisma";
import { normalizeSiteOrigin } from "../../../../lib/validation";

export const runtime = "nodejs";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,x-smm-secret",
};

function toDateOnly(value) {
  const d = value ? new Date(value) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function normalizePlatform(value) {
  return String(value || "").trim().toLowerCase();
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function POST(req) {
  try {
    const isProd = process.env.NODE_ENV === "production";
    const configuredSecret = (process.env.SMM_COLLECT_SECRET || "").trim();
    const incomingSecret = (req.headers.get("x-smm-secret") || "").trim();

    if (isProd && !configuredSecret) {
      return new Response(
        JSON.stringify({
          error: "SMM ingestion is disabled: set SMM_COLLECT_SECRET in production.",
        }),
        { status: 503, headers: CORS_HEADERS }
      );
    }

    if (configuredSecret && incomingSecret !== configuredSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized ingestion request." }), {
        status: 401,
        headers: CORS_HEADERS,
      });
    }

    const body = await req.json();
    const {
      gtmContainerId,
      siteUrl,
      stats,
      platform,
      accountName,
      accountHandle,
      date,
      followers,
      reach,
      engagements,
      queuedPosts,
      queuedReels,
      source = "gtm",
    } = body || {};

    const normalizedSite = normalizeSiteOrigin(siteUrl);
    if (!normalizedSite) {
      return new Response(JSON.stringify({ error: "Valid siteUrl is required." }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    if (!gtmContainerId) {
      return new Response(JSON.stringify({ error: "gtmContainerId is required." }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const globalSite = await prisma.site.findUnique({
      where: { siteUrl: normalizedSite }
    });

    const isGtmValid =
      (globalSite && globalSite.gtmContainerId === String(gtmContainerId).trim());

    let user = await prisma.user.findFirst({
      where: isGtmValid ? { siteLink: normalizedSite } : {
        gtmContainerId: String(gtmContainerId).trim(),
        siteLink: normalizedSite,
      },
      select: { id: true },
    });

    if (!user && isGtmValid) {
      // Fallback for disassociated setup: use the first super admin to satisfy foreign key constraints
      user = await prisma.user.findFirst({
        where: { role: "super_admin" },
        select: { id: true },
      });
    }

    if (!user) {
      return new Response(
        JSON.stringify({ error: "No integrated user found for this site (or GTM container mismatch)." }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const rows = Array.isArray(stats)
      ? stats
      : [{
          platform,
          accountName,
          accountHandle,
          date,
          followers,
          reach,
          engagements,
          queuedPosts,
          queuedReels,
        }];

    const prepared = rows
      .map((row) => ({
        platform: (() => {
          const p = normalizePlatform(row.platform);
          if (p === "linkedin") return "";
          return p === "x" ? "tiktok" : p;
        })(),
        accountName: String(row.accountName || "").trim() || null,
        accountHandle: String(row.accountHandle || "").trim() || null,
        statDate: toDateOnly(row.date),
        followers: Number(row.followers || 0),
        reach: Number(row.reach || 0),
        engagements: Number(row.engagements || 0),
        queuedPosts: Number(row.queuedPosts || 0),
        queuedReels: Number(row.queuedReels || 0),
      }))
      .filter((row) => row.platform);

    if (!prepared.length) {
      return new Response(JSON.stringify({ error: "At least one valid platform row is required." }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    await prisma.$transaction(
      prepared.map((row) =>
        prisma.socialMediaDailyStat.upsert({
          where: {
            userId_siteLink_platform_statDate: {
              userId: user.id,
              siteLink: normalizedSite,
              platform: row.platform,
              statDate: row.statDate,
            },
          },
          update: {
            accountName: row.accountName,
            accountHandle: row.accountHandle,
            followers: row.followers,
            reach: row.reach,
            engagements: row.engagements,
            queuedPosts: row.queuedPosts,
            queuedReels: row.queuedReels,
            source,
          },
          create: {
            userId: user.id,
            siteLink: normalizedSite,
            platform: row.platform,
            accountName: row.accountName,
            accountHandle: row.accountHandle,
            statDate: row.statDate,
            followers: row.followers,
            reach: row.reach,
            engagements: row.engagements,
            queuedPosts: row.queuedPosts,
            queuedReels: row.queuedReels,
            source,
          },
        })
      )
    );

    return new Response(
      JSON.stringify({
        message: "SMM stats collected successfully.",
        inserted: prepared.length,
        siteUrl: normalizedSite,
        userId: user.id,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Failed to collect SMM stats." }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

