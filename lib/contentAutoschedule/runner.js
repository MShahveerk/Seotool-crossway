/**
 * Run content autoschedule for one site or all enabled configs.
 */
import {
  getAutoscheduleConfig,
  listEnabledConfigs,
  normalizeKind,
  touchLastRun,
} from "./engine.js";
import { planAssignments, applyAssignments } from "./assign.js";

/**
 * @param {{ kind: string, siteLink: string, dryRun?: boolean, force?: boolean }} opts
 * force=true runs even when disabled (manual "Run now")
 */
export async function runAutoscheduleForSite({
  kind,
  siteLink,
  dryRun = false,
  force = false,
} = {}) {
  const k = normalizeKind(kind);
  const link = String(siteLink || "").trim();
  if (!k || !link) {
    const err = new Error("kind and siteLink are required.");
    err.status = 400;
    throw err;
  }

  const config = await getAutoscheduleConfig(k, link);
  if (!config.enabled && !force && !dryRun) {
    return {
      kind: k,
      siteLink: link,
      skipped: true,
      reason: "disabled",
      proposals: [],
      applied: [],
    };
  }

  const plan = await planAssignments({ kind: k, siteLink: link, config });

  if (dryRun) {
    return {
      kind: k,
      siteLink: link,
      dryRun: true,
      config: plan.config,
      poolCount: plan.pool.length,
      freeWeekdays: plan.freeWeekdays,
      occupied: plan.occupied,
      proposals: plan.proposals,
      unassignedCount: plan.unassignedCount,
      applied: [],
      skipped: [],
    };
  }

  const { applied, skipped } = await applyAssignments({
    kind: k,
    siteLink: link,
    proposals: plan.proposals,
  });

  await touchLastRun(k, link);

  return {
    kind: k,
    siteLink: link,
    dryRun: false,
    config: plan.config,
    poolCount: plan.pool.length,
    freeWeekdays: plan.freeWeekdays,
    occupied: plan.occupied,
    proposals: plan.proposals,
    unassignedCount: plan.unassignedCount,
    applied,
    skipped,
  };
}

export async function getAutoschedulePreview(kind, siteLink) {
  return runAutoscheduleForSite({ kind, siteLink, dryRun: true, force: true });
}

/** Cron: fill schedules for every enabled site/kind config. */
export async function runScheduledContentAutoschedule(logger = console) {
  const configs = await listEnabledConfigs();
  if (!configs.length) {
    return { processed: 0 };
  }

  let assigned = 0;
  for (const cfg of configs) {
    try {
      const result = await runAutoscheduleForSite({
        kind: cfg.kind,
        siteLink: cfg.siteLink,
        force: false,
      });
      const n = result.applied?.length || 0;
      assigned += n;
      if (n > 0) {
        logger.info?.(
          `[autoschedule] ${cfg.kind} ${cfg.siteLink}: assigned ${n} item(s)`
        );
      }
    } catch (err) {
      logger.error?.(
        `[autoschedule] ${cfg.kind} ${cfg.siteLink} failed: ${err.message}`
      );
    }
  }

  return { processed: configs.length, assigned };
}
