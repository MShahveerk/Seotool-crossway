import prisma from "../prisma.js";
import { logger } from "../logger.js";
import { TTL_DAYS } from "./config.js";
import { clampDataType, clampSiteUrl, clampSourceKey } from "./sourceKey.js";

export { clampSourceKey } from "./sourceKey.js";

function addDays(d, days) {
  const o = new Date(d.getTime());
  o.setUTCDate(o.getUTCDate() + days);
  return o;
}

function snapshotWhere(siteUrl, dataType, sourceKey = "") {
  return {
    siteUrl: clampSiteUrl(siteUrl),
    dataType: clampDataType(dataType),
    sourceKey: clampSourceKey(sourceKey || ""),
  };
}

function isConnectionError(err) {
  const msg = String(err?.message || err || "");
  return /closed the connection|connection reset|kind: Closed|can't reach database|connection timed out|Server has closed/i.test(
    msg
  );
}

export async function getCachedSnapshot(siteUrl, dataType, sourceKey = "") {
  try {
    const row = await prisma.serankingSnapshot.findUnique({
      where: { siteUrl_dataType_sourceKey: snapshotWhere(siteUrl, dataType, sourceKey) },
    });
    if (!row) return null;
    const expired = row.expiresAt && new Date(row.expiresAt).getTime() < Date.now();
    return { ...row, expired, stale: expired };
  } catch (err) {
    logger.warn("Snapshot cache read skipped", {
      dataType,
      message: err?.message,
      connection: isConnectionError(err),
    });
    return null;
  }
}

export async function saveSnapshot({
  siteUrl,
  dataType,
  sourceKey = "",
  payload,
  creditsSpent = 0,
  errorMessage = null,
}) {
  const ttl = TTL_DAYS[dataType] ?? 30;
  const now = new Date();
  const expiresAt = addDays(now, ttl);
  const key = snapshotWhere(siteUrl, dataType, sourceKey);
  try {
    return await prisma.serankingSnapshot.upsert({
      where: { siteUrl_dataType_sourceKey: key },
      create: {
        ...key,
        payload: payload ?? undefined,
        creditsSpent,
        fetchedAt: now,
        expiresAt,
        errorMessage,
      },
      update: {
        payload: payload ?? undefined,
        creditsSpent,
        fetchedAt: now,
        expiresAt,
        errorMessage,
      },
    });
  } catch (err) {
    logger.warn("Snapshot cache write skipped", {
      dataType,
      sourceKey: key.sourceKey,
      message: err?.message,
      connection: isConnectionError(err),
    });
    return null;
  }
}

/** Sites with expired or missing snapshot for a data type (oldest first). */
export async function listSitesDueForRefresh(siteUrls, dataType) {
  const due = [];
  for (const siteUrl of siteUrls) {
    const cached = await getCachedSnapshot(siteUrl, dataType);
    if (!cached || cached.expired || cached.errorMessage) due.push({ siteUrl, fetchedAt: cached?.fetchedAt || null });
  }
  due.sort((a, b) => {
    const ta = a.fetchedAt ? new Date(a.fetchedAt).getTime() : 0;
    const tb = b.fetchedAt ? new Date(b.fetchedAt).getTime() : 0;
    return ta - tb;
  });
  return due.map((d) => d.siteUrl);
}

export async function getLatestAuditJob(siteUrl) {
  return prisma.serankingAuditJob.findFirst({
    where: { siteUrl },
    orderBy: { startedAt: "desc" },
  });
}

/** Jobs older than this are treated as stuck so a new force audit can start. */
export const AUDIT_JOB_STALE_MS = 2 * 60 * 60 * 1000; // 2 hours

export function isAuditJobStale(job, maxAgeMs = AUDIT_JOB_STALE_MS) {
  if (!job || !["pending", "running"].includes(String(job.status || ""))) return false;
  const started = job.startedAt ? new Date(job.startedAt).getTime() : 0;
  if (!started) return true;
  return Date.now() - started > maxAgeMs;
}

/** Mark in-flight audit jobs abandoned so a force re-run can proceed. */
export async function abandonInFlightAuditJobs(
  siteUrl,
  { force = false, maxAgeMs = AUDIT_JOB_STALE_MS, reason = "Abandoned — new audit started." } = {}
) {
  const active = await prisma.serankingAuditJob.findMany({
    where: { siteUrl, status: { in: ["pending", "running"] } },
    orderBy: { startedAt: "desc" },
  });
  const toAbandon = force
    ? active
    : active.filter((job) => isAuditJobStale(job, maxAgeMs));
  const now = new Date();
  for (const job of toAbandon) {
    await prisma.serankingAuditJob.update({
      where: { id: job.id },
      data: {
        status: "error",
        finishedAt: now,
        errorMessage: reason,
      },
    });
  }
  return toAbandon.length;
}

export async function createAuditJob({ siteUrl, domain }) {
  return prisma.serankingAuditJob.create({
    data: { siteUrl, domain, status: "pending" },
  });
}

export async function updateAuditJob(id, data) {
  return prisma.serankingAuditJob.update({ where: { id }, data });
}
