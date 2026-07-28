/**
 * Normalize SE Ranking keyword API rows into a consistent shape for UI.
 */
import {
  competitionLevelFromFloat,
  computeEstimatedClicks,
  formatSerankingCpc,
  finalizeKeywordRow,
  historyTrendToMonthlyTrend,
} from "./keywordMetrics.js";
import { enrichAuditCheck } from "./auditIssueGuide.js";

function trendDirection(trend) {
  const pts = (trend || []).filter((t) => t.searches != null).slice(-6);
  if (pts.length < 2) return "stable";
  const mid = Math.floor(pts.length / 2);
  const first = pts.slice(0, mid).reduce((s, p) => s + p.searches, 0) / Math.max(1, mid);
  const second = pts.slice(mid).reduce((s, p) => s + p.searches, 0) / Math.max(1, pts.length - mid);
  if (second > first * 1.12) return "rising";
  if (second < first * 0.88) return "declining";
  return "stable";
}

export function normalizeKeywordResearchRow(row, source) {
  if (!row || typeof row !== "object") return null;
  const keyword = String(row.keyword || row.query || "").trim();
  if (!keyword) return null;

  if (row.is_data_found === false) {
    return { keyword, source, isDataFound: false };
  }

  const volume = row.volume != null ? Number(row.volume) : null;
  const difficulty = row.difficulty != null ? Number(row.difficulty) : null;
  const cpc = row.cpc != null ? Number(row.cpc) : null;
  const competition = row.competition != null ? Number(row.competition) : null;
  const monthlyTrend = historyTrendToMonthlyTrend(row.history_trend);

  const normalized = {
    keyword,
    source,
    volume,
    difficulty,
    cpc,
    cpcFormatted: formatSerankingCpc(cpc),
    competition,
    competitionLevel: competitionLevelFromFloat(competition),
    monthlyTrend,
    trendDirection: trendDirection(monthlyTrend),
    intents: Array.isArray(row.intents) ? row.intents : [],
    serpFeatures: Array.isArray(row.serp_features) ? row.serp_features : [],
    isDataFound: row.is_data_found !== false,
    wordCount: keyword.split(/\s+/).filter(Boolean).length,
    position: row.position != null ? Number(row.position) : null,
    url: row.url || row.landing_url || null,
    traffic: row.traffic != null ? Number(row.traffic) : null,
  };

  return finalizeKeywordRow(normalized, source);
}

export function normalizeKeywordResearchList(data, source) {
  const rows = Array.isArray(data) ? data : data?.keywords || data?.data || [];
  return rows.map((row) => normalizeKeywordResearchRow(row, source)).filter(Boolean);
}

export function extractBacklinksSummary(payload) {
  if (!payload) return null;
  if (payload.summary) {
    if (Array.isArray(payload.summary)) return payload.summary[0] || null;
    if (typeof payload.summary === "object") return payload.summary;
  }
  if (payload.backlinks != null || payload.refdomains != null || payload.domain_inlink_rank != null) {
    return payload;
  }
  return null;
}

function num(value) {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function pickOrganicBlock(data) {
  if (!data || typeof data !== "object") return null;
  let organic = data.organic;
  if (Array.isArray(organic)) {
    if (organic.length === 1) return organic[0];
    return organic.reduce(
      (acc, row) => ({
        traffic_sum: (acc.traffic_sum || 0) + (num(row.traffic_sum ?? row.traffic) || 0),
        keywords_count: (acc.keywords_count || 0) + (num(row.keywords_count ?? row.keywords) || 0),
        price: (acc.price || 0) + (num(row.price) || 0),
        positions_tops: row.positions_tops || acc.positions_tops,
      }),
      {}
    );
  }
  if (organic && typeof organic === "object") return organic;
  return data;
}

function sumPositionTops(tops) {
  if (!tops || typeof tops !== "object") return null;
  const keys = ["top1_3", "top4_10", "top11_20", "top21_50", "top51_100"];
  let sum = 0;
  let any = false;
  for (const k of keys) {
    const v = num(tops[k]);
    if (v != null) {
      sum += v;
      any = true;
    }
  }
  if (any) return sum;
  return num(tops.top10 ?? tops.top_10);
}

/** Worldwide / regional domain overview → flat KPI object. */
export function normalizeDomainOverview(raw) {
  if (!raw) return null;
  const block = pickOrganicBlock(raw);
  const tops = block?.positions_tops || block?.positionsTops || {};
  const zones = raw.zones || raw.zone_list || raw.markets || [];
  const zoneRows = (Array.isArray(zones) ? zones : []).map((z) => ({
    source: z.source || z.country,
    traffic: num(z.traffic_sum ?? z.traffic),
    keywords: num(z.keywords_count ?? z.keywords),
  }));

  const traffic = num(block?.traffic_sum ?? block?.traffic ?? block?.etv ?? block?.traffic_forecast);
  const keywords = num(block?.keywords_count ?? block?.keywords ?? block?.num_keywords ?? block?.count);
  const price = num(block?.price ?? block?.cost ?? block?.traffic_cost);

  const usZone = zoneRows.find((z) => String(z.source || "").toLowerCase() === "us");
  const usTraffic = usZone?.traffic ?? null;
  const trafficShareUs =
    traffic != null && usTraffic != null && traffic > 0 ? Math.round((usTraffic / traffic) * 1000) / 10 : null;

  return {
    traffic,
    keywords,
    price,
    top10: sumPositionTops(tops),
    trafficShareUs,
    usTraffic,
    zones: zoneRows.filter((z) => z.source),
    hasData: traffic != null || keywords != null || price != null,
  };
}

export function normalizeDomainCompetitors(raw) {
  const rows = Array.isArray(raw) ? raw : raw?.data || raw?.competitors || [];
  if (!Array.isArray(rows)) return [];
  return rows
    .map((c) => ({
      domain: c.domain || c.competitor || c.name || "",
      commonKeywords: num(c.common_keywords ?? c.commonKeywords ?? c.intersection),
      keywords: num(c.keywords_count ?? c.keywords ?? c.total_keywords),
      traffic: num(c.traffic_sum ?? c.traffic),
    }))
    .filter((c) => c.domain);
}

export function normalizeDomainKeywordsList(raw, source = "us") {
  const rows = Array.isArray(raw) ? raw : raw?.data || raw?.keywords || [];
  if (!Array.isArray(rows)) return [];
  return rows
    .map((k) =>
      normalizeKeywordResearchRow(
        {
          ...k,
          keyword: k.keyword || k.query || "",
          url: k.url || k.landing_url || null,
        },
        source
      )
    )
    .filter(Boolean);
}

export function normalizeBacklinksSummary(payload) {
  const row = extractBacklinksSummary(payload);
  if (!row) return null;
  return {
    target: row.target,
    backlinks: num(row.backlinks),
    refdomains: num(row.refdomains),
    domainInlinkRank: num(row.domain_inlink_rank ?? row.domainInlinkRank),
    inlinkRank: num(row.inlink_rank),
    dofollowBacklinks: num(row.dofollow_backlinks),
    nofollowBacklinks: num(row.nofollow_backlinks),
    topAnchors: row.top_anchors_by_backlinks || row.topAnchorsByBacklinks || [],
    topPages: row.top_pages_by_backlinks || row.topPagesByBacklinks || [],
    hasData: num(row.backlinks) != null || num(row.refdomains) != null,
  };
}

const SEVERITY_ORDER = { error: 0, warning: 1, notice: 2, passed: 3 };

/** SE Ranking audit report uses score_percent and sections[].props (not checks[]). */
export function normalizeAuditReport(raw) {
  const report = raw?.report || raw;
  if (!report || typeof report !== "object") return null;

  const sections = (report.sections || []).map((sec) => {
    const props = sec.props || {};
    const sectionName = sec.name || sec.title || sec.uid;
    const checks = Object.values(props)
      .map((chk) =>
        enrichAuditCheck(
          {
            code: chk.code,
            name: chk.name || chk.code,
            type: chk.status || chk.type || "notice",
            count: num(chk.value ?? chk.count),
          },
          sectionName
        )
      )
      .filter((chk) => chk.type !== "passed" && (chk.count == null || chk.count > 0))
      .sort((a, b) => (SEVERITY_ORDER[a.type] ?? 9) - (SEVERITY_ORDER[b.type] ?? 9));

    return {
      uid: sec.uid,
      name: sectionName,
      checks,
    };
  });

  return {
    score: num(report.score_percent ?? report.score ?? report.health_score),
    totalPages: num(report.total_pages),
    totalErrors: num(report.total_errors),
    totalWarnings: num(report.total_warnings),
    totalNotices: num(report.total_notices),
    totalPassed: num(report.total_passed),
    isFinished: report.is_finished !== false,
    auditTime: report.audit_time || report.completedAt,
    domainProps: report.domain_props || null,
    sections,
    hasData: report.is_finished !== false || num(report.score_percent) != null,
  };
}

export function normalizeAiSearchOverview(raw) {
  const summary = raw?.summary || {};
  const pick = (key) => {
    const m = summary[key];
    if (!m || typeof m !== "object") return { current: null, changePercent: null };
    return {
      current: num(m.current),
      changePercent: num(m.change_percent),
    };
  };
  const brand = pick("brand_presence");
  const links = pick("link_presence");
  const aiTraffic = pick("ai_opportunity_traffic");
  return {
    aiVisibility: brand.current,
    aiVisibilityChange: brand.changePercent,
    mentions: links.current,
    mentionsChange: links.changePercent,
    citedPages: links.current,
    aiTraffic: aiTraffic.current,
    aiTrafficChange: aiTraffic.changePercent,
    hasData: brand.current != null || links.current != null,
  };
}

export function normalizeAiSearchByEngine(raw, engine) {
  const summary = raw?.summary || {};
  const brand = summary.brand_presence?.current ?? summary.link_presence?.current;
  return {
    engine,
    visibility: num(brand),
    linkPresence: num(summary.link_presence?.current),
    brandPresence: num(summary.brand_presence?.current),
    hasData: brand != null,
  };
}

export function normalizeDomainPagesList(raw) {
  const rows = Array.isArray(raw) ? raw : raw?.data || raw?.pages || [];
  if (!Array.isArray(rows)) return [];
  return rows
    .map((p) => ({
      url: p.url || p.page || "",
      traffic: num(p.traffic_sum ?? p.traffic ?? p.traffic_forecast),
      keywords: num(p.keywords_count ?? p.keywords ?? p.num_keywords),
      title: p.title || null,
    }))
    .filter((p) => p.url);
}

export function normalizeAuditPagesList(raw) {
  const rows = raw?.pages || raw?.data || (Array.isArray(raw) ? raw : []);
  if (!Array.isArray(rows)) return [];
  return rows.map((p) => ({
    id: p.id || null,
    url: p.url || "",
    title: p.title || null,
    status: p.status != null ? Number(p.status) : null,
    depth: num(p.depth),
    issues: num(p.issues),
    errors: num(p.errors),
    warnings: num(p.warnings),
    notices: num(p.notices),
    trafficForecast: num(p.traffic_forecast),
    keywords: num(p.num_keywords),
    inlinks: num(p.inlinks),
    loadMs: num(p.load_ms),
    indexable: p.indexable != null ? Boolean(Number(p.indexable)) : null,
  }));
}
