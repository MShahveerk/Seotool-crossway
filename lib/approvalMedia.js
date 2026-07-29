/**
 * Approval uploads store a public URL in `imagePath` (legacy field name).
 * Detect video vs image by file extension so we render <video> vs <img> correctly.
 */

import { approvalsUploadDir, writeUploadBuffer } from "./uploadPaths.js";
import { resolveMediaMimeAndExt } from "./mediaSniff.js";

const VIDEO_EXT = /\.(mp4|webm|mov|mpeg|mkv)$/i;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

export function isApprovalVideoPath(src) {
  if (!src || typeof src !== "string") return false;
  const base = src.split("?")[0].split("#")[0];
  return VIDEO_EXT.test(base);
}

export async function saveApprovalMediaBuffer(buf, mime) {
  const body = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const { mime: normalizedMime, ext } = resolveMediaMimeAndExt(body, mime);
  const isVideo = VIDEO_TYPES.has(normalizedMime);
  const isImage = IMAGE_TYPES.has(normalizedMime);
  if (!isVideo && !isImage) {
    const err = new Error("Invalid media type. Use JPEG, PNG, WebP, GIF, MP4, WebM, or MOV.");
    err.status = 400;
    throw err;
  }

  // Match blog featured limit (8 MB) — GPT image PNGs often exceed 5 MB.
  const maxBytes = isVideo ? 100 * 1024 * 1024 : 8 * 1024 * 1024;
  if (body.length > maxBytes) {
    const err = new Error(isVideo ? "Video must be 100 MB or smaller." : "Image must be 8 MB or smaller.");
    err.status = 400;
    throw err;
  }

  return writeUploadBuffer(approvalsUploadDir(), body, ext);
}

export async function saveApprovalMediaFromUrl(mediaUrl) {
  const url = String(mediaUrl || "").trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    const err = new Error("mediaUrl must be a valid http(s) URL.");
    err.status = 400;
    throw err;
  }
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error(`Could not download media (${res.status}).`);
    err.status = 400;
    throw err;
  }
  const mime = res.headers.get("content-type") || "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  return saveApprovalMediaBuffer(buf, mime);
}
