/** Shared formatting + normalisation for the three studios' run consoles. */

export function formatCost(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  if (v === 0) return "$0";
  if (v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}

export function formatWhen(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

/** 92_000 → "1:32". Used for stage durations and the live run clock. */
export function formatDuration(ms) {
  if (ms == null || !Number.isFinite(Number(ms)) || Number(ms) < 0) return null;
  const total = Math.floor(Number(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function normalizeStatus(value) {
  const s = String(value ?? "").toLowerCase();
  if (["running", "in_progress", "active", "working"].includes(s)) return "running";
  if (["queued", "pending_start", "starting"].includes(s)) return "queued";
  if (["waiting", "awaiting_approval", "paused"].includes(s)) return "waiting";
  if (["succeeded", "success", "completed", "complete", "done", "ok"].includes(s)) return "succeeded";
  if (["failed", "error", "errored"].includes(s)) return "failed";
  if (["cancelled", "canceled", "aborted"].includes(s)) return "cancelled";
  return "pending";
}

export function isLiveStatus(value) {
  const s = normalizeStatus(value);
  return s === "running" || s === "queued" || s === "waiting";
}

/** Best-effort readable dump of whatever an agent returned. */
export function stageBodyText(stage) {
  if (!stage) return "";
  if (stage.data && typeof stage.data === "object") {
    try {
      return JSON.stringify(stage.data, null, 2);
    } catch {
      /* fall through */
    }
  }
  if (stage.rawText) return String(stage.rawText);
  if (stage.preview) return String(stage.preview);
  return "";
}

/**
 * Merge a run's recorded stages onto the studio's full agent roster so the
 * pipeline shows every agent from the first frame — the ones that haven't run
 * yet sit there greyed instead of popping into existence mid-run.
 *
 * @param {Array} blueprint  [{ id, title, subtitle }] in pipeline order
 * @param {Array} stages     raw stagesJson from the run
 * @param {Function} matchKey how to read a stage's agent id
 */
export function buildPipelineSteps(blueprint = [], stages = [], matchKey = (s) => s?.agent) {
  const list = Array.isArray(stages) ? stages : [];
  const used = new Set();

  const fromBlueprint = (blueprint || [])
    .map((role) => {
      const idx = list.findIndex(
        (s, i) => !used.has(i) && String(matchKey(s) || "") === String(role.id)
      );
      if (idx >= 0) used.add(idx);
      const stage = idx >= 0 ? list[idx] : null;
      // `optional` agents (e.g. the Interpreter, which only runs for document
      // and Excel sources) shouldn't sit on the rail as permanent ghosts.
      if (!stage && role.optional) return null;
      return toStep(stage, role);
    })
    .filter(Boolean);

  // Anything the run reported that isn't on the roster still deserves a chip.
  const extras = list
    .map((stage, i) => (used.has(i) ? null : toStep(stage, null)))
    .filter(Boolean);

  return [...fromBlueprint, ...extras];
}

function spanMs(from, to) {
  if (!from || !to) return null;
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return b - a;
}

function toStep(stage, role) {
  const status = stage
    ? normalizeStatus(
        stage.status ?? (stage.ok === true ? "succeeded" : stage.ok === false ? "failed" : "pending")
      )
    : "pending";

  return {
    id: String(role?.id || stage?.agent || stage?.agentId || stage?.title || "step"),
    title: role?.title || stage?.role || stage?.title || stage?.agent || "Agent",
    subtitle: role?.subtitle || stage?.subtitle || "",
    status,
    provider: stage?.provider || "",
    model: stage?.model || "",
    costUsd: stage?.costUsd,
    durationMs: stage?.durationMs ?? stage?.elapsedMs ?? spanMs(stage?.startedAt, stage?.finishedAt),
    preview: stage?.preview ? String(stage.preview) : "",
    body: stageBodyText(stage),
    error: stage?.error ? String(stage.error) : "",
    warning: stage?.warning ? String(stage.warning) : "",
    raw: stage || null,
  };
}
