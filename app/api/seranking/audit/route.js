import { resolveWebsiteAccess } from "../../../../lib/resolveWebsiteAccess.js";
import {
  loadOrRefreshAudit,
  finalizeAuditReport,
  resolveDomainFromSite,
  getAuditPages,
} from "../../../../lib/seranking/api.js";
import {
  getCachedSnapshot,
  getLatestAuditJob,
  createAuditJob,
  updateAuditJob,
  abandonInFlightAuditJobs,
  isAuditJobStale,
} from "../../../../lib/seranking/cache.js";
import { DATA_TYPES, isSerankingConfigured } from "../../../../lib/seranking/config.js";
import { getAuditStatus } from "../../../../lib/seranking/api.js";
import { SerankingApiError } from "../../../../lib/seranking/client.js";
import { pollPendingAudits } from "../../../../lib/seranking/jobs.js";
import { normalizeAuditReport, normalizeAuditPagesList } from "../../../../lib/seranking/normalize.js";
import { SEO_DATA_NOT_CONFIGURED } from "../../../../lib/seoDataMessages.js";

export const runtime = "nodejs";

async function loadAuditPages(auditId) {
  if (!auditId) return [];
  try {
    return normalizeAuditPagesList(await getAuditPages(auditId, { limit: 50 }));
  } catch {
    return [];
  }
}

export async function GET(req) {
  try {
    if (!isSerankingConfigured()) {
      return Response.json({ error: SEO_DATA_NOT_CONFIGURED }, { status: 503 });
    }
    const { siteUrl } = await resolveWebsiteAccess(req);
    const domain = resolveDomainFromSite(siteUrl);

    await pollPendingAudits(console);
    // Clear stuck pending/running jobs so the UI is not stuck on an old "running" lock.
    await abandonInFlightAuditJobs(siteUrl, {
      force: false,
      reason: "Abandoned — audit job timed out (stale).",
    });

    const cached = await getCachedSnapshot(siteUrl, DATA_TYPES.AUDIT_REPORT);
    let job = await getLatestAuditJob(siteUrl);

    if (job?.auditId && ["pending", "running"].includes(job.status) && !isAuditJobStale(job)) {
      try {
        const status = await getAuditStatus(job.auditId);
        const state = String(status?.status || status?.state || "").toLowerCase();
        if (state === "finished" || state === "completed" || state === "success" || status?.progress === 100) {
          const { report, normalized } = await finalizeAuditReport(siteUrl, job.auditId, job.creditsSpent);
          await updateAuditJob(job.id, { status: "success", finishedAt: new Date(), payload: { report, normalized } });
          const pages = await loadAuditPages(job.auditId);
          return Response.json({
            siteUrl,
            domain,
            auditId: job.auditId,
            pages,
            data: {
              auditId: job.auditId,
              report,
              normalized,
              completedAt: new Date().toISOString(),
            },
            normalized,
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
          fromCache: Boolean(cached?.payload),
        });
      } catch {
        /* fall through — serve cache / allow force restart */
      }
    }

    if (cached?.payload && !cached.expired) {
      const normalized =
        cached.payload.normalized || normalizeAuditReport(cached.payload.report || cached.payload);
      const auditId = cached.payload.auditId || null;
      const pages = auditId ? await loadAuditPages(auditId) : [];
      return Response.json({
        siteUrl,
        domain,
        auditId,
        pages,
        data: cached.payload,
        normalized,
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
      return Response.json({ error: SEO_DATA_NOT_CONFIGURED }, { status: 503 });
    }
    const { siteUrl } = await resolveWebsiteAccess(req);
    const domain = resolveDomainFromSite(siteUrl);
    const body = await req.json().catch(() => ({}));
    const forceRestart = body?.force !== false; // default true — this endpoint is always a force re-run

    const running = await getLatestAuditJob(siteUrl);
    if (running && ["pending", "running"].includes(running.status) && !isAuditJobStale(running)) {
      if (!forceRestart) {
        return Response.json(
          { error: "An audit is already running for this site.", auditId: running.auditId },
          { status: 409 }
        );
      }
      // User explicitly asked for a new audit — abandon the in-flight job and start fresh.
      await abandonInFlightAuditJobs(siteUrl, {
        force: true,
        reason: "Abandoned — user forced a new audit.",
      });
    } else if (running && isAuditJobStale(running)) {
      await abandonInFlightAuditJobs(siteUrl, {
        force: true,
        reason: "Abandoned — audit job timed out (stale).",
      });
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
        forced: true,
        message: "New audit started — previous cache stays visible until this run finishes.",
      });
    }

    return Response.json({ siteUrl, domain, data: result.data, status: "success", forced: true });
  } catch (err) {
    const status = err instanceof SerankingApiError ? err.status : err.status || 500;
    return Response.json({ error: err.message || "Audit start failed." }, { status });
  }
}
