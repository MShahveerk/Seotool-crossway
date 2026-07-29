/**
 * Scheduled entry for Post Automation (internal Studio vs external ingest mode).
 */
import { getEngineMode, ENGINE_INTERNAL } from "./postsStudio/engine.js";
import { runScheduledInternalPostStudio } from "./postsStudio/runner.js";

export async function runScheduledPostAutomation(logger = console) {
  const mode = await getEngineMode();
  if (mode === ENGINE_INTERNAL) {
    return runScheduledInternalPostStudio(logger);
  }
  // External mode: inbound / Meta pull / email remain the generators — nothing to do here.
  return { processed: 0, mode: "external" };
}
