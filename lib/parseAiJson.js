/**
 * Tolerant JSON extraction + repair for LLM outputs.
 * Prefer recovering usable objects over failing the whole run.
 */

function stripFences(raw) {
  return String(raw || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^```(?:json|javascript|js)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function repairJsonSyntax(text) {
  let s = String(text || "");
  // Smart quotes → straight
  s = s.replace(/[\u201C\u201D\u201E\u201F]/g, '"').replace(/[\u2018\u2019\u201A\u201B]/g, "'");
  // Trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, "$1");
  // JS-style unquoted keys: { foo: 1 } → { "foo": 1 } (conservative)
  s = s.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');
  // Single-quoted strings → double (best-effort)
  s = s.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, inner) => `"${inner.replace(/"/g, '\\"')}"`);
  // Remove // line comments and /* */ blocks
  s = s.replace(/\/\*[\s\S]*?\*\//g, "");
  s = s.replace(/(^|[^:])\/\/.*$/gm, "$1");
  return s.trim();
}

function balanceBrackets(text) {
  let s = String(text || "").trim();
  if (!s.startsWith("{") && !s.startsWith("[")) return s;
  const stack = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "{" || ch === "[") stack.push(ch);
    if (ch === "}" || ch === "]") stack.pop();
  }
  if (inStr) s += '"';
  while (stack.length) {
    const open = stack.pop();
    s += open === "{" ? "}" : "]";
  }
  return s;
}

function tryParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Parse model text into a JSON object/array. Returns null only if nothing salvageable.
 */
export function parseAiJson(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const cleaned = stripFences(raw);
  let parsed = tryParse(cleaned);
  if (parsed) return parsed;

  const startObj = cleaned.indexOf("{");
  const startArr = cleaned.indexOf("[");
  let start = -1;
  let isArr = false;
  if (startObj >= 0 && (startArr < 0 || startObj < startArr)) {
    start = startObj;
  } else if (startArr >= 0) {
    start = startArr;
    isArr = true;
  }
  if (start >= 0) {
    const end = isArr ? cleaned.lastIndexOf("]") : cleaned.lastIndexOf("}");
    const slice = end > start ? cleaned.slice(start, end + 1) : cleaned.slice(start);
    parsed = tryParse(slice);
    if (parsed) return parsed;

    const repaired = repairJsonSyntax(slice);
    parsed = tryParse(repaired);
    if (parsed) return parsed;

    parsed = tryParse(balanceBrackets(repaired));
    if (parsed) return parsed;
  }

  const repairedAll = repairJsonSyntax(cleaned);
  parsed = tryParse(repairedAll) || tryParse(balanceBrackets(repairedAll));
  return parsed;
}

/**
 * Last-resort object so a run can continue with the model's prose/partial output.
 */
export function salvageAgentJson(agentId, rawText) {
  const text = String(rawText || "").trim().slice(0, 12000);
  const summary =
    text.slice(0, 1200) ||
    "Model returned non-JSON output; content was recovered as plain text.";

  const base = {
    _recoveredFromText: true,
    summary,
  };

  switch (String(agentId || "")) {
    case "auditor":
      return {
        ...base,
        googleHealthScore: null,
        geoReadinessScore: null,
        topProblems: [],
        metrics: {},
        backlinks: {},
        nextSteps: [],
      };
    case "geoSpy":
      return {
        ...base,
        overallVisibilityScore: null,
        engines: [],
        biggestGap: summary.slice(0, 400),
        quickWins: [],
      };
    case "diagnoser":
      return {
        ...base,
        strikingDistance: [],
        aiQuestions: [],
        priorityWrites: [],
      };
    case "writer":
      return { ...base, sends: [] };
    case "fixer":
      return {
        ...base,
        robotsTxt: "",
        llmsTxt: "",
        faqSchemaJsonLd: "",
        answerBlocks: [],
        deployGuides: [],
      };
    case "foundation":
      return { ...base, links: [] };
    case "pitcher":
      return { ...base, pitches: [] };
    case "tracker":
      return { ...base, visibilityTrend: summary.slice(0, 400) };
    default:
      return { ...base, raw: text.slice(0, 4000) };
  }
}

/**
 * Parse → local repair → one model repair call → salvage object.
 * Never returns null; always yields { data, repaired, salvaged, costUsd, rawText }.
 */
export async function resolveModelJson({
  chatCompletion,
  provider,
  model,
  siteConfig,
  agentId,
  system,
  user,
  temperature = 0.3,
  maxTokens = 6000,
  signal = null,
} = {}) {
  let costUsd = 0;
  let rawText = "";

  const first = await chatCompletion({
    provider,
    model,
    siteConfig,
    system,
    user,
    temperature,
    maxTokens,
    jsonMode: true,
    signal,
  });
  costUsd += Number(first?.costUsd || 0);
  rawText = String(first?.text || first?.content || "");
  let data = first?.json && typeof first.json === "object" ? first.json : parseAiJson(rawText);

  if (data && typeof data === "object") {
    return { data, repaired: false, salvaged: false, costUsd, rawText, model, provider };
  }

  // Local syntax repair already tried inside parseAiJson — ask model to fix once.
  const repairUser = [
    "Your previous answer was not valid JSON. Convert it into ONE valid JSON object only.",
    "Keep the same meaning and fields. No markdown fences. No commentary.",
    "",
    "BROKEN OUTPUT:",
    rawText.slice(0, 14000) || "(empty)",
  ].join("\n");

  try {
    const second = await chatCompletion({
      provider,
      model,
      siteConfig,
      system:
        "You repair malformed JSON from SEO agents. Output a single valid JSON object only.",
      user: repairUser,
      temperature: 0.1,
      maxTokens: Math.min(maxTokens, 6000),
      jsonMode: true,
      signal,
    });
    costUsd += Number(second?.costUsd || 0);
    const repairRaw = String(second?.text || second?.content || "");
    rawText = repairRaw || rawText;
    data =
      second?.json && typeof second.json === "object"
        ? second.json
        : parseAiJson(repairRaw);
    if (data && typeof data === "object") {
      return { data, repaired: true, salvaged: false, costUsd, rawText, model, provider };
    }
  } catch {
    /* fall through to salvage */
  }

  data = salvageAgentJson(agentId, rawText);
  return {
    data,
    repaired: false,
    salvaged: true,
    costUsd,
    rawText,
    model,
    provider,
  };
}
