/**
 * Decide Facebook Page + Instagram destinations for a social post.
 * Approvals often store only the Page id even when the Page has a linked IG
 * business account on the site / Meta config.
 */
import prisma from "./prisma.js";
import { canonicalizeSiteKey, isMetaPageId } from "./siteAccess.js";
import axios from "axios";

const GRAPH = "https://graph.facebook.com/v20.0";

function firstId(...values) {
  for (const value of values) {
    const id = String(value || "").trim();
    if (id) return id;
  }
  return null;
}

async function instagramFromSiteRecords({ facebookPageId, siteLink }) {
  const or = [];
  if (facebookPageId) or.push({ facebookPageId });
  if (siteLink) {
    or.push({ siteUrl: siteLink });
    const canonical = canonicalizeSiteKey(siteLink);
    if (canonical && canonical !== siteLink) or.push({ siteUrl: canonical });
  }
  if (or.length) {
    const site = await prisma.site.findFirst({
      where: { OR: or },
      select: { instagramUserId: true },
    });
    if (site?.instagramUserId) return String(site.instagramUserId).trim();
  }

  const configOr = [];
  if (facebookPageId) {
    configOr.push({ facebookPageId });
    configOr.push({ siteKey: facebookPageId });
  }
  if (siteLink) {
    configOr.push({ siteKey: siteLink });
    const canonical = canonicalizeSiteKey(siteLink);
    if (canonical && canonical !== siteLink) configOr.push({ siteKey: canonical });
  }
  if (configOr.length) {
    const config = await prisma.sitePostConfig.findFirst({
      where: { OR: configOr },
      select: { instagramUserId: true },
    });
    if (config?.instagramUserId) return String(config.instagramUserId).trim();
  }

  if (facebookPageId) {
    const user = await prisma.user.findFirst({
      where: { facebookPageId, instagramUserId: { not: null } },
      select: { instagramUserId: true },
    });
    if (user?.instagramUserId) return String(user.instagramUserId).trim();
  }

  return null;
}

async function instagramFromGraph(facebookPageId, token) {
  const pageId = String(facebookPageId || "").trim();
  const accessToken = String(token || "").trim();
  if (!isMetaPageId(pageId) || !accessToken) return null;
  try {
    const res = await axios.get(`${GRAPH}/${pageId}`, {
      params: { fields: "instagram_business_account", access_token: accessToken },
      timeout: 15000,
    });
    const id = res.data?.instagram_business_account?.id;
    return id ? String(id).trim() : null;
  } catch {
    return null;
  }
}

/**
 * @returns {Promise<{
 *   facebookPageId: string|null,
 *   instagramUserId: string|null,
 *   publishFb: boolean,
 *   publishIg: boolean,
 *   igWanted: boolean,
 *   igMissing: boolean,
 * }>}
 */
export async function resolveMetaPublishTargets(approval, config, { token } = {}) {
  const igWanted = config?.publishToInstagram !== false;
  const fbWanted = config?.publishToFacebook !== false;
  const facebookPageId = firstId(approval?.facebookPageId, config?.facebookPageId);
  let instagramUserId = firstId(approval?.instagramUserId, config?.instagramUserId);

  if (igWanted && !instagramUserId) {
    instagramUserId =
      (await instagramFromSiteRecords({
        facebookPageId,
        siteLink: approval?.siteLink,
      })) || (await instagramFromGraph(facebookPageId, token));
  }

  const publishFb = fbWanted && Boolean(facebookPageId);
  const publishIg = igWanted && Boolean(instagramUserId);
  return {
    facebookPageId,
    instagramUserId,
    publishFb,
    publishIg,
    igWanted,
    igMissing: igWanted && !instagramUserId,
  };
}
