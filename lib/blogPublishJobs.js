import prisma from "../prisma.js";
import { publishBlogPost } from "./blogPublishers/index.js";

const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
};

export async function runScheduledBlogPublish(loggerIn = logger) {
  const now = new Date();
  const due = await prisma.blogPost.findMany({
    where: {
      status: "approved",
      publishStatus: "unpublish",
      scheduledFor: { lte: now, not: null },
    },
    include: { assignee: { select: { id: true, email: true, name: true } } },
  });

  if (!due.length) return { processed: 0 };

  loggerIn.info(`Found ${due.length} blog(s) ready to publish.`);

  for (const blog of due) {
    try {
      const result = await publishBlogPost(blog);
      const finalStatus = result.success ? "published" : "failed";
      await prisma.blogPost.update({
        where: { id: blog.id },
        data: {
          publishStatus: finalStatus,
          publishError: result.success ? null : result.errors.join(" | "),
          externalPostId: result.externalId || undefined,
        },
      });

      if (result.success) {
        try {
          const { sendBlogPublishNotification } = await import("./email.js");
          await sendBlogPublishNotification(blog, result.method, result.externalId);
        } catch (err) {
          loggerIn.error(`Blog publish email failed for ${blog.id}: ${err.message}`);
        }
      }

      loggerIn.info(`Blog ${blog.id} marked as ${finalStatus} via ${result.method || "none"}.`);
    } catch (err) {
      loggerIn.error(`Blog publish failed ${blog.id}: ${err.message}`);
      await prisma.blogPost.update({
        where: { id: blog.id },
        data: { publishStatus: "failed", publishError: err.message },
      });
    }
  }

  return { processed: due.length };
}

export async function publishBlogNow(blogId, loggerIn = logger) {
  const blog = await prisma.blogPost.findUnique({
    where: { id: blogId },
    include: { assignee: { select: { id: true, email: true, name: true } } },
  });

  if (!blog) {
    const err = new Error("Blog not found.");
    err.status = 404;
    throw err;
  }

  if (blog.publishStatus === "published") {
    const err = new Error("Blog is already published.");
    err.status = 400;
    throw err;
  }

  if (!["approved", "edited"].includes(blog.status)) {
    const err = new Error("Blog must be approved before publishing.");
    err.status = 400;
    throw err;
  }

  const result = await publishBlogPost(blog);
  const finalStatus = result.success ? "published" : "failed";

  await prisma.blogPost.update({
    where: { id: blog.id },
    data: {
      publishStatus: finalStatus,
      publishError: result.success ? null : result.errors.join(" | "),
      externalPostId: result.externalId || undefined,
    },
  });

  if (result.success) {
    try {
      const { sendBlogPublishNotification } = await import("./email.js");
      await sendBlogPublishNotification(blog, result.method, result.externalId);
    } catch (err) {
      loggerIn.error(`Blog publish email failed for ${blog.id}: ${err.message}`);
    }
  }

  return { success: result.success, method: result.method, externalId: result.externalId, errors: result.errors };
}
