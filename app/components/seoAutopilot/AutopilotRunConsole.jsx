"use client";

import { useState } from "react";
import { FiChevronDown, FiChevronRight, FiLoader, FiXCircle } from "react-icons/fi";
import { Radar } from "lucide-react";
import { formatMoney, formatWhen, statusTone } from "../blogStudio/studioConstants";

function stageTone(status) {
  const s = String(status || "").toLowerCase();
  if (s === "running") return "border-emerald-500 bg-emerald-50/80 shadow-[0_0_0_3px_rgba(16,185,129,0.1)]";
  if (s === "succeeded" || s === "completed") return "border-gray-200 bg-white";
  if (s === "failed") return "border-red-200 bg-red-50/50";
  if (s === "cancelled") return "border-gray-200 bg-gray-50";
  return "border-dashed border-gray-200 bg-gray-50/60";
}

function stageStatusOf(stage) {
  return (
    stage?.status ||
    (stage?.ok === true ? "succeeded" : stage?.ok === false ? "failed" : "pending")
  );
}

function formatStageBody(stage) {
  if (stage?.data && typeof stage.data === "object") {
    try {
      return JSON.stringify(stage.data, null, 2);
    } catch {
      /* fall through */
    }
  }
  if (stage?.rawText) return String(stage.rawText);
  if (stage?.preview) return String(stage.preview);
  return "";
}

export default function AutopilotRunConsole({
  run,
  onCancel,
  cancelling,
  runArtifacts = [],
  loadingDetail = false,
}) {
  const [expanded, setExpanded] = useState({});

  if (!run) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
        <Radar className="mx-auto h-8 w-8 text-emerald-700/70" />
        <p className="mt-3 text-sm font-semibold text-gray-900">No run selected</p>
        <p className="mt-1 text-sm text-gray-500 max-w-md mx-auto">
          Click <span className="font-semibold">Run Autopilot</span> for a live console, or open any
          past run below to inspect every agent stage and full JSON output.
        </p>
      </div>
    );
  }

  const stages = Array.isArray(run.stagesJson) ? run.stagesJson : [];
  const live = ["queued", "running"].includes(String(run.status || ""));
  const scorecard =
    run.scorecardJson && typeof run.scorecardJson === "object" ? run.scorecardJson : null;
  const artifacts = Array.isArray(runArtifacts) ? runArtifacts : [];

  const toggle = (idx) => {
    setExpanded((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-[#f4fbf4] to-white px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {live ? "Live Autopilot run" : "Past Autopilot run"}
            {loadingDetail ? " · loading full output…" : ""}
          </p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5">
            {run.trigger || "manual"} · {run.id}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${statusTone(run.status)}`}
          >
            {live ? <FiLoader className="inline h-3 w-3 mr-1 animate-spin" /> : null}
            {run.status}
          </span>
          <span className="text-xs font-mono text-gray-600 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1">
            est. {formatMoney(run.totalCostUsd)}
          </span>
          {live ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelling}
              className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 border border-red-200 bg-red-50 rounded-lg px-2.5 py-1.5 hover:bg-red-100 disabled:opacity-50"
            >
              <FiXCircle className="h-3.5 w-3.5" />
              {cancelling ? "Cancelling…" : "Cancel"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-0">
        <div className="p-4 border-b xl:border-b-0 xl:border-r border-gray-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
            Agent stages {stages.length ? `(${stages.length})` : ""}
          </p>
          <ol className="space-y-2">
            {!stages.length ? (
              <li className="text-sm text-gray-500">
                {live ? "Starting agents…" : "No stages recorded for this run."}
              </li>
            ) : null}
            {stages.map((stage, idx) => {
              const status = stageStatusOf(stage);
              const isOpen = Boolean(expanded[idx]);
              const body = formatStageBody(stage);
              const hasDetail = Boolean(stage?.data || stage?.rawText || stage?.preview);
              return (
                <li
                  key={`${stage.agentId || stage.title}-${idx}`}
                  className={`rounded-xl border px-3 py-2.5 transition-all ${stageTone(status)} ${
                    status === "running" ? "animate-pulse" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">
                        {stage.title || stage.agentId || `Agent ${idx + 1}`}
                      </p>
                      {stage.subtitle ? (
                        <p className="text-[11px] text-gray-500 mt-0.5">{stage.subtitle}</p>
                      ) : null}
                      <p className="text-[11px] text-gray-500 font-mono mt-0.5">
                        {stage.provider || "—"} · {stage.model || "—"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusTone(status)}`}
                      >
                        {status === "running" ? (
                          <FiLoader className="inline h-3 w-3 mr-1 animate-spin" />
                        ) : null}
                        {status}
                      </span>
                      <p className="text-[11px] text-gray-500 mt-1">
                        {formatMoney(stage.costUsd)}
                      </p>
                    </div>
                  </div>
                  {stage.error ? (
                    <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-red-50 border border-red-100 p-2 text-[11px] text-red-700 whitespace-pre-wrap break-words">
                      {String(stage.error)}
                    </pre>
                  ) : null}
                  {stage.warning ? (
                    <p className="mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
                      {String(stage.warning)}
                    </p>
                  ) : null}
                  {stage.preview && !isOpen ? (
                    <p className="mt-2 text-[11px] text-gray-600 leading-relaxed whitespace-pre-wrap">
                      {String(stage.preview)}
                    </p>
                  ) : null}
                  {hasDetail ? (
                    <button
                      type="button"
                      onClick={() => toggle(idx)}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 hover:underline"
                    >
                      {isOpen ? (
                        <FiChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <FiChevronRight className="h-3.5 w-3.5" />
                      )}
                      {isOpen ? "Hide full output" : "Show full output"}
                    </button>
                  ) : null}
                  {isOpen && body ? (
                    <pre className="mt-2 max-h-[28rem] overflow-auto rounded-lg bg-gray-950 text-gray-100 border border-gray-800 p-3 text-[11px] leading-relaxed whitespace-pre-wrap break-words font-mono">
                      {body}
                    </pre>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {run.errorMessage ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-xs font-bold uppercase tracking-wide text-red-800">Run failed</p>
              <pre className="mt-1 max-h-40 overflow-auto text-sm text-red-800 whitespace-pre-wrap break-words font-sans">
                {run.errorMessage}
              </pre>
            </div>
          ) : null}
          <p className="mt-3 text-[11px] text-gray-400">
            Started {formatWhen(run.startedAt || run.createdAt)}
            {run.finishedAt ? ` · Finished ${formatWhen(run.finishedAt)}` : ""}
          </p>
        </div>

        <div className="p-4 bg-[#fafcfa] space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {live ? "Live scorecard snapshot" : "Scorecard for this run"}
          </p>
          {scorecard ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-gray-100 bg-white px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Google health
                  </p>
                  <p className="text-2xl font-semibold text-emerald-800 tabular-nums mt-1">
                    {scorecard.googleHealthScore ?? "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-white px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    GEO readiness
                  </p>
                  <p className="text-2xl font-semibold text-sky-800 tabular-nums mt-1">
                    {scorecard.geoReadinessScore ?? "—"}
                  </p>
                </div>
              </div>
              {scorecard.summary ? (
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {scorecard.summary}
                </p>
              ) : (
                <p className="text-sm text-gray-500">No summary on this scorecard.</p>
              )}
              {Array.isArray(scorecard.topProblems) && scorecard.topProblems.length ? (
                <ul className="space-y-1.5">
                  {scorecard.topProblems.slice(0, 8).map((p, i) => (
                    <li
                      key={`${p.title}-${i}`}
                      className="rounded-lg border border-gray-100 bg-white px-3 py-2 text-sm text-gray-800"
                    >
                      <span className="font-semibold">{p.title}</span>
                      {p.fix ? (
                        <span className="block text-xs text-gray-600 mt-0.5">{p.fix}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-gray-500 leading-relaxed">
              {live
                ? "Scorecard updates as Auditor and AI-Search Spy finish…"
                : "No scorecard stored on this run."}
            </p>
          )}

          {artifacts.length ? (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                Artifacts from this run ({artifacts.length})
              </p>
              <ul className="space-y-1.5 max-h-48 overflow-auto">
                {artifacts.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-lg border border-gray-100 bg-white px-3 py-2 text-xs text-gray-800"
                  >
                    <span className="font-semibold text-gray-900">{a.kind}</span>
                    {a.title ? <span className="text-gray-600"> · {a.title}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="text-[11px] text-gray-500 leading-relaxed">
            {live
              ? "Finished artifacts also land in Scorecard, Fixes, Gaps, Blog seeds, and Pitches."
              : "Expand any stage for the full JSON the agent returned. Latest site-wide tabs may show newer runs."}
          </p>
        </div>
      </div>
    </div>
  );
}
