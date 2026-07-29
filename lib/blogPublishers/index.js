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

function isWordpressLinkedBlog(blog, options = {}) {
  return (
    options.preferWordpress === true ||
    ["wordpress_pull", "inbound"].includes(String(blog?.source || "")) ||
    Boolean(blog?.externalId || blog?.externalPostId)
  );
}

function resolvePublishChain(config, blog, options = {}) {
  const base = parseDeliveryChain(config);
  const preferWp = isWordpressLinkedBlog(blog, options);

  if (!preferWp) return base;

  // WordPress first for WP-sourced / WP-linked blogs.
  const rest = base.filter((m) => m !== "wordpress");
  if (config?.wordpressUrl && config?.wordpressUsername && config?.wordpressAppPassword) {
    return ["wordpress", ...rest];
  }
  return base;
}

/**
 * Try delivery chain until one succeeds.
 * WP-linked blogs only succeed when WordPress itself publishes (no webhook/email false success).
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
  const forcePublish = options.forcePublish !== false;
  const wpLinked = isWordpressLinkedBlog(blog, options);

  if (forcePublish) {
    payload.status = "publish";
    // Avoid WP bouncing to "future" when Crossway still has a later scheduledFor.
    payload.date = new Date().toISOString();
  }

  const chain = resolvePublishChain(config, blog, options);
  const errors = [];
  const requireWordpress =
    wpLinked &&
    Boolean(config?.wordpressUrl && config?.wordpressUsername && config?.wordpressAppPassword);

  for (const method of chain) {
    if (requireWordpress && method !== "wordpress") {
      // Do not accept non-WP fallbacks as terminal publish for WordPress-linked blogs.
      continue;
    }

    const handler = HANDLERS[method];
    if (!handler) {
      errors.push(`${method}: unknown delivery method`);
      continue;
    }

    try {
      const result =
        method === "wordpress"
          ? await handler(payload, config, blog, {
              forcePublish,
              mode: options.mode || (forcePublish ? "publish" : "schedule"),
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
      if (requireWordpress && method === "wordpress") {
        return { success: false, errors };
      }
    }
  }

  if (requireWordpress && !errors.some((e) => e.startsWith("wordpress:"))) {
    errors.push("wordpress: WordPress delivery is required for this blog but was not attempted.");
  }

  return { success: false, errors };
}
