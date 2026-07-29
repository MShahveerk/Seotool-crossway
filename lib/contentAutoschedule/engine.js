/**
 * Per-site content autoschedule config (posts | blogs).
 */
import prisma from "../prisma.js";

export const KIND_POST = "post";
export const KIND_BLOG = "blog";

const POOL_STATUSES = ["draft", "pending", "edited", "approved"];

export function normalizeKind(kind) {
  const k = String(kind || "").toLowerCase().trim();
  if (k === KIND_BLOG || k === "blogs") return KIND_BLOG;
  if (k === KIND_POST || k === "posts" || k === "approval" || k === "approvals") return KIND_POST;
  return null;
}

export { POOL_STATUSES };

function defaultRow(siteLink, kind) {
  return {
    kind,
    siteLink,
    enabled: false,
    horizonDays: 14,
    itemsPerDay: 1,
    scheduleHour: 10,
    scheduleMinute: 0,
    lastRunAt: null,
  };
}

function clampInt(n, min, max, fallback) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

export async function getAutoscheduleConfig(kind, siteLink) {
  const k = normalizeKind(kind);
  const link = String(siteLink || "").trim();
  if (!k || !link) {
    const err = new Error("kind and siteLink are required.");
    err.status = 400;
    throw err;
  }
  const row = await prisma.contentAutoscheduleConfig.findUnique({
    where: { kind_siteLink: { kind: k, siteLink: link } },
  });
  return row || defaultRow(link, k);
}

export async function saveAutoscheduleConfig(kind, siteLink, input = {}) {
  const k = normalizeKind(kind);
  const link = String(siteLink || "").trim();
  if (!k || !link) {
    const err = new Error("kind and siteLink are required.");
    err.status = 400;
    throw err;
  }
  const existing = await getAutoscheduleConfig(k, link);
  const data = {
    kind: k,
    siteLink: link,
    enabled: input.enabled !== undefined ? Boolean(input.enabled) : existing.enabled,
    horizonDays:
      input.horizonDays !== undefined
        ? clampInt(input.horizonDays, 1, 60, existing.horizonDays || 14)
        : existing.horizonDays || 14,
    itemsPerDay:
      input.itemsPerDay !== undefined
        ? clampInt(input.itemsPerDay, 1, 5, existing.itemsPerDay || 1)
        : existing.itemsPerDay || 1,
    scheduleHour:
      input.scheduleHour !== undefined
        ? clampInt(input.scheduleHour, 0, 23, existing.scheduleHour ?? 10)
        : existing.scheduleHour ?? 10,
    scheduleMinute:
      input.scheduleMinute !== undefined
        ? clampInt(input.scheduleMinute, 0, 59, existing.scheduleMinute ?? 0)
        : existing.scheduleMinute ?? 0,
  };

  return prisma.contentAutoscheduleConfig.upsert({
    where: { kind_siteLink: { kind: k, siteLink: link } },
    create: data,
    update: data,
  });
}

export async function listEnabledConfigs() {
  return prisma.contentAutoscheduleConfig.findMany({
    where: { enabled: true },
  });
}

export async function touchLastRun(kind, siteLink, when = new Date()) {
  const k = normalizeKind(kind);
  const link = String(siteLink || "").trim();
  if (!k || !link) return null;
  try {
    return await prisma.contentAutoscheduleConfig.update({
      where: { kind_siteLink: { kind: k, siteLink: link } },
      data: { lastRunAt: when },
    });
  } catch {
    return null;
  }
}
