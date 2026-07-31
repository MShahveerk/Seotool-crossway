/**
 * Load blog + SMM posts for monthly report card slides
 * (image, title, short description).
 */
import fs from "fs";
import prisma from "../prisma.js";
import {
  resolveSiteEquivalents,
  isMetaPageId,
  buildApprovalSiteOrFilter,
} from "../siteAccess.js";
import { normalizeSiteOrigin } from "../validation.js";
import { resolveUploadDiskPath } from "../uploadPaths.js";
import { sniffImageOrVideoMime } from "../mediaSniff.js";
import { isApprovalVideoPath } from "../approvalMedia.js";
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

/** Expand a site key into every siteLink variant blogs/approvals might use. */
async function siteLinkCandidates(siteKey) {
  const key = String(siteKey || "").trim();
  const eqs = await resolveSiteEquivalents(prisma, key).catch(() => []);
  const out = new Set();
  const hosts = new Set();

  const add = (raw) => {
    const s = String(raw || "").trim();
    if (!s) return;
    out.add(s);
    out.add(s.replace(/\/+$/, ""));
    out.add(`${s.replace(/\/+$/, "")}/`);
    if (!isMetaPageId(s)) {
      const origin = normalizeSiteOrigin(s);
      if (origin) {
        out.add(origin);
        out.add(`${origin}/`);
      }
      try {
        const host = new URL(origin || (s.startsWith("http") ? s : `https://${s}`)).hostname.replace(
          /^www\./i,
          ""
        );
        if (host) {
          hosts.add(host.toLowerCase());
          out.add(host);
          out.add(`https://${host}`);
          out.add(`https://${host}/`);
          out.add(`https://www.${host}`);
          out.add(`https://www.${host}/`);
          out.add(`http://${host}`);
          out.add(`http://${host}/`);
          out.add(`http://www.${host}`);
          out.add(`http://www.${host}/`);
        }
      } catch {
        /* ignore */
      }
    }
  };

  add(key);
  for (const e of eqs || []) add(e);

  // Pull Meta IDs / URLs from Site rows that share the hostname
  if (hosts.size) {
    try {
      const hostList = [...hosts];
      const sites = await prisma.site.findMany({
        where: {
          OR: hostList.map((h) => ({ siteUrl: { contains: h, mode: "insensitive" } })),
        },
        select: { siteUrl: true, facebookPageId: true, instagramUserId: true },
        take: 20,
      });
      for (const s of sites) {
        add(s.siteUrl);
        add(s.facebookPageId);
        add(s.instagramUserId);
      }
    } catch {
      /* ignore */
    }
  }

  return [...out].filter(Boolean);
}

function blogSiteWhere(siteLinks) {
  const links = (siteLinks || []).map((s) => String(s || "").trim()).filter(Boolean);
  if (!links.length) return { siteLink: "__none__" };

  const or = [{ siteLink: { in: links } }];
  const hosts = new Set();
  for (const key of links) {
    if (isMetaPageId(key) || !key.includes(".")) continue;
    try {
      const host = new URL(key.startsWith("http") ? key : `https://${key}`).hostname
        .replace(/^www\./i, "")
        .toLowerCase();
      if (host) hosts.add(host);
    } catch {
      /* ignore */
    }
  }
  for (const host of hosts) {
    or.push({ siteLink: { contains: host, mode: "insensitive" } });
  }
  return { OR: or };
}

function publicAppOrigin() {
  const raw =
    process.env.NEXTAUTH_URL ||
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    "";
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s.replace(/\/+$/, "");
  return `https://${s.replace(/\/+$/, "")}`;
}

async function convertToPdfImage(buf) {
  const mime = sniffImageOrVideoMime(buf);
  if (!mime || mime.startsWith("video/")) return { imageBytes: null, imageKind: null };

  if (mime === "image/png") return { imageBytes: buf, imageKind: "png" };
  if (mime === "image/jpeg") return { imageBytes: buf, imageKind: "jpg" };

  // WebP / GIF / odd formats → PNG via sharp (pdf-lib cannot embed them)
  try {
    const sharp = (await import("sharp")).default;
    const png = await sharp(buf).rotate().png().toBuffer();
    return { imageBytes: png, imageKind: "png" };
  } catch {
    return { imageBytes: null, imageKind: null };
  }
}

async function readLocalUpload(imagePath) {
  const disk = resolveUploadDiskPath(imagePath);
  if (!disk || !fs.existsSync(disk)) return null;
  try {
    return fs.readFileSync(disk);
  } catch {
    return null;
  }
}

async function fetchRemoteBytes(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: {
        Accept: "image/*,*/*",
        "User-Agent": "CrosswaySuite-Report/1.0",
      },
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Resolve image bytes for PDF cards from local uploads, absolute URLs, or app-origin fetch.
 */
async function loadImageBytes(imagePath) {
  const path = String(imagePath || "").trim();
  if (!path || isApprovalVideoPath(path)) return { imageBytes: null, imageKind: null };

  let buf = null;

  if (/^https?:\/\//i.test(path)) {
    // Prefer local copy when URL points at our upload route
    buf = await readLocalUpload(path);
    if (!buf) buf = await fetchRemoteBytes(path);
  } else {
    buf = await readLocalUpload(path);
    if (!buf) {
      const origin = publicAppOrigin();
      if (origin) {
        const rel = path.startsWith("/") ? path : `/${path}`;
        buf = await fetchRemoteBytes(`${origin}${rel}`);
      }
    }
  }

  if (!buf?.length) return { imageBytes: null, imageKind: null };
  return convertToPdfImage(buf);
}

async function firstImageBytes(paths) {
  for (const p of paths) {
    if (!p) continue;
    const loaded = await loadImageBytes(p);
    if (loaded.imageBytes) return loaded;
  }
  return { imageBytes: null, imageKind: null };
}

function stripHtml(text) {
  return String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(text, n = 180) {
  return stripHtml(text).slice(0, n);
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
  if (!origin || isMetaPageId(origin)) return slug ? `/${slug}` : "";
  const base = String(origin).replace(/\/+$/, "");
  if (!slug) return base;
  return `${base}/${slug}/`;
}

function backupPaths(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x || "").trim()).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x || "").trim()).filter(Boolean);
    } catch {
      return [raw.trim()].filter(Boolean);
    }
  }
  return [];
}

/** Activity inside a date window. */
function inRangeDateOr(start, end) {
  return {
    OR: [
      { createdAt: { gte: start, lte: end } },
      { scheduledFor: { gte: start, lte: end } },
      { updatedAt: { gte: start, lte: end } },
      { respondedAt: { gte: start, lte: end } },
      {
        publishLogs: {
          some: { success: true, createdAt: { gte: start, lte: end } },
        },
      },
    ],
  };
}

const BLOG_INCLUDE = {
  publishLogs: {
    where: { success: true },
    orderBy: { createdAt: "desc" },
    take: 1,
  },
};

function blogBadge(blog) {
  if (blog.publishStatus === "published" || blog.wpStatus === "publish") return "Published";
  if (blog.status === "pending" || blog.status === "edited") return "Pending approval";
  if (blog.status === "approved") return "Approved";
  return "In review";
}

async function mapBlogRows(list) {
  const blogs = [];
  for (const blog of list) {
    const slug = String(blog.userEditedSlug || blog.slug || "")
      .trim()
      .replace(/^\/+|\/+$/g, "");
    const payload = blog.payload && typeof blog.payload === "object" ? blog.payload : {};
    const logLink = extractLinkFromLog(blog.publishLogs?.[0]);
    const url = buildBlogPublicUrl(blog.siteLink, slug, logLink || payload.link || payload.url);
    const imageCandidates = [
      blog.featuredImagePath,
      ...backupPaths(blog.backupImagePaths),
      payload.featuredImageUrl,
      payload.featuredImagePath,
      payload.image,
    ];
    const { imageBytes, imageKind } = await firstImageBytes(imageCandidates);
    const publishedAt =
      blog.publishLogs?.[0]?.createdAt || blog.scheduledFor || blog.updatedAt || blog.createdAt;

    blogs.push({
      id: blog.id,
      kind: "blog",
      badge: blogBadge(blog),
      title: String(blog.userEditedTitle || blog.title || "Untitled").trim(),
      excerpt: clip(blog.userEditedExcerpt || blog.excerpt || blog.userEditedContent || blog.content),
      url,
      publishedAt,
      imagePath: blog.featuredImagePath || null,
      imageBytes,
      imageKind,
    });
  }
  return blogs;
}

/**
 * Content window for cards.
 * Current month (or missing month): include prior calendar month too so early-month
 * website decks aren't empty (GSC also uses a rolling ~28d window).
 */
function contentWindow(reportMonth) {
  const bounds = reportMonthBounds(reportMonth);
  const now = new Date();
  const parsed = parseYearMonth(reportMonth);
  const isCurrent =
    !parsed || (parsed.y === now.getFullYear() && parsed.mo === now.getMonth());

  if (!isCurrent) return bounds;

  const start = new Date(bounds.start);
  start.setMonth(start.getMonth() - 1);
  const rolling = new Date(now);
  rolling.setDate(rolling.getDate() - 35);
  const wideStart = start < rolling ? start : rolling;
  return {
    start: wideStart,
    end: bounds.end,
    label: bounds.label,
  };
}

/**
 * Blogs for website decks — same spirit as SMM cards:
 * published in the report window, plus anything still pending approval.
 */
export async function loadPublishedBlogsForReport(siteKey, reportMonth, { limit = 9 } = {}) {
  const { start, end, label } = contentWindow(reportMonth);
  const siteLinks = await siteLinkCandidates(siteKey);
  if (!siteLinks.length) return { blogs: [], label };

  const siteWhere = blogSiteWhere(siteLinks);
  const livePublished = {
    OR: [{ publishStatus: "published" }, { wpStatus: "publish" }],
  };

  const [published, pending] = await Promise.all([
    prisma.blogPost.findMany({
      where: {
        AND: [siteWhere, livePublished, inRangeDateOr(start, end)],
      },
      include: BLOG_INCLUDE,
      orderBy: [{ scheduledFor: "desc" }, { updatedAt: "desc" }],
      take: limit,
    }),
    // Mirror SMM: pending / edited always show (not month-gated)
    prisma.blogPost.findMany({
      where: {
        AND: [siteWhere, { status: { in: ["pending", "edited"] } }],
      },
      include: BLOG_INCLUDE,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
    }),
  ]);

  const seen = new Set();
  let list = [];
  for (const row of [...published, ...pending]) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    list.push(row);
  }

  // Approved / scheduled in window (publish flag lag)
  if (list.length < 3) {
    const extra = await prisma.blogPost.findMany({
      where: {
        AND: [
          siteWhere,
          { status: { in: ["approved", "edited", "pending"] } },
          inRangeDateOr(start, end),
        ],
      },
      include: BLOG_INCLUDE,
      orderBy: [{ scheduledFor: "desc" }, { updatedAt: "desc" }],
      take: limit,
    });
    for (const row of extra) {
      if (!row?.id || seen.has(row.id)) continue;
      seen.add(row.id);
      list.push(row);
    }
  }

  // Last resort: any recent blogs for this site (site match was the usual miss)
  if (!list.length) {
    list = await prisma.blogPost.findMany({
      where: {
        AND: [
          siteWhere,
          { status: { notIn: ["declined", "deleted"] } },
          { createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
        ],
      },
      include: BLOG_INCLUDE,
      orderBy: [{ updatedAt: "desc" }],
      take: limit,
    });
  }

  list = list
    .sort((a, b) => {
      const aPub = a.publishStatus === "published" || a.wpStatus === "publish" ? 0 : 1;
      const bPub = b.publishStatus === "published" || b.wpStatus === "publish" ? 0 : 1;
      if (aPub !== bPub) return aPub - bPub;
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    })
    .slice(0, limit);

  const blogs = await mapBlogRows(list);
  return { blogs, label };
}

/**
 * SMM posts: published in the report month, plus anything still pending approval.
 */
export async function loadSmmPostsForReport(siteKey, reportMonth, { limit = 9 } = {}) {
  const { start, end, label } = reportMonthBounds(reportMonth);
  const siteLinks = await siteLinkCandidates(siteKey);
  if (!siteLinks.length) return { posts: [], label };

  const siteOr = buildApprovalSiteOrFilter(siteLinks) || {
    OR: [{ siteLink: { in: siteLinks } }],
  };

  const [published, pending] = await Promise.all([
    prisma.approval.findMany({
      where: {
        AND: [
          siteOr,
          { publishStatus: "published" },
          {
            OR: [
              { scheduledFor: { gte: start, lte: end } },
              { createdAt: { gte: start, lte: end } },
              { respondedAt: { gte: start, lte: end } },
              { updatedAt: { gte: start, lte: end } },
            ],
          },
        ],
      },
      orderBy: [{ scheduledFor: "desc" }, { updatedAt: "desc" }],
      take: limit,
    }),
    prisma.approval.findMany({
      where: {
        AND: [siteOr, { status: { in: ["pending", "edited"] } }],
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
    const caption = String(
      row.userEditedCaption || row.caption || row.userEditedText || row.bodyText || ""
    ).trim();
    const imageCandidates = [row.imagePath, ...backupPaths(row.backupImagePaths)];
    const { imageBytes, imageKind } = await firstImageBytes(imageCandidates);
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

  posts.sort((a, b) => {
    if (a.badge !== b.badge) return a.badge === "Published" ? -1 : 1;
    return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
  });

  return { posts: posts.slice(0, limit), label };
}
