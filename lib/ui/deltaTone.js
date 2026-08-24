/**
 * Semantic tone for period-over-period deltas.
 *
 * Up / good → brand electric blue (`--cw-up`).
 * Down / bad → danger red (`--cw-down`).
 * Invert when a lower number is the win (average position).
 */

export const DELTA_BADGE_CLASS = {
  up: "border-[color-mix(in_srgb,var(--cw-up)_35%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-up)_16%,transparent)] text-[var(--cw-up)]",
  down: "border-[color-mix(in_srgb,var(--cw-down)_35%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-down)_16%,transparent)] text-[var(--cw-down)]",
  neutral: "border-[var(--cw-hairline)] bg-[var(--cw-raised)] text-[var(--cw-ink-muted)]",
};

export const DELTA_TEXT_CLASS = {
  up: "text-[var(--cw-up)]",
  down: "text-[var(--cw-down)]",
  neutral: "text-[var(--cw-ink-muted)]",
};

export function deltaTone(value, { invert = false, epsilon = 0.05 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) < epsilon) return "neutral";
  const good = invert ? n < 0 : n > 0;
  return good ? "up" : "down";
}

export function deltaBadgeClass(value, opts) {
  return DELTA_BADGE_CLASS[deltaTone(value, opts)];
}

export function deltaTextClass(value, opts) {
  return DELTA_TEXT_CLASS[deltaTone(value, opts)];
}

export function formatSignedDelta(value, { digits = 1, suffix = "%" } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}${suffix}`;
}

/** Average position: current minus prior. A rise is worse. */
export function formatPositionDelta(value, { digits = 1, epsilon = 0.05 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  const abs = Math.abs(n).toFixed(digits);
  if (Math.abs(n) < epsilon) return `${abs} even`;
  return n > 0 ? `${abs} worse` : `${abs} better`;
}
