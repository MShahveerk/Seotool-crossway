/**
 * Runs once when the Node.js server starts (not during `next build`).
 * Fails fast in production if required env vars are missing.
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  // Extra safety: some CI/build contexts may load instrumentation
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }
  const { validateStartup } = await import("./lib/startup.js");
  await validateStartup();

  // Start the integrated cron scheduler
  const { startCronJobs } = await import("./lib/cron.js");
  startCronJobs();
}
