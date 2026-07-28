import { resolveWebsiteAccess } from "../../../../lib/resolveWebsiteAccess.js";
import {
  loadOrRefreshAudit,
  finalizeAuditReport,
  resolveDomainFromSite,
} from "../../../../lib/seranking/api.js";
import { getCachedSnapshot, getLatestAuditJob, createAuditJob, updateAuditJob } from "../../../../lib/seranking/cache.js";
import { DATA_TYPES, isSerankingConfigured } from "../../../../lib/seranking/config.js";
import { getAuditStatus } from "../../../../lib/seranking/api.js";
import { SerankingApiError } from "../../../../lib/seranking/client.js";
import { pollPendingAudits } from "../../../../lib/seranking/jobs.js";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    if (!isSerankingConfigured()) {
      return Response.json({ error: "SE Ranking is not configured." }, { status: 503 });
    }
    const { siteUrl } = await resolveWebsiteAccess(req);
    const domain = resolveDomainFromSite(siteUrl);

    await pollPendingAudits(console);

    const cached = await getCachedSnapshot(siteUrl, DATA_TYPES.AUDIT_REPORT);
    const job = await getLatestAuditJob(siteUrl);

    if (job?.auditId && ["pending", "running"].includes(job.status)) {
      try {
        const status = await getAuditStatus(job.auditId);
        const state = String(status?.status || status?.state || "").toLowerCase();
        if (state === "finished" || state === "completed" || state === "success" || status?.progress === 100) {
          const report = await finalizeAuditReport(siteUrl, job.auditId, job.creditsSpent);
          await updateAuditJob(job.id, { status: "success", finishedAt: new Date(), payload: report });
          return Response.json({
            siteUrl,
            domain,
            data: { auditId: job.auditId, report, completedAt: new Date().toISOString() },
            status: "success",
            fromCache: false,
          });
        }
        return Response.json({
          siteUrl,
          domain,
          status: "running",
          progress: status?.progress ?? null,
          auditId: job.auditId,
          data: cached?.payload || null,
        });
      } catch {
        /* fall through */
      }
    }

    if (cached?.payload && !cached.expired) {
      return Response.json({
        siteUrl,
        domain,
        data: cached.payload,
        status: "success",
        fromCache: true,
        fetchedAt: cached.fetchedAt,
        expiresAt: cached.expiresAt,
      });
    }

    const autoStart = req.nextUrl.searchParams.get("autostart") !== "0";
    const canStart = autoStart && (!job || !["pending", "running"].includes(job.status));

    if (canStart) {
      try {
        const jobRow = await createAuditJob({ siteUrl, domain });
        const result = await loadOrRefreshAudit(siteUrl, domain, { allowManual: true, force: true });
        if (result.pending && result.auditId) {
          await updateAuditJob(jobRow.id, {
            auditId: String(result.auditId),
            status: "running",
            creditsSpent: result.creditsSpent || 0,
          });
          return Response.json({
            siteUrl,
            domain,
            status: "running",
            auditId: result.auditId,
            progress: 0,
            data: cached?.payload || null,
            creditsSpent: result.creditsSpent || 0,
            message: "Audit started — results usually ready in a few minutes.",
          });
        }
      } catch (startErr) {
        return Response.json({
          siteUrl,
          domain,
          data: cached?.payload || null,
          status: "error",
          error: startErr.message || "Could not start audit.",
        }, { status: startErr instanceof SerankingApiError ? startErr.status : 502 });
      }
    }

    return Response.json({
      siteUrl,
      domain,
      data: cached?.payload || null,
      status: job?.status || "missing",
      message: cached
        ? "Cached audit expired — open again to start a fresh run."
        : "No audit yet — starting automatically on next load.",
    });
  } catch (err) {
    const status = err instanceof SerankingApiError ? err.status : err.status || 500;
    return Response.json({ error: err.message || "Audit load failed." }, { status });
  }
}

export async function POST(req) {
  try {
    if (!isSerankingConfigured()) {
      return Response.json({ error: "SE Ranking is not configured." }, { status: 503 });
    }
    const { siteUrl } = await resolveWebsiteAccess(req);
    const domain = resolveDomainFromSite(siteUrl);

    const running = await getLatestAuditJob(siteUrl);
    if (running && ["pending", "running"].includes(running.status)) {
      return Response.json({ error: "An audit is already running for this site.", auditId: running.auditId }, { status: 409 });
    }

    const jobRow = await createAuditJob({ siteUrl, domain });
    const result = await loadOrRefreshAudit(siteUrl, domain, { allowManual: true, force: true });
    if (result.pending && result.auditId) {
      await updateAuditJob(jobRow.id, {
        auditId: String(result.auditId),
        status: "running",
        creditsSpent: result.creditsSpent || 0,
      });
      return Response.json({
        siteUrl,
        domain,
        auditId: result.auditId,
        status: "running",
        creditsSpent: result.creditsSpent,
      });
    }

    return Response.json({ siteUrl, domain, data: result.data, status: "success" });
  } catch (err) {
    const status = err instanceof SerankingApiError ? err.status : err.status || 500;
    return Response.json({ error: err.message || "Audit start failed." }, { status });
  }
}
