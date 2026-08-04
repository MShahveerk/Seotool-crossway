import { requireAdminRoute } from "../../../../../../../lib/adminAuth";
import { runWriterSendInBlogStudio } from "@/lib/seoAutopilot/writerSends.js";
import { ENGINE_INTERNAL, getEngineMode } from "@/lib/blogStudio/engine.js";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  try {
    const session = await requireAdminRoute(req, "blog-automation");
    const mode = await getEngineMode();
    if (mode !== ENGINE_INTERNAL) {
      return Response.json(
        { error: "Switch Engine to Internal Studio before running a Writer send." },
        { status: 409 }
      );
    }
    const { id: rawId } = await params;
    const id = String(rawId || "").trim();
    const result = await runWriterSendInBlogStudio(id, { triggeredById: session.user.id });
    return Response.json(result, { status: 202 });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to run Writer send in Blog Studio." },
      { status: error.status || 500 }
    );
  }
}
