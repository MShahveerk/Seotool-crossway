import { requireAdminRoute } from "../../../../../../../lib/adminAuth";

import { buildExcelTemplateBuffer } from "@/lib/postsStudio/excelTemplate.js";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    await requireAdminRoute(req, "post-automation");
    const buffer = buildExcelTemplateBuffer();
    const body = Buffer.isBuffer(buffer) ? new Uint8Array(buffer) : buffer;
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="crossway-post-automation-excel-template.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to build template." },
      { status: error.status || 500 }
    );
  }
}
