import { resolveWebsiteAccess, requireSession } from "../../../../lib/resolveWebsiteAccess.js";
import { isSerankingConfigured, DATA_TYPES, DEFAULT_SOURCE } from "../../../../lib/seranking/config.js";
import { getCreditStatus } from "../../../../lib/seranking/credits.js";
import { getBundleForSite } from "../../../../lib/seranking/api.js";
import { SERANKING_SCHEDULES } from "../../../../lib/seranking/loadBundle.js";
import { getLatestAuditJob, getCachedSnapshot } from "../../../../lib/seranking/cache.js";
import { SEO_DATA_NOT_CONFIGURED, SEO_DATA_STATUS_FAILED } from "../../../../lib/seoDataMessages.js";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    const globalOnly = req.nextUrl.searchParams.get("global") === "1";
    const credits = await getCreditStatus();

    if (globalOnly) {
      await requireSession({ anySeo: true });
      return Response.json({
        configured: isSerankingConfigured(),
        credits,
        schedules: SERANKING_SCHEDULES,
      });
    }

    const { siteUrl } = await resolveWebsiteAccess(req, { section: null });

    if (!isSerankingConfigured()) {
      return Response.json({
        configured: false,
        siteUrl,
        credits,
        message: "Contact your administrator to enable live SEO data.",
      });
    }

    const bundle = await getBundleForSite(siteUrl);
    const auditJob = await getLatestAuditJob(siteUrl);

    const snapMeta = {};
    for (const t of Object.values(DATA_TYPES)) {
      const sk = t === DATA_TYPES.DOMAIN_KEYWORDS || t === DATA_TYPES.KEYWORDS_SEEDS ? DEFAULT_SOURCE : "";
      const s = await getCachedSnapshot(siteUrl, t, sk);
      if (s) {
        snapMeta[t] = {
          fetchedAt: s.fetchedAt,
          expiresAt: s.expiresAt,
          stale: s.expired,
        };
      }
    }

    return Response.json({
      configured: true,
      siteUrl,
      domain: bundle.domain,
      credits,
      snapshots: snapMeta,
      schedules: SERANKING_SCHEDULES,
      auditJob: auditJob
        ? {
            status: auditJob.status,
            auditId: auditJob.auditId,
            startedAt: auditJob.startedAt,
            finishedAt: auditJob.finishedAt,
            errorMessage: auditJob.errorMessage,
          }
        : null,
    });
  } catch (err) {
    return Response.json({ error: err.message || SEO_DATA_STATUS_FAILED }, { status: err.status || 500 });
  }
}
