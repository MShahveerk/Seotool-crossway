/**
 * Resolve which report sections apply for a client account (site key).
 * Meta-only pages without website + GTM association → SMM reports only.
 */
import { isMetaPageId, pickClientDisplayName } from "./siteAccess.js";
import { normalizeSiteOrigin } from "./validation.js";

export const REPORT_SECTIONS = [
  "smm",
  "website",
  "seo-opportunities",
  "url-inspection",
  "sitemap-health",
  "device-appearance",
  "query-page-matrix",
];

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} siteKey - URL, Meta page ID, or accessibleSites key
 */
export async function resolveSiteReportContext(prisma, siteKey) {
  const key = String(siteKey || "").trim();
  const isMeta = isMetaPageId(key);
  const canonical = normalizeSiteOrigin(key);

  const or = [{ facebookPageId: key }, { instagramUserId: key }];
  if (key.startsWith("http") || key.includes(".")) {
    or.push({ siteUrl: key });
    if (canonical) or.push({ siteUrl: canonical });
  }

  const siteRecord = await prisma.site.findFirst({
    where: { OR: or },
    select: {
      siteUrl: true,
      gtmContainerId: true,
      facebookPageId: true,
      instagramUserId: true,
    },
  });

  let userRecord = null;
  if (isMeta || !siteRecord?.siteUrl) {
    userRecord = await prisma.user.findFirst({
      where: {
        OR: [{ facebookPageId: key }, { instagramUserId: key }, ...(canonical ? [{ siteLink: canonical }] : [])],
      },
      select: {
        siteLink: true,
        gtmContainerId: true,
        facebookPageId: true,
        name: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  const websiteUrl =
    (siteRecord?.siteUrl ? normalizeSiteOrigin(siteRecord.siteUrl) : null) ||
    (userRecord?.siteLink ? normalizeSiteOrigin(userRecord.siteLink) : null) ||
    (!isMeta && key.startsWith("http") ? normalizeSiteOrigin(key) : null) ||
    (!isMeta && canonical?.startsWith("http") ? canonical : null);

  const gtmContainerId = String(siteRecord?.gtmContainerId || userRecord?.gtmContainerId || "").trim() || null;

  let includeWebsiteReports = false;
  if (isMeta) {
    includeWebsiteReports = Boolean(websiteUrl && gtmContainerId);
  } else {
    includeWebsiteReports = Boolean(websiteUrl);
  }

  const smmSiteKey = isMeta ? key : websiteUrl || key;

  return {
    siteKey: key,
    smmSiteKey,
    websiteUrl,
    gtmContainerId,
    isMetaPage: isMeta,
    includeWebsiteReports,
    displayName: pickClientDisplayName({
      siteLink: websiteUrl || key,
      facebookPageId: siteRecord?.facebookPageId || userRecord?.facebookPageId || (isMeta ? key : null),
      userName: userRecord?.name,
    }),
    applicableSections: includeWebsiteReports
      ? [...REPORT_SECTIONS]
      : ["smm"],
  };
}

/** Sections included in a full client report pack for this context. */
export function sectionsForClientPack(context) {
  return context?.applicableSections || ["smm"];
}
