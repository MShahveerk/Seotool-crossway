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

        if (assignee.facebookPageId) {
          try {
            await publishToFacebookPage(assignee.facebookPageId, metaToken, media, text);
            fbSuccess = true;
            logger.info(`Successfully published to Facebook Page ${assignee.facebookPageId}`);
          } catch (err) {
            errors.push(`Facebook: ${err.message}`);
          }
        }

        if (assignee.instagramUserId) {
          try {
            await publishToInstagram(assignee.instagramUserId, metaToken, media, text);
            igSuccess = true;
            logger.info(`Successfully published to Instagram User ${assignee.instagramUserId}`);
          } catch (err) {
            errors.push(`Instagram: ${err.message}`);
          }
        }

        const finalStatus = (fbSuccess || igSuccess) ? "published" : "failed";
        await prisma.approval.update({
          where: { id: post.id },
          data: {
            publishStatus: finalStatus,
            publishError: errors.length > 0 ? errors.join(" | ") : null
          }
        });

        logger.info(`Post ${post.id} marked as ${finalStatus}.`);
      }
    } catch (error) {
      logger.error(`Critical error during cron processing: ${error.message}`);
    }
  });
}