/**
 * Operator-uploaded keyword bank for the Topic Decider.
 * Closed list — never invents phrases. Stored on the per-site prefix AppSetting.
 */

export const OPERATOR_KEYWORD_MAX = 200;

export function hasOperatorKeywordBank(config = {}) {
  return Boolean(config.useOperatorKeywords) && sanitizeOperatorKeywords(config.operatorKeywords).length > 0;
}

export function sanitizeOperatorKeywords(raw) {
  const seen = new Set();
  const out = [];
  const list = Array.isArray(raw) ? raw : [];
  for (const row of list) {
    const keyword = String(typeof row === "string" ? row : row?.keyword || "")
      .trim()
      .replace(/\s+/g, " ");
    if (keyword.length < 2 || keyword.length > 120) continue;
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const volume = Number(typeof row === "object" ? row.volume : null);
    const kd = Number(typeof row === "object" ? row.kd ?? row.difficulty : null);
    out.push({
      keyword,
      volume: Number.isFinite(volume) && volume >= 0 ? Math.round(volume) : null,
      kd: Number.isFinite(kd) && kd >= 0 ? Math.round(kd) : null,
      notes: String(typeof row === "object" ? row.notes || "" : "").trim().slice(0, 240),
    });
    if (out.length >= OPERATOR_KEYWORD_MAX) break;
  }
  return out;
}

export function collectOperatorCandidates(rows) {
  const keywords = sanitizeOperatorKeywords(rows);
  const candidates = keywords.map((row, i) => {
    const kd = row.kd;
    const volume = row.volume || 0;
    const kdScore = kd == null ? 40 : Math.max(0, 100 - kd);
    return {
      id: String(row.keyword)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 48) || `op-${i}`,
      query: row.keyword,
      source: "operator",
      lane: "library",
      score: Math.min(volume, 50000) + kdScore,
      posture: "gap",
      kd: kd,
      volume: row.volume,
      trendDirection: null,
      cluster: null,
      notes: row.notes || "",
    };
  });
  return {
    geo: "US",
    source: "operator",
    candidates,
    gscStatus: null,
  };
}

const HEADER_ALIASES = {
  keyword: ["keyword", "keywords", "phrase", "query", "seed", "primary", "primary keyword", "focus keyword"],
  volume: ["volume", "vol", "search volume", "sv"],
  kd: ["kd", "difficulty", "keyword difficulty", "seo difficulty"],
  notes: ["notes", "note", "angle", "comment"],
};

function headerKey(name) {
  const n = String(name || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .trim();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(n)) return field;
  }
  return null;
}

/**
 * Map spreadsheet objects (sheet_to_json) into operator keyword rows.
 */
export function rowsFromSpreadsheetJson(objects = []) {
  const raw = Array.isArray(objects) ? objects : [];
  if (!raw.length) return [];
  const keys = Object.keys(raw[0] || {});
  const map = {};
  for (const k of keys) {
    const field = headerKey(k);
    if (field && map[field] == null) map[field] = k;
  }
  const firstKey = keys[0];
  return raw.map((row) => {
    const keyword = map.keyword
      ? row[map.keyword]
      : row.keyword || row.Keyword || row[firstKey];
    return {
      keyword,
      volume: map.volume ? row[map.volume] : row.volume,
      kd: map.kd ? row[map.kd] : row.kd ?? row.difficulty,
      notes: map.notes ? row[map.notes] : row.notes,
    };
  });
}
