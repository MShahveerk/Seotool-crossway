import { defaultUnscheduledDraftTimes } from "./timezone.js";

/**
 * Ensure an approved post has a publish schedule (next 11:59 slot if unset).
 */
export function resolveScheduleOnApprove(existingScheduledFor) {
  if (existingScheduledFor) {
    const d = existingScheduledFor instanceof Date ? existingScheduledFor : new Date(existingScheduledFor);
    if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now()) return d;
  }
  const [next] = defaultUnscheduledDraftTimes(1);
  return next || new Date(Date.now() + 60 * 60 * 1000);
}
