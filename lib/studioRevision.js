/**
 * Turn a rejected blog/post (with reviewer remarks) into an immediate studio
 * re-run. Remarks are routed to the Writer (text), the Image agent (image), or
 * both — while the un-flagged half of the draft is carried over unchanged.
 *
 * Best-effort: callers should not let a failure here block the decline itself.
 */
import prisma from "./prisma.js";

export const REVISION_TARGETS = new Set(["text", "image", "both"]);

export function normalizeRevisionTarget(value) {
  const t = String(value || "").trim().toLowerCase();
  return REVISION_TARGETS.has(t) ? t : "both";
}

function contextOverrides(run) {
  const meta = Array.isArray(run?.stagesJson)
    ? run.stagesJson.find((s) => s?.agent === "_context")
    : null;
  return meta?.overrides && typeof meta.overrides === "object" ? meta.overrides : {};
}

/**
 * Kick off a revision run for a declined studio blog post.
 * @returns the new run, or null when a re-run is not applicable.
 */
export async function enqueueBlogRevisionFromDecline({
  blogPostId,
  remarks = "",
  target = "both",
  triggeredById = null,
} = {}) {
  const id = String(blogPostId || "").trim();
  if (!id) return null;

  const blog = await prisma.blogPost.findUnique({ where: { id } });
  if (!blog || blog.source !== "blog_studio") return null;

  const run = await prisma.blogAutomationRun.findFirst({
    where: { blogPostId: id },
    orderBy: { createdAt: "desc" },
  });

  const payload = blog.payload && typeof blog.payload === "object" ? blog.payload : {};
  const priorArticle = {
    title: String(blog.userEditedTitle || blog.title || "").trim(),
    article_html: String(blog.userEditedContent || blog.content || ""),
    excerpt: String(blog.userEditedExcerpt || blog.excerpt || "").trim(),
    slug: String(blog.userEditedSlug || blog.slug || "").trim(),
    meta_title: String(payload?.meta?.seo_title || "").trim(),
    meta_description: String(payload?.meta?.meta_description || "").trim(),
    alt_text: String(blog.featuredImageAlt || "").trim(),
    tags: Array.isArray(payload?.tags) ? payload.tags : [],
  };
  const priorImage = {
    featuredImagePath: blog.featuredImagePath || null,
    featuredImageAlt: blog.featuredImageAlt || null,
    backupImagePaths: Array.isArray(blog.backupImagePaths) ? blog.backupImagePaths : [],
  };

  const overrides = {
    ...(run?.seedPromptSnapshot ? { seedPrompt: run.seedPromptSnapshot } : {}),
    ...(run?.keywordsSnapshot ? { mustFollowKeywords: run.keywordsSnapshot } : {}),
    ...contextOverrides(run),
  };

  const { enqueueStudioRun } = await import("./blogStudio/runner.js");
  return enqueueStudioRun({
    siteLink: blog.siteLink,
    topic: run?.topic || priorArticle.title || "",
    trigger: "manual",
    triggeredById: triggeredById || null,
    overrides: Object.keys(overrides).length ? overrides : null,
    revision: {
      target: normalizeRevisionTarget(target),
      remarks: String(remarks || "").trim(),
      priorArticle,
      priorImage,
      parentBlogPostId: id,
    },
  });
}

/**
 * Kick off a revision run for a declined studio social post.
 * @returns the new run, or null when a re-run is not applicable.
 */
export async function enqueuePostRevisionFromDecline({
  approvalId,
  remarks = "",
  target = "both",
  triggeredById = null,
} = {}) {
  const id = String(approvalId || "").trim();
  if (!id) return null;

  const approval = await prisma.approval.findUnique({ where: { id } });
  if (!approval || approval.source !== "post_studio") return null;

  const run = await prisma.postAutomationRun.findFirst({
    where: { approvalId: id },
    orderBy: { createdAt: "desc" },
  });

  const draft = run?.draftPreviewJson && typeof run.draftPreviewJson === "object" ? run.draftPreviewJson : {};
  const priorPost = {
    title: String(approval.userEditedTitle || approval.title || "").trim(),
    caption: String(approval.userEditedCaption || draft.caption || "").trim(),
    body_text: String(approval.userEditedText || approval.bodyText || "").trim(),
    platform: String(draft.platform || "both").toLowerCase(),
  };
  const priorImage = {
    imagePath: approval.imagePath || draft.imagePath || null,
    backupImagePaths: Array.isArray(approval.backupImagePaths)
      ? approval.backupImagePaths
      : Array.isArray(draft.backupImagePaths)
        ? draft.backupImagePaths
        : [],
  };

  const overrides = {
    ...(run?.seedPromptSnapshot ? { seedPrompt: run.seedPromptSnapshot } : {}),
    ...(run?.keywordsSnapshot ? { hooksOrKeywords: run.keywordsSnapshot } : {}),
    ...contextOverrides(run),
  };

  const { enqueueStudioRun } = await import("./postsStudio/runner.js");
  return enqueueStudioRun({
    siteLink: approval.siteLink,
    topic: run?.topic || priorPost.title || "",
    trigger: "manual",
    triggeredById: triggeredById || null,
    overrides: Object.keys(overrides).length ? overrides : null,
    revision: {
      target: normalizeRevisionTarget(target),
      remarks: String(remarks || "").trim(),
      priorPost,
      priorImage,
      parentApprovalId: id,
    },
  });
}
