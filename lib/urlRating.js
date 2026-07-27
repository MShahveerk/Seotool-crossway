/**
 * Estimate page UR (0–100) from domain DR using path heuristics.
 * Not a real link graph — avoids every URL showing the same score as DR.
 */

function parseUrlParts(url) {
  try {
    const u = new URL(String(url || "").includes("://") ? url : `https://${url}`);
    return {
      pathname: u.pathname || "/",
      host: u.hostname.replace(/^www\./, "").toLowerCase(),
    };
  } catch {
    return { pathname: "/", host: "" };
  }
}

export function pathDepth(url) {
  const { pathname } = parseUrlParts(url);
  if (pathname === "/" || pathname === "") return 0;
  return pathname.split("/").filter(Boolean).length;
}

export function isLikelyHomepage(url, registrableDomain = "") {
  const { pathname, host } = parseUrlParts(url);
  if (pathname !== "/" && pathname !== "") return false;
  const reg = String(registrableDomain || host).replace(/^www\./, "").toLowerCase();
  if (!reg) return pathDepth(url) === 0;
  return host === reg || host === `www.${reg}` || host.endsWith(`.${reg}`);
}

/**
 * @param {number|null} dr100 Domain rating 0–100
 * @param {string} url Page URL
 * @param {string} [registrableDomain] Apex domain being explored
 */
export function estimatePageUr100(dr100, url, registrableDomain = "") {
  if (dr100 == null || !Number.isFinite(Number(dr100))) return null;
  const dr = Math.min(100, Math.max(0, Math.round(Number(dr100))));
  if (dr <= 0) return 0;

  const depth = pathDepth(url);
  const homepage = isLikelyHomepage(url, registrableDomain);

  if (homepage || depth === 0) {
    // Homepage: close to DR but not a copy-paste (typical Ahrefs: homepage ≈ high UR)
    const lift = dr >= 70 ? 1 : dr >= 40 ? 2 : 3;
    return Math.min(100, Math.max(1, Math.round(dr * 0.94 + lift)));
  }

  let factor = Math.pow(0.81, depth);

  const { pathname } = parseUrlParts(url);
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 1 && segments[0].length <= 14) {
    factor = Math.max(factor, 0.72);
  }

  if (pathname.length > 100) factor *= 0.86;
  else if (pathname.length > 65) factor *= 0.92;

  let ur = Math.round(dr * factor);
  if (dr > 8) ur = Math.min(ur, dr - Math.max(1, Math.floor(depth / 2)));
  return Math.max(1, Math.min(100, ur));
}

export function estimateHomepageUr100(dr100, registrableDomain) {
  const d = String(registrableDomain || "").replace(/^www\./, "");
  if (!d) return dr100 != null ? estimatePageUr100(dr100, "https://example.com/", "") : null;
  return estimatePageUr100(dr100, `https://${d}/`, d);
}
