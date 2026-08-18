"use client";

/**
 * RunLibrary — the studio's run history as a master/detail workspace.
 *
 * What it replaces: a grid of run cards with the cockpit floating above them.
 * Clicking a card looked like it did nothing (the cockpit was off-screen, and
 * while anything was live it was hidden altogether), and there was no way to
 * tell which card you had opened or to close it again.
 *
 * Here the list and the cockpit sit side by side. Selection is explicit — neon
 * rail, lit surface, aria-current — the detail column always answers a click
 * with a skeleton, an error or the cockpit, and a live run keeps streaming its
 * progress in the list whether or not it is the run you're reading.
 *
 * Below xl the two columns become one: the list steps aside for the detail and
 * a Back control brings it back.
 */

import { useMemo, useState } from "react";
import { ArrowLeft, Ban, ListOrdered, PenLine, RefreshCw, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import Btn from "../ui-shared/Btn";
import TabRail from "../ui-shared/TabRail";
import { Panel } from "../ui-shared/Panel";
import { GlowDot, StatusPill } from "../ui-shared/Status";
import { formatCost, formatWhen, isLiveStatus, normalizeStatus } from "../studioShared/runFormat";
import RunConsole, { BLOG_PIPELINE, resolveImageSrc } from "./RunConsole";

/** Agents that always run, so a live card can say "3 of 4" before it finishes. */
const REQUIRED_STEPS = BLOG_PIPELINE.filter((s) => !s.optional).length;

const FILTERS = [
  { id: "all", label: "All", match: () => true },
  { id: "live", label: "Live", match: (s) => s === "running" || s === "queued" },
  { id: "succeeded", label: "Done", match: (s) => s === "succeeded" },
  { id: "failed", label: "Failed", match: (s) => s === "failed" || s === "cancelled" },
];

/** "2m ago" reads better than a timestamp in a list you scan. */
function relativeWhen(iso) {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diff = Date.now() - then;
  if (diff < 45_000) return "just now";
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatWhen(iso);
}

function runTitle(run) {
  return run?.topic || run?.draftPreviewJson?.title || "Untitled topic";
}

/* ── one row in the list ────────────────────────────────────────────────── */
function RunRow({ run, selected, onSelect, onCancel, cancelling }) {
  const status = normalizeStatus(run.status);
  const live = isLiveStatus(run.status);
  const summary = run.stageSummary || null;

  const total = REQUIRED_STEPS + (summary?.hasInterpreter ? 1 : 0);
  const done = Math.min(summary?.done ?? 0, total);
  const pct = total ? Math.round((done / total) * 100) : 0;

  const thumb = resolveImageSrc(run.draftPreviewJson?.featuredImagePath);
  const title = runTitle(run);

  return (
    <li className="flex items-stretch gap-1">
      <button
        type="button"
        onClick={() => onSelect(run.id)}
        aria-current={selected ? "true" : undefined}
        title={`${title} · ${formatWhen(run.createdAt)}`}
        className={cn(
          "group relative flex min-w-0 flex-1 gap-3 overflow-hidden rounded-xl border px-3 py-2.5 text-left",
          "transition-smooth focus-visible:outline-none",
          selected
            ? "border-[color-mix(in_srgb,var(--cw-neon)_45%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-neon)_8%,var(--cw-surface))]"
            : "border-[var(--cw-hairline)] bg-[var(--cw-raised)] hover:border-[color-mix(in_srgb,var(--cw-neon)_28%,var(--cw-hairline))] hover:bg-[var(--cw-overlay)]"
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-0 left-0 w-0.5 transition-smooth",
            selected ? "bg-[var(--cw-neon)] shadow-[0_0_10px_rgb(14_255_42_/_0.6)]" : "bg-transparent"
          )}
        />

        {thumb ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={thumb}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="size-11 shrink-0 rounded-lg border border-[var(--cw-hairline)] object-cover"
          />
        ) : (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-canvas)] text-[var(--cw-ink-faint)]">
            <PenLine className="size-4" aria-hidden />
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <GlowDot status={status} size={6} />
            <span className="truncate text-[13px] font-semibold text-[var(--cw-ink)]">{title}</span>
          </span>

          <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--cw-ink-muted)]">
            <span>{relativeWhen(run.createdAt)}</span>
            <span aria-hidden>·</span>
            <span className="font-mono tabular-nums">{formatCost(run.totalCostUsd)}</span>
            {run.trigger ? (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">{run.trigger}</span>
              </>
            ) : null}
          </span>

          {live ? (
            <span className="mt-1.5 block">
              <span className="flex items-center justify-between gap-2 text-[10px] font-bold tracking-[0.1em] uppercase">
                <span className="truncate text-[var(--cw-neon)]">
                  {summary?.current
                    ? `${summary.current} working…`
                    : status === "queued"
                      ? "Queued"
                      : "Starting…"}
                </span>
                <span className="font-mono tabular-nums text-[var(--cw-ink-muted)]">
                  {done}/{total}
                </span>
              </span>
              <span className="mt-1 block h-0.5 overflow-hidden rounded-full bg-[var(--cw-hairline)]">
                <span
                  className="cw-flow block h-full transition-[width] duration-700 ease-out"
                  style={{ width: `${Math.max(pct, 6)}%` }}
                />
              </span>
            </span>
          ) : status === "failed" && run.errorMessage ? (
            <span className="mt-1 line-clamp-2 block text-[11px] leading-relaxed text-[var(--cw-danger)]">
              {run.errorMessage}
            </span>
          ) : null}
        </span>
      </button>

      {/* A sibling, never nested inside the row button. */}
      {live && onCancel ? (
        <button
          type="button"
          onClick={() => onCancel(run.id)}
          disabled={cancelling}
          title="Cancel this run"
          aria-label={`Cancel run: ${title}`}
          className={cn(
            "flex shrink-0 items-center rounded-xl border px-2 transition-smooth",
            "border-[color-mix(in_srgb,var(--cw-danger)_35%,var(--cw-hairline))]",
            "bg-[color-mix(in_srgb,var(--cw-danger)_8%,var(--cw-surface))] text-[var(--cw-danger)]",
            "hover:bg-[color-mix(in_srgb,var(--cw-danger)_18%,var(--cw-surface))]",
            "disabled:pointer-events-none disabled:opacity-45"
          )}
        >
          <Ban className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </li>
  );
}

/* ── the detail column, before the run arrives ──────────────────────────── */
function DetailSkeleton({ row }) {
  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--cw-hairline)] px-5 py-3.5">
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-[0.14em] text-[var(--cw-ink-faint)] uppercase">
            Opening run
          </p>
          <p className="font-heading mt-0.5 truncate text-[15px] font-semibold text-[var(--cw-ink)]">
            {row ? runTitle(row) : "Loading…"}
          </p>
        </div>
        {row ? <StatusPill status={normalizeStatus(row.status)} /> : null}
      </div>
      <div className="space-y-3 px-5 py-5" aria-hidden>
        <div className="flex gap-2">
          {Array.from({ length: REQUIRED_STEPS }).map((_, i) => (
            <div
              key={i}
              className="h-16 flex-1 animate-pulse rounded-2xl border border-dashed border-[var(--cw-hairline-strong)] bg-[var(--cw-raised)]"
            />
          ))}
        </div>
        <div className="h-3 w-1/3 animate-pulse rounded-full bg-[var(--cw-hairline)]" />
        <div className="h-3 w-2/3 animate-pulse rounded-full bg-[var(--cw-hairline)]" />
      </div>
    </Panel>
  );
}

/* ── the library ────────────────────────────────────────────────────────── */
export default function RunLibrary({
  runs = [],
  selectedRunId = "",
  selectedRun = null,
  detailLoading = false,
  detailError = "",
  liveRunId = "",
  refreshing = false,
  cancelling = false,
  onSelect,
  onClose,
  onRefresh,
  onRetryDetail,
  onCancel,
  onGoCompose,
}) {
  const [filter, setFilter] = useState("all");

  const counts = useMemo(() => {
    const out = {};
    for (const f of FILTERS) out[f.id] = 0;
    for (const run of runs) {
      const status = normalizeStatus(run.status);
      for (const f of FILTERS) if (f.match(status)) out[f.id] += 1;
    }
    return out;
  }, [runs]);

  const active = FILTERS.find((f) => f.id === filter) || FILTERS[0];
  const visible = useMemo(
    () => runs.filter((run) => active.match(normalizeStatus(run.status))),
    [runs, active]
  );

  const selectedRow = useMemo(
    () => runs.find((r) => r.id === selectedRunId) || null,
    [runs, selectedRunId]
  );

  const showDetail = Boolean(selectedRunId);

  const filterTabs = FILTERS.map((f) => ({
    id: f.id,
    label: f.label,
    badge: counts[f.id] || undefined,
    live: f.id === "live" && counts.live > 0,
  }));

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
      {/* ── master ── */}
      <div className={cn("min-w-0 space-y-3", showDetail && "hidden xl:block")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabRail
            size="sm"
            tabs={filterTabs}
            value={filter}
            onChange={setFilter}
            ariaLabel="Filter runs"
            className="min-w-0"
          />
          <Btn variant="ghost" size="xs" icon={RefreshCw} onClick={onRefresh} loading={refreshing}>
            Refresh
          </Btn>
        </div>

        {visible.length ? (
          <ul className="space-y-1.5 xl:max-h-[calc(100vh-16rem)] xl:overflow-y-auto xl:pr-1">
            {visible.map((run) => (
              <RunRow
                key={run.id}
                run={run}
                selected={run.id === selectedRunId}
                onSelect={onSelect}
                onCancel={onCancel}
                cancelling={cancelling}
              />
            ))}
          </ul>
        ) : runs.length ? (
          <Panel className="px-5 py-10 text-center">
            <ListOrdered
              className="mx-auto size-6 text-[var(--cw-ink-faint)]"
              strokeWidth={1.6}
              aria-hidden
            />
            <p className="font-heading mt-2.5 text-sm font-semibold text-[var(--cw-ink)]">
              No {active.label.toLowerCase()} runs
            </p>
            <Btn variant="ghost" size="sm" className="mt-3" onClick={() => setFilter("all")}>
              Show all {counts.all}
            </Btn>
          </Panel>
        ) : (
          <Panel className="px-5 py-12 text-center">
            <PenLine
              className="mx-auto size-7 text-[var(--cw-ink-faint)]"
              strokeWidth={1.6}
              aria-hidden
            />
            <p className="font-heading mt-3 text-sm font-semibold text-[var(--cw-ink)]">
              No runs yet
            </p>
            <p className="mx-auto mt-1.5 max-w-xs text-[13px] leading-relaxed text-[var(--cw-ink-muted)]">
              Generate your first draft and it lands here — every agent, its cost and the finished
              article, kept for as long as you need it.
            </p>
            {onGoCompose ? (
              <Btn variant="primary" size="sm" className="mt-4" onClick={onGoCompose}>
                Go to Compose
              </Btn>
            ) : null}
          </Panel>
        )}
      </div>

      {/* ── detail ── */}
      <div className={cn("min-w-0", !showDetail && "hidden xl:block")}>
        {showDetail ? (
          <div className="mb-2 flex items-center justify-between gap-2">
            <Btn variant="ghost" size="xs" icon={ArrowLeft} onClick={onClose} className="xl:hidden">
              All runs
            </Btn>
            <p className="hidden min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--cw-ink-faint)] xl:block">
              {selectedRunId}
            </p>
            <Btn variant="ghost" size="xs" icon={X} onClick={onClose}>
              Close
            </Btn>
          </div>
        ) : null}

        {detailError ? (
          <Panel className="px-6 py-12 text-center">
            <p className="font-heading text-sm font-semibold text-[var(--cw-danger)]">
              Couldn&apos;t open that run
            </p>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-[var(--cw-ink-muted)]">
              {detailError}
            </p>
            {onRetryDetail ? (
              <Btn variant="outline" size="sm" icon={RotateCcw} className="mt-4" onClick={onRetryDetail}>
                Try again
              </Btn>
            ) : null}
          </Panel>
        ) : selectedRun ? (
          <div key={selectedRun.id} className="animate-soft-rise">
            <RunConsole
              run={selectedRun}
              onCancel={onCancel ? () => onCancel(selectedRun.id) : undefined}
              cancelling={cancelling}
            />
          </div>
        ) : detailLoading || showDetail ? (
          <DetailSkeleton row={selectedRow} />
        ) : (
          <Panel className="px-6 py-16 text-center">
            <ListOrdered
              className="mx-auto size-8 text-[var(--cw-ink-faint)]"
              strokeWidth={1.6}
              aria-hidden
            />
            <p className="font-heading mt-3 text-sm font-semibold text-[var(--cw-ink)]">
              Pick a run to open its cockpit
            </p>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-[var(--cw-ink-muted)]">
              Every agent in the chain, its full output, what it cost and the finished draft — all in
              this pane, without leaving the list.
            </p>
            {liveRunId ? (
              <Btn
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => onSelect?.(liveRunId)}
              >
                Open the live run
              </Btn>
            ) : null}
          </Panel>
        )}
      </div>
    </div>
  );
}
