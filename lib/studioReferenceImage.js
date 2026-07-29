/**
 * Assets → reference image(s) for Blog/Post studio image agents.
 * Up to 4 refs; first image gets richest OpenAI input fidelity.
 */
import { loadBlogUploadBuffer } from "./blogMedia.js";

export const MAX_REFERENCE_IMAGES = 4;

const REFERENCE_PROMPT_BLOCK_ONE = `CRITICAL — ATTACHED STYLE REFERENCE IMAGE (input image):
A brand/style reference image is attached as the edit input. You MUST follow that image's visual identity as the primary look constraint:
- Match color palette, lighting, contrast, texture, lens/photography or illustration style, and overall aesthetic.
- Keep the same brand/mood language; change only the subject/topic content as directed below.
- Do NOT invent a different art style, stock-photo look, or generic AI aesthetic that ignores the reference.
- Do NOT copy text overlays or watermarks from the reference.
- If topic guidance conflicts with the reference LOOK, keep the reference LOOK and adapt only the subject matter.`;

const REFERENCE_PROMPT_BLOCK_MULTI = `CRITICAL — ATTACHED STYLE REFERENCE IMAGES (input images, in order):
Multiple brand/style reference images are attached. You MUST follow their combined visual identity as the primary look constraint:
- The FIRST reference is the primary look lock (richest fidelity): match its color palette, lighting, texture, and overall aesthetic most closely.
- Additional references supply secondary cues (materials, props, alternate angles, brand details) — blend them into the same look family; do not invent a new style.
- Keep the same brand/mood language; change only the subject/topic content as directed below.
- Do NOT copy text overlays or watermarks from the references.
- If topic guidance conflicts with the reference LOOK, keep the reference LOOK and adapt only the subject matter.`;

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

export function referenceStylePromptBlock(referenceCount = 0) {
  const n = Number(referenceCount) || 0;
  if (n <= 0) return "";
  if (n === 1) return REFERENCE_PROMPT_BLOCK_ONE;
  return `${REFERENCE_PROMPT_BLOCK_MULTI}\n(${n} reference images attached.)`;
}

/**
 * Load all configured reference images. Throws if any configured path is missing on disk.
 * @returns {Promise<Array<{ buffer: Buffer, mime: string, fileName: string }>>}
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
    loaded.push({
      buffer,
      mime: String(row.mime || "image/png").split(";")[0].trim() || "image/png",
      fileName: String(row.fileName || `reference-${i + 1}.png`),
    });
  }
  console.info(`[${label}] loaded ${loaded.length} style reference image(s)`);
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
