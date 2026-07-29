import fs from "fs/promises";
import { createHash } from "crypto";
import path from "path";
import { resolveUploadDiskPath, uploadFsCandidates, uploadBasename } from "@/lib/uploadPaths.js";
import { contentTypeForUpload } from "@/lib/mediaSniff.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mediaHeaders(filename, buf, etag) {
  const contentType = contentTypeForUpload(buf, filename);
  return {
    "Content-Type": contentType,
    // Do NOT set Content-Length manually — mismatched length after any transform
    // (or accidental compression) breaks Chrome while Edge may still paint.
    "Cache-Control": "public, max-age=3600, must-revalidate",
    ETag: etag,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "X-Content-Type-Options": "nosniff",
    // Hint proxies not to rewrite/compress binary bodies.
    "X-Content-Type": contentType,
  };
}

function asBody(buf) {
  // Node Buffer → plain Uint8Array so the Fetch Response body is a clean
  // ArrayBuffer view (Chrome is picky about some Buffer edge cases).
  return buf instanceof Uint8Array
    ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
    : new Uint8Array(buf);
}

async function loadUpload(rawFilename) {
  const filename = uploadBasename(rawFilename) || path.basename(String(rawFilename || ""));
  if (!filename) {
    return {
      error: new Response("Filename is required", {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      }),
    };
  }

  let filePath = resolveUploadDiskPath(filename);
  if (!filePath) {
    await new Promise((r) => setTimeout(r, 120));
    filePath = resolveUploadDiskPath(filename);
  }
  if (!filePath) {
    console.warn(`[uploads] 404 ${filename}; checked: ${uploadFsCandidates(filename).join(" | ")}`);
    return {
      error: new Response("File not found", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      }),
    };
  }

  const buf = await fs.readFile(filePath);
  if (!buf.length) {
    console.warn(`[uploads] empty file ${filename} at ${filePath}`);
    return {
      error: new Response("Empty file", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      }),
    };
  }

  const st = await fs.stat(filePath);
  const etag = `"${createHash("sha1").update(`${st.mtimeMs}:${st.size}:${filename}`).digest("hex")}"`;
  return { filename, buf, etag, contentType: contentTypeForUpload(buf, filename) };
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
          "Cache-Control": "public, max-age=3600, must-revalidate",
          "Access-Control-Allow-Origin": "*",
          "Cross-Origin-Resource-Policy": "cross-origin",
          "Content-Type": loaded.contentType,
        },
      });
    }

    return new Response(asBody(loaded.buf), {
      status: 200,
      headers: mediaHeaders(loaded.filename, loaded.buf, loaded.etag),
    });
  } catch (error) {
    console.error("[uploads] serve failed:", error.message);
    return new Response(error.message || "Failed to read file", {
      status: 500,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

export async function HEAD(req, { params }) {
  try {
    const { filename: rawFilename } = await params;
    const loaded = await loadUpload(rawFilename);
    if (loaded.error) return loaded.error;
    const headers = mediaHeaders(loaded.filename, loaded.buf, loaded.etag);
    headers["Content-Length"] = String(loaded.buf.length);
    return new Response(null, { status: 200, headers });
  } catch {
    return new Response(null, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, If-None-Match, Range",
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  });
}
