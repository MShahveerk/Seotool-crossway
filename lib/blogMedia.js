import { readFile } from "fs/promises";
import path from "path";
import axios from "axios";
import {
  blogsUploadDir,
  resolveUploadDiskPath,
  writeUploadBuffer,
} from "./uploadPaths.js";
import { resolveMediaMimeAndExt, mimeFromFilename } from "./mediaSniff.js";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** Resolve a stored `/api/uploads/...` path to an absolute filesystem path. */
export function resolveBlogUploadFsPath(publicPath) {
  // Prefer shared resolver (blogs + approvals + legacy flat) so reference images always load.
  return resolveUploadDiskPath(publicPath);
}

/** Load a previously uploaded blog image for use as a reference (edits API). */
export async function loadBlogUploadBuffer(publicPath) {
  const full = resolveBlogUploadFsPath(publicPath);
  if (!full) return null;
  const buf = await readFile(full);
  const { mime } = resolveMediaMimeAndExt(buf, mimeFromFilename(full) || "image/png");
  return {
    buffer: buf,
    mime,
    fileName: path.basename(full),
  };
}

async function writeBlogImageBuffer(buf, mime) {
  const body = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const { mime: cleanMime, ext } = resolveMediaMimeAndExt(body, mime);
  if (!ALLOWED_IMAGE_TYPES.has(cleanMime)) {
    const err = new Error("Invalid image type. Use JPEG, PNG, WebP, or GIF.");
    err.status = 400;
    throw err;
  }
  if (body.length > 8 * 1024 * 1024) {
    const err = new Error("Image must be 8 MB or smaller.");
    err.status = 400;
    throw err;
  }
  return writeUploadBuffer(blogsUploadDir(), body, ext);
}

export async function saveBlogFeaturedImageFromBuffer(buf, mime = "image/png") {
  return writeBlogImageBuffer(Buffer.isBuffer(buf) ? buf : Buffer.from(buf), mime);
}

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

  const buf = Buffer.from(await file.arrayBuffer());
  return writeBlogImageBuffer(buf, mime);
}

/**
 * Download a remote featured image. Tries absolute URL, then optional WP-auth media fetch.
 * Avoids the Node `File` constructor (unreliable across runtimes).
 */
export async function saveBlogFeaturedImageFromUrl(imageUrl, opts = {}) {
  const url = String(imageUrl || "").trim();
  if (!url) return null;

  const candidates = [];
  if (/^https?:\/\//i.test(url)) candidates.push(url);
  else if (opts.wordpressBase && url.startsWith("/")) {
    candidates.push(`${String(opts.wordpressBase).replace(/\/+$/, "")}${url}`);
  }

  let lastError = null;
  for (const candidate of candidates) {
    try {
      const res = await axios.get(candidate, {
        responseType: "arraybuffer",
        timeout: 45000,
        maxRedirects: 5,
        validateStatus: (s) => s >= 200 && s < 400,
        headers: {
          Accept: "image/*,*/*",
          "User-Agent": "CrosswaySuite/1.0",
          ...(opts.authHeader ? { Authorization: opts.authHeader } : {}),
        },
      });
      const mime = String(res.headers["content-type"] || "image/jpeg").split(";")[0].trim();
      if (!String(mime).startsWith("image/")) {
        // Some hosts return octet-stream for media — allow if buffer looks like image
        const buf = Buffer.from(res.data);
        if (buf.length > 100) {
          return writeBlogImageBuffer(buf, mime.startsWith("image/") ? mime : "image/jpeg");
        }
        throw new Error(`Not an image (${mime})`);
      }
      return writeBlogImageBuffer(Buffer.from(res.data), mime);
    } catch (err) {
      lastError = err;
    }
  }

  if (opts.mediaId && opts.wpConfig) {
    try {
      const { fetchWordpressMediaUrl, getWordpressConfig } = await import("./wordpressClient.js");
      const mediaUrl = await fetchWordpressMediaUrl(opts.wpConfig, opts.mediaId);
      if (mediaUrl && mediaUrl !== url) {
        return saveBlogFeaturedImageFromUrl(mediaUrl, { ...opts, mediaId: null });
      }
      // Authenticated raw media download
      const { base, auth } = getWordpressConfig(opts.wpConfig);
      if (auth?.username && auth?.password) {
        const token = Buffer.from(`${auth.username}:${auth.password}`).toString("base64");
        const mediaRes = await axios.get(`${base}/wp-json/wp/v2/media/${opts.mediaId}`, {
          auth,
          timeout: 20000,
        });
        const source = mediaRes.data?.source_url || mediaRes.data?.guid?.rendered;
        if (source) {
          return saveBlogFeaturedImageFromUrl(source, {
            wordpressBase: base,
            authHeader: `Basic ${token}`,
          });
        }
      }
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError) {
    const err = new Error(`Could not download featured image: ${lastError.message}`);
    err.status = 400;
    throw err;
  }
  return null;
}
