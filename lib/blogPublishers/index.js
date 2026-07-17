import prisma from "../prisma.js";
import { getEffectiveBlogFields } from "../blogPayload.js";
import { getSitePublishConfig, parseDeliveryChain } from "../blogPublishConfig.js";
import { publishViaWebhook } from "./webhook.js";
import { publishViaApi } from "./api.js";
import { publishViaEmail } from "./email.js";
import { publishViaWordpress } from "./wordpress.js";

const HANDLERS = {
  webhook: publishViaWebhook,
  api: publishViaApi,
  email: publishViaEmail,
  wordpress: publishViaWordpress,
};

async function logAttempt(blogPostId, method, success, externalId, responseBody) {
  await prisma.blogPublishLog.create({
    data: {
      blogPostId,
      method,
      success,
      externalId,
      responseBody: responseBody ? String(responseBody).slice(0, 8000) : null,
    },
  });
}

/**
 * Try delivery chain until one succeeds.
 * @returns {{ success: boolean, method?: string, externalId?: string, errors: string[] }}
 */
export async function publishBlogPost(blog) {
  const config = await getSitePublishConfig(blog.siteLink);
  if (!config || !config.enabled) {
    return { success: false, errors: ["Blog publishing is not configured for this site."] };
  }

  const payload = getEffectiveBlogFields(blog);
  const chain = parseDeliveryChain(config);
  const errors = [];

  for (const method of chain) {
    const handler = HANDLERS[method];
    if (!handler) {
      errors.push(`${method}: unknown delivery method`);
      continue;
    }

    try {
      const result = await handler(payload, config, blog);
      await logAttempt(blog.id, method, true, result.externalId, result.responseBody);
      return { success: true, method, externalId: result.externalId, errors };
    } catch (err) {
      const msg = `${method}: ${err.message}`;
      errors.push(msg);
      await logAttempt(blog.id, method, false, null, msg);
      if (!err.skippable) {
        // hard failure on configured method — still try fallbacks
      }
    }
  }

  return { success: false, errors };
}
