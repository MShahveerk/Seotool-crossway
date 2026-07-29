import { defaultUnscheduledDraftTimes } from "./timezone.js";

/**
 * Ensure an approved post has a publish schedule.
 * - Future schedule → keep it
 * - Past / due / within 90s → keep it (caller should publish now)
 * - Missing → next 11:59 slot in app timezone
 */
export function resolveScheduleOnApprove(existingScheduledFor) {
  if (existingScheduledFor) {
    const d =
      existingScheduledFor instanceof Date
        ? existingScheduledFor
        : new Date(existingScheduledFor);
    if (!Number.isNaN(d.getTime())) {
      // Keep past/due schedules so "publish if due" can fire; only replace invalid dates.
      return d;
    }
  }
  const [next] = defaultUnscheduledDraftTimes(1);
  return next || new Date(Date.now() + 60 * 60 * 1000);
}

/** True when the schedule is due now (with a small grace for clock/UI skew). */
export function isScheduleDue(scheduledFor, { graceMs = 90_000, now = Date.now() } = {}) {
  if (!scheduledFor) return false;
  const t = scheduledFor instanceof Date ? scheduledFor.getTime() : new Date(scheduledFor).getTime();
  if (Number.isNaN(t)) return false;
  return t <= now + graceMs;
}
