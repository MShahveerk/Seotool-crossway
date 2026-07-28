/**
 * Approval uploads store a public URL in `imagePath` (legacy field name).
 * Detect video vs image by file extension so we render <video> vs <img> correctly.
 */

import crypto from "crypto";
import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const VIDEO_EXT = /\.(mp4|webm|mov|mpeg|mkv)$/i;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

const EXT_BY_MIME = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
};

export function isApprovalVideoPath(src) {
  if (!src || typeof src !== "string") return false;
  const base = src.split("?")[0].split("#")[0];
  return VIDEO_EXT.test(base);
}

export async function saveApprovalMediaBuffer(buf, mime) {
  const normalizedMime = (mime || "image/jpeg").split(";")[0].trim();
  const isVideo = VIDEO_TYPES.has(normalizedMime);
  const isImage = IMAGE_TYPES.has(normalizedMime);
  if (!isVideo && !isImage) {
    const err = new Error("Invalid media type. Use JPEG, PNG, WebP, GIF, MP4, WebM, or MOV.");
    err.status = 400;
    throw err;
  }

  const maxBytes = isVideo ? 100 * 1024 * 1024 : 5 * 1024 * 1024;
  if (buf.length > maxBytes) {
    const err = new Error(isVideo ? "Video must be 100 MB or smaller." : "Image must be 5 MB or smaller.");
    err.status = 400;
    throw err;
  }

  const ext = EXT_BY_MIME[normalizedMime] || (isVideo ? ".mp4" : ".jpg");
  const fileName = `${crypto.randomBytes(20).toString("hex")}${ext}`;
  const isProductionDisk = existsSync("/var/data");
  const uploadsDir = isProductionDisk
    ? "/var/data/uploads/approvals"
    : path.join(process.cwd(), "public", "uploads", "approvals");
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(path.join(uploadsDir, fileName), buf);
  return `/api/uploads/${fileName}`;
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
