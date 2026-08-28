/**
 * Encode / parse Facebook + Instagram object ids stored on Approval.externalId.
 * Legacy rows may hold a single Graph id (treated as Facebook).
 */

export function encodeMetaExternalIds({ facebookId = null, instagramId = null } = {}) {
  const parts = [];
  const fb = String(facebookId || "").trim();
  const ig = String(instagramId || "").trim();
  if (fb) parts.push(`fb:${fb}`);
  if (ig) parts.push(`ig:${ig}`);
  const encoded = parts.join("|");
  if (!encoded) return null;
  return encoded.slice(0, 191);
}

export function parseMetaExternalIds(externalId) {
  const raw = String(externalId || "").trim();
  if (!raw) return { facebookId: null, instagramId: null };
  if (raw.includes("fb:") || raw.includes("ig:")) {
    const facebookId = raw.match(/(?:^|\|)fb:([^|]+)/)?.[1] || null;
    const instagramId = raw.match(/(?:^|\|)ig:([^|]+)/)?.[1] || null;
    return { facebookId, instagramId };
  }
  return { facebookId: raw, instagramId: null };
}
