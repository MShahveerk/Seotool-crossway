/**
 * Daily URL Inspection monitor: discover URLs, inspect within quota, persist snapshots.
 */
import prisma from "./prisma.js";
import {
  getSitemaps,
  getTopPages,
  inspectUrl,
} from "./searchconsole.js";
import { getDateRangeForPresetId } from "./searchConsoleDateRanges.js";
import { listWebsiteUrls } from "./seoJobs.js";
import { normalizeSiteOrigin } from "./validation.js";

const HARD_MAX_PER_SITE = 2000;
const DEFAULT_DAILY_LIMIT = 200;
const ROTATION_KEY_PREFIX = "url_inspect_offset:";
const MIN_MS_BETWEEN_CALLS = 120; // stay well under 600 QPM

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function dailyLimit() {
  const n = Number(process.env.SEO_URL_INSPECT_DAILY_LIMIT || DEFAULT_DAILY_LIMIT);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_DAILY_LIMIT;
  return Math.min(Math.floor(n), HARD_MAX_PER_SITE);
}

function todayYmd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function runDateFromYmd(ymd) {
  const s = String(ymd || todayYmd()).slice(0, 10);
  return new Date(`${s}T00:00:00.000Z`);
}

/**
 * Classify Google inspection result into indexed / not_indexed / unknown.
 */
export function classifyInspection(indexStatusResult = {}) {
  const verdict = String(indexStatusResult.verdict || "").toUpperCase();
  const coverageLower = String(indexStatusResult.coverageState || "").toLowerCase();

  const looksIndexed =
    (coverageLower.includes("indexed") && !coverageLower.includes("not indexed")) ||
    coverageLower.includes("submitted and indexed");

  if (looksIndexed || (verdict.includes("PASS") && !coverageLower.includes("not indexed"))) {
    return "indexed";
  }

  const looksNotIndexed =
    verdict.includes("FAIL") ||
    verdict.includes("NEUTRAL") ||
    coverageLower.includes("not indexed") ||
    coverageLower.includes("excluded") ||
    coverageLower.includes("discovered") ||
    coverageLower.includes("crawled") ||
    coverageLower.includes("blocked") ||
    coverageLower.includes("error") ||
    coverageLower.includes("redirect") ||
    coverageLower.includes("soft 404") ||
    coverageLower.includes("duplicate") ||
    coverageLower.includes("alternate");

  if (looksNotIndexed) return "not_indexed";
  if (!coverageLower && !verdict) return "unknown";
  return "unknown";
}

/**
 * Human-readable cause from Google's fields.
 */
export function buildInspectionCause(indexStatusResult = {}) {
  const parts = [];
  const coverage = indexStatusResult.coverageState;
  const indexing = indexStatusResult.indexingState;
  const robots = indexStatusResult.robotsTxtState;
  const fetch = indexStatusResult.pageFetchState;
  const verdict = indexStatusResult.verdict;

  if (coverage && coverage !== "UNKNOWN") parts.push(coverage);
  if (indexing && indexing !== "UNKNOWN" && indexing !== "INDEXING_ALLOWED") {
    parts.push(`Indexing: ${indexing}`);
  }
  if (robots && String(robots).toUpperCase() !== "ALLOWED") {
    parts.push(`robots.txt: ${robots}`);
  }
  if (fetch && String(fetch).toUpperCase() !== "SUCCESSFUL") {
    parts.push(`Fetch: ${fetch}`);
  }
  if (indexStatusResult.googleCanonical && indexStatusResult.userCanonical) {
    const g = String(indexStatusResult.googleCanonical);
    const u = String(indexStatusResult.userCanonical);
    if (g && u && g !== u) {
      parts.push(`Canonical mismatch (Google chose different URL)`);
    }
  }
  if (!parts.length && verdict) parts.push(`Verdict: ${verdict}`);
  return parts.join(" · ") || "No detail from Google";
}

async function fetchSitemapLocs(sitemapUrl, depth = 0, seen = new Set()) {
  if (!sitemapUrl || depth > 2 || seen.has(sitemapUrl)) return [];
  seen.add(sitemapUrl);
  try {
    const res = await fetch(sitemapUrl, {
      headers: { "User-Agent": "CrosswaySeoTool/1.0 (+url-inspection)" },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const locs = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((m) =>
      String(m[1] || "").trim()
    );
    const urls = [];
    const childSitemaps = [];
    for (const loc of locs) {
      if (!loc) continue;
      if (/\.xml(\.gz)?$/i.test(loc) || loc.includes("sitemap")) {
        childSitemaps.push(loc);
      } else {
        urls.push(loc);
      }
    }
    // If this looks like a sitemap index (mostly .xml children)
    if (childSitemaps.length && urls.length === 0) {
      for (const child of childSitemaps.slice(0, 20)) {
        const nested = await fetchSitemapLocs(child, depth + 1, seen);
        urls.push(...nested);
      }
      return urls;
    }
    // Mixed: collect page URLs; optionally follow a few child sitemaps
    for (const child of childSitemaps.slice(0, 5)) {
      const nested = await fetchSitemapLocs(child, depth + 1, seen);
      urls.push(...nested);
    }
    return urls;
  } catch {
    return [];
  }
}

/**
 * Discover candidate URLs: sitemaps first, then GSC top pages.
 */
export async function discoverInspectionUrls(siteUrl) {
  const origin = normalizeSiteOrigin(siteUrl) || siteUrl;
  const set = new Set();

  try {
    const listed = await getSitemaps(siteUrl);
    for (const sm of listed.sitemaps || []) {
      if (!sm.path) continue;
      const locs = await fetchSitemapLocs(sm.path);
      for (const loc of locs) {
        if (loc.startsWith("http")) set.add(loc.split("#")[0]);
      }
    }
  } catch {
    // continue with top pages
  }

  try {
    const { startDate, endDate } = getDateRangeForPresetId("28d");
    const pages = await getTopPages(siteUrl, startDate, endDate, 500);
    for (const p of pages.pages || []) {
      if (p.page?.startsWith("http")) set.add(String(p.page).split("#")[0]);
    }
  } catch {
    // ignore
  }

  // Always include site origin as a sanity check URL
  if (origin?.startsWith("http")) set.add(origin.endsWith("/") ? origin : `${origin}/`);

  return Array.from(set);
}

async function getRotationOffset(siteUrl) {
  const key = `${ROTATION_KEY_PREFIX}${normalizeSiteOrigin(siteUrl) || siteUrl}`;
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } });
    const n = Number(row?.value || 0);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

async function setRotationOffset(siteUrl, offset) {
  const key = `${ROTATION_KEY_PREFIX}${normalizeSiteOrigin(siteUrl) || siteUrl}`;
  const value = String(Math.max(0, Math.floor(offset)));
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

/**
 * Rotate through the full URL list when larger than the daily cap.
 */
export function pickRotatedSlice(allUrls, offset, limit) {
  if (!allUrls.length) return { slice: [], nextOffset: 0 };
  const start = offset % allUrls.length;
  const slice = [];
  for (let i = 0; i < Math.min(limit, allUrls.length); i++) {
    slice.push(allUrls[(start + i) % allUrls.length]);
  }
  const nextOffset = (start + slice.length) % allUrls.length;
  return { slice, nextOffset };
}

async function inspectOnePersisted(siteUrl, inspectionUrl, snapshotId) {
  try {
    const data = await inspectUrl(siteUrl, inspectionUrl);
    const idx = data.indexStatusResult || {};
    const category = classifyInspection(idx);
    const cause = buildInspectionCause(idx);
    let lastCrawl = null;
    if (idx.lastCrawlTime) {
      const t = new Date(idx.lastCrawlTime);
      if (Number.isFinite(t.getTime())) lastCrawl = t;
    }
    await prisma.urlInspectionResult.create({
      data: {
        snapshotId,
        inspectionUrl,
        category,
        verdict: idx.verdict || null,
        coverageState: idx.coverageState || null,
        indexingState: idx.indexingState || null,
        robotsTxtState: idx.robotsTxtState || null,
        pageFetchState: idx.pageFetchState || null,
        lastCrawlTime: lastCrawl,
        googleCanonical: idx.googleCanonical ? String(idx.googleCanonical).slice(0, 2048) : null,
        userCanonical: idx.userCanonical ? String(idx.userCanonical).slice(0, 2048) : null,
        cause,
      },
    });
    return { category, ok: true };
  } catch (err) {
    await prisma.urlInspectionResult.create({
      data: {
        snapshotId,
        inspectionUrl,
        category: "error",
        cause: err.message || "Inspection failed",
        errorMessage: err.message || String(err),
      },
    });
    return { category: "error", ok: false };
  }
}

/**
 * Run daily inspections for one site.
 */
export async function runUrlInspectionForSite(siteUrl, logger = console, runDateYmd = todayYmd()) {
  const limit = dailyLimit();
  const runDate = runDateFromYmd(runDateYmd);
  const normalized = normalizeSiteOrigin(siteUrl) || siteUrl;

  const existing = await prisma.urlInspectionSnapshot.findUnique({
    where: { siteUrl_runDate: { siteUrl: normalized, runDate } },
  });
  if (existing?.status === "completed") {
    logger.info?.(`URL inspection already completed for ${normalized} on ${runDateYmd}`);
    return { skipped: true, reason: "already_completed", snapshotId: existing.id };
  }

  let snapshot;
  if (existing) {
    snapshot = existing;
    await prisma.urlInspectionResult.deleteMany({ where: { snapshotId: snapshot.id } });
    await prisma.urlInspectionSnapshot.update({
      where: { id: snapshot.id },
      data: {
        status: "running",
        totalUrls: 0,
        indexedCount: 0,
        notIndexedCount: 0,
        unknownCount: 0,
        errorCount: 0,
        errorMessage: null,
        finishedAt: null,
        startedAt: new Date(),
      },
    });
  } else {
    snapshot = await prisma.urlInspectionSnapshot.create({
      data: {
        siteUrl: normalized,
        runDate,
        status: "running",
      },
    });
  }

  try {
    const allUrls = await discoverInspectionUrls(siteUrl);
    const offset = await getRotationOffset(siteUrl);
    const { slice, nextOffset } = pickRotatedSlice(allUrls, offset, limit);

    let indexedCount = 0;
    let notIndexedCount = 0;
    let unknownCount = 0;
    let errorCount = 0;

    for (const url of slice) {
      const r = await inspectOnePersisted(siteUrl, url, snapshot.id);
      if (r.category === "indexed") indexedCount += 1;
      else if (r.category === "not_indexed") notIndexedCount += 1;
      else if (r.category === "error") errorCount += 1;
      else unknownCount += 1;
      await sleep(MIN_MS_BETWEEN_CALLS);
    }

    await setRotationOffset(siteUrl, nextOffset);

    const updated = await prisma.urlInspectionSnapshot.update({
      where: { id: snapshot.id },
      data: {
        status: "completed",
        totalUrls: slice.length,
        indexedCount,
        notIndexedCount,
        unknownCount,
        errorCount,
        finishedAt: new Date(),
      },
    });

    let taskSync = null;
    try {
      const { syncIndexingTasksFromSnapshot } = await import("./indexingTasks.js");
      taskSync = await syncIndexingTasksFromSnapshot(normalized, snapshot.id);
      logger.info?.(
        `Indexing tasks synced for ${normalized}: +${taskSync.created} updated=${taskSync.updated} autoDone=${taskSync.completed}`
      );
    } catch (syncErr) {
      logger.error?.(`Indexing task sync failed for ${normalized}: ${syncErr.message}`);
    }

    logger.info?.(
      `URL inspection ${normalized}: ${slice.length}/${allUrls.length} urls (indexed=${indexedCount}, not=${notIndexedCount})`
    );
    return { skipped: false, snapshot: updated, discovered: allUrls.length, taskSync };
  } catch (err) {
    await prisma.urlInspectionSnapshot.update({
      where: { id: snapshot.id },
      data: {
        status: "failed",
        errorMessage: err.message || String(err),
        finishedAt: new Date(),
      },
    });
    logger.error?.(`URL inspection failed for ${normalized}: ${err.message}`);
    throw err;
  }
}

/**
 * Cron entry: all known websites when SEO_URL_INSPECT_DAILY is enabled.
 */
export async function runDailyUrlInspections(logger = console) {
  const { isCronJobEnabled } = await import("./cronSettings.js");
  if (!(await isCronJobEnabled("url-inspect"))) {
    logger.info?.("URL inspect cron disabled (Admin toggle / SEO_URL_INSPECT_DAILY) — skipping.");
    return { skipped: true };
  }

  const urls = await listWebsiteUrls();
  logger.info?.(`Daily URL inspection: ${urls.length} site(s), limit=${dailyLimit()}/site`);
  const results = [];
  for (const siteUrl of urls) {
    try {
      results.push(await runUrlInspectionForSite(siteUrl, logger));
    } catch (err) {
      results.push({ siteUrl, error: err.message });
    }
  }
  return { skipped: false, results };
}

/**
 * Load snapshot + results for UI/API.
 */
export async function getInspectionMonitor(siteUrl, dateYmd = null) {
  const normalized = normalizeSiteOrigin(siteUrl) || siteUrl;
  let snapshot;
  if (dateYmd) {
    snapshot = await prisma.urlInspectionSnapshot.findUnique({
      where: {
        siteUrl_runDate: { siteUrl: normalized, runDate: runDateFromYmd(dateYmd) },
      },
    });
  } else {
    snapshot = await prisma.urlInspectionSnapshot.findFirst({
      where: { siteUrl: normalized },
      orderBy: { runDate: "desc" },
    });
  }

  if (!snapshot) {
    return {
      siteUrl: normalized,
      snapshot: null,
      indexed: [],
      notIndexed: [],
      unknown: [],
      errors: [],
    };
  }

  const results = await prisma.urlInspectionResult.findMany({
    where: { snapshotId: snapshot.id },
    orderBy: { inspectionUrl: "asc" },
  });

  const mapRow = (r) => ({
    id: r.id,
    url: r.inspectionUrl,
    category: r.category,
    verdict: r.verdict,
    coverageState: r.coverageState,
    indexingState: r.indexingState,
    robotsTxtState: r.robotsTxtState,
    pageFetchState: r.pageFetchState,
    lastCrawlTime: r.lastCrawlTime,
    googleCanonical: r.googleCanonical,
    userCanonical: r.userCanonical,
    cause: r.cause,
    errorMessage: r.errorMessage,
  });

  return {
    siteUrl: normalized,
    snapshot: {
      id: snapshot.id,
      runDate: snapshot.runDate,
      status: snapshot.status,
      totalUrls: snapshot.totalUrls,
      indexedCount: snapshot.indexedCount,
      notIndexedCount: snapshot.notIndexedCount,
      unknownCount: snapshot.unknownCount,
      errorCount: snapshot.errorCount,
      startedAt: snapshot.startedAt,
      finishedAt: snapshot.finishedAt,
      errorMessage: snapshot.errorMessage,
    },
    indexed: results.filter((r) => r.category === "indexed").map(mapRow),
    notIndexed: results.filter((r) => r.category === "not_indexed").map(mapRow),
    unknown: results.filter((r) => r.category === "unknown").map(mapRow),
    errors: results.filter((r) => r.category === "error").map(mapRow),
  };
}

export async function getInspectionHistory(siteUrl, days = 30) {
  const normalized = normalizeSiteOrigin(siteUrl) || siteUrl;
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - Math.max(1, Math.min(days, 90)));
  since.setUTCHours(0, 0, 0, 0);

  const rows = await prisma.urlInspectionSnapshot.findMany({
    where: {
      siteUrl: normalized,
      runDate: { gte: since },
      status: { in: ["completed", "failed"] },
    },
    orderBy: { runDate: "asc" },
    select: {
      id: true,
      runDate: true,
      status: true,
      totalUrls: true,
      indexedCount: true,
      notIndexedCount: true,
      unknownCount: true,
      errorCount: true,
      finishedAt: true,
    },
  });

  return {
    siteUrl: normalized,
    history: rows.map((r) => ({
      ...r,
      runDate: r.runDate,
    })),
  };
}

export { todayYmd, dailyLimit };
