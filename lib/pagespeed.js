import axios from "axios";

/**
 * Calls Google PageSpeed Insights API and extracts key metrics.
 *
 * Required ENV:
 *   - PAGESPEED_API_KEY: Google API key with PageSpeed Insights enabled
 */

const PAGESPEED_API_ENDPOINT =
  "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

const MAX_DETAIL_ITEMS = 15;
const MAX_STRING_LEN = 300;

/** Audits that are internal/visual plumbing — never useful in our UI. */
const SKIPPED_AUDIT_IDS = new Set([
  "screenshot-thumbnails",
  "final-screenshot",
  "full-page-screenshot",
  "main-thread-tasks",
  "network-requests",
  "network-rtt",
  "network-server-latency",
  "user-timings",
  "script-treemap-data",
  "metrics",
  "diagnostics",
]);

/** Lab metric audits shown in the metrics strip (performance category "metrics" group). */
const LAB_METRIC_IDS = [
  "first-contentful-paint",
  "largest-contentful-paint",
  "total-blocking-time",
  "cumulative-layout-shift",
  "speed-index",
  "interactive",
];

function truncate(str, max = MAX_STRING_LEN) {
  const s = String(str);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** Keep only renderable fields from Lighthouse table cell values. */
function sanitizeDetailValue(value) {
  if (value == null) return value;
  if (typeof value === "string") return truncate(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "object") {
    const type = value.type;
    if (type === "node") {
      return {
        type: "node",
        selector: value.selector ? truncate(value.selector, 160) : null,
        nodeLabel: value.nodeLabel ? truncate(value.nodeLabel, 160) : null,
        snippet: value.snippet ? truncate(value.snippet, 240) : null,
      };
    }
    if (type === "url" || type === "link") {
      return { type, url: truncate(value.url || "", 500), text: value.text ? truncate(value.text, 160) : null };
    }
    if (type === "source-location") {
      return { type, url: truncate(value.url || "", 500), line: value.line ?? null, column: value.column ?? null };
    }
    if (type === "code") {
      return { type, value: truncate(value.value || "", 240) };
    }
    if (type === "numeric" || type === "bytes" || type === "ms" || type === "timespanMs") {
      return { type, value: value.value ?? null, granularity: value.granularity ?? null };
    }
    // Unknown object shape — keep primitive-ish fields only
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        out[k] = typeof v === "string" ? truncate(v) : v;
      }
    }
    return out;
  }
  return null;
}

/** Trim audit details down to what the UI renders (headings + capped item rows). */
function trimAuditDetails(details) {
  if (!details || typeof details !== "object") return null;
  const type = details.type;
  if (type !== "table" && type !== "opportunity" && type !== "list") {
    return null;
  }

  const headings = Array.isArray(details.headings)
    ? details.headings
        .map((h) => ({
          key: h.key ?? null,
          label: h.label || h.text || "",
          valueType: h.valueType || h.itemType || null,
        }))
        .filter((h) => h.key)
    : [];

  const items = Array.isArray(details.items)
    ? details.items.slice(0, MAX_DETAIL_ITEMS).map((item) => {
        const row = {};
        for (const h of headings) {
          if (item[h.key] !== undefined) row[h.key] = sanitizeDetailValue(item[h.key]);
        }
        // list-type details often have a single "value"/free-shape item
        if (!headings.length) {
          for (const [k, v] of Object.entries(item)) {
            if (k === "subItems") continue;
            row[k] = sanitizeDetailValue(v);
          }
        }
        return row;
      })
    : [];

  return {
    type,
    headings,
    items,
    totalItems: Array.isArray(details.items) ? details.items.length : 0,
    overallSavingsMs: details.overallSavingsMs ?? null,
    overallSavingsBytes: details.overallSavingsBytes ?? null,
  };
}

function normalizeLoadingExperience(le) {
  if (!le || !le.metrics || !Object.keys(le.metrics).length) return null;
  const metrics = {};
  for (const [key, m] of Object.entries(le.metrics)) {
    metrics[key] = {
      percentile: m.percentile ?? null,
      category: m.category || null,
      distributions: Array.isArray(m.distributions)
        ? m.distributions.map((d) => ({
            min: d.min ?? 0,
            max: d.max ?? null,
            proportion: d.proportion ?? 0,
          }))
        : [],
    };
  }
  return { overallCategory: le.overall_category || null, metrics };
}

function toScore100(score) {
  if (typeof score !== "number") return null;
  return score <= 1 ? Math.round(score * 100) : Math.round(score);
}

/**
 * Fetch the complete PageSpeed Insights report for one URL + strategy.
 * Returns everything the UI needs: CrUX field data, category scores,
 * lab metrics, and every category audit grouped PSI-style
 * (opportunities / diagnostics / passed / manual / notApplicable).
 */
export async function getPageSpeedFullReport(url, strategy = "mobile") {
  const apiKey = process.env.PAGESPEED_API_KEY;
  if (!apiKey) {
    throw new Error("PAGESPEED_API_KEY is not set. Please configure it in your environment.");
  }

  const categoryList = ["performance", "seo", "accessibility", "best-practices"];
  const categoryParams = categoryList.map((cat) => `category=${encodeURIComponent(cat)}`).join("&");
  const queryString = `url=${encodeURIComponent(url)}&key=${encodeURIComponent(apiKey)}&strategy=${encodeURIComponent(
    strategy
  )}&${categoryParams}`;

  let data;
  try {
    const response = await axios.get(`${PAGESPEED_API_ENDPOINT}?${queryString}`, {
      timeout: 120000,
    });
    data = response.data;
  } catch (err) {
    const message = err?.response?.data?.error?.message || err?.message || "Unknown PageSpeed API error";
    const status = err?.response?.status;
    throw new Error(status ? `PageSpeed API error ${status}: ${message}` : message);
  }

  const lighthouse = data.lighthouseResult ?? {};
  const rawCategories = lighthouse.categories ?? {};
  const rawAudits = lighthouse.audits ?? {};

  // Collect every audit referenced by a visible category ref
  const audits = {};
  const categories = {};

  for (const [catId, cat] of Object.entries(rawCategories)) {
    const groups = {
      opportunities: [],
      diagnostics: [],
      passed: [],
      manual: [],
      notApplicable: [],
    };

    for (const ref of cat.auditRefs || []) {
      if (!ref?.id || ref.group === "hidden" || SKIPPED_AUDIT_IDS.has(ref.id)) continue;
      // Metric audits are rendered in the dedicated metrics strip
      if (catId === "performance" && ref.group === "metrics") continue;

      const a = rawAudits[ref.id];
      if (!a) continue;

      if (!audits[ref.id]) {
        const details = trimAuditDetails(a.details);
        audits[ref.id] = {
          id: ref.id,
          title: a.title || ref.id,
          description: a.description || "",
          score: typeof a.score === "number" ? a.score : null,
          scoreDisplayMode: a.scoreDisplayMode || null,
          displayValue: a.displayValue || null,
          metricSavings: a.metricSavings || null,
          savingsMs: details?.overallSavingsMs ?? a.details?.overallSavingsMs ?? null,
          savingsBytes: details?.overallSavingsBytes ?? a.details?.overallSavingsBytes ?? null,
          details,
        };
      }

      const audit = audits[ref.id];
      const mode = audit.scoreDisplayMode;

      if (mode === "manual") {
        groups.manual.push(ref.id);
      } else if (mode === "notApplicable") {
        groups.notApplicable.push(ref.id);
      } else if (mode === "informative") {
        groups.diagnostics.push(ref.id);
      } else if (mode === "error") {
        groups.diagnostics.push(ref.id);
      } else if (audit.score !== null && audit.score >= 0.9) {
        groups.passed.push(ref.id);
      } else if (
        catId === "performance" &&
        (audit.details?.type === "opportunity" || audit.savingsMs != null || audit.metricSavings)
      ) {
        groups.opportunities.push(ref.id);
      } else {
        groups.diagnostics.push(ref.id);
      }
    }

    groups.opportunities.sort((x, y) => (audits[y]?.savingsMs || 0) - (audits[x]?.savingsMs || 0));
    // Worst score first so the biggest problems lead the list
    groups.diagnostics.sort((x, y) => (audits[x]?.score ?? 1) - (audits[y]?.score ?? 1));

    categories[catId] = {
      id: catId,
      title: cat.title || catId,
      score: toScore100(cat.score),
      ...groups,
    };
  }

  const labMetrics = LAB_METRIC_IDS.map((id) => {
    const a = rawAudits[id];
    if (!a) return null;
    return {
      id,
      title: a.title || id,
      displayValue: a.displayValue || null,
      score: typeof a.score === "number" ? Math.round(a.score * 100) : null,
      numericValue: a.numericValue ?? null,
    };
  }).filter(Boolean);

  return {
    analyzedUrl: data.id || url,
    finalUrl: lighthouse.finalDisplayedUrl || lighthouse.finalUrl || null,
    strategy,
    fetchTime: lighthouse.fetchTime ?? null,
    lighthouseVersion: lighthouse.lighthouseVersion ?? null,
    scores: {
      performance: toScore100(rawCategories.performance?.score),
      seo: toScore100(rawCategories.seo?.score),
      accessibility: toScore100(rawCategories.accessibility?.score),
      bestPractices: toScore100(rawCategories["best-practices"]?.score),
    },
    fieldData: {
      page: normalizeLoadingExperience(data.loadingExperience),
      origin: normalizeLoadingExperience(data.originLoadingExperience),
    },
    labMetrics,
    categories,
    audits,
  };
}

export async function getPageSpeedReport(url) {
  const apiKey = process.env.PAGESPEED_API_KEY;

  if (!apiKey) {
    throw new Error(
      "PAGESPEED_API_KEY is not set. Please configure it in your environment."
    );
  }

  // Build query string manually to ensure proper encoding of repeated category params
  // Google PageSpeed API expects: category=performance&category=seo&category=accessibility&category=best-practices
  const categoryList = ["performance", "seo", "accessibility", "best-practices"];
  const categoryParams = categoryList.map(cat => `category=${encodeURIComponent(cat)}`).join("&");
  const queryString = `url=${encodeURIComponent(url)}&key=${encodeURIComponent(apiKey)}&strategy=mobile&${categoryParams}`;
  const fullUrl = `${PAGESPEED_API_ENDPOINT}?${queryString}`;

  let data;
  try {
    const response = await axios.get(fullUrl);
    data = response.data;
    
    // Debug logging in development
    if (process.env.NODE_ENV === "development") {
      const categoriesData = data?.lighthouseResult?.categories;
      if (categoriesData) {
        console.log("PageSpeed API Categories received:", {
          performance: categoriesData.performance?.score,
          seo: categoriesData.seo?.score,
          accessibility: categoriesData.accessibility?.score,
          "best-practices": categoriesData["best-practices"]?.score,
        });
      } else {
        console.warn("PageSpeed API response missing categories:", {
          hasLighthouseResult: !!data?.lighthouseResult,
          lighthouseKeys: data?.lighthouseResult ? Object.keys(data.lighthouseResult) : [],
        });
      }
    }
  } catch (err) {
    // Bubble up clearer error details from the PageSpeed API if present
    const message =
      err?.response?.data?.error?.message ||
      err?.message ||
      "Unknown PageSpeed API error";
    const status = err?.response?.status;
    throw new Error(
      status ? `PageSpeed API error ${status}: ${message}` : message
    );
  }

  const lighthouseResult = data.lighthouseResult ?? {};
  const categories = lighthouseResult.categories ?? {};
  const audits = lighthouseResult.audits ?? {};

  // Extract scores - handle both number (0-1) and already converted (0-100) scores
  const getScore = (category) => {
    const score = category?.score;
    if (typeof score === "number") {
      // If score is between 0 and 1, convert to 0-100 scale
      if (score <= 1) {
        return Math.round(score * 100);
      }
      // If already 0-100, return as is
      return Math.round(score);
    }
    return null;
  };

  const performanceScore = getScore(categories.performance);
  const seoScore = getScore(categories.seo);
  const accessibilityScore = getScore(categories.accessibility);
  const bestPracticesScore = getScore(categories["best-practices"]);

  // Log warning if any scores are missing
  if (process.env.NODE_ENV === "development") {
    const missingScores = [];
    if (performanceScore === null) missingScores.push("Performance");
    if (seoScore === null) missingScores.push("SEO");
    if (accessibilityScore === null) missingScores.push("Accessibility");
    if (bestPracticesScore === null) missingScores.push("Best Practices");
    
    if (missingScores.length > 0) {
      console.warn(`PageSpeed API: Missing scores for: ${missingScores.join(", ")}`);
      console.warn("Available categories:", Object.keys(categories));
    }
  }

  const fcp = audits["first-contentful-paint"];
  const lcp = audits["largest-contentful-paint"];
  const cls = audits["cumulative-layout-shift"];
  const tbt = audits["total-blocking-time"];

  const metric = (audit) =>
    audit
      ? {
          title: audit.title,
          displayValue: audit.displayValue ?? null,
          numericValue: audit.numericValue ?? null,
          score:
            typeof audit.score === "number"
              ? Math.round(audit.score * 100)
              : null,
        }
      : null;

  return {
    lighthouseVersion: lighthouseResult.lighthouseVersion ?? null,
    fetchTime: lighthouseResult.fetchTime ?? null,
    performanceScore,
    seoScore,
    accessibilityScore,
    bestPracticesScore,
    metrics: {
      FCP: metric(fcp),
      LCP: metric(lcp),
      CLS: metric(cls),
      TBT: metric(tbt),
    },
  };
}

