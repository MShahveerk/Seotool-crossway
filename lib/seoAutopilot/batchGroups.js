/**
 * Group Autopilot outputs into timestamped batches (by runId, else hour bucket).
 */

export function groupByTimestampBatch(items = [], { runIdKey = "runId", dateKey = "createdAt" } = {}) {
  const map = new Map();

  for (const item of items) {
    const runId = item?.[runIdKey] ? String(item[runIdKey]) : "";
    const created = item?.[dateKey] ? new Date(item[dateKey]) : new Date(0);
    const hourKey = Number.isNaN(created.getTime())
      ? "unknown"
      : created.toISOString().slice(0, 13);
    const key = runId ? `run:${runId}` : `t:${hourKey}`;

    if (!map.has(key)) {
      map.set(key, {
        key,
        runId: runId || null,
        items: [],
        latestAt: created,
      });
    }
    const batch = map.get(key);
    batch.items.push(item);
    if (created > batch.latestAt) batch.latestAt = created;
  }

  return Array.from(map.values()).sort((a, b) => b.latestAt - a.latestAt);
}

export function formatBatchLabel(date, count, noun = "item") {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return `Unknown · ${count} ${noun}${count === 1 ? "" : "s"}`;
  const when = d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${when} · ${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function statusTone(status) {
  const s = String(status || "").toLowerCase();
  if (s === "completed" || s === "sent") return "bg-emerald-50 text-emerald-800 border-emerald-100";
  if (s === "queued" || s === "running") return "bg-sky-50 text-sky-800 border-sky-100";
  if (s === "failed") return "bg-red-50 text-red-800 border-red-100";
  if (s === "ready" || s === "draft") return "bg-amber-50 text-amber-900 border-amber-100";
  return "bg-gray-50 text-gray-700 border-gray-100";
}
