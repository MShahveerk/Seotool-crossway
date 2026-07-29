/**
 * Load the Assets → reference image for Blog/Post studio image agents.
 * When a path is configured, generation must use it (edits + high fidelity).
 */
import { loadBlogUploadBuffer } from "./blogMedia.js";

const REFERENCE_PROMPT_BLOCK = `CRITICAL — ATTACHED STYLE REFERENCE IMAGE (input image):
A brand/style reference image is attached as the edit input. You MUST follow that image's visual identity as the primary look constraint:
- Match color palette, lighting, contrast, texture, lens/photography or illustration style, and overall aesthetic.
- Keep the same brand/mood language; change only the subject/topic content as directed below.
- Do NOT invent a different art style, stock-photo look, or generic AI aesthetic that ignores the reference.
- Do NOT copy text overlays or watermarks from the reference.
- If topic guidance conflicts with the reference LOOK, keep the reference LOOK and adapt only the subject matter.`;

export function referenceStylePromptBlock(hasReference) {
  return hasReference ? REFERENCE_PROMPT_BLOCK : "";
}

/**
 * @param {string|null|undefined} referenceImagePath
 * @param {{ required?: boolean, label?: string }} [opts]
 * @returns {Promise<null|{ buffer: Buffer, mime: string, fileName: string }>}
 */
export async function loadStudioReferenceImage(referenceImagePath, opts = {}) {
  const required = opts.required !== false;
  const label = opts.label || "studio";
  const refPath = String(referenceImagePath || "").trim();
  if (!refPath) return null;

  const loaded = await loadBlogUploadBuffer(refPath);
  if (!loaded?.buffer?.length) {
    const err = new Error(
      `Reference image is configured (${refPath}) but could not be loaded from disk. Re-upload it under Assets.`
    );
    err.status = 400;
    if (required) throw err;
    console.warn(`[${label}] ${err.message}`);
    return null;
  }

  const buffer = Buffer.isBuffer(loaded.buffer)
    ? loaded.buffer
    : Buffer.from(loaded.buffer);

  return {
    buffer,
    mime: String(loaded.mime || "image/png").split(";")[0].trim() || "image/png",
    fileName: String(loaded.fileName || "reference.png"),
  };
}
