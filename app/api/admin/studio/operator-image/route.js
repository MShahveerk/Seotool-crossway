import { requireAnySectionRoute } from "../../../../../lib/adminAuth";
import { saveBlogFeaturedImage } from "../../../../../lib/blogMedia.js";
import { saveApprovalMediaBuffer } from "../../../../../lib/approvalMedia.js";

export const runtime = "nodejs";

const KINDS = new Set(["blog", "post"]);

/** Upload an operator-supplied image used instead of the studio image agent. */
export async function POST(req) {
  try {
    const kind = String(new URL(req.url).searchParams.get("kind") || "blog")
      .trim()
      .toLowerCase();
    if (!KINDS.has(kind)) {
      return Response.json({ error: "kind must be blog or post." }, { status: 400 });
    }
    await requireAnySectionRoute([kind === "post" ? "post-automation" : "blog-automation"]);

    const form = await req.formData();
    const file = form.get("image") || form.get("featuredImage");
    if (!file || typeof file === "string" || !file.size) {
      return Response.json({ error: "Choose a JPEG, PNG, WebP, or GIF (8 MB or smaller)." }, { status: 400 });
    }

    let path;
    if (kind === "post") {
      const mime = file.type || "image/jpeg";
      const buf = Buffer.from(await file.arrayBuffer());
      path = await saveApprovalMediaBuffer(buf, mime);
    } else {
      path = await saveBlogFeaturedImage(file);
    }

    return Response.json({ path, kind });
  } catch (error) {
    const msg = error.message || "Upload failed.";
    const forbidden = msg === "Unauthorized" || /Forbidden/i.test(msg);
    return Response.json({ error: msg }, { status: forbidden ? 403 : error.status || 500 });
  }
}
