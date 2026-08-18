import prisma from "./prisma";
import { DATA_TYPES } from "./seranking/config.js";
import { normalizeAuditReport } from "./seranking/normalize.js";
import { toDomain } from "./authority.js";

/**
 * SE Ranking audit health, read the same way everywhere.
 *
 * Audit health used to be derived in three places with three slightly different
 * payload walks, so the portfolio card, the project dashboard and the client
 * report could each show a different number for the same crawl. This module is
 * the one place that turns an SE Ranking payload into a score.
 */

/** SE Ranking sometimes stores a 0–1 fraction; every display wants 0–100. */
export function roundHealthScore(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const score = n > 0 && n <= 1 ? Math.round(n * 100) : Math.round(n);
  if (score < 0 || score > 100) return null;
  return score;
}

/**
 * Dig the normalized audit out of a payload, whatever shape it was stored in —
 * cached snapshots, raw API envelopes and job payloads all nest it differently.
 */
export function extractNormalizedAudit(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (payload.normalized && typeof payload.normalized === "object") {
    const n = payload.normalized;
    if (n.score != null || n.totalErrors != null || n.sections?.length) return n;
  }
  const candidates = [
    payload.report,
    payload.report?.report,
    payload.data?.report,
    payload.data?.report?.report,
    payload.payload?.report,
    payload.data,
    payload,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeAuditReport(candidate);
    if (
      normalized &&
      (normalized.score != null ||
        normalized.totalErrors != null ||
        normalized.totalWarnings != null ||
        (normalized.sections || []).length > 0)
    ) {
      return normalized;
    }
  }
  return null;
}

/** `null` when the payload holds no usable audit, so callers can fall through. */
export function healthFromSerankingPayload(payload, meta = {}) {
  const normalized = extractNormalizedAudit(payload);
  if (!normalized) return null;
  const score = roundHealthScore(normalized.score);
  const critical = normalized.totalErrors ?? null;
  const warning = normalized.totalWarnings ?? null;
  const pages = normalized.totalPages ?? null;
  if (score == null && critical == null && warning == null) return null;
  return {
    source: "seranking",
    score,
    critical,
    warning,
    pages: pages != null ? Number(pages) : null,
    finishedAt: meta.fetchedAt?.toISOString?.() || meta.fetchedAt || payload?.completedAt || null,
  };
}

/**
 * Health for the whole portfolio in two queries.
 *
 * Deliberately not a per-project fan-out: the portfolio dashboard renders every
 * project at once, so anything shaped per-site would turn one page load into
 * dozens of round trips. Keys are whatever `siteUrl` SE Ranking stored plus the
 * bare domain, and the caller resolves its own project identifiers against both.
 *
 * @returns {Promise<Array<{siteLink: string, domain: string|null, score: number|null,
 *   critical: number, warning: number, at: Date|string|null}>>}
 */
export async function loadPortfolioSerankingHealth() {
  const [snapshots, jobs] = await Promise.all([
    prisma.serankingSnapshot
      .findMany({
        where: { dataType: DATA_TYPES.AUDIT_REPORT },
        orderBy: [{ siteUrl: "asc" }, { fetchedAt: "desc" }],
        distinct: ["siteUrl"],
        select: { siteUrl: true, payload: true, fetchedAt: true },
      })
      .catch(() => []),
    // Successful jobs cover sites whose cache key never matched the snapshot key.
    prisma.serankingAuditJob
      .findMany({
        where: { status: "success" },
        orderBy: [{ domain: "asc" }, { finishedAt: "desc" }],
        distinct: ["domain"],
        select: { siteUrl: true, domain: true, payload: true, finishedAt: true, startedAt: true },
      })
      .catch(() => []),
  ]);

  const out = [];
  const seenDomains = new Set();

  for (const row of snapshots) {
    const health = healthFromSerankingPayload(row.payload, { fetchedAt: row.fetchedAt });
    if (!health) continue;
    const domain = toDomain(row.siteUrl);
    if (domain) seenDomains.add(domain);
    out.push({
      siteLink: row.siteUrl,
      domain,
      score: health.score,
      critical: health.critical || 0,
      warning: health.warning || 0,
      at: row.fetchedAt,
    });
  }

  for (const job of jobs) {
    const domain = job.domain || toDomain(job.siteUrl);
    // A snapshot already covered this domain and is the fresher of the two paths.
    if (domain && seenDomains.has(domain)) continue;
    const health = healthFromSerankingPayload(job.payload, {
      fetchedAt: job.finishedAt || job.startedAt,
    });
    if (!health) continue;
    out.push({
      siteLink: job.siteUrl || domain,
      domain,
      score: health.score,
      critical: health.critical || 0,
      warning: health.warning || 0,
      at: job.finishedAt || job.startedAt,
    });
  }

  return out;
}
