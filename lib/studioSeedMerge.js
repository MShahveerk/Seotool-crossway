/**
 * Merge standing Seeds config with per-run / Excel row layers.
 * Standing site Seeds always stay in play; row brief layers on top.
 */

export function mergeTextLayers(...parts) {
  return parts
    .map((p) => String(p || "").trim())
    .filter(Boolean)
    .join("\n\n");
}

/** Merge keyword/hook lines (one per line), deduped case-insensitively. */
export function mergeKeywordLines(...blocks) {
  const lines = [];
  const seen = new Set();
  for (const block of blocks) {
    for (const line of String(block || "").split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(t);
    }
  }
  return lines.join("\n");
}

/** Blog Excel: keep site Seeds, layer row topic brief on top. */
export function blogExcelOverrides(site, row) {
  const rowBrief = mergeTextLayers(row?.seedContext, row?.notes);
  return {
    seedPrompt: mergeTextLayers(
      site?.seedPrompt,
      rowBrief ? "--- This run (Excel row brief) ---" : "",
      rowBrief
    ),
    mustFollowKeywords: mergeKeywordLines(
      site?.mustFollowKeywords,
      row?.keywords || row?.topic || ""
    ),
    targetAudience: String(row?.audience || site?.targetAudience || "").trim(),
    ctaText: String(row?.ctaText || site?.ctaText || "").trim(),
    ctaUrl: String(row?.ctaUrl || site?.ctaUrl || "").trim(),
    topicImagePrompt: String(row?.imagePrompt || "").trim(),
  };
}

/** Post Excel: keep site Seeds, layer row topic brief on top. */
export function postExcelOverrides(site, row) {
  const rowBrief = mergeTextLayers(row?.seedContext, row?.notes);
  return {
    seedPrompt: mergeTextLayers(
      site?.seedPrompt,
      rowBrief ? "--- This run (Excel row brief) ---" : "",
      rowBrief
    ),
    hooksOrKeywords: mergeKeywordLines(
      site?.hooksOrKeywords,
      row?.keywords || row?.topic || ""
    ),
    ctaText: String(row?.ctaText || site?.ctaText || "").trim(),
    ctaUrl: String(row?.ctaUrl || site?.ctaUrl || "").trim(),
    defaultPlatform: String(row?.platform || site?.defaultPlatform || "both").trim(),
    topicImagePrompt: String(row?.imagePrompt || "").trim(),
  };
}
