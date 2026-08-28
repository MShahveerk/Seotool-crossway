/**
 * When a live contribute page has no paid language, Unpaid is confirmed.
 * Listing/submit routes still need free-listing copy on the page.
 */

export function confirmedPitchCost({ cost, paidOnly = false, openKinds = [] } = {}) {
  if (paidOnly || cost === "paid") return "paid";
  if (cost === "unpaid") return "unpaid";
  if ((openKinds || []).includes("contribute")) return "unpaid";
  return cost || "unknown";
}
