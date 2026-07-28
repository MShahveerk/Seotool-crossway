/** SE Ranking integration — credit budgets, TTLs, and endpoint cost estimates. */

export const SERANKING_BASE = "https://api.seranking.com/v1";

export const DATA_TYPES = {
  BACKLINKS_SUMMARY: "backlinks_summary",
  DOMAIN_OVERVIEW: "domain_overview",
  DOMAIN_COMPETITORS: "domain_competitors",
  DOMAIN_KEYWORDS: "domain_keywords",
  KEYWORDS_SEEDS: "keywords_seeds",
  KEYWORD_EXPORT: "keyword_export",
  KEYWORD_METRIC: "keyword_metric",
  AUDIT_REPORT: "audit_report",
};

/** Default regional DB for keyword endpoints. */
export const DEFAULT_SOURCE = "us";

/** App geo keys → SE Ranking regional DB codes. */
export const SERANKING_GEO_MAP = {
  us: "us",
  uk: "uk",
  pk: "pk",
  ca: "ca",
  au: "au",
};

export const SERANKING_COUNTRY_LABELS = {
  us: "United States",
  uk: "United Kingdom",
  pk: "Pakistan",
  ca: "Canada",
  au: "Australia",
};

export function geoToSerankingSource(geoKey) {
  const key = String(geoKey || "us").toLowerCase();
  return SERANKING_GEO_MAP[key] || DEFAULT_SOURCE;
}

/** Countries shown in volume-by-country breakdown (cached metrics only for non-primary). */
export function volumeCountryCodes() {
  const raw = process.env.SERANKING_VOLUME_COUNTRIES || "us,uk,ca,au,pk";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Hard monthly cap (user requirement). */
export function monthlyBudget() {
  const n = Number(process.env.SERANKING_MONTHLY_CREDIT_BUDGET || 20000);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 20000;
}

/** Max credits to spend per cron run (~20k / 30 days with buffer). */
export function dailyCronBudget() {
  const n = Number(process.env.SERANKING_DAILY_CREDIT_CAP || 600);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 600;
}

/** Credits held back for rare manual/on-demand calls. */
export function manualReserve() {
  const n = Number(process.env.SERANKING_MANUAL_RESERVE || 1500);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 1500;
}

/** Scheduled refresh budget = monthly − reserve. */
export function scheduledMonthlyBudget() {
  return Math.max(0, monthlyBudget() - manualReserve());
}

export const TTL_DAYS = {
  [DATA_TYPES.BACKLINKS_SUMMARY]: 30,
  [DATA_TYPES.DOMAIN_OVERVIEW]: 30,
  [DATA_TYPES.DOMAIN_COMPETITORS]: 45,
  [DATA_TYPES.DOMAIN_KEYWORDS]: 30,
  [DATA_TYPES.KEYWORDS_SEEDS]: 30,
  [DATA_TYPES.KEYWORD_EXPORT]: 30,
  [DATA_TYPES.KEYWORD_METRIC]: 30,
  [DATA_TYPES.AUDIT_REPORT]: 30,
};

/** Conservative per-endpoint credit estimates (successful 2xx). */
export const CREDIT_ESTIMATES = {
  backlinks_summary: 100,
  domain_overview: 100,
  domain_competitors: 100,
  domain_keywords: 100,
  keywords_export_request: 100,
  keywords_similar_per_kw: 10,
  audit_standard_per_page: 2,
};

/** Max pages crawled in SE Ranking standard audit (2 credits/page). */
export function auditMaxPages() {
  const n = Number(process.env.SERANKING_AUDIT_MAX_PAGES || 20);
  return Number.isFinite(n) ? Math.min(100, Math.max(5, Math.floor(n))) : 20;
}

export function seedKeywordCount() {
  return 3;
}

export function isSerankingConfigured() {
  return Boolean(process.env.SERANKING_API_KEY?.trim());
}
