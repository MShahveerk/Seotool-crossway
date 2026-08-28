/**
 * Decline can optionally hand remarks to Automation Studio for a rewrite.
 * Studio only runs for post_studio / blog_studio sources; this helper is the
 * opt-in flag that callers must pass through.
 */

export function isStudioPostSource(source) {
  return String(source || "") === "post_studio";
}

export function isStudioBlogSource(source) {
  return String(source || "") === "blog_studio";
}

function asFlagString(value) {
  if (value === true || value === 1) return "true";
  if (value === false || value === 0) return "false";
  return String(value ?? "").trim().toLowerCase();
}

function isTruthyFlag(value) {
  const s = asFlagString(value);
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function isFalsyFlag(value) {
  const s = asFlagString(value);
  return s === "0" || s === "false" || s === "no" || s === "off";
}

/**
 * Whether the reviewer asked Automation Studio to apply corrections.
 *
 * Email forms that offer the checkbox send studioRevisionOffered=1 and
 * runStudioRevision=1 when checked. Unchecked boxes are omitted from POST,
 * which we treat as false. Older emails without the offer field keep the
 * previous default (run the rewrite).
 *
 * JSON clients send runStudioRevision as a boolean. Omitted also defaults
 * to true so older in-app builds keep working.
 *
 * @param {{ form?: FormData | null, body?: Record<string, unknown> | null }} input
 */
export function parseRunStudioRevision({ form = null, body = null } = {}) {
  if (form) {
    if (String(form.get("studioRevisionOffered") || "") === "1") {
      return isTruthyFlag(form.get("runStudioRevision"));
    }
    return true;
  }
  if (body && typeof body === "object") {
    if (Object.prototype.hasOwnProperty.call(body, "runStudioRevision")) {
      const value = body.runStudioRevision;
      if (isFalsyFlag(value)) return false;
      return isTruthyFlag(value);
    }
  }
  return true;
}
