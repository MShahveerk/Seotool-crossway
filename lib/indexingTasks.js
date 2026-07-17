/**
 * Persist / query SEO indexing tasks created from not-indexed URL inspections.
 */
import prisma from "./prisma.js";
import { buildIndexingTaskFromResult } from "./indexingTaskGuide.js";
import { normalizeSiteOrigin } from "./validation.js";

/**
 * Upsert open tasks for every not_indexed result in a completed snapshot.
 * Pages that become indexed are auto-completed.
 */
export async function syncIndexingTasksFromSnapshot(siteUrl, snapshotId) {
  const normalized = normalizeSiteOrigin(siteUrl) || siteUrl;
  const results = await prisma.urlInspectionResult.findMany({
    where: { snapshotId },
  });

  let created = 0;
  let updated = 0;
  let completed = 0;

  for (const row of results) {
    const pageUrl = row.inspectionUrl;
    if (!pageUrl) continue;

    if (row.category === "indexed") {
      const existing = await prisma.seoIndexingTask.findUnique({
        where: { siteUrl_pageUrl: { siteUrl: normalized, pageUrl } },
      });
      if (existing && existing.status === "open") {
        await prisma.seoIndexingTask.update({
          where: { id: existing.id },
          data: { status: "done", completedAt: new Date() },
        });
        completed += 1;
      }
      continue;
    }

    if (row.category !== "not_indexed") continue;

    const payload = buildIndexingTaskFromResult(normalized, {
      url: pageUrl,
      cause: row.cause,
      coverageState: row.coverageState,
      indexingState: row.indexingState,
      robotsTxtState: row.robotsTxtState,
      pageFetchState: row.pageFetchState,
      verdict: row.verdict,
      googleCanonical: row.googleCanonical,
      userCanonical: row.userCanonical,
    });

    const existing = await prisma.seoIndexingTask.findUnique({
      where: { siteUrl_pageUrl: { siteUrl: normalized, pageUrl } },
    });

    if (!existing) {
      await prisma.seoIndexingTask.create({
        data: {
          siteUrl: normalized,
          pageUrl: payload.pageUrl,
          title: payload.title,
          issueType: payload.issueType,
          cause: payload.cause,
          coverageState: payload.coverageState,
          verdict: payload.verdict,
          summary: payload.summary,
          steps: payload.steps,
          status: "open",
          sourceSnapshotId: snapshotId,
        },
      });
      created += 1;
    } else {
      // Refresh guide/cause; reopen if previously done but still not indexed
      await prisma.seoIndexingTask.update({
        where: { id: existing.id },
        data: {
          title: payload.title,
          issueType: payload.issueType,
          cause: payload.cause,
          coverageState: payload.coverageState,
          verdict: payload.verdict,
          summary: payload.summary,
          steps: payload.steps,
          sourceSnapshotId: snapshotId,
          status: existing.status === "dismissed" ? "dismissed" : "open",
          completedAt: existing.status === "dismissed" ? existing.completedAt : null,
        },
      });
      updated += 1;
    }
  }

  return { created, updated, completed };
}

export async function listIndexingTasks(siteUrl, { status = "open" } = {}) {
  const normalized = normalizeSiteOrigin(siteUrl) || siteUrl;
  const where = { siteUrl: normalized };
  if (status && status !== "all") where.status = status;

  const tasks = await prisma.seoIndexingTask.findMany({
    where,
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });

  return tasks.map((t) => ({
    id: t.id,
    siteUrl: t.siteUrl,
    pageUrl: t.pageUrl,
    title: t.title,
    issueType: t.issueType,
    cause: t.cause,
    coverageState: t.coverageState,
    verdict: t.verdict,
    summary: t.summary,
    steps: Array.isArray(t.steps) ? t.steps : [],
    status: t.status,
    sourceSnapshotId: t.sourceSnapshotId,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    completedAt: t.completedAt,
  }));
}

export async function updateIndexingTaskStatus(taskId, status) {
  const allowed = new Set(["open", "done", "dismissed"]);
  if (!allowed.has(status)) {
    const err = new Error("status must be open, done, or dismissed");
    err.status = 400;
    throw err;
  }
  return prisma.seoIndexingTask.update({
    where: { id: taskId },
    data: {
      status,
      completedAt: status === "done" ? new Date() : null,
    },
  });
}
