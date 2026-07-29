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

function resolvePublishChain(config, blog, options = {}) {
  const base = parseDeliveryChain(config);
  const preferWp =
    options.preferWordpress === true ||
    ["wordpress_pull", "inbound"].includes(String(blog?.source || "")) ||
    Boolean(blog?.externalId || blog?.externalPostId);

  if (!preferWp) return base;

  // Ensure WordPress runs (and first) for WP-sourced / WP-linked blogs so
  // webhook ACKs cannot mark the blog published without a real WP write.
  const rest = base.filter((m) => m !== "wordpress");
  if (config?.wordpressUrl && config?.wordpressUsername && config?.wordpressAppPassword) {
    return ["wordpress", ...rest];
  }
  return base;
}

/**
 * Try delivery chain until one succeeds.
 * @param {object} blog
 * @param {{ forcePublish?: boolean, preferWordpress?: boolean, mode?: string }} [options]
 * @returns {{ success: boolean, method?: string, externalId?: string, errors: string[], link?: string }}
 */
export async function publishBlogPost(blog, options = {}) {
  const config = await getSitePublishConfig(blog.siteLink);
  if (!config || !config.enabled) {
    return { success: false, errors: ["Blog publishing is not configured for this site."] };
  }

  const payload = getEffectiveBlogFields(blog);
  // Live publish must not keep pulled draft/future wpStatus
  if (options.forcePublish !== false) {
    payload.status = "publish";
  }

  const chain = resolvePublishChain(config, blog, options);
  const errors = [];

  for (const method of chain) {
    const handler = HANDLERS[method];
    if (!handler) {
      errors.push(`${method}: unknown delivery method`);
      continue;
    }

    try {
      const result =
        method === "wordpress"
          ? await handler(payload, config, blog, {
              forcePublish: options.forcePublish !== false,
              mode: options.mode || "publish",
            })
          : await handler(payload, config, blog);
      await logAttempt(blog.id, method, true, result.externalId, result.responseBody);
      return {
        success: true,
        method,
        externalId: result.externalId,
        link: result.link,
        errors,
      };
    } catch (err) {
      const msg = `${method}: ${err.message}`;
      errors.push(msg);
      await logAttempt(blog.id, method, false, null, msg);
    }
  }

  return { success: false, errors };
}
