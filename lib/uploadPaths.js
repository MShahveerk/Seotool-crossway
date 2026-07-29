/**
 * Shared upload disk resolution for approvals + blog featured images.
 * Keep in sync with writers in approvalMedia.js / blogMedia.js.
 */
import { existsSync } from "fs";
import { mkdir, writeFile, rename, stat } from "fs/promises";
import path from "path";
import crypto from "crypto";

export function isProductionUploadsDisk() {
  return existsSync("/var/data");
}

export function approvalsUploadDir() {
  return isProductionUploadsDisk()
    ? "/var/data/uploads/approvals"
    : path.join(process.cwd(), "public", "uploads", "approvals");
}

export function blogsUploadDir() {
  return isProductionUploadsDisk()
    ? "/var/data/uploads/blogs"
    : path.join(process.cwd(), "public", "uploads", "blogs");
}

/** Strip a stored public path down to a safe basename. */
export function uploadBasename(relativePath) {
  const value = String(relativePath || "").trim();
  if (!value) return null;
  let fileName = value;
  if (value.includes("/api/uploads/")) {
    fileName = value.split("/api/uploads/").pop();
  } else if (value.includes("/uploads/")) {
    fileName = value.split("/uploads/").pop();
  }
  fileName = path.basename(String(fileName || "").split("?")[0].split("#")[0]);
  if (!fileName || fileName === "." || fileName === ".." || fileName.includes("..")) {
    return null;
  }
  return fileName;
}

/** Candidate absolute paths for a public `/api/uploads/<file>` name. */
export function uploadFsCandidates(fileName) {
  const name = uploadBasename(fileName) || String(fileName || "").trim();
  if (!name) return [];
  return [
    path.join("/var/data/uploads/approvals", name),
    path.join("/var/data/uploads/blogs", name),
    path.join(process.cwd(), "public", "uploads", "approvals", name),
    path.join(process.cwd(), "public", "uploads", "blogs", name),
    // Legacy flat layout (some older deploys)
    path.join("/var/data/uploads", name),
    path.join(process.cwd(), "public", "uploads", name),
  ];
}

/** Resolve a stored `/api/uploads/...` path to an existing file on disk. */
export function resolveUploadDiskPath(relativePath) {
  const fileName = uploadBasename(relativePath);
  if (!fileName) return null;
  return uploadFsCandidates(fileName).find((candidate) => existsSync(candidate)) || null;
}

/**
 * Atomically write a buffer into `dir`, verify size, return public `/api/uploads/...` path.
 */
export async function writeUploadBuffer(dir, buf, ext) {
  const cleanExt = String(ext || ".bin").startsWith(".") ? String(ext) : `.${ext}`;
  const fileName = `${crypto.randomBytes(20).toString("hex")}${cleanExt}`;
  await mkdir(dir, { recursive: true });
  const finalPath = path.join(dir, fileName);
  const tmpPath = `${finalPath}.tmp-${process.pid}-${Date.now()}`;
  const body = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  await writeFile(tmpPath, body);
  await rename(tmpPath, finalPath);
  const st = await stat(finalPath);
  if (!st.isFile() || st.size !== body.length) {
    const err = new Error("Upload write verification failed — file missing or size mismatch.");
    err.status = 500;
    throw err;
  }
  return `/api/uploads/${fileName}`;
}
