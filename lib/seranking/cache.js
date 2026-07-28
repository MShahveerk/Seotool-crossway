import prisma from "../prisma.js";
import { TTL_DAYS } from "./config.js";

function addDays(d, days) {
  const o = new Date(d.getTime());
  o.setUTCDate(o.getUTCDate() + days);
  return o;
}

export async function getCachedSnapshot(siteUrl, dataType, sourceKey = "") {
  const row = await prisma.serankingSnapshot.findUnique({
    where: {
      siteUrl_dataType_sourceKey: { siteUrl, dataType, sourceKey: sourceKey || "" },
    },
  });
  if (!row) return null;
  const expired = row.expiresAt && new Date(row.expiresAt).getTime() < Date.now();
  return { ...row, expired, stale: expired };
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
  return prisma.serankingSnapshot.upsert({
    where: {
      siteUrl_dataType_sourceKey: { siteUrl, dataType, sourceKey: sourceKey || "" },
    },
    create: {
      siteUrl,
      dataType,
      sourceKey: sourceKey || "",
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

export async function createAuditJob({ siteUrl, domain }) {
  return prisma.serankingAuditJob.create({
    data: { siteUrl, domain, status: "pending" },
  });
}

export async function updateAuditJob(id, data) {
  return prisma.serankingAuditJob.update({ where: { id }, data });
}
