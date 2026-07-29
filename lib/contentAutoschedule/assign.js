/**
 * Greedy weekday fill for content autoschedule.
 */
import prisma from "../prisma.js";
import {
  getAppTimezone,
  datetimeLocalToUtcIso,
} from "../timezone.js";
import { KIND_POST, getAutoscheduleConfig } from "./engine.js";
import {
  loadUnscheduledPool,
  loadOccupiedDateKeys,
  listWeekdayKeysInHorizon,
  localDateKey,
} from "./pool.js";

function pad(n) {
  return String(n).padStart(2, "0");
}

function slotUtcForDay(dateKey, hour, minute, timeZone) {
  const [y, m, d] = String(dateKey).split("-").map(Number);
  const iso = datetimeLocalToUtcIso(
    `${y}-${pad(m)}-${pad(d)}T${pad(hour)}:${pad(minute)}`,
    timeZone
  );
  return iso ? new Date(iso) : null;
}

/**
 * Build proposed assignments without writing.
 * @returns {{ proposals: Array, pool: Array, freeWeekdays: string[], occupied: string[], config: object }}
 */
export async function planAssignments({
  kind,
  siteLink,
  config: configInput = null,
  now = new Date(),
} = {}) {
  const config = configInput || (await getAutoscheduleConfig(kind, siteLink));
  const timeZone = getAppTimezone();
  const hour = config.scheduleHour ?? 10;
  const minute = config.scheduleMinute ?? 0;
  const itemsPerDay = Math.max(1, Math.min(5, Number(config.itemsPerDay) || 1));
  const horizonDays = Math.max(1, Math.min(60, Number(config.horizonDays) || 14));

  const [pool, occupiedSet] = await Promise.all([
    loadUnscheduledPool(kind, siteLink),
    loadOccupiedDateKeys(kind, siteLink, { timeZone }),
  ]);

  const weekdayKeys = listWeekdayKeysInHorizon({ horizonDays, timeZone, now });
  const freeWeekdays = [];
  const daySlots = []; // { dateKey, remaining }

  for (const key of weekdayKeys) {
    if (occupiedSet.has(key)) continue;
    const slot = slotUtcForDay(key, hour, minute, timeZone);
    if (!slot || slot.getTime() <= now.getTime()) {
      // Today's slot already passed — skip this day
      continue;
    }
    freeWeekdays.push(key);
    daySlots.push({ dateKey: key, remaining: itemsPerDay, slot });
  }

  const proposals = [];
  let poolIdx = 0;
  for (const day of daySlots) {
    while (day.remaining > 0 && poolIdx < pool.length) {
      const item = pool[poolIdx];
      poolIdx += 1;
      proposals.push({
        id: item.id,
        kind: item.kind || kind,
        title: item.title,
        status: item.status,
        dateKey: day.dateKey,
        scheduledFor: day.slot.toISOString(),
      });
      day.remaining -= 1;
      // Track as occupied for subsequent items same run when itemsPerDay > 1
      // (same day is fine — remaining handles capacity)
    }
    if (poolIdx >= pool.length) break;
  }

  return {
    config,
    pool,
    freeWeekdays,
    occupied: [...occupiedSet].sort(),
    proposals,
    unassignedCount: Math.max(0, pool.length - proposals.length),
  };
}

/**
 * Apply proposals: only update rows that still have scheduledFor = null.
 */
export async function applyAssignments({ kind, siteLink, proposals = [] } = {}) {
  const applied = [];
  const skipped = [];

  for (const p of proposals) {
    try {
      const notPublished = {
        OR: [{ publishStatus: null }, { publishStatus: { not: "published" } }],
      };
      if (kind === KIND_POST || p.kind === KIND_POST) {
        const result = await prisma.approval.updateMany({
          where: {
            id: p.id,
            scheduledFor: null,
            AND: [notPublished],
          },
          data: {
            scheduledFor: new Date(p.scheduledFor),
            lastAction: "autoschedule",
          },
        });
        if (result.count) applied.push(p);
        else skipped.push({ ...p, reason: "already_scheduled_or_missing" });
      } else {
        const result = await prisma.blogPost.updateMany({
          where: {
            id: p.id,
            scheduledFor: null,
            AND: [notPublished],
          },
          data: {
            scheduledFor: new Date(p.scheduledFor),
            lastAction: "autoschedule",
          },
        });
        if (result.count) applied.push(p);
        else skipped.push({ ...p, reason: "already_scheduled_or_missing" });
      }
    } catch (err) {
      skipped.push({ ...p, reason: err.message || "update_failed" });
    }
  }

  return { applied, skipped };
}

/** Verify a proposal's dateKey still matches after write (debug helper). */
export function proposalLocalKey(scheduledForIso, timeZone = getAppTimezone()) {
  return localDateKey(scheduledForIso, timeZone);
}
