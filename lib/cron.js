import cron from "node-cron";

const logger = {
  info: (msg, data) => console.log(`[INFO] ${msg}`, data || ""),
  error: (msg, data) => console.error(`[ERROR] ${msg}`, data || ""),
};

// Keep a reference so we only start the cron once in dev
let isRunning = false;

async function runCron(id, fn) {
  try {
    const { isCronJobEnabled } = await import("./cronSettings.js");
    if (!(await isCronJobEnabled(id))) {
      logger.info(`Cron "${id}" skipped (disabled in Admin → Cron jobs)`);
      return;
    }
    await fn();
  } catch (error) {
    logger.error(`Cron "${id}" failed: ${error?.message || error}`);
  }
}

export function startCronJobs() {
  if (isRunning) return;
  isRunning = true;

  logger.info("Initializing SMM Cron Scheduler within Next.js...");

  // 1. Keep-Alive Service for Render Free Tier (pings itself every 14 mins)
  cron.schedule("*/14 * * * *", async () => {
    await runCron("keep-alive", async () => {
      const url = process.env.NEXTAUTH_URL;
      if (!url) return;
      await fetch(url);
      logger.info(`Keep-alive ping sent to ${url}`);
    });
  });

  // 2. Scheduled posts + blogs publisher (runs every minute)
  cron.schedule("* * * * *", async () => {
    await runCron("post-publish", async () => {
      const { runScheduledPostPublish } = await import("./postPublishJobs.js");
      await runScheduledPostPublish(logger);
    });

    await runCron("blog-publish", async () => {
      const { runScheduledBlogPublish } = await import("./blogPublishJobs.js");
      await runScheduledBlogPublish(logger);
    });

    await runCron("blog-automation", async () => {
      const { runScheduledBlogAutomation } = await import("./blogAutomation.js");
      await runScheduledBlogAutomation(logger);
    });

    await runCron("seo-autopilot", async () => {
      const { runScheduledSeoAutopilot } = await import("./seoAutopilot/runner.js");
      await runScheduledSeoAutopilot(logger);
    });

    await runCron("post-automation", async () => {
      const { runScheduledPostAutomation } = await import("./postAutomation.js");
      await runScheduledPostAutomation(logger);
    });

    await runCron("content-autoschedule", async () => {
      const { runScheduledContentAutoschedule } = await import("./contentAutoschedule/runner.js");
      await runScheduledContentAutoschedule(logger);
    });
  });

  // 3. Weekly SEO jobs — Mondays 06:00 (server local time)
  cron.schedule("0 6 * * 1", async () => {
    logger.info("Running weekly SEO jobs...");
    await runCron("sitemap-resubmit", async () => {
      const { runWeeklySitemapResubmit } = await import("./seoJobs.js");
      await runWeeklySitemapResubmit(logger);
    });
    await runCron("seo-digest", async () => {
      const { sendStaffDigestsNow } = await import("./reports/sendJobs.js");
      await sendStaffDigestsNow({ trigger: "cron" });
    });
  });

  // 3b. Monthly reports (weekly send) — Mondays 07:00
  cron.schedule("0 7 * * 1", async () => {
    await runCron("client-reports", async () => {
      logger.info("Running weekly client slide-deck reports...");
      const { sendClientReportsNow } = await import("./reports/sendJobs.js");
      await sendClientReportsNow({ trigger: "cron" });
    });
  });

  // 3c. WordPress draft pull — hourly
  cron.schedule("0 * * * *", async () => {
    await runCron("wordpress-pull", async () => {
      logger.info("Running WordPress draft pull...");
      const { runWordpressPullForAllSites } = await import("./wordpressPull.js");
      await runWordpressPullForAllSites(logger);
    });
  });

  // 3c2. Meta scheduled post pull — hourly
  cron.schedule("15 * * * *", async () => {
    await runCron("meta-pull", async () => {
      logger.info("Running Meta draft pull...");
      const { runMetaPullForAllSites } = await import("./metaDraftPull.js");
      await runMetaPullForAllSites(logger);
    });
  });

  // 3c3. Email inbound — every 10 minutes
  cron.schedule("*/10 * * * *", async () => {
    await runCron("email-inbound", async () => {
      logger.info("Running email inbound pull...");
      const { runEmailInboundForAllSites } = await import("./emailInboundPull.js");
      await runEmailInboundForAllSites(logger);
    });
  });

  // 3c4. Promote latest email draft → approval queue (daily at 09:00)
  cron.schedule("0 9 * * *", async () => {
    await runCron("email-promote", async () => {
      logger.info("Promoting email drafts for approval...");
      const { promoteEmailDraftsForApproval } = await import("./emailInboundPull.js");
      await promoteEmailDraftsForApproval(logger);
    });
  });

  // 3d. PageSpeed snapshots — every 2 hours
  cron.schedule("10 */2 * * *", async () => {
    await runCron("pagespeed", async () => {
      logger.info("Running PageSpeed snapshot refresh...");
      const { runPageSpeedRefreshAll } = await import("./pagespeedJobs.js");
      await runPageSpeedRefreshAll(logger);
    });
  });

  /* The nightly internal crawl used to live here. SE Ranking is now the only
     audit anyone sees, so the crawl was writing snapshots no screen read — a
     nightly fetch of every client site for nobody. */

  // 3f. Daily domain authority refresh — 04:30
  cron.schedule("30 4 * * *", async () => {
    await runCron("authority", async () => {
      logger.info("Running daily authority refresh...");
      const { runAuthorityRefreshAll } = await import("./authority.js");
      await runAuthorityRefreshAll(logger);
    });
  });

  // 3g. Weekly Common Crawl site explorer — Mondays 05:00
  cron.schedule("0 5 * * 1", async () => {
    await runCron("site-explorer", async () => {
      logger.info("Running weekly site explorer (Common Crawl) refresh...");
      const { runSiteExplorerForAllSites } = await import("./siteExplorerJobs.js");
      await runSiteExplorerForAllSites(logger);
    });
  });

  // 3g2. Weekly SE Ranking site explorer — Mondays 05:30
  cron.schedule("30 5 * * 1", async () => {
    await runCron("seranking-explorer", async () => {
      logger.info("Running weekly SE Ranking site explorer refresh...");
      const { runSerankingExplorerWeeklyRefresh } = await import("./seranking/explorerCache.js");
      await runSerankingExplorerWeeklyRefresh(logger);
    });
  });

  // 3h. Weekly Keyword Planner enrichment — Mondays 06:30
  cron.schedule("30 6 * * 1", async () => {
    await runCron("keyword-planner", async () => {
      logger.info("Running weekly Keyword Planner refresh...");
      const { runKeywordPlannerRefreshAll } = await import("./keywordResearchJobs.js");
      await runKeywordPlannerRefreshAll(logger);
    });
  });

  // 3i. SE Ranking cached refresh — daily 04:45
  cron.schedule("45 4 * * *", async () => {
    await runCron("seranking", async () => {
      logger.info("Running SE Ranking scheduled refresh...");
      const { runSerankingScheduledRefresh } = await import("./seranking/jobs.js");
      await runSerankingScheduledRefresh(logger);
    });
  });

  // 4. Daily URL Inspection monitor — 05:00
  cron.schedule("0 5 * * *", async () => {
    await runCron("url-inspect", async () => {
      logger.info("Running daily URL inspections...");
      const { runDailyUrlInspections } = await import("./urlInspectionJobs.js");
      await runDailyUrlInspections(logger);
    });
  });
}
