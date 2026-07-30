import { requireAdminRoute } from "../../../../../../../lib/adminAuth";

import { buildExcelTemplateBuffer } from "@/lib/blogStudio/excelTemplate.js";

export const runtime = "nodejs";

/** GET downloadable .xlsx campaign template */
export async function GET(req) {
  try {
    await requireAdminRoute(req, "blog-automation");
    const buffer = buildExcelTemplateBuffer();
    const filename = "crossway-blog-automation-excel-template.xlsx";
    const body = Buffer.isBuffer(buffer) ? new Uint8Array(buffer) : buffer;
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
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
