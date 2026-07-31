/**
 * Persistent upload disk for posts (approvals) + blog featured images.
 *
 * Production default: /var/data/uploads/{approvals,blogs}
 * Override with UPLOADS_ROOT (or CROSSWAY_UPLOADS_ROOT).
 * Local/dev fallback: <cwd>/public/uploads/...
 *
 * Never store production media under the deploy directory — it gets wiped
 * on every release.
 */
import { existsSync, mkdirSync, accessSync, constants as fsConstants } from "fs";
import { mkdir, writeFile, rename, stat } from "fs/promises";
import path from "path";
import crypto from "crypto";

const DEFAULT_PERSISTENT_ROOT = "/var/data";

function envUploadsRoot() {
  const raw = String(process.env.UPLOADS_ROOT || process.env.CROSSWAY_UPLOADS_ROOT || "").trim();
  return raw || null;
}

/**
 * True when we should prefer the persistent disk (production or volume present).
 */
export function isProductionUploadsDisk() {
  if (envUploadsRoot()) return true;
  if (existsSync(DEFAULT_PERSISTENT_ROOT)) return true;
  return process.env.NODE_ENV === "production";
}

/**
 * Absolute root that owns `uploads/approvals` and `uploads/blogs`.
 * - UPLOADS_ROOT if set
 * - /var/data in production or when that mount exists
 * - else local public/ (dev only)
 */
export function uploadsRoot() {
  const fromEnv = envUploadsRoot();
  if (fromEnv) return path.resolve(fromEnv);

  if (existsSync(DEFAULT_PERSISTENT_ROOT) || process.env.NODE_ENV === "production") {
    return DEFAULT_PERSISTENT_ROOT;
  }

  return path.join(process.cwd(), "public");
}

export function uploadsBaseDir() {
  return path.join(uploadsRoot(), "uploads");
}

export function approvalsUploadDir() {
  return path.join(uploadsBaseDir(), "approvals");
}

export function blogsUploadDir() {
  return path.join(uploadsBaseDir(), "blogs");
}

/** Create upload dirs (and verify writable). Safe to call on every boot. */
export function ensureUploadDirs() {
  const root = uploadsRoot();
  const dirs = [approvalsUploadDir(), blogsUploadDir()];
  const persistent =
    root === DEFAULT_PERSISTENT_ROOT ||
    Boolean(envUploadsRoot()) ||
    root.startsWith(DEFAULT_PERSISTENT_ROOT);

  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, fsConstants.W_OK);
  }

  if (process.env.NODE_ENV === "production" && !persistent) {
    console.warn(
      `[uploads] WARNING: writing under ${root} — set UPLOADS_ROOT=/var/data (or mount /var/data) so media survives deploys.`
    );
  } else {
    console.info(`[uploads] root=${root} approvals=${approvalsUploadDir()} blogs=${blogsUploadDir()}`);
  }

  return { root, approvals: approvalsUploadDir(), blogs: blogsUploadDir(), persistent };
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
  const root = uploadsRoot();
  return [
    path.join(root, "uploads", "approvals", name),
    path.join(root, "uploads", "blogs", name),
    path.join(root, "uploads", name),
    // Always also check the canonical persistent + legacy local layouts
    path.join(DEFAULT_PERSISTENT_ROOT, "uploads", "approvals", name),
    path.join(DEFAULT_PERSISTENT_ROOT, "uploads", "blogs", name),
    path.join(DEFAULT_PERSISTENT_ROOT, "uploads", name),
    path.join(process.cwd(), "public", "uploads", "approvals", name),
    path.join(process.cwd(), "public", "uploads", "blogs", name),
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
