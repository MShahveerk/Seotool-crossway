import cron from "node-cron";

const logger = {
  info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
  error: (msg, data) => console.error(`[ERROR] ${msg}`, data || '')
};

// Keep a reference so we only start the cron once in dev
let isRunning = false;

export function startCronJobs() {
  if (isRunning) return;
  isRunning = true;

  logger.info("Initializing SMM Cron Scheduler within Next.js...");

  // 1. Keep-Alive Service for Render Free Tier (pings itself every 14 mins)
  cron.schedule("*/14 * * * *", async () => {
    const url = process.env.NEXTAUTH_URL;
    if (url) {
      try {
        await fetch(url);
        logger.info(`Keep-alive ping sent to ${url}`);
      } catch (err) {
        logger.error(`Keep-alive ping failed: ${err.message}`);
      }
    }
  });

  // 2. Scheduled posts + blogs publisher (runs every minute)
  cron.schedule("* * * * *", async () => {
    try {
      const { runScheduledPostPublish } = await import("./postPublishJobs.js");
      await runScheduledPostPublish(logger);
    } catch (error) {
      logger.error(`Post publish cron failed: ${error.message}`);
    }

    try {
      const { runScheduledBlogPublish } = await import("./blogPublishJobs.js");
      await runScheduledBlogPublish(logger);
    } catch (error) {
      logger.error(`Blog publish cron failed: ${error.message}`);
    }

    try {
      const { runScheduledBlogAutomation } = await import("./blogAutomation.js");
      await runScheduledBlogAutomation(logger);
    } catch (error) {
      logger.error(`Blog automation cron failed: ${error.message}`);
    }
  });

  // 3. Weekly SEO jobs — Mondays 06:00 (server local time)
  // Sitemap: SEO_AUTO_SUBMIT_SITEMAPS. Digest: UI toggle and/or SEO_DIGEST_EMAIL.
  cron.schedule("0 6 * * 1", async () => {
    logger.info("Running weekly SEO jobs...");
    try {
      const { runWeeklySitemapResubmit, runWeeklySeoDigest } = await import("./seoJobs.js");
      await runWeeklySitemapResubmit(logger);
      await runWeeklySeoDigest(logger);
    } catch (err) {
      logger.error(`Weekly SEO jobs failed: ${err.message}`);
    }
  });

  // 3b. Weekly client reports to approvers — Mondays 07:00
  cron.schedule("0 7 * * 1", async () => {
    logger.info("Running weekly client reports for approvers...");
    try {
      const { runWeeklyClientReports } = await import("./clientReportJobs.js");
      await runWeeklyClientReports(logger);
    } catch (err) {
      logger.error(`Weekly client reports failed: ${err.message}`);
    }
  });

  // 3c. WordPress draft pull — hourly for sites with pull enabled
  cron.schedule("0 * * * *", async () => {
    logger.info("Running WordPress draft pull...");
    try {
      const { runWordpressPullForAllSites } = await import("./wordpressPull.js");
      await runWordpressPullForAllSites(logger);
    } catch (err) {
      logger.error(`WordPress pull cron failed: ${err.message}`);
    }
  });

  // 3c2. Meta scheduled post pull — hourly
  cron.schedule("15 * * * *", async () => {
    logger.info("Running Meta draft pull...");
    try {
      const { runMetaPullForAllSites } = await import("./metaDraftPull.js");
      await runMetaPullForAllSites(logger);
    } catch (err) {
      logger.error(`Meta pull cron failed: ${err.message}`);
    }
  });

  // 3c3. Email inbound — every 10 minutes
  cron.schedule("*/10 * * * *", async () => {
    logger.info("Running email inbound pull...");
    try {
      const { runEmailInboundForAllSites } = await import("./emailInboundPull.js");
      await runEmailInboundForAllSites(logger);
    } catch (err) {
      logger.error(`Email inbound cron failed: ${err.message}`);
    }
  });

  // 3d. PageSpeed snapshots — every 2 hours (both strategies, all known websites)
  cron.schedule("10 */2 * * *", async () => {
    logger.info("Running PageSpeed snapshot refresh...");
    try {
      const { runPageSpeedRefreshAll } = await import("./pagespeedJobs.js");
      await runPageSpeedRefreshAll(logger);
    } catch (err) {
      logger.error(`PageSpeed snapshot refresh failed: ${err.message}`);
    }
  });

  // 3e. Daily site audits for every website — 03:30
  cron.schedule("30 3 * * *", async () => {
    logger.info("Running daily site audits...");
    try {
      const { runSiteAuditsForAllSites } = await import("./siteAuditJobs.js");
      await runSiteAuditsForAllSites(logger);
    } catch (err) {
      logger.error(`Daily site audits failed: ${err.message}`);
    }
  });

  // 3f. Daily domain authority refresh — 04:30
  cron.schedule("30 4 * * *", async () => {
    logger.info("Running daily authority refresh...");
    try {
      const { runAuthorityRefreshAll } = await import("./authority.js");
      await runAuthorityRefreshAll(logger);
    } catch (err) {
      logger.error(`Daily authority refresh failed: ${err.message}`);
    }
  });

  // 3g. Weekly Common Crawl site explorer — Mondays 05:00 (7-day cache per domain)
  cron.schedule("0 5 * * 1", async () => {
    logger.info("Running weekly site explorer (Common Crawl) refresh...");
    try {
      const { runSiteExplorerForAllSites } = await import("./siteExplorerJobs.js");
      await runSiteExplorerForAllSites(logger);
    } catch (err) {
      logger.error(`Weekly site explorer refresh failed: ${err.message}`);
    }
  });

  // 3g2. Weekly SE Ranking site explorer — Mondays 05:30 (7-day cache per explored domain)
  cron.schedule("30 5 * * 1", async () => {
    logger.info("Running weekly SE Ranking site explorer refresh...");
    try {
      const { runSerankingExplorerWeeklyRefresh } = await import("./seranking/explorerCache.js");
      await runSerankingExplorerWeeklyRefresh(logger);
    } catch (err) {
      logger.error(`Weekly SE Ranking explorer refresh failed: ${err.message}`);
    }
  });

  // 3h. Weekly Keyword Planner enrichment — Mondays 06:30 (after SEO digest)
  cron.schedule("30 6 * * 1", async () => {
    logger.info("Running weekly Keyword Planner refresh...");
    try {
      const { runKeywordPlannerRefreshAll } = await import("./keywordResearchJobs.js");
      await runKeywordPlannerRefreshAll(logger);
    } catch (err) {
      logger.error(`Keyword Planner refresh failed: ${err.message}`);
    }
  });

  // 3i. SE Ranking cached refresh — daily 04:45 (conservative credit budget)
  cron.schedule("45 4 * * *", async () => {
    logger.info("Running SE Ranking scheduled refresh...");
    try {
      const { runSerankingScheduledRefresh } = await import("./seranking/jobs.js");
      await runSerankingScheduledRefresh(logger);
    } catch (err) {
      logger.error(`SE Ranking refresh failed: ${err.message}`);
    }
  });

  // 4. Daily URL Inspection monitor — 05:00 (opt-in: SEO_URL_INSPECT_DAILY=true)
  cron.schedule("0 5 * * *", async () => {
    logger.info("Running daily URL inspections...");
    try {
      const { runDailyUrlInspections } = await import("./urlInspectionJobs.js");
      await runDailyUrlInspections(logger);
    } catch (err) {
      logger.error(`Daily URL inspections failed: ${err.message}`);
    }
  });
}