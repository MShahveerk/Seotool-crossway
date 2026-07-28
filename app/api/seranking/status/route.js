import { resolveWebsiteAccess } from "../../../../lib/resolveWebsiteAccess.js";
import { isSerankingConfigured, DATA_TYPES, DEFAULT_SOURCE } from "../../../../lib/seranking/config.js";
import { getCreditStatus } from "../../../../lib/seranking/credits.js";
import { getBundleForSite } from "../../../../lib/seranking/api.js";
import { getLatestAuditJob, getCachedSnapshot } from "../../../../lib/seranking/cache.js";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    const { siteUrl } = await resolveWebsiteAccess(req);
    const credits = await getCreditStatus();

    if (!isSerankingConfigured()) {
      return Response.json({
        configured: false,
        siteUrl,
        credits,
        message: "Add SERANKING_API_KEY to enable SE Ranking data.",
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
    return Response.json({ error: err.message || "Failed to load SE Ranking status." }, { status: err.status || 500 });
  }
}
