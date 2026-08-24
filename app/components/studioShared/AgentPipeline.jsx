"use client";

/**
 * AgentPipeline — the run cockpit shared by SEO Autopilot, Blog Automation
 * Studio and Post Automation Studio.
 *
 * The idea it replaces: a scrolling list of stage cards where the only way to
 * read agent 2's output was to scroll past agent 3's.
 *
 * The idea it implements:
 *   1. A chain of agent chips across the top. The agent currently working glows
 *      neon and breathes; finished agents are solid and ticked; agents that
 *      haven't started are dashed grey. The whole chain is visible from the
 *      first frame, so you always know what is coming.
 *   2. Selection is independent of execution. Click any chip — including a
 *      finished one while a later agent is still running — and its full output
 *      opens in the pane below. The rail keeps glowing where the work is.
 *   3. Selection auto-follows the live agent until you click something, at
 *      which point a "Follow live" control appears. You are never yanked away
 *      from what you were reading.
 *   4. When the draft exists it renders as an actual article — title, hero,
 *      typeset body — not a JSON blob, even while later agents are still going.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Ban,
  Check,
  ChevronDown,
  CircleSlash,
  Clock,
  Coins,
  FileText,
  Radio,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Panel } from "../ui-shared/Panel";
import Btn from "../ui-shared/Btn";
import { GlowDot, StatusPill } from "../ui-shared/Status";
import { formatCost, formatDuration, formatWhen, isLiveStatus, normalizeStatus } from "./runFormat";

/**
 * Elapsed-time readout.
 *
 * The ticking text is written straight to the DOM node rather than held in
 * state: a run console can have a dozen live sub-trees, and none of them should
 * re-render once a second just to move a clock.
 */
export function LiveClock({ startedAt, live, className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const started = startedAt ? new Date(startedAt).getTime() : NaN;
    if (!Number.isFinite(started)) {
      node.textContent = "";
      return undefined;
    }
    const paint = () => {
      node.textContent = formatDuration(Math.max(0, Date.now() - started)) || "";
    };
    paint();
    if (!live) return undefined;
    const id = setInterval(paint, 1000);
    return () => clearInterval(id);
  }, [startedAt, live]);

  return <span ref={ref} className={className} />;
}

/* ── one chip in the chain ──────────────────────────────────────────────── */
function AgentChip({ step, index, selected, onSelect, isLast }) {
  const status = normalizeStatus(step.status);
  const running = status === "running" || status === "queued";
  const waiting = status === "waiting";
  const done = status === "succeeded";
  const failed = status === "failed";
  const cancelled = status === "cancelled";

  return (
    <li className="flex min-w-0 flex-1 items-start">
      <button
        type="button"
        onClick={() => onSelect(step.id)}
        aria-pressed={selected}
        title={`${step.title}${step.subtitle ? ` — ${step.subtitle}` : ""}`}
        className={cn(
          "group relative flex min-w-[104px] flex-1 flex-col items-center gap-2 rounded-2xl px-2 py-3",
          "transition-smooth focus-visible:outline-none",
          selected ? "bg-[var(--cw-raised)]" : "hover:bg-[var(--cw-raised)]/60"
        )}
      >
        {/* Badge */}
        <span
          className={cn(
            "relative flex size-10 shrink-0 items-center justify-center rounded-xl border transition-smooth",
            running &&
              "cw-live border-[var(--cw-neon)] text-[var(--cw-neon)]",
            waiting &&
              "border-[color-mix(in_srgb,var(--cw-caution)_50%,transparent)] bg-[color-mix(in_srgb,var(--cw-caution)_12%,var(--cw-surface))] text-[var(--cw-caution)]",
            done &&
              "border-[color-mix(in_srgb,var(--cw-neon)_50%,transparent)] bg-[color-mix(in_srgb,var(--cw-neon)_10%,var(--cw-surface))] text-[var(--cw-neon)]",
            failed &&
              "border-[color-mix(in_srgb,var(--cw-danger)_50%,transparent)] bg-[color-mix(in_srgb,var(--cw-danger)_10%,var(--cw-surface))] text-[var(--cw-danger)]",
            cancelled && "border-[var(--cw-hairline-strong)] bg-[var(--cw-raised)] text-[var(--cw-ink-faint)]",
            !running && !waiting && !done && !failed && !cancelled &&
              "border-dashed border-[var(--cw-hairline-strong)] bg-[var(--cw-surface)] text-[var(--cw-ink-faint)]"
          )}
        >
          {running ? (
            <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : waiting ? (
            <Clock className="size-4" aria-hidden />
          ) : done ? (
            <Check className="size-5" strokeWidth={2.6} aria-hidden />
          ) : failed ? (
            <AlertTriangle className="size-4" aria-hidden />
          ) : cancelled ? (
            <Ban className="size-4" aria-hidden />
          ) : (
            <span className="font-mono text-xs font-bold">{index + 1}</span>
          )}
        </span>

        {/* Name */}
        <span className="w-full min-w-0 text-center">
          <span
            className={cn(
              "block truncate text-[12px] font-bold transition-smooth",
              running
                ? "text-[var(--cw-neon)]"
                : waiting
                  ? "text-[var(--cw-caution)]"
                  : selected
                    ? "text-[var(--cw-ink)]"
                    : done
                      ? "text-[var(--cw-ink-dim)]"
                      : "text-[var(--cw-ink-faint)]"
            )}
          >
            {step.title}
          </span>
          <span className="mt-0.5 block truncate text-[10px] text-[var(--cw-ink-faint)]">
            {running
              ? "working…"
              : waiting
                ? "awaiting review"
                : done
                ? formatDuration(step.durationMs) || "done"
                : failed
                  ? "failed"
                  : cancelled
                    ? "cancelled"
                    : step.subtitle || "waiting"}
          </span>
        </span>

        {/* Selection underline */}
        <span
          aria-hidden
          className={cn(
            "absolute inset-x-4 bottom-0 h-0.5 rounded-full transition-smooth",
            selected
              ? "bg-[var(--cw-neon)] opacity-100 shadow-[0_0_10px_rgb(0_163_255_/_0.7)]"
              : "opacity-0"
          )}
        />
      </button>

      {/* Connector */}
      {!isLast ? (
        <span aria-hidden className="mt-[30px] h-0.5 w-4 shrink-0 sm:w-6">
          <span
            className={cn(
              "block h-full w-full rounded-full",
              done
                ? "bg-[color-mix(in_srgb,var(--cw-neon)_55%,transparent)]"
                : running
                  ? "cw-flow"
                  : "bg-[var(--cw-hairline)]"
            )}
          />
        </span>
      ) : null}
    </li>
  );
}

/* ── the finished article ───────────────────────────────────────────────── */
function DraftCard({ draft }) {
  if (!draft?.title && !draft?.html && !draft?.imageUrl && !draft?.mediaNode && !draft?.body)
    return null;

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--cw-hairline)] px-5 py-3">
        <p className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[0.14em] text-[var(--cw-ink-faint)] uppercase">
          <Sparkles className="size-3.5 text-[var(--cw-neon)]" aria-hidden />
          Draft
        </p>
        {draft.href ? (
          <Btn as="a" href={draft.href} variant="ghost" size="xs" iconRight={ArrowUpRight}>
            {draft.hrefLabel || "Open"}
          </Btn>
        ) : null}
      </div>

      <article className="animate-soft-rise px-5 py-5">
        {draft.mediaNode ? (
          <div
            className={cn(
              "mb-5 overflow-hidden rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-canvas)]",
              draft.mediaAspect || "max-w-md"
            )}
          >
            {draft.mediaNode}
          </div>
        ) : draft.imageUrl ? (
          <div className="mb-5 overflow-hidden rounded-xl border border-[var(--cw-hairline)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={draft.imageUrl}
              alt=""
              className="max-h-64 w-full object-cover"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={(e) => {
                const el = e.currentTarget;
                if (el.dataset.retried === "1") return;
                el.dataset.retried = "1";
                const base = String(el.src || "").split("?")[0];
                if (base) el.src = `${base}?_cb=${Date.now()}`;
              }}
            />
          </div>
        ) : null}

        {draft.title ? (
          <h2 className="font-heading text-2xl leading-tight font-semibold text-balance text-[var(--cw-ink)]">
            {draft.title}
          </h2>
        ) : null}

        {draft.excerpt ? (
          <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-[var(--cw-ink-dim)]">
            {draft.excerpt}
          </p>
        ) : null}

        {draft.slug || draft.seoTitle || draft.meta ? (
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {draft.slug ? (
              <span className="rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-2 py-1 font-mono text-[11px] text-[var(--cw-ink-muted)]">
                /{String(draft.slug).replace(/^\//, "")}
              </span>
            ) : null}
            {draft.seoTitle ? (
              <span className="rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-2 py-1 text-[11px] text-[var(--cw-ink-muted)]">
                SEO · {draft.seoTitle}
              </span>
            ) : null}
            {draft.meta}
          </div>
        ) : null}

        {draft.html ? (
          <div
            className={cn(
              "mt-5 max-h-[32rem] overflow-auto rounded-xl border border-[var(--cw-hairline)]",
              "bg-[var(--cw-canvas)] px-5 py-4",
              // Reading column, dark-tuned
              "prose prose-sm prose-invert max-w-none",
              "prose-headings:font-heading prose-headings:text-[var(--cw-ink)]",
              "prose-p:text-[var(--cw-ink-dim)] prose-li:text-[var(--cw-ink-dim)]",
              "prose-strong:text-[var(--cw-ink)]",
              "prose-a:text-[var(--cw-neon)] prose-a:no-underline hover:prose-a:underline",
              "prose-img:rounded-lg prose-hr:border-[var(--cw-hairline)]",
              "prose-blockquote:border-l-[var(--cw-neon)] prose-blockquote:text-[var(--cw-ink-muted)]"
            )}
            dangerouslySetInnerHTML={{ __html: draft.html }}
          />
        ) : null}

        {draft.body && !draft.html ? (
          <p className="mt-4 text-sm leading-relaxed whitespace-pre-wrap text-[var(--cw-ink-dim)]">
            {draft.body}
          </p>
        ) : null}
      </article>
    </Panel>
  );
}

/* ── the pane under the rail ────────────────────────────────────────────── */
/* Mounted with `key={step.id}`, so switching agents starts collapsed again. */
function StepDetail({ step, live }) {
  const [rawOpen, setRawOpen] = useState(false);
  const status = normalizeStatus(step?.status);
  const running = status === "running" || status === "queued";

  if (!step) return null;

  const hasBody = Boolean(step.body && step.body !== step.preview);

  return (
    <div className="animate-soft-rise px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-heading text-[15px] font-semibold text-[var(--cw-ink)]">
              {step.title}
            </h4>
            <StatusPill status={status} size="sm" />
          </div>
          {step.subtitle ? (
            <p className="mt-1 text-xs text-[var(--cw-ink-muted)]">{step.subtitle}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-[var(--cw-ink-faint)]">
          {step.provider || step.model ? (
            <span className="rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-2 py-1">
              {step.provider || "—"} · {step.model || "—"}
            </span>
          ) : null}
          {formatDuration(step.durationMs) ? (
            <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-2 py-1">
              <Clock className="size-3" aria-hidden />
              {formatDuration(step.durationMs)}
            </span>
          ) : null}
          {step.costUsd != null ? (
            <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-2 py-1">
              <Coins className="size-3" aria-hidden />
              {formatCost(step.costUsd)}
            </span>
          ) : null}
        </div>
      </div>

      {step.error ? (
        <pre className="mt-3 max-h-56 overflow-auto rounded-xl border border-[color-mix(in_srgb,var(--cw-danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--cw-danger)_8%,var(--cw-canvas))] p-3 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap text-[var(--cw-danger)]">
          {step.error}
        </pre>
      ) : null}

      {step.warning ? (
        <p className="mt-3 rounded-xl border border-[color-mix(in_srgb,var(--cw-caution)_32%,transparent)] bg-[color-mix(in_srgb,var(--cw-caution)_8%,transparent)] px-3 py-2 text-[11px] text-[var(--cw-caution)]">
          {step.warning}
        </p>
      ) : null}

      {step.preview ? (
        <p className="mt-3 text-[13px] leading-relaxed whitespace-pre-wrap text-[var(--cw-ink-dim)]">
          {step.preview}
        </p>
      ) : null}

      {step.extra ? <div className="mt-3">{step.extra}</div> : null}

      {!step.preview && !step.error && !step.body ? (
        <p className="mt-3 flex items-center gap-2 text-[13px] text-[var(--cw-ink-muted)]">
          {running ? (
            <>
              <GlowDot status="running" />
              This agent is working. Output appears here the moment it lands.
            </>
          ) : status === "pending" ? (
            <>
              <CircleSlash className="size-3.5 text-[var(--cw-ink-faint)]" aria-hidden />
              Hasn&apos;t run yet{live ? " — it's next in the chain." : "."}
            </>
          ) : (
            "No output recorded for this agent."
          )}
        </p>
      ) : null}

      {hasBody ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setRawOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--cw-neon)] transition-smooth hover:text-[var(--cw-neon-soft)]"
          >
            <ChevronDown
              className={cn("size-3.5 transition-transform duration-200", rawOpen && "rotate-180")}
              aria-hidden
            />
            {rawOpen ? "Hide raw output" : "Show raw output"}
          </button>
          {rawOpen ? (
            <pre className="animate-soft-rise mt-2 max-h-[28rem] overflow-auto rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-canvas)] p-3.5 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap text-[var(--cw-ink-dim)]">
              {step.body}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ── the cockpit ────────────────────────────────────────────────────────── */
export default function AgentPipeline({
  run,
  steps = [],
  eyebrow = "Run",
  title,
  draft = null,
  onCancel,
  cancelling = false,
  aside = null,
  footer = null,
  emptyTitle = "No run yet",
  emptyHint = "Start a run to watch each agent work in sequence.",
  emptyIcon: EmptyIcon = Radio,
  className = "",
  showDraftSlot = true,
}) {
  // `pinnedId` is the only stored selection: null means "follow the live agent".
  // Everything else is derived during render, so the cockpit can never show a
  // selection that disagrees with the run it's displaying.
  const [pinnedId, setPinnedId] = useState(null);
  const [seenRunId, setSeenRunId] = useState(run?.id ?? null);

  // A brand new run drops the pin so the cockpit follows again.
  if ((run?.id ?? null) !== seenRunId) {
    setSeenRunId(run?.id ?? null);
    setPinnedId(null);
  }

  const runStatus = normalizeStatus(run?.status);
  const live = isLiveStatus(run?.status);

  const liveStep = useMemo(
    () => steps.find((s) => normalizeStatus(s.status) === "running") || null,
    [steps]
  );

  const lastMeaningful = useMemo(() => {
    const done = steps.filter((s) => normalizeStatus(s.status) !== "pending");
    return done[done.length - 1] || steps[0] || null;
  }, [steps]);

  const pinnedStep = pinnedId ? steps.find((s) => s.id === pinnedId) : null;
  const selected = pinnedStep || liveStep || lastMeaningful;
  const pinned = Boolean(pinnedStep);
  const followingLive = !pinned && Boolean(liveStep) && selected?.id === liveStep.id;

  const doneCount = steps.filter((s) => normalizeStatus(s.status) === "succeeded").length;

  if (!run) {
    return (
      <Panel className={cn("px-6 py-12 text-center", className)}>
        <EmptyIcon className="mx-auto size-8 text-[var(--cw-ink-faint)]" strokeWidth={1.6} aria-hidden />
        <p className="font-heading mt-3 text-sm font-semibold text-[var(--cw-ink)]">{emptyTitle}</p>
        <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-[var(--cw-ink-muted)]">
          {emptyHint}
        </p>
      </Panel>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <Panel className="overflow-hidden" glow={live}>
        {/* ── Run header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--cw-hairline)] px-5 py-3.5">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] text-[var(--cw-ink-faint)] uppercase">
              {live ? <GlowDot status="running" /> : null}
              {live ? "Live run" : eyebrow}
            </p>
            <p className="font-heading mt-0.5 truncate text-[15px] font-semibold text-[var(--cw-ink)]">
              {title || run.topic || run.trigger || "Untitled run"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={runStatus} />
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-2.5 py-1 font-mono text-[11px] tabular-nums text-[var(--cw-ink-dim)]">
              <Clock className="size-3" aria-hidden />
              <LiveClock startedAt={run.startedAt || run.createdAt} live={live} />
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-2.5 py-1 font-mono text-[11px] tabular-nums text-[var(--cw-ink-dim)]">
              <Coins className="size-3" aria-hidden />
              {formatCost(run.totalCostUsd)}
            </span>
            {steps.length ? (
              <span className="rounded-full border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-2.5 py-1 font-mono text-[11px] tabular-nums text-[var(--cw-ink-muted)]">
                {doneCount}/{steps.length}
              </span>
            ) : null}
            {live && onCancel ? (
              <Btn variant="danger" size="sm" icon={Ban} onClick={onCancel} disabled={cancelling}>
                {cancelling ? "Cancelling…" : "Cancel"}
              </Btn>
            ) : null}
          </div>
        </div>

        {/* ── The chain ── */}
        {steps.length ? (
          <div className="border-b border-[var(--cw-hairline)] bg-[var(--cw-canvas)]/40 px-3 py-2">
            <ol className="flex items-start overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {steps.map((step, i) => (
                <AgentChip
                  key={step.id}
                  step={step}
                  index={i}
                  selected={selected?.id === step.id}
                  isLast={i === steps.length - 1}
                  onSelect={(id) => setPinnedId(id)}
                />
              ))}
            </ol>
          </div>
        ) : (
          <div className="border-b border-[var(--cw-hairline)] px-5 py-6 text-center text-[13px] text-[var(--cw-ink-muted)]">
            {live ? "Starting agents…" : "No agent stages were recorded for this run."}
          </div>
        )}

        {/* ── Reading a finished agent while a later one runs ── */}
        {pinned && liveStep && selected?.id !== liveStep.id ? (
          <button
            type="button"
            onClick={() => setPinnedId(null)}
            className="flex w-full items-center justify-between gap-2 border-b border-[var(--cw-hairline)] bg-[color-mix(in_srgb,var(--cw-neon)_7%,transparent)] px-5 py-2 text-left transition-smooth hover:bg-[color-mix(in_srgb,var(--cw-neon)_12%,transparent)]"
          >
            <span className="flex items-center gap-2 text-[11px] font-semibold text-[var(--cw-neon)]">
              <GlowDot status="running" />
              {liveStep.title} is working while you read {selected?.title}
            </span>
            <span className="text-[11px] font-bold text-[var(--cw-neon)]">Follow live →</span>
          </button>
        ) : followingLive ? (
          <div className="border-b border-[var(--cw-hairline)] px-5 py-1.5 text-[10px] font-bold tracking-[0.12em] text-[var(--cw-ink-faint)] uppercase">
            Following the live agent · click any step to pin it
          </div>
        ) : null}

        {/* ── Detail ── */}
        <div className={cn(aside && "grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px]")}>
          <StepDetail key={selected?.id || "none"} step={selected} live={live} />
          {aside ? (
            <div className="border-t border-[var(--cw-hairline)] xl:border-t-0 xl:border-l">
              {aside}
            </div>
          ) : null}
        </div>

        {/* ── Run-level failure + timings ── */}
        {run.errorMessage ? (
          <div className="mx-5 mb-4 rounded-xl border border-[color-mix(in_srgb,var(--cw-danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--cw-danger)_8%,transparent)] px-4 py-3">
            <p className="text-[10px] font-bold tracking-[0.12em] text-[var(--cw-danger)] uppercase">
              Run failed
            </p>
            <pre className="mt-1.5 max-h-40 overflow-auto font-sans text-[13px] leading-relaxed break-words whitespace-pre-wrap text-[var(--cw-danger)]">
              {run.errorMessage}
            </pre>
          </div>
        ) : null}

        <div className="border-t border-[var(--cw-hairline)] px-5 py-2.5 font-mono text-[10px] text-[var(--cw-ink-faint)]">
          started {formatWhen(run.startedAt || run.createdAt)}
          {run.finishedAt ? ` · finished ${formatWhen(run.finishedAt)}` : ""}
          {run.id ? ` · ${run.id}` : ""}
        </div>
      </Panel>

      {/* ── The draft, rendered as an article ── */}
      {showDraftSlot && draft ? (
        <DraftCard draft={draft} />
      ) : showDraftSlot && live ? (
        <Panel className="flex items-center gap-3 px-5 py-4">
          <FileText className="size-4 shrink-0 text-[var(--cw-ink-faint)]" aria-hidden />
          <p className="text-[13px] text-[var(--cw-ink-muted)]">
            The draft appears here the moment the writer finishes — you can keep reading agent
            output above while it works.
          </p>
        </Panel>
      ) : null}

      {footer}
    </div>
  );
}
