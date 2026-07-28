/**
 * Scheduled SE Ranking refresh — conservative credit usage across all websites.
 */
import { listWebsiteUrls } from "../seoJobs.js";
import {
  DATA_TYPES,
  CREDIT_ESTIMATES,
  dailyCronBudget,
  seedKeywordCount,
  auditMaxPages,
} from "./config.js";
import { canSpendCredits } from "./credits.js";
import { listSitesDueForRefresh, getLatestAuditJob, updateAuditJob, getCachedSnapshot, createAuditJob } from "./cache.js";
import {
  fetchBacklinksSummary,
  fetchDomainOverview,
  fetchDomainCompetitors,
  fetchDomainKeywords,
  fetchSeedKeywords,
  createStandardAudit,
  getAuditStatus,
  finalizeAuditReport,
  resolveDomainFromSite,
} from "./api.js";
import { toSerankingDomain } from "./domain.js";
import { getTopQueries } from "../searchconsole.js";
import { getDateRangeForPresetId, clampSearchConsoleQueryRange } from "../searchConsoleDateRanges.js";

const JOB_ORDER = [
  { type: DATA_TYPES.BACKLINKS_SUMMARY, cost: CREDIT_ESTIMATES.backlinks_summary, fn: "backlinks" },
  { type: DATA_TYPES.DOMAIN_OVERVIEW, cost: CREDIT_ESTIMATES.domain_overview, fn: "overview" },
  { type: DATA_TYPES.DOMAIN_KEYWORDS, cost: CREDIT_ESTIMATES.domain_keywords, fn: "keywords" },
  { type: DATA_TYPES.DOMAIN_COMPETITORS, cost: CREDIT_ESTIMATES.domain_competitors, fn: "competitors" },
  { type: DATA_TYPES.KEYWORDS_SEEDS, cost: CREDIT_ESTIMATES.keywords_export_request, fn: "seeds" },
  {
    type: DATA_TYPES.AUDIT_REPORT,
    cost: auditMaxPages() * CREDIT_ESTIMATES.audit_standard_per_page,
    fn: "audit",
  },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function gscTopQueries(siteUrl, limit = 3) {
  try {
    let { startDate, endDate } = getDateRangeForPresetId("28d");
    ({ startDate, endDate } = clampSearchConsoleQueryRange(startDate, endDate));
    const res = await getTopQueries(siteUrl, startDate, endDate, limit);
    return (res.queries || []).map((q) => q.query).filter(Boolean).slice(0, seedKeywordCount());
  } catch {
    return [];
  }
}

async function runJobForSite(siteUrl, job, logger) {
  const domain = toSerankingDomain(siteUrl);
  if (!domain) return { skipped: true, reason: "no-domain" };

  switch (job.fn) {
    case "backlinks":
      await fetchBacklinksSummary(siteUrl, domain, { allowManual: false, force: true });
      break;
    case "overview":
      await fetchDomainOverview(siteUrl, domain, { allowManual: false, force: true });
      break;
    case "keywords":
      await fetchDomainKeywords(siteUrl, domain, { allowManual: false, force: true });
      break;
    case "competitors":
      await fetchDomainCompetitors(siteUrl, domain, { allowManual: false, force: true });
      break;
    case "seeds": {
      const seeds = await gscTopQueries(siteUrl);
      if (seeds.length) await fetchSeedKeywords(siteUrl, seeds, { allowManual: false, force: true });
      break;
    }
    case "audit": {
      const running = await getLatestAuditJob(siteUrl);
      if (running && ["pending", "running"].includes(running.status)) {
        return { skipped: true, reason: "audit-in-flight" };
      }
      const jobRow = await createAuditJob({ siteUrl, domain });
      const { auditId, creditsSpent } = await createStandardAudit(siteUrl, domain, { allowManual: false });
      await updateAuditJob(jobRow.id, {
        auditId: String(auditId),
        status: "running",
        creditsSpent,
      });
      break;
    }
    default:
      break;
  }
  logger.info(`SE Ranking refreshed ${job.fn} for ${domain}`);
  return { ok: true, cost: job.cost };
}

export async function pollPendingAudits(logger = console) {
  const pending = await import("../prisma.js").then((m) =>
    m.default.serankingAuditJob.findMany({
      where: { status: { in: ["pending", "running"] }, auditId: { not: null } },
      take: 10,
    })
  );

  for (const job of pending) {
    try {
      const status = await getAuditStatus(job.auditId);
      const state = String(status?.status || status?.state || "").toLowerCase();
      if (state === "finished" || state === "completed" || state === "success" || status?.progress === 100) {
        await finalizeAuditReport(job.siteUrl, job.auditId, job.creditsSpent);
        await updateAuditJob(job.id, { status: "success", finishedAt: new Date() });
        logger.info(`SE Ranking audit completed for ${job.domain}`);
      } else if (state === "failed" || state === "error") {
        await updateAuditJob(job.id, {
          status: "error",
          finishedAt: new Date(),
          errorMessage: status?.error || "Audit failed",
        });
      }
    } catch (err) {
      logger.error(`SE Ranking audit poll failed for ${job.siteUrl}: ${err.message}`);
    }
    await sleep(400);
  }
}

/**
 * Daily cron: refresh stale snapshots until daily credit cap.
 */
export async function runSerankingScheduledRefresh(logger = console) {
  if (!process.env.SERANKING_API_KEY?.trim()) {
    logger.info("SE Ranking refresh skipped: SERANKING_API_KEY not set.");
    return { skipped: true };
  }

  await pollPendingAudits(logger);

  const siteUrls = await listWebsiteUrls();
  if (!siteUrls.length) {
    logger.info("SE Ranking refresh: no website URLs.");
    return { sites: 0, spent: 0 };
  }

  const dailyCap = dailyCronBudget();
  let spent = 0;
  let jobsRun = 0;

  for (const job of JOB_ORDER) {
    if (spent >= dailyCap) break;

    const dueSites = await listSitesDueForRefresh(siteUrls, job.type);
    for (const siteUrl of dueSites) {
      if (spent + job.cost > dailyCap) break;

      const gate = await canSpendCredits(job.cost, { allowManual: false });
      if (!gate.ok) {
        logger.info(`SE Ranking budget gate: ${gate.reason}`);
        return { sites: siteUrls.length, spent, jobsRun, stopped: "budget" };
      }

      try {
        const result = await runJobForSite(siteUrl, job, logger);
        if (result?.ok) {
          spent += job.cost;
          jobsRun += 1;
        }
      } catch (err) {
        logger.error(`SE Ranking ${job.fn} failed for ${siteUrl}: ${err.message}`);
      }

      await sleep(500);
    }
  }

  logger.info(`SE Ranking cron done: ${jobsRun} jobs, ~${spent} credits (cap ${dailyCap}).`);
  return { sites: siteUrls.length, spent, jobsRun };
}

export async function getSerankingSiteStatus(siteUrl) {
  const types = Object.values(DATA_TYPES);
  const snapshots = await Promise.all(types.map((t) => getCachedSnapshot(siteUrl, t, t === DATA_TYPES.DOMAIN_KEYWORDS || t === DATA_TYPES.KEYWORDS_SEEDS ? "us" : "")));
  const auditJob = await getLatestAuditJob(siteUrl);
  return { snapshots, auditJob };
}
