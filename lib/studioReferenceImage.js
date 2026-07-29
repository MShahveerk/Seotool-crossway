/**
 * Assets → reference image(s) for Blog/Post studio image agents.
 * Up to 4 refs; first image gets richest OpenAI input fidelity.
 */
import { loadBlogUploadBuffer } from "./blogMedia.js";

export const MAX_REFERENCE_IMAGES = 4;

/** Style-only lock — never keep the reference photo's subject/scene. */
export function referenceStylePromptBlock(referenceCount = 0) {
  const n = Number(referenceCount) || 0;
  if (n <= 0) return "";
  if (n === 1) {
    return `STYLE REFERENCE — image 1 (attached input):
Use image 1 ONLY for visual style: color palette, lighting, contrast, texture, photography/illustration language, and brand mood.
Do NOT keep, recreate, or remix the people, objects, products, location, or scene from image 1.
Invent a NEW scene that depicts the SUBJECT below, while matching image 1's LOOK.`;
  }
  return `STYLE REFERENCES — images 1–${n} (attached inputs, in order):
Image 1 is the primary look lock (palette, lighting, texture, mood). Images 2+ are secondary style cues only.
Do NOT keep or recreate subjects/scenes from any reference photo.
Invent a NEW scene that depicts the SUBJECT below, while matching the references' LOOK.`;
}

/**
 * Build a concrete subject block so images stay on-topic.
 * Subject ALWAYS leads; style references must not override topic.
 */
export function buildSubjectImageBrief({
  topic = "",
  title = "",
  captionOrExcerpt = "",
  imageDirection = "",
  altText = "",
  kind = "social", // social | blog
} = {}) {
  const topicLine = String(topic || "").trim();
  const titleLine = String(title || "").trim();
  const direction = String(imageDirection || "").trim();
  const body = String(captionOrExcerpt || "").trim().slice(0, 600);
  const alt = String(altText || "").trim();

  const subject =
    direction ||
    (topicLine && titleLine && topicLine.toLowerCase() !== titleLine.toLowerCase()
      ? `${titleLine} — ${topicLine}`
      : topicLine || titleLine || "brand marketing creative");

  const lines = [
    `SUBJECT (must depict this — non-negotiable):`,
    subject,
    kind === "blog"
      ? "Compose a wide blog hero (~1.91:1) that clearly illustrates this subject for an SEO article."
      : "Compose a social feed creative that clearly illustrates this subject (readable subject, safe margins).",
  ];
  if (titleLine && titleLine !== subject) lines.push(`Post/article title: ${titleLine}`);
  if (topicLine && topicLine !== subject && topicLine !== titleLine) {
    lines.push(`Run topic/angle: ${topicLine}`);
  }
  if (body) lines.push(`Context from copy (for visual cues only):\n${body}`);
  if (alt) lines.push(`Alt-text guidance: ${alt}`);
  lines.push(
    "The image must be recognizably about this subject. Generic stock/abstract filler that ignores the subject is a failure."
  );
  return lines.join("\n");
}

/** Deduped list of reference paths from config (array + legacy single), max 4. */
export function normalizeReferencePaths(config = {}) {
  const out = [];
  const seen = new Set();
  const push = (raw) => {
    const p = String(raw || "").trim();
    if (!p || seen.has(p)) return;
    seen.add(p);
    out.push(p);
  };

  if (Array.isArray(config.referenceImagePaths) && config.referenceImagePaths.length) {
    for (const p of config.referenceImagePaths) push(p);
  }
  push(config.referenceImagePath);
  return out.slice(0, MAX_REFERENCE_IMAGES);
}

/** Persist shape: array + legacy primary = first. */
export function syncReferenceFields(paths) {
  const list = normalizeReferencePaths({ referenceImagePaths: paths });
  return {
    referenceImagePaths: list,
    referenceImagePath: list[0] || null,
  };
}

/** Merge save input with existing row for reference fields. */
export function resolveReferenceFieldsForSave(input = {}, existing = {}) {
  if (input.referenceImagePaths !== undefined) {
    return syncReferenceFields(input.referenceImagePaths);
  }
  if (input.referenceImagePath !== undefined) {
    const primary = String(input.referenceImagePath || "").trim();
    if (!primary) return syncReferenceFields([]);
    const rest = normalizeReferencePaths(existing).filter((p) => p !== primary);
    return syncReferenceFields([primary, ...rest]);
  }
  return syncReferenceFields(normalizeReferencePaths(existing));
}

/**
 * Load all configured reference images. Throws if any configured path is missing on disk.
 */
export async function loadStudioReferenceImages(config, opts = {}) {
  const label = opts.label || "studio";
  const paths = normalizeReferencePaths(config);
  if (!paths.length) return [];

  const loaded = [];
  for (let i = 0; i < paths.length; i++) {
    const refPath = paths[i];
    const row = await loadBlogUploadBuffer(refPath);
    if (!row?.buffer?.length) {
      const err = new Error(
        `Reference image #${i + 1} is configured (${refPath}) but could not be loaded from disk. Re-upload it under Assets.`
      );
      err.status = 400;
      throw err;
    }
    const buffer = Buffer.isBuffer(row.buffer) ? row.buffer : Buffer.from(row.buffer);
    const mime = String(row.mime || "image/png").split(";")[0].trim() || "image/png";
    // GPT image edits reject gif — coerce declaration; bytes must still be png/jpg/webp
    if (mime === "image/gif") {
      const err = new Error(
        `Reference image #${i + 1} is a GIF. Re-upload as JPEG, PNG, or WebP under Assets.`
      );
      err.status = 400;
      throw err;
    }
    loaded.push({
      buffer,
      mime,
      fileName: String(row.fileName || `reference-${i + 1}.png`),
    });
  }
  console.info(`[${label}] loaded ${loaded.length} style reference image(s) for edits`);
  return loaded;
}

/** @deprecated use loadStudioReferenceImages */
export async function loadStudioReferenceImage(referenceImagePath, opts = {}) {
  const list = await loadStudioReferenceImages(
    { referenceImagePath, referenceImagePaths: referenceImagePath ? [referenceImagePath] : [] },
    opts
  );
  return list[0] || null;
}
