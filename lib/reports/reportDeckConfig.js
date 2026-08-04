/**
 * Per-site report deck template — which slides & stats appear in PDFs
 * (download, Send all, and weekly cron all honor this).
 */
import prisma from "../prisma.js";
import { normalizeSiteOrigin } from "../validation.js";
import { toDomain } from "../authority.js";

export const REPORT_DECK_CONFIG_VERSION = 1;

/** @type {{ id: string, label: string, deck: "website"|"smm"|"both", description: string }[]} */
export const REPORT_SLIDE_CATALOG = [
  {
    id: "executive",
    label: "Executive dashboard",
    deck: "website",
    description: "GSC KPIs, daily clicks trend, top queries",
  },
  {
    id: "authority",
    label: "Authority & performance",
    deck: "website",
    description: "Domain strength, PageSpeed, Core Web Vitals",
  },
  {
    id: "traffic",
    label: "Organic traffic",
    deck: "website",
    description: "Search Console traffic chart",
  },
  {
    id: "geography",
    label: "Audience geography",
    deck: "website",
    description: "World heat map and top countries",
  },
  {
    id: "queriesPages",
    label: "Queries & pages",
    deck: "website",
    description: "Top queries and top landing pages",
  },
  {
    id: "domainIntel",
    label: "Domain intelligence",
    deck: "website",
    description: "SE Ranking footprint and keyword panels",
  },
  {
    id: "backlinks",
    label: "Backlink profile",
    deck: "website",
    description: "Referring domains, anchors, linked pages",
  },
  {
    id: "audit",
    label: "Site audit",
    deck: "website",
    description: "Health score and crawl issues",
  },
  {
    id: "blogs",
    label: "Blog content cards",
    deck: "website",
    description: "Published and pending blogs this month",
  },
  {
    id: "seoOpportunities",
    label: "SEO opportunities",
    deck: "website",
    description: "Internal quick wins (staff digests only)",
  },
  {
    id: "socialPerformance",
    label: "Social performance",
    deck: "smm",
    description: "Platform KPIs and follower growth",
  },
  {
    id: "contentActivity",
    label: "Content activity",
    deck: "smm",
    description: "Posting cadence and engagement",
  },
  {
    id: "socialPosts",
    label: "Social post cards",
    deck: "smm",
    description: "Published and pending social posts",
  },
];

/** @type {{ id: string, label: string, slide: string, description: string }[]} */
export const REPORT_STAT_CATALOG = [
  // Executive
  { id: "exec.clicks", label: "Clicks", slide: "executive", description: "GSC clicks KPI" },
  { id: "exec.impressions", label: "Impressions", slide: "executive", description: "GSC impressions KPI" },
  { id: "exec.ctr", label: "Avg CTR", slide: "executive", description: "Average click-through rate" },
  { id: "exec.position", label: "Avg position", slide: "executive", description: "Average SERP position" },
  { id: "exec.orgTraffic", label: "Org. traffic", slide: "executive", description: "SE Ranking organic traffic" },
  { id: "exec.keywords", label: "Keywords", slide: "executive", description: "SE Ranking keyword count" },
  { id: "exec.clicksChart", label: "Daily clicks chart", slide: "executive", description: "Trend chart" },
  { id: "exec.topQueries", label: "Top queries list", slide: "executive", description: "Side panel query bars" },

  // Authority
  { id: "auth.score", label: "Authority score", slide: "authority", description: "Primary authority number" },
  { id: "auth.inlinkRank", label: "InLink Rank", slide: "authority", description: "SE Ranking inlink rank" },
  { id: "auth.openPageRank", label: "Open PageRank", slide: "authority", description: "OPR score" },
  { id: "auth.globalRank", label: "Global rank", slide: "authority", description: "OPR global rank" },
  { id: "auth.refDomains", label: "Referring domains", slide: "authority", description: "Authority panel ref domains" },
  { id: "auth.homepageUr", label: "Homepage UR", slide: "authority", description: "Homepage URL rating" },
  { id: "auth.backlinks", label: "Backlinks", slide: "authority", description: "Backlink count" },
  { id: "auth.dofollow", label: "Dofollow", slide: "authority", description: "Dofollow backlinks" },
  { id: "auth.nofollow", label: "Nofollow", slide: "authority", description: "Nofollow backlinks" },
  { id: "auth.orgTraffic", label: "Org. traffic", slide: "authority", description: "Organic traffic row" },
  { id: "auth.orgKeywords", label: "Org. keywords", slide: "authority", description: "Organic keywords row" },
  { id: "auth.trafficValue", label: "Traffic value", slide: "authority", description: "Estimated traffic value" },
  { id: "auth.top10", label: "Top 10 keywords", slide: "authority", description: "Keywords in top 10" },
  { id: "auth.pagespeedMobile", label: "PageSpeed mobile", slide: "authority", description: "Mobile Lighthouse block" },
  { id: "auth.pagespeedDesktop", label: "PageSpeed desktop / CWV", slide: "authority", description: "Desktop + Core Web Vitals" },

  // Domain intelligence
  { id: "domain.kpiTraffic", label: "Org. traffic KPI", slide: "domainIntel", description: "Top KPI strip" },
  { id: "domain.kpiKeywords", label: "Keywords KPI", slide: "domainIntel", description: "Top KPI strip" },
  { id: "domain.kpiValue", label: "Traffic value KPI", slide: "domainIntel", description: "Top KPI strip" },
  { id: "domain.kpiTop10", label: "Top 10 KPI", slide: "domainIntel", description: "Top KPI strip" },
  { id: "domain.ranked", label: "Ranked keywords panel", slide: "domainIntel", description: "Positions 1–20" },
  { id: "domain.crucial", label: "Crucial keywords panel", slide: "domainIntel", description: "Striking distance" },
  { id: "domain.trafficKw", label: "Highest traffic panel", slide: "domainIntel", description: "Traffic drivers" },
  { id: "domain.competitors", label: "Competitors", slide: "domainIntel", description: "Competitor strip" },

  // Backlinks
  { id: "bl.kpis", label: "Backlink KPIs", slide: "backlinks", description: "Summary metric cards" },
  { id: "bl.anchors", label: "Top anchors", slide: "backlinks", description: "Anchor list" },
  { id: "bl.pages", label: "Top linked pages", slide: "backlinks", description: "Page list" },

  // Audit
  { id: "audit.score", label: "Audit health score", slide: "audit", description: "Primary score" },
  { id: "audit.issues", label: "Issue table", slide: "audit", description: "Issue rows" },
  { id: "audit.sections", label: "Section tallies", slide: "audit", description: "Area breakdown" },

  // SMM
  { id: "smm.platformCards", label: "Platform KPI cards", slide: "socialPerformance", description: "Per-network cards" },
  { id: "smm.followers", label: "Follower totals", slide: "socialPerformance", description: "Follower metrics" },
  { id: "smm.engagement", label: "Engagement metrics", slide: "contentActivity", description: "Engagement block" },
];

function allTrueMap(ids) {
  return Object.fromEntries(ids.map((id) => [id, true]));
}

export function defaultReportDeckConfig() {
  return {
    version: REPORT_DECK_CONFIG_VERSION,
    slides: allTrueMap(REPORT_SLIDE_CATALOG.map((s) => s.id)),
    stats: allTrueMap(REPORT_STAT_CATALOG.map((s) => s.id)),
  };
}

export function configStorageKey(siteKey) {
  const raw = String(siteKey || "").trim();
  if (!raw) return null;
  const origin = normalizeSiteOrigin(raw);
  const domain = toDomain(raw);
  const key = origin || (domain ? `https://${domain}` : raw);
  return `report_deck_config:${key}`;
}

export function normalizeReportDeckConfig(raw) {
  const base = defaultReportDeckConfig();
  if (!raw || typeof raw !== "object") return base;
  const slides = { ...base.slides };
  const stats = { ...base.stats };
  if (raw.slides && typeof raw.slides === "object") {
    for (const id of Object.keys(slides)) {
      if (raw.slides[id] === false) slides[id] = false;
      if (raw.slides[id] === true) slides[id] = true;
    }
  }
  if (raw.stats && typeof raw.stats === "object") {
    for (const id of Object.keys(stats)) {
      if (raw.stats[id] === false) stats[id] = false;
      if (raw.stats[id] === true) stats[id] = true;
    }
  }
  // If a slide is off, treat its stats as off for UI clarity (builder also checks slide)
  for (const st of REPORT_STAT_CATALOG) {
    if (slides[st.slide] === false) stats[st.id] = false;
  }
  return { version: REPORT_DECK_CONFIG_VERSION, slides, stats };
}

export function isSlideEnabled(config, slideId) {
  const cfg = normalizeReportDeckConfig(config);
  return cfg.slides[slideId] !== false;
}

export function isStatEnabled(config, statId) {
  const cfg = normalizeReportDeckConfig(config);
  const def = REPORT_STAT_CATALOG.find((s) => s.id === statId);
  if (def && cfg.slides[def.slide] === false) return false;
  return cfg.stats[statId] !== false;
}

export function summarizeDeckConfig(config) {
  const cfg = normalizeReportDeckConfig(config);
  const slidesOff = REPORT_SLIDE_CATALOG.filter((s) => cfg.slides[s.id] === false).map((s) => s.label);
  const statsOff = REPORT_STAT_CATALOG.filter((s) => cfg.stats[s.id] === false && cfg.slides[s.slide] !== false).map(
    (s) => s.label
  );
  return {
    slidesOn: REPORT_SLIDE_CATALOG.length - slidesOff.length,
    slidesTotal: REPORT_SLIDE_CATALOG.length,
    statsOn: REPORT_STAT_CATALOG.length - statsOff.length - REPORT_STAT_CATALOG.filter((s) => cfg.slides[s.slide] === false).length,
    statsTotal: REPORT_STAT_CATALOG.filter((s) => cfg.slides[s.slide] !== false).length,
    slidesOff,
    statsOff,
    isDefault: slidesOff.length === 0 && statsOff.length === 0,
  };
}

export async function getReportDeckConfig(siteKey) {
  const key = configStorageKey(siteKey);
  if (!key) return defaultReportDeckConfig();
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } });
    if (!row?.value) return defaultReportDeckConfig();
    return normalizeReportDeckConfig(JSON.parse(row.value));
  } catch {
    return defaultReportDeckConfig();
  }
}

export async function setReportDeckConfig(siteKey, config) {
  const key = configStorageKey(siteKey);
  if (!key) {
    const err = new Error("Site key required");
    err.status = 400;
    throw err;
  }
  const normalized = normalizeReportDeckConfig(config);
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: JSON.stringify(normalized) },
    update: { value: JSON.stringify(normalized) },
  });
  return normalized;
}

export function canAccessReportsStudio(user) {
  if (!user) return false;
  const role = String(user.role || "").toLowerCase();
  return role === "super_admin" || role === "smm";
}

export function getReportCatalogPayload() {
  return {
    slides: REPORT_SLIDE_CATALOG,
    stats: REPORT_STAT_CATALOG,
    defaults: defaultReportDeckConfig(),
  };
}
