"use client";

/**
 * RunNotifications — everything that happened during a run, in order.
 *
 * The pipeline rail answers "where are we"; this answers "what has happened".
 * It's derived entirely from the run record the studios already poll, so there
 * is no second source of truth to keep in sync — every agent start, finish,
 * warning, failure, cost and the moment the draft landed, on one timeline.
 */

import { useMemo, useRef } from "react";
import { AlertTriangle, Ban, Check, FileText, Play, Radio, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCost, formatDuration, normalizeStatus } from "./runFormat";

const KIND = {
  queued: { icon: Radio, tone: "text-[var(--cw-caution)]", ring: "border-[color-mix(in_srgb,var(--cw-caution)_40%,transparent)]" },
  running: { icon: Play, tone: "text-[var(--cw-neon)]", ring: "border-[color-mix(in_srgb,var(--cw-neon)_45%,transparent)]" },
  succeeded: { icon: Check, tone: "text-[var(--cw-neon-soft)]", ring: "border-[color-mix(in_srgb,var(--cw-neon)_30%,transparent)]" },
  warning: { icon: TriangleAlert, tone: "text-[var(--cw-caution)]", ring: "border-[color-mix(in_srgb,var(--cw-caution)_40%,transparent)]" },
  failed: { icon: AlertTriangle, tone: "text-[var(--cw-danger)]", ring: "border-[color-mix(in_srgb,var(--cw-danger)_45%,transparent)]" },
  cancelled: { icon: Ban, tone: "text-[var(--cw-ink-faint)]", ring: "border-[var(--cw-hairline-strong)]" },
  draft: { icon: FileText, tone: "text-[var(--cw-info)]", ring: "border-[color-mix(in_srgb,var(--cw-info)_40%,transparent)]" },
};

function clock(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}

function agentName(stage) {
  return stage?.title || stage?.role || stage?.agentId || stage?.agent || "Agent";
}

function spanMs(from, to) {
  if (!from || !to) return null;
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return b - a;
}

export function buildRunEvents(run) {
  if (!run) return [];
  const events = [];
  const stages = Array.isArray(run.stagesJson) ? run.stagesJson : [];

  if (run.createdAt) {
    events.push({ at: run.createdAt, kind: "queued", title: "Run queued", detail: run.trigger ? `trigger · ${run.trigger}` : "" });
  }
  if (run.startedAt) {
    events.push({ at: run.startedAt, kind: "running", title: "Run started" });
  }

  stages.forEach((stage, i) => {
    const name = agentName(stage);
    const status = normalizeStatus(stage?.status);
    const model = [stage?.provider, stage?.model].filter(Boolean).join(" · ");

    if (stage?.startedAt) {
      events.push({ at: stage.startedAt, kind: "running", title: `${name} started`, detail: model, key: `s${i}` });
    }

    if (stage?.warning) {
      events.push({
        at: stage.finishedAt || stage.startedAt,
        kind: "warning",
        title: `${name} warning`,
        detail: String(stage.warning),
        key: `w${i}`,
      });
    }

    if (status === "failed" || stage?.error) {
      events.push({
        at: stage?.finishedAt || stage?.startedAt,
        kind: "failed",
        title: `${name} failed`,
        detail: stage?.error ? String(stage.error) : "",
        key: `f${i}`,
      });
    } else if (stage?.finishedAt) {
      const took = formatDuration(spanMs(stage.startedAt, stage.finishedAt));
      const cost = stage.costUsd != null ? formatCost(stage.costUsd) : null;
      const meta = [took, cost].filter(Boolean).join(" · ");
      events.push({
        at: stage.finishedAt,
        kind: "succeeded",
        title: `${name} finished`,
        detail: [meta, stage.preview ? String(stage.preview).slice(0, 180) : ""].filter(Boolean).join(" — "),
        key: `d${i}`,
      });
    }
  });

  const draft = run.draftPreviewJson;
  if (draft && (draft.title || draft.caption || draft.html)) {
    events.push({
      at: run.finishedAt || run.startedAt,
      kind: "draft",
      title: "Draft ready",
      detail: draft.title || String(draft.caption || "").slice(0, 120),
    });
  }

  if (run.finishedAt) {
    const status = normalizeStatus(run.status);
    events.push({
      at: run.finishedAt,
      kind: status === "succeeded" ? "succeeded" : status === "cancelled" ? "cancelled" : "failed",
      title:
        status === "succeeded"
          ? "Run finished"
          : status === "cancelled"
            ? "Run cancelled"
            : "Run failed",
      detail: run.errorMessage ? String(run.errorMessage) : formatCost(run.totalCostUsd),
    });
  }

  return events
    .filter((e) => e.at)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

export default function RunNotifications({ run, className = "" }) {
  const events = useMemo(() => buildRunEvents(run), [run]);
  const endRef = useRef(null);

  if (!run) return null;

  if (!events.length) {
    return (
      <p className={cn("px-4 py-8 text-center text-[13px] text-[var(--cw-ink-muted)]", className)}>
        Nothing has happened yet — the first agent is starting up.
      </p>
    );
  }

  return (
    <ol className={cn("relative space-y-0 px-1", className)}>
      {events.map((event, i) => {
        const meta = KIND[event.kind] || KIND.running;
        const Icon = meta.icon;
        const last = i === events.length - 1;
        return (
          <li key={event.key ? `${event.key}-${i}` : `${event.at}-${i}`} className="flex gap-3">
            {/* Rail: marker + connector down to the next event */}
            <div className="flex shrink-0 flex-col items-center">
              <span
                className={cn(
                  "mt-1.5 inline-flex size-6 items-center justify-center rounded-full border bg-[var(--cw-surface)]",
                  meta.ring,
                  meta.tone
                )}
              >
                <Icon className="size-3" aria-hidden />
              </span>
              {!last ? <span className="w-px flex-1 bg-[var(--cw-hairline)]" aria-hidden /> : null}
            </div>

            <div className={cn("min-w-0 flex-1", last ? "pb-1" : "pb-4")}>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <p className={cn("text-[13px] font-semibold", meta.tone)}>{event.title}</p>
                <span className="font-mono text-[10px] tabular-nums text-[var(--cw-ink-faint)]">
                  {clock(event.at)}
                </span>
              </div>
              {event.detail ? (
                <p className="mt-0.5 text-[12px] leading-relaxed break-words whitespace-pre-wrap text-[var(--cw-ink-muted)]">
                  {event.detail}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
      <li ref={endRef} aria-hidden />
    </ol>
  );
}
