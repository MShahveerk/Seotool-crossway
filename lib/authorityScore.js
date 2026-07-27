/**
 * Open PageRank API returns 0–10; display as 0–100 (DA-style).
 */
export function toScore100(score10) {
  if (score10 == null || !Number.isFinite(Number(score10))) return null;
  const n = Number(score10);
  if (n > 10) return Math.min(100, Math.round(n));
  return Math.min(100, Math.round(n * 10));
}
