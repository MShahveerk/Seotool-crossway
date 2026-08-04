/**
 * Enrich Auditor scorecard with real Crossway metrics and heal bogus zero scores.
 */

function num(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function pickMetrics(context = {}) {
  const gsc = context.gsc || {};
  const totals = gsc.totals || gsc.summary || gsc.performance || gsc;
  const bl = context.backlinks || {};
  const blSummary = bl.summary || bl.metrics || bl.data || bl;
  const auth = context.authority || context.overview || {};
  const audit = context.audit || {};
  const auditScore =
    num(
      audit.score,
      audit.overallScore,
      audit.summary?.score,
      audit.data?.score,
      audit.healthScore,
      audit.siteScore
    ) ?? null;

  const impressions = num(totals.impressions, totals.totalImpressions, gsc.impressions);
  const clicks = num(totals.clicks, totals.totalClicks, gsc.clicks);
  const avgPosition = num(
    totals.averagePosition,
    totals.position,
    totals.avgPosition,
    gsc.avgPosition,
    gsc.position
  );
  const ctr = num(
    totals.averageCtr,
    totals.ctr,
    gsc.ctr,
    clicks != null && impressions > 0 ? clicks / impressions : null
  );

  const backlinks = num(
    blSummary.backlinks,
    blSummary.backLinks,
    blSummary.totalBacklinks,
    bl.backlinks,
    bl.count,
    blSummary.total
  );
  const refdomains = num(
    blSummary.refdomains,
    blSummary.referringDomains,
    bl.refdomains,
    bl.referringDomains,
    auth.referringDomains,
    auth.refdomains
  );
  const dofollow = num(
    blSummary.dofollowBacklinks,
    blSummary.dofollow,
    bl.dofollow,
    blSummary.doFollow
  );

  return {
    impressions,
    clicks,
    avgPosition,
    ctr,
    auditScore,
    backlinks,
    refdomains,
    dofollow,
  };
}

function heuristicGoogleHealth(m) {
  let score = 35;
  if (m.impressions != null && m.impressions > 0) score += 12;
  if (m.impressions != null && m.impressions > 1000) score += 8;
  if (m.clicks != null && m.clicks > 0) score += 8;
  if (m.avgPosition != null) {
    if (m.avgPosition <= 10) score += 18;
    else if (m.avgPosition <= 20) score += 12;
    else if (m.avgPosition <= 40) score += 6;
  }
  if (m.ctr != null) {
    if (m.ctr >= 0.05) score += 8;
    else if (m.ctr >= 0.02) score += 5;
  }
  if (m.auditScore != null) {
    score += Math.round(Math.max(0, Math.min(20, m.auditScore / 5)));
  }
  if (m.backlinks != null && m.backlinks > 0) score += 6;
  if (m.refdomains != null && m.refdomains > 5) score += 5;
  return Math.max(1, Math.min(96, Math.round(score)));
}

function buildNarrative(m, auditor = {}, brand = "") {
  const bits = [];
  if (brand) bits.push(`${brand} is being evaluated against live Crossway Search Console, audit, and backlink signals.`);
  else bits.push("This scorecard is built from live Crossway Search Console, audit, and backlink signals.");

  if (m.impressions != null || m.clicks != null || m.avgPosition != null) {
    bits.push(
      `Search visibility: ${m.impressions != null ? `${Math.round(m.impressions).toLocaleString()} impressions` : "impressions n/a"}, ${
        m.clicks != null ? `${Math.round(m.clicks).toLocaleString()} clicks` : "clicks n/a"
      }, average position ${m.avgPosition != null ? m.avgPosition.toFixed(1) : "n/a"}${
        m.ctr != null ? `, CTR ${(m.ctr * 100).toFixed(1)}%` : ""
      }.`
    );
  } else {
    bits.push("Search Console metrics were thin or unavailable for this window — treat Google health as directional until GSC data fills in.");
  }

  if (m.backlinks != null || m.refdomains != null) {
    bits.push(
      `Authority: ${m.backlinks != null ? `${Math.round(m.backlinks).toLocaleString()} backlinks` : "backlinks n/a"} from ${
        m.refdomains != null ? `${Math.round(m.refdomains).toLocaleString()} referring domains` : "an unknown number of domains"
      }${m.dofollow != null ? ` (${Math.round(m.dofollow).toLocaleString()} dofollow)` : ""}.`
    );
  } else {
    bits.push("Backlink snapshot was not available in this pass — open Backlink Profile or re-run after authority data refreshes.");
  }

  if (m.auditScore != null) {
    bits.push(`Technical audit score sits around ${Math.round(m.auditScore)}/100.`);
  }

  const llmSummary = String(auditor.summary || "").trim();
  if (llmSummary && !/^no scorecard/i.test(llmSummary) && llmSummary.length > 20) {
    bits.push(llmSummary);
  }

  const next = Array.isArray(auditor.nextSteps) ? auditor.nextSteps.filter(Boolean).slice(0, 3) : [];
  if (next.length) {
    bits.push(`Immediate focus: ${next.join(" · ")}`);
  }

  return bits.join(" ");
}

function synthesizeProblems(context, m) {
  const out = [];
  const opps = context.opportunities || {};
  const striking = opps.strikingDistance || opps.striking || opps.queries || [];
  if (Array.isArray(striking) && striking.length) {
    out.push({
      title: "Striking-distance keywords unused",
      impact: "High",
      effort: "Medium",
      fix: `You have keywords near page 1–2. Prioritize content/FAQ updates for the top opportunities (see Gaps → Diagnoser).`,
    });
  }
  if (m.avgPosition != null && m.avgPosition > 20) {
    out.push({
      title: "Average position is outside the top 20",
      impact: "High",
      effort: "High",
      fix: "Double down on page-level SEO for top impression URLs and fill content gaps the Diagnoser lists.",
    });
  }
  if (m.backlinks == null || m.backlinks === 0) {
    out.push({
      title: "Thin or missing backlink footprint",
      impact: "Medium",
      effort: "Medium",
      fix: "Claim Foundation directories and run Pitch outreach from Autopilot to earn first editorial links.",
    });
  }
  if (m.ctr != null && m.ctr < 0.02 && (m.impressions || 0) > 100) {
    out.push({
      title: "Low CTR relative to impressions",
      impact: "Medium",
      effort: "Low",
      fix: "Rewrite titles/meta for high-impression queries; add clearer benefit language and FAQ schema where relevant.",
    });
  }
  return out.slice(0, 5);
}

/**
 * @returns enriched scorecard object for UI + storage
 */
export function enrichScorecard({ auditorData = {}, context = {}, config = {}, geoData = null } = {}) {
  const m = pickMetrics(context);
  let googleHealthScore = num(auditorData.googleHealthScore);
  if (!(googleHealthScore > 0)) {
    googleHealthScore = heuristicGoogleHealth(m);
  }

  let geoReadinessScore = num(
    auditorData.geoReadinessScore,
    geoData?.overallVisibilityScore
  );
  if (!(geoReadinessScore > 0) && geoData) {
    const cited = (geoData.engines || []).filter((e) => e.citedLikely).length;
    geoReadinessScore = Math.max(15, Math.min(90, 25 + cited * 12));
  }

  let topProblems = Array.isArray(auditorData.topProblems)
    ? auditorData.topProblems.filter((p) => p && (p.title || p.fix))
    : [];
  if (!topProblems.length) {
    topProblems = synthesizeProblems(context, m);
  }

  const summary = buildNarrative(m, auditorData, config.brandName || "");

  return {
    googleHealthScore,
    geoReadinessScore: geoReadinessScore ?? null,
    summary,
    topProblems,
    metrics: {
      avgPosition: m.avgPosition,
      impressions: m.impressions,
      clicks: m.clicks,
      ctr: m.ctr,
      auditScore: m.auditScore,
      indexedHint: auditorData.metrics?.indexedHint || "",
    },
    backlinks: {
      backlinks: m.backlinks,
      refdomains: m.refdomains,
      dofollow: m.dofollow,
    },
    nextSteps: Array.isArray(auditorData.nextSteps) ? auditorData.nextSteps : [],
    geo: geoData
      ? {
          overallVisibilityScore: geoData.overallVisibilityScore,
          engines: geoData.engines || [],
          biggestGap: geoData.biggestGap || "",
          quickWins: geoData.quickWins || [],
        }
      : null,
    at: new Date().toISOString(),
    enriched: true,
  };
}
