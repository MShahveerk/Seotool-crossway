import fs from "fs";
import path from "path";
import { resolveUploadDiskPath, uploadFsCandidates, uploadBasename } from "@/lib/uploadPaths.js";

export const runtime = "nodejs";

function contentTypeFor(filename) {
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

export async function GET(req, { params }) {
  try {
    const { filename: rawFilename } = await params;
    const filename = uploadBasename(rawFilename) || path.basename(String(rawFilename || ""));
    if (!filename) {
      return new Response("Filename is required", {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      });
    }

    // Same resolution order as email inline attachments (disk-first).
    let filePath = resolveUploadDiskPath(filename);
    if (!filePath) {
      // Brief retry: studio writes can race a preview poll on a cold volume.
      await new Promise((r) => setTimeout(r, 120));
      filePath = resolveUploadDiskPath(filename);
    }

    if (!filePath) {
      console.warn(
        `[uploads] 404 ${filename}; checked: ${uploadFsCandidates(filename).join(" | ")}`
      );
      return new Response("File not found", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const stat = fs.statSync(filePath);
    const stream = fs.createReadStream(filePath);
    const body = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk)));
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
      cancel() {
        stream.destroy();
      },
    });

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentTypeFor(filename),
        "Content-Length": String(stat.size),
        "Content-Disposition": `inline; filename="${filename}"`,
        // Avoid year-long caching of a bad first paint; still cache healthy hits.
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        // Email / board embeds from other origins must be able to load media.
        "Access-Control-Allow-Origin": "*",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[uploads] serve failed:", error.message);
    return new Response(error.message || "Failed to read file", {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  });
}
