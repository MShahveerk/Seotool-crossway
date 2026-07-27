import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function GET(req, { params }) {
  try {
    const { filename: rawFilename } = await params;
    const filename = path.basename(String(rawFilename || ""));
    if (!filename) {
      return new Response("Filename is required", { status: 400 });
    }

    // Persistent disk first, then local dev dirs; approvals and blog uploads share this route.
    const candidates = [
      path.join("/var/data/uploads/approvals", filename),
      path.join("/var/data/uploads/blogs", filename),
      path.join(process.cwd(), "public", "uploads", "approvals", filename),
      path.join(process.cwd(), "public", "uploads", "blogs", filename),
    ];
    const filePath = candidates.find((candidate) => fs.existsSync(candidate));

    if (!filePath) {
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
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return new Response(error.message || "Failed to read file", { status: 500 });
  }
}
