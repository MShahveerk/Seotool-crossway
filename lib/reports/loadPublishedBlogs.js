/**
 * Load published blog posts for a site + report month (for slide decks).
 */
import fs from "fs";
import prisma from "../prisma.js";
import { resolveSiteEquivalents } from "../siteAccess.js";
import { normalizeSiteOrigin } from "../validation.js";
import { resolveUploadDiskPath } from "../uploadPaths.js";
import { parseYearMonth } from "../smmReportMonthRange.js";

function monthBounds(reportMonth) {
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth();
  const parsed = parseYearMonth(reportMonth);
  if (parsed) {
    y = parsed.y;
    m = parsed.mo;
  }
  const start = new Date(y, m, 1, 0, 0, 0, 0);
  const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
  return { start, end, label: start.toLocaleDateString("en-US", { month: "long", year: "numeric" }) };
}

function pickTitle(blog) {
  return String(blog.userEditedTitle || blog.title || "Untitled").trim();
}

function pickSlug(blog) {
  return String(blog.userEditedSlug || blog.slug || "").trim().replace(/^\/+|\/+$/g, "");
}

function pickExcerpt(blog) {
  const raw = String(blog.userEditedExcerpt || blog.excerpt || "").trim();
  if (raw) return raw.replace(/\s+/g, " ").slice(0, 180);
  const content = String(blog.userEditedContent || blog.content || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return content.slice(0, 180);
}

function extractLinkFromLog(log) {
  if (!log?.responseBody) return null;
  try {
    const body = JSON.parse(log.responseBody);
    const link = body?.link || body?.url || body?.data?.link || body?.post?.link;
    if (link && /^https?:\/\//i.test(String(link))) return String(link).trim();
  } catch {
    const m = String(log.responseBody).match(/https?:\/\/[^\s"'<>]+/i);
    if (m) return m[0];
  }
  return null;
}

function buildPublicUrl(siteLink, slug, payloadLink) {
  if (payloadLink && /^https?:\/\//i.test(String(payloadLink))) {
    return String(payloadLink).trim();
  }
  const origin = normalizeSiteOrigin(siteLink) || siteLink;
  if (!origin) return slug ? `/${slug}` : "";
  const base = String(origin).replace(/\/+$/, "");
  if (!slug) return base;
  return `${base}/${slug}/`;
}

/**
 * @returns {Promise<Array<{
 *  id: string, title: string, excerpt: string, url: string, slug: string,
 *  publishedAt: Date|null, imagePath: string|null, imageBytes: Buffer|null, imageKind: 'png'|'jpg'|null
 * }>>}
 */
export async function loadPublishedBlogsForReport(siteKey, reportMonth, { limit = 6 } = {}) {
  const { start, end, label } = monthBounds(reportMonth);
  const equivalents = await resolveSiteEquivalents(prisma, siteKey).catch(() => []);
  const siteLinks = [...new Set([siteKey, ...(equivalents || [])].map((s) => String(s || "").trim()).filter(Boolean))];
  if (!siteLinks.length) return { blogs: [], label };

  const rows = await prisma.blogPost.findMany({
    where: {
      siteLink: { in: siteLinks },
      publishStatus: "published",
      OR: [
        { scheduledFor: { gte: start, lte: end } },
        {
          scheduledFor: null,
          updatedAt: { gte: start, lte: end },
        },
      ],
    },
    include: {
      publishLogs: {
        where: { success: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: [{ scheduledFor: "desc" }, { updatedAt: "desc" }],
    take: limit,
  });

  const blogs = [];
  for (const blog of rows) {
    const slug = pickSlug(blog);
    const payload = blog.payload && typeof blog.payload === "object" ? blog.payload : {};
    const logLink = extractLinkFromLog(blog.publishLogs?.[0]);
    const url = buildPublicUrl(blog.siteLink, slug, logLink || payload.link || payload.url);
    const imagePath = blog.featuredImagePath || null;
    let imageBytes = null;
    let imageKind = null;
    if (imagePath) {
      if (/^https?:\/\//i.test(imagePath)) {
        // Remote — skip embed (keep URL only)
      } else {
        const disk = resolveUploadDiskPath(imagePath);
        if (disk && fs.existsSync(disk)) {
          try {
            const buf = fs.readFileSync(disk);
            if (buf[0] === 0x89 && buf[1] === 0x50) {
              imageBytes = buf;
              imageKind = "png";
            } else if (buf[0] === 0xff && buf[1] === 0xd8) {
              imageBytes = buf;
              imageKind = "jpg";
            }
          } catch {
            /* skip image */
          }
        }
      }
    }

    blogs.push({
      id: blog.id,
      title: pickTitle(blog),
      excerpt: pickExcerpt(blog),
      url,
      slug,
      publishedAt: blog.scheduledFor || blog.updatedAt || null,
      imagePath,
      imageBytes,
      imageKind,
    });
  }

  return { blogs, label };
}
