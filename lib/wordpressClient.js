/**
 * Shared WordPress REST API client (Application Password auth).
 */
import axios from "axios";

export function getWordpressConfig(config) {
  const base = String(config?.wordpressUrl || "").trim().replace(/\/+$/, "");
  const username = String(config?.wordpressUsername || "").trim();
  const password = String(config?.wordpressAppPassword || "").trim();
  if (!base || !username || !password) {
    const err = new Error("WordPress URL, username, and application password are required.");
    err.status = 400;
    throw err;
  }
  return { base, auth: { username, password } };
}

export async function testWordpressConnection(config) {
  const { base, auth } = getWordpressConfig(config);
  const res = await axios.get(`${base}/wp-json/wp/v2/users/me`, { auth, timeout: 20000 });
  return {
    ok: true,
    name: res.data?.name || res.data?.slug || usernameLabel(auth.username),
    roles: res.data?.roles || [],
  };
}

function usernameLabel(u) {
  return String(u || "user");
}

export async function fetchWordpressPosts(config, { statuses = ["draft", "future"], perPage = 20 } = {}) {
  const { base, auth } = getWordpressConfig(config);
  const statusParam = statuses.join(",");
  const res = await axios.get(`${base}/wp-json/wp/v2/posts`, {
    auth,
    timeout: 30000,
    params: {
      status: statusParam,
      per_page: perPage,
      orderby: "modified",
      order: "desc",
      _embed: "wp:featuredmedia",
    },
  });
  return Array.isArray(res.data) ? res.data : [];
}

export async function fetchWordpressMediaUrl(config, mediaId) {
  if (!mediaId) return null;
  const { base, auth } = getWordpressConfig(config);
  const res = await axios.get(`${base}/wp-json/wp/v2/media/${mediaId}`, { auth, timeout: 15000 });
  return res.data?.source_url || res.data?.guid?.rendered || null;
}

export function extractFeaturedFromPost(wpPost) {
  const embedded = wpPost?._embedded?.["wp:featuredmedia"];
  const media = Array.isArray(embedded) ? embedded[0] : null;
  return {
    url: media?.source_url || null,
    alt: media?.alt_text || "",
    id: media?.id || wpPost?.featured_media || null,
  };
}

export function wpPostToCanonical(wpPost, featured = {}) {
  const title = wpPost?.title?.rendered || wpPost?.title || "";
  const content = wpPost?.content?.rendered || wpPost?.content || "";
  const excerpt = wpPost?.excerpt?.rendered || wpPost?.excerpt || "";
  const date = wpPost?.date_gmt || wpPost?.date || null;
  const scheduled = date ? new Date(date.includes("T") ? date : `${date}T00:00:00Z`) : null;

  return {
    title: stripHtml(title),
    content,
    excerpt: stripHtml(excerpt),
    slug: wpPost?.slug || "",
    wpStatus: wpPost?.status || "draft",
    scheduledFor: scheduled && !Number.isNaN(scheduled.getTime()) ? scheduled : null,
    externalId: String(wpPost?.id || ""),
    categories: wpPost?.categories || [],
    tags: wpPost?.tags || [],
    meta: wpPost?.meta || {},
    featuredImageUrl: featured.url || null,
    featuredImageAlt: featured.alt || "",
    payload: {
      title: stripHtml(title),
      content,
      excerpt: stripHtml(excerpt),
      slug: wpPost?.slug || "",
      status: wpPost?.status || "draft",
      date: scheduled ? scheduled.toISOString() : null,
      featured_media: {
        url: featured.url || null,
        alt: featured.alt || "",
        id: featured.id || null,
      },
      categories: wpPost?.categories || [],
      tags: wpPost?.tags || [],
      meta: wpPost?.meta || {},
      wordpress: {
        id: wpPost?.id,
        link: wpPost?.link,
        modified: wpPost?.modified_gmt || wpPost?.modified,
      },
    },
  };
}

function stripHtml(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

/** Resolve category/tag labels or numeric strings to WP term IDs. */
export async function resolveTaxonomyIds(config, { categories = [], tags = [] } = {}) {
  const { base, auth } = getWordpressConfig(config);
  const catIds = [];
  const tagIds = [];

  for (const item of categories) {
    if (typeof item === "number" || /^\d+$/.test(String(item))) {
      catIds.push(Number(item));
      continue;
    }
    const name = String(item).trim();
    if (!name) continue;
    const res = await axios.get(`${base}/wp-json/wp/v2/categories`, {
      auth,
      params: { search: name, per_page: 5 },
    });
    const match = (res.data || []).find((c) => c.name?.toLowerCase() === name.toLowerCase()) || res.data?.[0];
    if (match?.id) catIds.push(match.id);
  }

  for (const item of tags) {
    if (typeof item === "number" || /^\d+$/.test(String(item))) {
      tagIds.push(Number(item));
      continue;
    }
    const name = String(item).trim();
    if (!name) continue;
    const res = await axios.get(`${base}/wp-json/wp/v2/tags`, {
      auth,
      params: { search: name, per_page: 5 },
    });
    const match = (res.data || []).find((t) => t.name?.toLowerCase() === name.toLowerCase()) || res.data?.[0];
    if (match?.id) tagIds.push(match.id);
  }

  return { categories: catIds, tags: tagIds };
}

export async function uploadFeaturedMediaToWordpress(config, payload) {
  const { base, auth } = getWordpressConfig(config);
  const imageUrl = payload.featured_media?.url;
  if (!imageUrl) return null;

  const { absoluteMediaUrl } = await import("./blogPayload.js");
  const absolute = absoluteMediaUrl(imageUrl);
  if (!absolute) return null;

  const imgRes = await axios.get(absolute, { responseType: "arraybuffer", timeout: 30000 });
  const contentType = imgRes.headers["content-type"] || "image/jpeg";
  const fileName = absolute.split("/").pop()?.split("?")[0] || "featured.jpg";

  const mediaRes = await axios.post(`${base}/wp-json/wp/v2/media`, Buffer.from(imgRes.data), {
    auth,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
    maxBodyLength: Infinity,
    timeout: 60000,
  });

  return mediaRes.data?.id || null;
}

export async function upsertWordpressPost(config, payload, existingWpId = null) {
  const { base, auth } = getWordpressConfig(config);

  let categoryIds = Array.isArray(payload.categories) ? payload.categories : [];
  let tagIds = Array.isArray(payload.tags) ? payload.tags : [];
  const hasStrings = [...categoryIds, ...tagIds].some((x) => typeof x === "string" && !/^\d+$/.test(x));
  if (hasStrings) {
    const resolved = await resolveTaxonomyIds(config, { categories: categoryIds, tags: tagIds });
    categoryIds = resolved.categories;
    tagIds = resolved.tags;
  }

  let featuredMediaId = null;
  try {
    featuredMediaId = await uploadFeaturedMediaToWordpress(config, payload);
  } catch (err) {
    console.warn("[wordpress] featured media upload failed:", err.message);
  }

  const desiredStatus = payload.status || "publish";
  const body = {
    title: payload.title,
    content: payload.content,
    excerpt: payload.excerpt || "",
    slug: payload.slug || undefined,
    categories: categoryIds.length ? categoryIds : undefined,
    tags: tagIds.length ? tagIds : undefined,
  };

  if (payload.meta && typeof payload.meta === "object" && Object.keys(payload.meta).length) {
    body.meta = payload.meta;
  }

  if (payload.date) {
    body.date = payload.date;
    body.status = desiredStatus === "draft" ? "draft" : "future";
  } else {
    body.status = desiredStatus === "draft" ? "draft" : "publish";
  }

  if (featuredMediaId) body.featured_media = featuredMediaId;

  const wpId = existingWpId || payload?.wordpress?.id || null;
  let res;
  if (wpId) {
    res = await axios.put(`${base}/wp-json/wp/v2/posts/${wpId}`, body, { auth, timeout: 30000 });
  } else {
    res = await axios.post(`${base}/wp-json/wp/v2/posts`, body, { auth, timeout: 30000 });
  }

  return {
    externalId: res.data?.id ? String(res.data.id) : null,
    link: res.data?.link || null,
    responseBody: JSON.stringify({ id: res.data?.id, link: res.data?.link, status: res.data?.status }).slice(0, 4000),
  };
}
