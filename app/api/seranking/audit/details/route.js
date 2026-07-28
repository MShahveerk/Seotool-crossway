import { requireSession } from "../../../../../lib/resolveWebsiteAccess.js";
import { getAuditIssuePages, getAuditPageIssues } from "../../../../../lib/seranking/api.js";
import { enrichAuditCheck } from "../../../../../lib/seranking/auditIssueGuide.js";
import { isSerankingConfigured } from "../../../../../lib/seranking/config.js";
import { SerankingApiError } from "../../../../../lib/seranking/client.js";
import { SEO_DATA_NOT_CONFIGURED } from "../../../../../lib/seoDataMessages.js";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    if (!isSerankingConfigured()) {
      return Response.json({ error: SEO_DATA_NOT_CONFIGURED }, { status: 503 });
    }
    await requireSession();

    const auditId = req.nextUrl.searchParams.get("auditId");
    if (!auditId) {
      return Response.json({ error: "auditId is required." }, { status: 400 });
    }

    const code = req.nextUrl.searchParams.get("code");
    const urlId = req.nextUrl.searchParams.get("urlId");
    const url = req.nextUrl.searchParams.get("url");

    if (code) {
      const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 50));
      const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset")) || 0);
      const data = await getAuditIssuePages(auditId, code, { limit, offset });
      const urls = Array.isArray(data?.urls) ? data.urls : [];
      return Response.json({
        auditId,
        code,
        totalUrls: data?.total_urls ?? urls.length,
        urls,
        offset,
        limit,
      });
    }

    if (urlId || url) {
      const data = await getAuditPageIssues(auditId, {
        urlId: urlId ? Number(urlId) : null,
        url: url || null,
      });
      const issues = (Array.isArray(data?.issues) ? data.issues : []).map((issue) =>
        enrichAuditCheck(
          {
            code: issue.code,
            name: issue.name || issue.code,
            type: issue.type || issue.status || "notice",
            group: issue.group || null,
            snippet: issue.snippet || null,
          },
          issue.group || "Other"
        )
      );
      return Response.json({
        auditId,
        url: data?.url || url || null,
        pageData: data?.page_data || null,
        issues,
      });
    }

    return Response.json({ error: "Provide code (issue pages) or urlId/url (page issues)." }, { status: 400 });
  } catch (err) {
    const status = err instanceof SerankingApiError ? err.status : err.status || 500;
    return Response.json({ error: err.message || "Audit details failed." }, { status });
  }
}
