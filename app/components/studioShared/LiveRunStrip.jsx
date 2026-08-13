"use client";

/**
 * LiveRunStrip — a run in flight, said in one line.
 *
 * Shown on every tab *except* the run console itself, so you always know work is
 * happening and which agent is doing it, without a whole console following you
 * around the app.
 */

import { Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlowDot } from "../ui-shared/Status";
import Btn from "../ui-shared/Btn";
import { LiveClock } from "./AgentPipeline";
import { normalizeStatus } from "./runFormat";

export default function LiveRunStrip({
  run,
  label = "Autopilot",
  agentKey = "agentId",
  onExpand,
  onOpenConsole,
  onCancel,
  cancelling = false,
  className = "",
}) {
  if (!run) return null;

  const stages = Array.isArray(run.stagesJson) ? run.stagesJson : [];
  const current = stages.find((s) => normalizeStatus(s?.status) === "running");
  const done = stages.filter((s) => normalizeStatus(s?.status) === "succeeded").length;
  const total = Math.max(stages.length, done + (current ? 1 : 0));
  const pct = total ? Math.round(((done + (current ? 0.5 : 0)) / total) * 100) : 8;

  const startedAt = run.startedAt || run.createdAt;
  const agentName =
    current?.title || current?.role || current?.[agentKey] || (done ? "wrapping up" : "starting up");

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--cw-neon)_32%,transparent)]",
        "bg-[color-mix(in_srgb,var(--cw-neon)_6%,var(--cw-surface))] px-4 py-2.5",
        className
      )}
    >
      {/* Progress fill along the bottom edge */}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--cw-hairline)]"
      >
        <span
          className="cw-flow block h-full transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </span>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex min-w-0 items-center gap-2">
          <GlowDot status="running" />
          <span className="text-[13px] font-semibold text-[var(--cw-ink)]">
            {label} running
          </span>
          <span className="truncate text-[13px] text-[var(--cw-neon)]">· {agentName}</span>
        </span>

        <span className="flex items-center gap-2 font-mono text-[11px] tabular-nums text-[var(--cw-ink-muted)]">
          {total ? (
            <span>
              {done}/{total}
            </span>
          ) : null}
          <LiveClock startedAt={startedAt} live />
        </span>

        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {onCancel ? (
            <Btn variant="ghost" size="xs" icon={Ban} onClick={onCancel} disabled={cancelling}>
              {cancelling ? "Cancelling…" : "Cancel"}
            </Btn>
          ) : null}
          {onExpand ? (
            <Btn variant="ghost" size="xs" onClick={onExpand}>
              Expand here
            </Btn>
          ) : null}
          {onOpenConsole ? (
            <Btn variant="outline" size="xs" onClick={onOpenConsole}>
              Run console →
            </Btn>
          ) : null}
        </span>
      </div>
    </div>
  );
}
