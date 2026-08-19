/**
 * Collapse a studio run's stages into the few numbers the run library needs.
 *
 * `stagesJson` carries every agent's full output, which is far too heavy to ship
 * for a list that polls while a run is live — so the runs routes read it, reduce
 * it here, and drop it before responding.
 *
 * Shared by the Blog and Post studios; the two differ only in what their agents
 * are called, hence the `agentTitles` map.
 */

const DONE_STATUSES = ["succeeded", "success", "completed", "complete", "done", "ok"];
const FAILED_STATUSES = ["failed", "error", "errored"];
const RUNNING_STATUSES = ["running", "in_progress", "active", "working", "waiting"];

export function toStageSummary(stagesJson, agentTitles = {}) {
    const stages = Array.isArray(stagesJson)
    ? stagesJson.filter(
        (s) => s && typeof s === "object" && s.agent && !String(s.agent).startsWith("_")
      )
    : [];
  if (!stages.length) return null;

  let done = 0;
  let failed = 0;
  let current = null;

  for (const stage of stages) {
    const status = String(stage.status || "").toLowerCase();
    if (DONE_STATUSES.includes(status)) done += 1;
    else if (FAILED_STATUSES.includes(status)) failed += 1;
    else if (!current && RUNNING_STATUSES.includes(status)) current = stage;
  }

  return {
    done,
    failed,
    current: current
      ? agentTitles[current.agent] || current.role || current.title || String(current.agent || "")
      : null,
    // The Interpreter only runs for document / Excel sources, so the expected
    // pipeline length depends on whether this run used one.
    hasInterpreter: stages.some((s) => s.agent === "interpreter"),
    hasDecider: stages.some((s) => s.agent === "decider"),
  };
}

export const BLOG_AGENT_TITLES = {
  interpreter: "Interpreter",
  decider: "Topic Decider",
  binder: "Keyword Binder",
  checker: "Topic Checker",
  headings: "Headings",
  headings_approval: "Headings review",
  agent1: "Strategist",
  agent2: "Architect",
  agent3: "Writer",
  humanizer: "Humanizer",
  image: "Image",
  researcher: "Site Researcher",
  scout: "Keyword Scout",
};

export const POST_AGENT_TITLES = {
  interpreter: "Interpreter",
  agent1: "Strategist",
  agent2: "Copywriter",
  image: "Image",
};
