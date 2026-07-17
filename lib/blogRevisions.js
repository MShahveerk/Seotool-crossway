import prisma from "./prisma.js";

export function snapshotBlogPost(blog) {
  if (!blog) return null;
  return {
    title: blog.title,
    slug: blog.slug,
    excerpt: blog.excerpt,
    content: blog.content,
    wpStatus: blog.wpStatus,
    status: blog.status,
    scheduledFor: blog.scheduledFor,
    payload: blog.payload,
    userEditedTitle: blog.userEditedTitle,
    userEditedSlug: blog.userEditedSlug,
    userEditedExcerpt: blog.userEditedExcerpt,
    userEditedContent: blog.userEditedContent,
    featuredImagePath: blog.featuredImagePath,
    featuredImageAlt: blog.featuredImageAlt,
    source: blog.source,
  };
}

export async function createBlogRevision(blogPostId, { action, actorId = null, snapshot }) {
  if (!blogPostId || !snapshot) return null;
  return prisma.blogPostRevision.create({
    data: {
      blogPostId,
      action: String(action || "update").slice(0, 32),
      actorId: actorId || null,
      snapshot,
    },
  });
}

export async function recordBlogRevision(blog, { action, actorId = null }) {
  try {
    const snapshot = snapshotBlogPost(blog);
    if (!snapshot) return null;
    return await createBlogRevision(blog.id, { action, actorId, snapshot });
  } catch (err) {
    console.warn("[blogRevisions] failed to record revision:", err.message);
    return null;
  }
}

export async function listBlogRevisions(blogPostId, limit = 30) {
  return prisma.blogPostRevision.findMany({
    where: { blogPostId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: { select: { id: true, name: true, email: true } } },
  });
}

export async function restoreBlogRevision(blogPostId, revisionId) {
  const revision = await prisma.blogPostRevision.findFirst({
    where: { id: revisionId, blogPostId },
  });
  if (!revision) {
    const err = new Error("Revision not found.");
    err.status = 404;
    throw err;
  }

  const snap = revision.snapshot;
  if (!snap || typeof snap !== "object") {
    const err = new Error("Revision snapshot is invalid.");
    err.status = 400;
    throw err;
  }

  const payload =
    snap.payload && typeof snap.payload === "object"
      ? snap.payload
      : {
          title: snap.title,
          content: snap.content,
          excerpt: snap.excerpt,
          slug: snap.slug,
          status: snap.wpStatus,
          date: snap.scheduledFor,
          meta: {},
        };

  return prisma.blogPost.update({
    where: { id: blogPostId },
    data: {
      title: snap.title,
      slug: snap.slug,
      excerpt: snap.excerpt,
      content: snap.content,
      wpStatus: snap.wpStatus,
      status: snap.status,
      scheduledFor: snap.scheduledFor ? new Date(snap.scheduledFor) : null,
      payload,
      userEditedTitle: snap.userEditedTitle,
      userEditedSlug: snap.userEditedSlug,
      userEditedExcerpt: snap.userEditedExcerpt,
      userEditedContent: snap.userEditedContent,
      featuredImagePath: snap.featuredImagePath,
      featuredImageAlt: snap.featuredImageAlt,
    },
  });
}
