/**
 * Load blog + SMM posts for monthly report card slides
 * (image, title, short description).
 */
import fs from "fs";
import prisma from "../prisma.js";
import { resolveSiteEquivalents, isMetaPageId } from "../siteAccess.js";
import { normalizeSiteOrigin } from "../validation.js";
import { resolveUploadDiskPath } from "../uploadPaths.js";
import { parseYearMonth } from "../smmReportMonthRange.js";

export function reportMonthBounds(reportMonth) {
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
  return {
    start,
    end,
    label: start.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
  };
}

async function siteLinkCandidates(siteKey) {
  const key = String(siteKey || "").trim();
  const eqs = await resolveSiteEquivalents(prisma, key).catch(() => []);
  const out = new Set();
  for (const raw of [key, ...(eqs || [])]) {
    const s = String(raw || "").trim();
    if (!s) continue;
    out.add(s);
    if (!isMetaPageId(s)) {
      const origin = normalizeSiteOrigin(s);
      if (origin) out.add(origin);
      try {
        const host = new URL(origin || (s.startsWith("http") ? s : `https://${s}`)).hostname.replace(
          /^www\./,
          ""
        );
        if (host) {
          out.add(host);
          out.add(`https://${host}`);
          out.add(`https://www.${host}`);
        }
      } catch {
        /* ignore */
      }
    }
  }
  return [...out];
}

function detectImageKind(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
  return null;
}

async function loadImageBytes(imagePath) {
  const path = String(imagePath || "").trim();
  if (!path) return { imageBytes: null, imageKind: null };

  if (/^https?:\/\//i.test(path)) {
    try {
      const res = await fetch(path, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return { imageBytes: null, imageKind: null };
      const buf = Buffer.from(await res.arrayBuffer());
      const kind = detectImageKind(buf);
      if (!kind) return { imageBytes: null, imageKind: null };
      return { imageBytes: buf, imageKind: kind };
    } catch {
      return { imageBytes: null, imageKind: null };
    }
  }

  const disk = resolveUploadDiskPath(path);
  if (!disk || !fs.existsSync(disk)) return { imageBytes: null, imageKind: null };
  try {
    const buf = fs.readFileSync(disk);
    const kind = detectImageKind(buf);
    if (!kind) return { imageBytes: null, imageKind: null };
    return { imageBytes: buf, imageKind: kind };
  } catch {
    return { imageBytes: null, imageKind: null };
  }
}

function stripHtml(text) {
  return String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(text, n = 180) {
  const s = stripHtml(text);
  return s.slice(0, n);
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

function buildBlogPublicUrl(siteLink, slug, payloadLink) {
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
 * Blogs created and published in the report month (card slides).
 */
export async function loadPublishedBlogsForReport(siteKey, reportMonth, { limit = 9 } = {}) {
  const { start, end, label } = reportMonthBounds(reportMonth);
  const siteLinks = await siteLinkCandidates(siteKey);
  if (!siteLinks.length) return { blogs: [], label };

  const rows = await prisma.blogPost.findMany({
    where: {
      siteLink: { in: siteLinks },
      publishStatus: "published",
      createdAt: { gte: start, lte: end },
      OR: [
        { scheduledFor: { gte: start, lte: end } },
        {
          publishLogs: {
            some: { success: true, createdAt: { gte: start, lte: end } },
          },
        },
        // Published the same month it was created (no schedule / log timing quirks)
        { scheduledFor: null, updatedAt: { gte: start, lte: end } },
      ],
    },
    include: {
      publishLogs: {
        where: { success: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: [{ scheduledFor: "desc" }, { createdAt: "desc" }],
    take: limit,
  });

  // Fallback: published in-month even if created earlier (still show live content)
  let list = rows;
  if (!list.length) {
    list = await prisma.blogPost.findMany({
      where: {
        siteLink: { in: siteLinks },
        publishStatus: "published",
        OR: [
          { scheduledFor: { gte: start, lte: end } },
          {
            publishLogs: {
              some: { success: true, createdAt: { gte: start, lte: end } },
            },
          },
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
  }

  const blogs = [];
  for (const blog of list) {
    const slug = String(blog.userEditedSlug || blog.slug || "")
      .trim()
      .replace(/^\/+|\/+$/g, "");
    const payload = blog.payload && typeof blog.payload === "object" ? blog.payload : {};
    const logLink = extractLinkFromLog(blog.publishLogs?.[0]);
    const url = buildBlogPublicUrl(blog.siteLink, slug, logLink || payload.link || payload.url);
    const imagePath = blog.featuredImagePath || null;
    const { imageBytes, imageKind } = await loadImageBytes(imagePath);
    const publishedAt =
      blog.publishLogs?.[0]?.createdAt || blog.scheduledFor || blog.updatedAt || blog.createdAt;

    blogs.push({
      id: blog.id,
      kind: "blog",
      badge: "Published",
      title: String(blog.userEditedTitle || blog.title || "Untitled").trim(),
      excerpt: clip(blog.userEditedExcerpt || blog.excerpt || blog.userEditedContent || blog.content),
      url,
      publishedAt,
      imagePath,
      imageBytes,
      imageKind,
    });
  }

  return { blogs, label };
}

/**
 * SMM posts: published in the report month, plus anything still pending approval.
 */
export async function loadSmmPostsForReport(siteKey, reportMonth, { limit = 9 } = {}) {
  const { start, end, label } = reportMonthBounds(reportMonth);
  const siteLinks = await siteLinkCandidates(siteKey);
  if (!siteLinks.length) return { posts: [], label };

  const metaIds = siteLinks.filter((s) => isMetaPageId(s));
  const siteOr = [
    { siteLink: { in: siteLinks } },
    ...(metaIds.length
      ? [{ facebookPageId: { in: metaIds } }, { instagramUserId: { in: metaIds } }]
      : []),
  ];

  const [published, pending] = await Promise.all([
    prisma.approval.findMany({
      where: {
        AND: [
          { OR: siteOr },
          { publishStatus: "published" },
          {
            OR: [
              { scheduledFor: { gte: start, lte: end } },
              { scheduledFor: null, respondedAt: { gte: start, lte: end } },
              { scheduledFor: null, respondedAt: null, updatedAt: { gte: start, lte: end } },
            ],
          },
        ],
      },
      orderBy: [{ scheduledFor: "desc" }, { updatedAt: "desc" }],
      take: limit,
    }),
    prisma.approval.findMany({
      where: {
        AND: [{ OR: siteOr }, { status: { in: ["pending", "edited"] } }],
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
    }),
  ]);

  const seen = new Set();
  const posts = [];

  async function pushApproval(row, badge) {
    if (!row?.id || seen.has(row.id)) return;
    seen.add(row.id);
    const title = String(row.userEditedTitle || row.title || "Untitled post").trim();
    const caption = String(row.userEditedCaption || row.caption || row.userEditedText || row.bodyText || "").trim();
    const { imageBytes, imageKind } = await loadImageBytes(row.imagePath);
    posts.push({
      id: row.id,
      kind: "smm",
      badge,
      title,
      excerpt: clip(caption || title),
      url: "",
      platform:
        row.instagramUserId && !row.facebookPageId
          ? "Instagram"
          : row.facebookPageId
            ? "Facebook"
            : "Social",
      publishedAt: row.scheduledFor || row.respondedAt || row.updatedAt || row.createdAt,
      imagePath: row.imagePath || null,
      imageBytes,
      imageKind,
    });
  }

  for (const row of published) await pushApproval(row, "Published");
  for (const row of pending) await pushApproval(row, "Pending approval");

  // Prefer a mix: published first, then pending; cap total
  posts.sort((a, b) => {
    if (a.badge !== b.badge) return a.badge === "Published" ? -1 : 1;
    return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
  });

  return { posts: posts.slice(0, limit), label };
}
