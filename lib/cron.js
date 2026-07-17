import cron from "node-cron";
import prisma from "./prisma.js";
import { publishToFacebookPage, publishToInstagram } from "./metaPublish.mjs";

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

  // 2. Scheduled Posts Publisher (runs every minute)
  cron.schedule("* * * * *", async () => {
    logger.info("Checking for scheduled posts...");
    const now = new Date();

    try {
      const duePosts = await prisma.approval.findMany({
        where: {
          status: "approved",
          publishStatus: "unpublish",
          scheduledFor: {
            lte: now,
            not: null
          }
        },
        include: {
          assignee: true
        }
      });

      if (duePosts.length === 0) {
        return;
      }

      logger.info(`Found ${duePosts.length} post(s) ready to publish.`);

      const metaToken = process.env.META_PAGE_ACCESS_TOKEN || process.env.META_APP_ACCESS_TOKEN;
      if (!metaToken) {
        logger.error("Missing META_PAGE_ACCESS_TOKEN. Cannot publish posts.");
        return;
      }

      for (const post of duePosts) {
        const { assignee } = post;
        logger.info(`Processing post ID: ${post.id} for user ${assignee.email}`);

        const text = post.userEditedCaption || post.caption || post.userEditedTitle || post.title;
        const media = post.imagePath;

        let fbSuccess = false;
        let igSuccess = false;
        let errors = [];

        const fbPageId = post.facebookPageId || assignee.facebookPageId;
        const igUserId = post.instagramUserId || assignee.instagramUserId;

        if (fbPageId) {
          try {
            await publishToFacebookPage(fbPageId, metaToken, media, text);
            fbSuccess = true;
            logger.info(`Successfully published to Facebook Page ${fbPageId}`);
          } catch (err) {
            errors.push(`Facebook: ${err.message}`);
          }
        }

        if (igUserId) {
          try {
            await publishToInstagram(igUserId, metaToken, media, text);
            igSuccess = true;
            logger.info(`Successfully published to Instagram User ${igUserId}`);
          } catch (err) {
            errors.push(`Instagram: ${err.message}`);
          }
        }

        const finalStatus = (fbSuccess || igSuccess) ? "published" : "failed";
        const updatedPost = await prisma.approval.update({
          where: { id: post.id },
          data: {
            publishStatus: finalStatus,
            publishError: errors.length > 0 ? errors.join(" | ") : null
          },
          include: {
            assignee: { select: { id: true, email: true, name: true, role: true } },
            createdBy: { select: { id: true, email: true, name: true } }
          }
        });

        if (finalStatus === "published") {
          try {
            const { sendPostStatusChangeNotification } = await import("./email.js");
            const systemUser = { name: "System Publisher", email: "scheduler@crossway-tool.com" };
            await sendPostStatusChangeNotification(updatedPost, systemUser, "published", "");
          } catch (err) {
            logger.error(`Failed to send publish notification email for post ${post.id}: ${err.message}`);
          }
        }

        logger.info(`Post ${post.id} marked as ${finalStatus}.`);
      }
    } catch (error) {
      logger.error(`Critical error during social cron processing: ${error.message}`);
    }

    try {
      const { runScheduledBlogPublish } = await import("./blogPublishJobs.js");
      await runScheduledBlogPublish(logger);
    } catch (error) {
      logger.error(`Blog publish cron failed: ${error.message}`);
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