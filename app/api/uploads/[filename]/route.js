import fs from "fs/promises";
import { createHash } from "crypto";
import path from "path";
import { resolveUploadDiskPath, uploadFsCandidates, uploadBasename } from "@/lib/uploadPaths.js";

export const runtime = "nodejs";

function contentTypeFromName(filename) {
  const lower = String(filename || "").toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  return "application/octet-stream";
}

/** Chrome ORB blocks images served as octet-stream — sniff magic bytes. */
function sniffContentType(buf, fallback) {
  if (!buf || buf.length < 12) return fallback;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  return fallback;
}

function mediaHeaders(filename, buf, etag) {
  const contentType = sniffContentType(buf, contentTypeFromName(filename));
  return {
    "Content-Type": contentType,
    "Content-Length": String(buf.length),
    "Content-Disposition": `inline; filename="${filename}"`,
    // Short cache + revalidate so a prior bad Chrome response can recover.
    "Cache-Control": "public, max-age=300, must-revalidate",
    ETag: etag,
    "Access-Control-Allow-Origin": "*",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "X-Content-Type-Options": "nosniff",
  };
}

async function loadUpload(rawFilename) {
  const filename = uploadBasename(rawFilename) || path.basename(String(rawFilename || ""));
  if (!filename) {
    return { error: new Response("Filename is required", { status: 400, headers: { "Cache-Control": "no-store" } }) };
  }

  let filePath = resolveUploadDiskPath(filename);
  if (!filePath) {
    await new Promise((r) => setTimeout(r, 150));
    filePath = resolveUploadDiskPath(filename);
  }
  if (!filePath) {
    console.warn(`[uploads] 404 ${filename}; checked: ${uploadFsCandidates(filename).join(" | ")}`);
    return {
      error: new Response("File not found", { status: 404, headers: { "Cache-Control": "no-store" } }),
    };
  }

  // Buffer whole file — streamed Node ReadableStream + Content-Length breaks in Chrome
  // on some devices (ORB / truncated body) while Edge still paints.
  const buf = await fs.readFile(filePath);
  const st = await fs.stat(filePath);
  const etag = `"${createHash("sha1").update(`${st.mtimeMs}:${st.size}:${filename}`).digest("hex")}"`;
  return { filename, buf, etag };
}

export async function GET(req, { params }) {
  try {
    const { filename: rawFilename } = await params;
    const loaded = await loadUpload(rawFilename);
    if (loaded.error) return loaded.error;

    const ifNoneMatch = req.headers.get("if-none-match");
    if (ifNoneMatch && ifNoneMatch === loaded.etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: loaded.etag,
          "Cache-Control": "public, max-age=300, must-revalidate",
          "Access-Control-Allow-Origin": "*",
          "Cross-Origin-Resource-Policy": "cross-origin",
        },
      });
    }

    const headers = mediaHeaders(loaded.filename, loaded.buf, loaded.etag);
    // Deduplicate accidental double key from edit
    return new Response(loaded.buf, { status: 200, headers });
  } catch (error) {
    console.error("[uploads] serve failed:", error.message);
    return new Response(error.message || "Failed to read file", {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export async function HEAD(req, { params }) {
  try {
    const { filename: rawFilename } = await params;
    const loaded = await loadUpload(rawFilename);
    if (loaded.error) return loaded.error;
    return new Response(null, {
      status: 200,
      headers: mediaHeaders(loaded.filename, loaded.buf, loaded.etag),
    });
  } catch (error) {
    return new Response(null, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, If-None-Match",
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  });
}
