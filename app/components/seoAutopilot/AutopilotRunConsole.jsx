"use client";

import { useMemo } from "react";
import { Package } from "lucide-react";
import { AGENT_DEFS } from "@/lib/seoAutopilot/defaults";
import AgentPipeline from "../studioShared/AgentPipeline";
import { buildPipelineSteps, isLiveStatus } from "../studioShared/runFormat";
import SeoAutopilotMark from "./SeoAutopilotMark";

/**
 * SEO Autopilot run console — adapter onto the shared AgentPipeline cockpit,
 * plus this studio's scorecard/artifacts rail.
 */

function ScorecardAside({ run, scorecard, artifacts, live }) {
  return (
    <div className="space-y-3 px-5 py-4">
      <p className="text-[10px] font-bold tracking-[0.14em] text-[var(--cw-ink-faint)] uppercase">
        {live ? "Live scorecard" : "Scorecard for this run"}
      </p>

      {scorecard ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-2.5">
              <p className="text-[10px] font-bold tracking-[0.1em] text-[var(--cw-ink-faint)] uppercase">
                Google health
              </p>
              <p className="font-heading mt-1 text-2xl font-semibold tabular-nums text-[var(--cw-neon)]">
                {scorecard.googleHealthScore ?? "—"}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-2.5">
              <p className="text-[10px] font-bold tracking-[0.1em] text-[var(--cw-ink-faint)] uppercase">
                GEO readiness
              </p>
              <p className="font-heading mt-1 text-2xl font-semibold tabular-nums text-[var(--cw-info)]">
                {scorecard.geoReadinessScore ?? "—"}
              </p>
            </div>
          </div>

          {scorecard.summary ? (
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-[var(--cw-ink-dim)]">
              {scorecard.summary}
            </p>
          ) : null}

          {Array.isArray(scorecard.topProblems) && scorecard.topProblems.length ? (
            <ul className="space-y-1.5">
              {scorecard.topProblems.slice(0, 8).map((p, i) => (
                <li
                  key={`${p.title}-${i}`}
                  className="rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-2"
                >
                  <p className="text-[13px] font-semibold text-[var(--cw-ink)]">{p.title}</p>
                  {p.fix ? (
                    <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--cw-ink-muted)]">
                      {p.fix}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <p className="text-[13px] leading-relaxed text-[var(--cw-ink-muted)]">
          {live
            ? "Fills in as the Auditor and AI-Search Spy finish."
            : "No scorecard was stored on this run."}
        </p>
      )}

      {artifacts.length ? (
        <div className="border-t border-[var(--cw-hairline)] pt-3">
          <p className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] text-[var(--cw-ink-faint)] uppercase">
            <Package className="size-3" aria-hidden />
            Artifacts ({artifacts.length})
          </p>
          <ul className="max-h-48 space-y-1.5 overflow-auto">
            {artifacts.map((a) => (
              <li
                key={a.id}
                className="rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-2 text-[11px]"
              >
                <span className="font-semibold text-[var(--cw-ink)]">{a.kind}</span>
                {a.title ? <span className="text-[var(--cw-ink-muted)]"> · {a.title}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-[11px] leading-relaxed text-[var(--cw-ink-faint)]">
        {live
          ? "Finished work also lands in Scorecard, Fixes, Gaps, Blog seeds and Pitches."
          : "Site-wide tabs may show newer runs than this one."}
      </p>
      {run?.trigger ? (
        <p className="font-mono text-[10px] text-[var(--cw-ink-faint)]">trigger · {run.trigger}</p>
      ) : null}
    </div>
  );
}

export default function AutopilotRunConsole({
  run,
  onCancel,
  cancelling,
  runArtifacts = [],
  loadingDetail = false,
}) {
  const live = isLiveStatus(run?.status);

  const steps = useMemo(() => {
    const stages = Array.isArray(run?.stagesJson) ? run.stagesJson : [];
    const ran = new Set(stages.map((s) => String(s?.agentId || "")));
    // A live run shows the whole roster so you can see what's coming. A finished
    // run shows only the agents it actually ran — Autopilot supports single-agent
    // runs, and eight permanent ghosts would be noise.
    const blueprint = AGENT_DEFS.filter((a) => live || ran.has(a.id)).map((a) => ({
      id: a.id,
      title: a.title,
      subtitle: a.subtitle,
    }));
    return buildPipelineSteps(blueprint, stages, (s) => s?.agentId);
  }, [run?.stagesJson, live]);

  const scorecard =
    run?.scorecardJson && typeof run.scorecardJson === "object" ? run.scorecardJson : null;
  const artifacts = Array.isArray(runArtifacts) ? runArtifacts : [];

  return (
    <AgentPipeline
      run={run}
      steps={steps}
      eyebrow={loadingDetail ? "Autopilot run · loading full output…" : "Autopilot run"}
      title={run ? `${run.trigger || "manual"} run` : null}
      onCancel={onCancel}
      cancelling={cancelling}
      aside={
        run ? (
          <ScorecardAside run={run} scorecard={scorecard} artifacts={artifacts} live={live} />
        ) : null
      }
      emptyIcon={SeoAutopilotMark}
      emptyTitle="No run selected"
      emptyHint="Hit Run Autopilot for a live console, or open a past run below to inspect every agent stage and its full JSON output."
    />
  );
}
