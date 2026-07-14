import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function GET(req, { params }) {
  try {
    const { filename } = await params;
    if (!filename) {
      return new Response("Filename is required", { status: 400 });
    }

    // Resolve persistent disk path first
    let filePath = path.join("/var/data/uploads/approvals", filename);
    if (!fs.existsSync(filePath)) {
      // Fallback to local development directory
      filePath = path.join(process.cwd(), "public", "uploads", "approvals", filename);
    }

    if (!fs.existsSync(filePath)) {
      return new Response("File not found", { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);

    // Manual content type mapping
    let contentType = "application/octet-stream";
    const lower = filename.toLowerCase();
    if (lower.endsWith(".png")) contentType = "image/png";
    else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) contentType = "image/jpeg";
    else if (lower.endsWith(".webp")) contentType = "image/webp";
    else if (lower.endsWith(".gif")) contentType = "image/gif";
    else if (lower.endsWith(".mp4")) contentType = "video/mp4";
    else if (lower.endsWith(".webm")) contentType = "video/webm";
    else if (lower.endsWith(".mov")) contentType = "video/quicktime";

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return new Response(error.message || "Failed to read file", { status: 500 });
  }
}
