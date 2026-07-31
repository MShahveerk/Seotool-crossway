/**
 * Resolve which report sections apply for a client account (site key).
 * Meta-only pages without website + GTM association → SMM reports only.
 */
import { isMetaPageId, pickClientDisplayName } from "./siteAccess.js";
import { normalizeSiteOrigin } from "./validation.js";

/** Sent to approvers / clients by email */
export const CLIENT_REPORT_SECTIONS = ["smm", "website"];

/** Internal-only — export from SEO tool pages, never emailed to clients */
export const INTERNAL_REPORT_SECTIONS = [
  "seo-opportunities",
  "url-inspection",
  "sitemap-health",
  "device-appearance",
  "query-page-matrix",
];

export const EXPORT_SECTIONS = [...CLIENT_REPORT_SECTIONS, ...INTERNAL_REPORT_SECTIONS, "full"];

export function isInternalReportSection(section) {
  return INTERNAL_REPORT_SECTIONS.includes(String(section || "").trim());
}

export function isClientReportSection(section) {
  return CLIENT_REPORT_SECTIONS.includes(String(section || "").trim()) || section === "full";
}

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
  // Website reports need a website URL. GTM is useful but not required to include
  // the site in slide decks when Meta + website are linked to the same client.
  includeWebsiteReports = Boolean(websiteUrl);

  const smmSiteKey = isMeta ? key : websiteUrl || key;

  const clientSections = sectionsForClientPack({ includeWebsiteReports });

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
    /** @deprecated use clientSections / exportSections */
    applicableSections: includeWebsiteReports ? [...EXPORT_SECTIONS] : ["smm"],
    clientSections,
    exportSections: includeWebsiteReports ? [...EXPORT_SECTIONS] : ["smm"],
  };
}

/** Sections emailed to approvers — SMM + website summary only. */
export function sectionsForClientPack(context) {
  const sections = ["smm"];
  if (context?.includeWebsiteReports) sections.push("website");
  return sections;
}
