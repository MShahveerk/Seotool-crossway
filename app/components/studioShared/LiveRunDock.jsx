"use client";

/**
 * LiveRunDock — a run in flight, docked at the top of a studio.
 *
 * Collapsed by default: one sticky line naming the agent that's actually
 * working, so it never costs you screen space you'd rather spend on the tab
 * you're using. Hit maximise and the full cockpit opens in place.
 *
 * It sticks to the top of the scroll container so the run stays reachable no
 * matter how far down a settings tab you are.
 */

import { useMemo, useState } from "react";
import { ArrowUpRight, Ban, Bell, ChevronDown, Maximize2, Minimize2, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlowDot } from "../ui-shared/Status";
import Btn from "../ui-shared/Btn";
import TabRail from "../ui-shared/TabRail";
import { LiveClock } from "./AgentPipeline";
import RunNotifications, { buildRunEvents } from "./RunNotifications";
import { isLiveStatus, normalizeStatus } from "./runFormat";

export default function LiveRunDock({
  run,
  label = "Run",
  children,
  onCancel,
  onOpen,
  openLabel = "Open",
  cancelling = false,
  defaultExpanded = false,
  className = "",
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [view, setView] = useState("pipeline");

  const eventCount = useMemo(() => buildRunEvents(run).length, [run]);

  if (!run || !isLiveStatus(run.status)) return null;

  const stages = Array.isArray(run.stagesJson) ? run.stagesJson : [];
  const current = stages.find((s) => ["running", "waiting"].includes(normalizeStatus(s?.status)));
  const done = stages.filter((s) => normalizeStatus(s?.status) === "succeeded").length;
  const total = Math.max(stages.length, done + (current ? 1 : 0));
  const pct = total ? Math.round(((done + (current ? 0.5 : 0)) / total) * 100) : 6;

  const queued = normalizeStatus(run.status) === "queued";
  const waiting = normalizeStatus(run.status) === "waiting";

  const agentName =
    current?.title ||
    current?.role ||
    current?.agentId ||
    current?.agent ||
    (waiting
      ? "waiting on headings review"
      : done
        ? "wrapping up"
        : queued
          ? "waiting for a slot"
          : "starting up");

  return (
    <div
      className={cn(
        "sticky top-14 z-30 -mx-1 mb-4 overflow-hidden rounded-2xl px-1",
        "border border-[color-mix(in_srgb,var(--cw-neon)_34%,transparent)]",
        "bg-[color-mix(in_srgb,var(--cw-neon)_7%,var(--cw-surface))]",
        "shadow-[var(--cw-shadow-lg)] backdrop-blur-md",
        className
      )}
    >
      {/* Collapsed line — always present, even when expanded, as the handle. */}
      <div className="relative flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          <GlowDot status={waiting ? "waiting" : queued ? "queued" : "running"} />
          <span className="text-[13px] font-semibold text-[var(--cw-ink)]">
            {label} {waiting ? "waiting" : queued ? "queued" : "running"}
          </span>
          <span
            className={cn(
              "truncate text-[13px]",
              queued ? "text-[var(--cw-caution)]" : "text-[var(--cw-neon)]"
            )}
          >
            · {agentName}
          </span>
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-[var(--cw-ink-faint)] transition-transform duration-200",
              expanded && "rotate-180"
            )}
            aria-hidden
          />
        </button>

        <span className="flex items-center gap-2 font-mono text-[11px] tabular-nums text-[var(--cw-ink-muted)]">
          {total ? (
            <span>
              {done}/{total}
            </span>
          ) : null}
          <LiveClock startedAt={run.startedAt || run.createdAt} live />
        </span>

        <span className="flex items-center gap-1.5">
          {onCancel ? (
            <Btn variant="ghost" size="xs" icon={Ban} onClick={onCancel} disabled={cancelling}>
              {cancelling ? "Cancelling…" : "Cancel"}
            </Btn>
          ) : null}
          {onOpen ? (
            <Btn variant="outline" size="xs" iconRight={ArrowUpRight} onClick={onOpen}>
              {openLabel}
            </Btn>
          ) : null}
          <Btn
            variant={onOpen ? "ghost" : "outline"}
            size="xs"
            icon={expanded ? Minimize2 : Maximize2}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Minimise" : "Peek"}
          </Btn>
        </span>

        {/* Progress along the bottom edge of the collapsed bar. */}
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--cw-hairline)]">
          <span
            className="cw-flow block h-full transition-[width] duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
        </span>
      </div>

      {expanded ? (
        <div className="animate-soft-rise border-t border-[var(--cw-hairline)] bg-[var(--cw-canvas)]">
          <div className="flex items-center gap-2 px-3 pt-3">
            <TabRail
              size="sm"
              tabs={[
                { id: "pipeline", label: "Pipeline", icon: Workflow },
                { id: "activity", label: "Activity", icon: Bell, badge: eventCount || undefined },
              ]}
              value={view}
              onChange={setView}
              ariaLabel="Run views"
            />
          </div>
          <div className="max-h-[70vh] overflow-auto p-3">
            {view === "activity" ? <RunNotifications run={run} /> : children}
          </div>
        </div>
      ) : null}
    </div>
  );
}
