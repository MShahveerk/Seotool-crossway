import crypto from "crypto";
import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const EXT_BY_MIME = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export async function saveBlogFeaturedImage(file) {
  if (!file || typeof file === "string" || !file.size) {
    const err = new Error("Featured image file is required.");
    err.status = 400;
    throw err;
  }
  const mime = file.type || "";
  if (!ALLOWED_IMAGE_TYPES.has(mime)) {
    const err = new Error("Invalid image type. Use JPEG, PNG, WebP, or GIF.");
    err.status = 400;
    throw err;
  }
  if (file.size > 8 * 1024 * 1024) {
    const err = new Error("Image must be 8 MB or smaller.");
    err.status = 400;
    throw err;
  }

  const ext = EXT_BY_MIME[mime] || ".jpg";
  const buf = Buffer.from(await file.arrayBuffer());
  const fileName = `${crypto.randomBytes(20).toString("hex")}${ext}`;
  const isProductionDisk = existsSync("/var/data");
  const uploadsDir = isProductionDisk
    ? "/var/data/uploads/blogs"
    : path.join(process.cwd(), "public", "uploads", "blogs");
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(path.join(uploadsDir, fileName), buf);
  return `/api/uploads/${fileName}`;
}

export async function saveBlogFeaturedImageFromUrl(imageUrl) {
  const url = String(imageUrl || "").trim();
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error(`Could not download featured image (${res.status}).`);
    err.status = 400;
    throw err;
  }
  const mime = res.headers.get("content-type") || "image/jpeg";
  const blob = await res.blob();
  const file = new File([blob], "featured", { type: mime.split(";")[0] });
  return saveBlogFeaturedImage(file);
}
