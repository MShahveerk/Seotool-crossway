/**
 * Robust JSON extraction from LLM responses (especially free OpenRouter models).
 */

function stripJsonFences(text) {
  let s = String(text || "").trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  }
  return s;
}

function removeTrailingCommas(json) {
  return json.replace(/,\s*([}\]])/g, "$1");
}

function extractBalancedJson(text, openChar, closeChar) {
  const start = text.indexOf(openChar);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === openChar) depth++;
    if (ch === closeChar) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function closeTruncatedJson(fragment) {
  let s = fragment.trim();
  if (!s) return s;

  const stack = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") {
      if (stack.length && stack[stack.length - 1] === ch) stack.pop();
    }
  }

  if (inString) s += '"';
  while (stack.length) s += stack.pop();
  return s;
}

function tryParse(candidate) {
  if (!candidate) return null;
  const variants = [
    candidate,
    removeTrailingCommas(candidate),
    removeTrailingCommas(closeTruncatedJson(candidate)),
  ];
  for (const v of variants) {
    try {
      return JSON.parse(v);
    } catch {
      /* next */
    }
  }
  return null;
}

/**
 * Parse JSON from messy LLM output. Returns object or throws.
 */
export function parseAiJsonResponse(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    const err = new Error("AI returned an empty response.");
    err.status = 502;
    throw err;
  }

  const candidates = new Set();
  candidates.add(text);
  candidates.add(stripJsonFences(text));

  const obj = extractBalancedJson(text, "{", "}");
  if (obj) candidates.add(obj);
  const arr = extractBalancedJson(text, "[", "]");
  if (arr) candidates.add(arr);

  const stripped = stripJsonFences(text);
  const obj2 = extractBalancedJson(stripped, "{", "}");
  if (obj2) candidates.add(obj2);

  for (const candidate of candidates) {
    const parsed = tryParse(candidate);
    if (parsed != null && typeof parsed === "object") return parsed;
  }

  const err = new Error("AI returned invalid JSON. Try again or switch model.");
  err.status = 502;
  throw err;
}
