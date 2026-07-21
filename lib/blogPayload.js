/**
 * WordPress REST–shaped blog payload helpers.
 */
import { normalizeSiteOrigin } from "./validation.js";
import { datetimeLocalToUtcIso } from "./timezone.js";

export const SEO_META_FIELDS = ["seo_title", "meta_description", "focus_keyword"];

export function parseSeoMetaInput(input = {}) {
  const meta = input.meta && typeof input.meta === "object" ? { ...input.meta } : {};
  const seoTitle = String(input.seoTitle ?? input.seo_title ?? meta.seo_title ?? meta.yoast_title ?? "").trim();
  const metaDescription = String(
    input.metaDescription ?? input.meta_description ?? meta.meta_description ?? meta.yoast_metadesc ?? ""
  ).trim();
  const focusKeyword = String(
    input.focusKeyword ?? input.focus_keyword ?? meta.focus_keyword ?? meta.yoast_focuskw ?? ""
  ).trim();

  const seo = {};
  if (seoTitle) seo.seo_title = seoTitle;
  if (metaDescription) seo.meta_description = metaDescription;
  if (focusKeyword) seo.focus_keyword = focusKeyword;
  return seo;
}

export function mergeSeoMeta(baseMeta = {}, seoMeta = {}) {
  const merged = { ...(baseMeta && typeof baseMeta === "object" ? baseMeta : {}), ...seoMeta };
  Object.keys(merged).forEach((key) => {
    if (merged[key] === "" || merged[key] == null) delete merged[key];
  });
  return merged;
}

export function extractSeoMetaFromPayload(payload = {}) {
  const meta = payload.meta && typeof payload.meta === "object" ? payload.meta : {};
  return {
    seoTitle: meta.seo_title || meta.yoast_title || "",
    metaDescription: meta.meta_description || meta.yoast_metadesc || "",
    focusKeyword: meta.focus_keyword || meta.yoast_focuskw || "",
  };
}

export function slugifyTitle(title) {
  return String(title || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 200);
}

export function parseScheduledDate(input) {
  if (!input) return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  const raw = String(input).trim();
  if (!raw) return null;
  const normalized = raw.replace(" ", "T");
  // Absolute instants (ISO with Z / offset) — parse as-is.
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)) {
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // datetime-local / WP site-local without offset → app timezone (not server local).
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(normalized)) {
    const iso = datetimeLocalToUtcIso(normalized.slice(0, 16));
    return iso ? new Date(iso) : null;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Build canonical WordPress-shaped payload from parts.
 */
export function buildBlogPayload(parts = {}) {
  const title = String(parts.title || "").trim();
  const content = String(parts.content || "").trim();
  const excerpt = String(parts.excerpt || "").trim();
  const slug = String(parts.slug || slugifyTitle(title)).trim() || slugifyTitle(title);
  const wpStatus = String(parts.status || parts.wpStatus || "draft").trim() || "draft";
  const date = parts.date || parts.scheduledFor || null;

  const featured = parts.featured_media || parts.featuredMedia || {};
  const featuredUrl = featured.url || parts.featuredImageUrl || null;
  const featuredAlt = featured.alt || parts.featuredImageAlt || "";

  return {
    title,
    content,
    excerpt,
    slug,
    status: wpStatus,
    date: date ? new Date(date).toISOString() : null,
    featured_media: {
      url: featuredUrl,
      alt: featuredAlt,
      id: featured.id ?? null,
    },
    categories: Array.isArray(parts.categories) ? parts.categories : [],
    tags: Array.isArray(parts.tags) ? parts.tags : [],
    meta: mergeSeoMeta(parts.meta, parseSeoMetaInput(parts)),
    author: parts.author && typeof parts.author === "object" ? parts.author : {},
  };
}

export function normalizeInboundPayload(body = {}) {
  const title = String(body.title || body.post_title || "").trim();
  const content = String(body.content || body.post_content || body.body || "").trim();
  if (!title || !content) {
    const err = new Error("title and content are required.");
    err.status = 400;
    throw err;
  }

  const scheduled = parseScheduledDate(body.date || body.scheduledFor || body.scheduled_for);
  const payload = buildBlogPayload({
    title,
    content,
    excerpt: body.excerpt || body.post_excerpt || "",
    slug: body.slug || body.post_name || "",
    status: body.status || body.wp_status || "draft",
    date: scheduled,
    categories: body.categories || body.category_ids || [],
    tags: body.tags || body.tag_names || [],
    meta: body.meta || {},
    author: body.author || {},
    featured_media: body.featured_media || {
      url: body.featured_image_url || body.featuredImageUrl,
      alt: body.featured_image_alt || body.featuredImageAlt || "",
    },
  });

  return {
    title: payload.title,
    slug: payload.slug,
    excerpt: payload.excerpt,
    content: payload.content,
    wpStatus: payload.status,
    scheduledFor: scheduled,
    payload,
    externalId: body.externalId || body.external_id || body.id ? String(body.externalId || body.external_id || body.id) : null,
  };
}

/** Effective fields after assignee edits (for publish). */
export function getEffectiveBlogFields(blog) {
  const payload = blog.payload && typeof blog.payload === "object" ? { ...blog.payload } : buildBlogPayload(blog);
  const title = String(blog.userEditedTitle || blog.title || payload.title || "").trim();
  const slug = String(blog.userEditedSlug || blog.slug || payload.slug || slugifyTitle(title)).trim();
  const excerpt = String(blog.userEditedExcerpt ?? blog.excerpt ?? payload.excerpt ?? "").trim();
  const content = String(blog.userEditedContent || blog.content || payload.content || "").trim();

  const merged = {
    ...payload,
    title,
    slug,
    excerpt,
    content,
    status: blog.wpStatus || payload.status || "draft",
    date: (blog.scheduledFor || payload.date) ? new Date(blog.scheduledFor || payload.date).toISOString() : null,
    featured_media: {
      ...(payload.featured_media || {}),
      url: blog.featuredImagePath
        ? absoluteMediaUrl(blog.featuredImagePath)
        : payload.featured_media?.url || null,
      alt: blog.featuredImageAlt || payload.featured_media?.alt || "",
    },
    site_link: blog.siteLink,
    blog_id: blog.id,
  };

  return merged;
}

export function absoluteMediaUrl(path) {
  const raw = String(path || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = (process.env.PUBLIC_URL || process.env.NEXTAUTH_URL || "").replace(/\/+$/, "");
  if (!base) return raw;
  return `${base}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

export function normalizeSiteForMatch(site) {
  const s = String(site || "").trim();
  if (!s) return "";
  if (/^\d+$/.test(s)) return s;
  return normalizeSiteOrigin(s) || s;
}

export function serializeBlogForApi(blog) {
  if (!blog) return null;
  return {
    ...blog,
    itemType: "blog",
    payload: blog.payload,
  };
}
