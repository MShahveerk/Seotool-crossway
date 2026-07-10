import * as dotenv from 'dotenv';
dotenv.config();

import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { publishToFacebookPage, publishToInstagram } from "../lib/metaPublish.mjs";

const prisma = new PrismaClient();

const log = (msg) => console.log(`[Scheduler] ${new Date().toISOString()} - ${msg}`);

async function processScheduledPosts() {
  log("Checking for scheduled posts...");
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

    log(`Found ${duePosts.length} post(s) ready to publish.`);

    const metaToken = process.env.META_PAGE_ACCESS_TOKEN || process.env.META_APP_ACCESS_TOKEN;
    if (!metaToken) {
      log("ERROR: Missing META_PAGE_ACCESS_TOKEN. Cannot publish posts.");
      return;
    }

    for (const post of duePosts) {
      const { assignee } = post;
      log(`Processing post ID: ${post.id} for user ${assignee.email}`);

      const text = post.userEditedCaption || post.caption || post.userEditedTitle || post.title;
      const media = post.imagePath;

      let fbSuccess = false;
      let igSuccess = false;
      let errors = [];

      if (assignee.facebookPageId) {
        try {
          await publishToFacebookPage(assignee.facebookPageId, metaToken, media, text);
          fbSuccess = true;
          log(`Successfully published to Facebook Page ${assignee.facebookPageId}`);
        } catch (err) {
          errors.push(`Facebook: ${err.message}`);
        }
      } else {
        log(`No Facebook Page ID linked for assignee ${assignee.id}. Skipping Facebook.`);
      }

      if (assignee.instagramUserId) {
        try {
          await publishToInstagram(assignee.instagramUserId, metaToken, media, text);
          igSuccess = true;
          log(`Successfully published to Instagram User ${assignee.instagramUserId}`);
        } catch (err) {
          errors.push(`Instagram: ${err.message}`);
        }
      } else {
        log(`No Instagram User ID linked for assignee ${assignee.id}. Skipping Instagram.`);
      }

      const finalStatus = (fbSuccess || igSuccess) ? "published" : "failed";
      await prisma.approval.update({
        where: { id: post.id },
        data: {
          publishStatus: finalStatus,
          publishError: errors.length > 0 ? errors.join(" | ") : null
        }
      });

      log(`Post ${post.id} marked as ${finalStatus}.`);
    }
  } catch (error) {
    log(`Critical error during processing: ${error.message}`);
  }
}

cron.schedule("* * * * *", () => {
  processScheduledPosts();
});

log("Scheduler started. Waiting for tasks...");

process.on("SIGINT", async () => {
  log("Shutting down scheduler...");
  await prisma.$disconnect();
  process.exit(0);
});
