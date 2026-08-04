/**
 * Build Autopilot context from existing Crossway SEO data sources.
 */
import { normalizeSiteOrigin } from "../validation.js";

function safeJson(value, max = 12000) {
  try {
    const s = JSON.stringify(value);
    return s.length > max ? s.slice(0, max) + "…" : s;
  } catch {
    return null;
  }
}

export async function buildAutopilotContext(siteLink, config = {}) {
  const site = normalizeSiteOrigin(siteLink) || String(siteLink || "").trim();
  const pack = {
    siteUrl: site,
    brandName: config.brandName || "",
    category: config.category || "",
    buyingQuestions: config.buyingQuestions || "",
    competitors: config.competitors || "",
    proofPoint: config.proofPoint || "",
    brandNotes: config.brandNotes || "",
    gsc: null,
    audit: null,
    opportunities: null,
    overview: null,
    backlinks: null,
    errors: [],
  };

  try {
    const { assembleWebsiteReportData } = await import("../reports/assembleWebsiteReportData.js");
    const report = await assembleWebsiteReportData(site, {
      reportMonth: null,
      includeInternal: false,
    }).catch((err) => {
      pack.errors.push(`report: ${err.message}`);
      return null;
    });
    if (report) {
      pack.gsc = report.gsc || report.searchConsole || null;
      pack.audit = report.audit || report.siteAudit || null;
      pack.backlinks = report.backlinks || null;
      pack.authority = report.authority || null;
      pack.overview = report.seo || report.authority || null;
      if (report.opportunities) pack.opportunities = report.opportunities;
    }
  } catch (err) {
    pack.errors.push(`assemble: ${err.message}`);
  }

  try {
    const { buildSeoOpportunityPack } = await import("../seoOpportunities.js");
    pack.opportunities = await buildSeoOpportunityPack(site, "28d").catch((err) => {
      pack.errors.push(`opportunities: ${err.message}`);
      return null;
    });
  } catch (err) {
    pack.errors.push(`opportunities-import: ${err.message}`);
  }

  try {
    const { getLatestSiteAudit } = await import("../siteAuditJobs.js");
    if (!pack.audit) {
      pack.audit = await getLatestSiteAudit(site).catch(() => null);
    }
  } catch {
    /* optional */
  }

  try {
    const { loadSeoOverview } = await import("../seranking/loadBundle.js");
    if (!pack.overview) {
      pack.overview = await loadSeoOverview(site).catch(() => null);
    }
  } catch {
    /* optional */
  }

  return {
    ...pack,
    contextText: [
      `Site: ${site}`,
      config.brandName ? `Brand: ${config.brandName}` : null,
      config.category ? `Category: ${config.category}` : null,
      config.buyingQuestions ? `Buying questions:\n${config.buyingQuestions}` : null,
      config.competitors ? `Competitors: ${config.competitors}` : null,
      config.proofPoint ? `Proof point: ${config.proofPoint}` : null,
      config.brandNotes ? `Brand notes: ${config.brandNotes}` : null,
      pack.gsc ? `GSC snapshot: ${safeJson(pack.gsc, 8000)}` : "GSC: not available",
      pack.audit ? `Audit snapshot: ${safeJson(pack.audit, 6000)}` : "Audit: not available",
      pack.opportunities
        ? `Opportunities: ${safeJson(pack.opportunities, 6000)}`
        : "Opportunities: not available",
      pack.backlinks ? `Backlinks: ${safeJson(pack.backlinks, 4000)}` : "Backlinks: not available",
      pack.overview ? `Overview: ${safeJson(pack.overview, 4000)}` : "Overview: not available",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
