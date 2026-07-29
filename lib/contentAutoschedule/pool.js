/**
 * Unscheduled pool + occupied weekday keys for a site/kind.
 */
import prisma from "../prisma.js";
import { resolveSiteEquivalents, buildApprovalSiteOrFilter } from "../siteAccess.js";
import {
  getAppTimezone,
  getZonedParts,
  addZonedCalendarDays,
  datetimeLocalToUtcIso,
} from "../timezone.js";
import { KIND_BLOG, KIND_POST, POOL_STATUSES, normalizeKind } from "./engine.js";

function pad(n) {
  return String(n).padStart(2, "0");
}

/** YYYY-MM-DD in app TZ for a Date. */
export function localDateKey(date, timeZone = getAppTimezone()) {
  const parts = getZonedParts(date, timeZone);
  if (!parts) return null;
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** Mon–Fri only (JS: Sun=0 … Sat=6). */
export function isWeekdayKey(dateKey, timeZone = getAppTimezone()) {
  if (!dateKey) return false;
  const [y, m, d] = dateKey.split("-").map(Number);
  const iso = datetimeLocalToUtcIso(`${y}-${pad(m)}-${pad(d)}T12:00`, timeZone);
  if (!iso) return false;
  // Use weekday in app TZ via Intl
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(new Date(iso));
  return !["Sat", "Sun"].includes(wd);
}

export function listWeekdayKeysInHorizon({
  horizonDays = 14,
  timeZone = getAppTimezone(),
  now = new Date(),
} = {}) {
  const parts = getZonedParts(now, timeZone);
  if (!parts) return [];
  const keys = [];
  const horizon = Math.max(1, Math.min(60, Number(horizonDays) || 14));
  // Start from today; skip past times later in assign when slot already passed.
  for (let i = 0; i < horizon; i += 1) {
    const day = addZonedCalendarDays(parts.year, parts.month, parts.day, i);
    const key = `${day.year}-${pad(day.month)}-${pad(day.day)}`;
    if (isWeekdayKey(key, timeZone)) keys.push(key);
  }
  return keys;
}

async function siteFilter(kind, siteLink) {
  const equivalents = await resolveSiteEquivalents(prisma, siteLink);
  if (kind === KIND_POST) {
    return buildApprovalSiteOrFilter(equivalents) || { siteLink: String(siteLink).trim() };
  }
  return { siteLink: { in: equivalents.length ? equivalents : [String(siteLink).trim()] } };
}

export async function loadUnscheduledPool(kind, siteLink) {
  const k = normalizeKind(kind);
  const link = String(siteLink || "").trim();
  if (!k || !link) return [];

  const filter = await siteFilter(k, link);
  const where = {
    AND: [
      filter,
      { scheduledFor: null },
      { status: { in: POOL_STATUSES } },
      {
        OR: [{ publishStatus: null }, { publishStatus: { not: "published" } }],
      },
    ],
  };

  if (k === KIND_POST) {
    const rows = await prisma.approval.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        userEditedTitle: true,
        status: true,
        publishStatus: true,
        scheduledFor: true,
        createdAt: true,
        siteLink: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      kind: KIND_POST,
      title: r.userEditedTitle || r.title || "Untitled post",
      status: r.status,
      createdAt: r.createdAt,
    }));
  }

  const rows = await prisma.blogPost.findMany({
    where,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      userEditedTitle: true,
      status: true,
      publishStatus: true,
      scheduledFor: true,
      createdAt: true,
      siteLink: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: KIND_BLOG,
    title: r.userEditedTitle || r.title || "Untitled blog",
    status: r.status,
    createdAt: r.createdAt,
  }));
}

/**
 * Occupied local date keys: any same-kind item with a scheduledFor on that day
 * for the site (including published — blocks stacking).
 */
export async function loadOccupiedDateKeys(kind, siteLink, { timeZone = getAppTimezone() } = {}) {
  const k = normalizeKind(kind);
  const link = String(siteLink || "").trim();
  if (!k || !link) return new Set();

  const filter = await siteFilter(k, link);
  const where = {
    AND: [filter, { scheduledFor: { not: null } }],
  };

  const rows =
    k === KIND_POST
      ? await prisma.approval.findMany({
          where,
          select: { scheduledFor: true },
        })
      : await prisma.blogPost.findMany({
          where,
          select: { scheduledFor: true },
        });

  const occupied = new Set();
  for (const r of rows) {
    const key = localDateKey(r.scheduledFor, timeZone);
    if (key) occupied.add(key);
  }
  return occupied;
}
