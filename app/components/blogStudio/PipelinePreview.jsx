"use client";

/**
 * PipelinePreview — the "here's what will happen when you hit Generate" strip.
 *
 * Shows the agents that will run, in order, each with a readiness dot (its key
 * is configured) and the model it will use. This turns an opaque "Generate"
 * button into a transparent promise: the user sees the machine before they
 * start it. Purely presentational — token-themed to match the studio chrome.
 */

import { Fragment } from "react";
import { ChevronRight, Cpu, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: "agent1", title: "Strategist", subtitle: "Keyword intelligence", readyKey: "agent1", modelKey: "agent1Model" },
  { id: "agent2", title: "Architect", subtitle: "Article blueprint", readyKey: "agent2", modelKey: "agent2Model" },
  { id: "agent3", title: "Writer", subtitle: "Publication draft", readyKey: "agent3", modelKey: "agent3Model" },
  { id: "image", title: "Image", subtitle: "Featured visual", readyKey: "image", modelKey: "imageModel" },
];

export default function PipelinePreview({ config = {}, onConfigure, className = "" }) {
  const ready = config?.agentReady || {};
  const missing = STEPS.filter((s) => !ready[s.readyKey]);

  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] p-4",
        className
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--cw-ink-faint)]">
          Pipeline · what runs on Generate
        </p>
        <span className="font-mono text-[11px] text-[var(--cw-ink-muted)]">~1–2 min</span>
      </div>

      <div className="flex flex-wrap items-stretch gap-1.5">
        {STEPS.map((step, i) => {
          const ok = Boolean(ready[step.readyKey]);
          const model = config?.[step.modelKey];
          return (
            <Fragment key={step.id}>
              <div
                className={cn(
                  "group relative flex min-w-[116px] flex-1 flex-col gap-1 rounded-xl border p-2.5",
                  ok
                    ? "border-[color-mix(in_srgb,var(--cw-neon)_28%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-neon)_6%,var(--cw-surface))]"
                    : "border-[color-mix(in_srgb,var(--cw-danger)_30%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-danger)_6%,var(--cw-surface))]"
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="inline-flex items-center gap-1.5">
                    <Cpu className="size-3.5 text-[var(--cw-neon)]" aria-hidden />
                    <span className="text-[12px] font-bold text-[var(--cw-ink)]">{step.title}</span>
                  </span>
                  {ok ? (
                    <CheckCircle2 className="size-3.5 text-[var(--cw-neon)]" aria-hidden />
                  ) : (
                    <AlertCircle className="size-3.5 text-[var(--cw-danger)]" aria-hidden />
                  )}
                </div>
                <span className="truncate text-[10px] text-[var(--cw-ink-faint)]">{step.subtitle}</span>
                {model ? (
                  <span className="truncate font-mono text-[10px] text-[var(--cw-ink-muted)]" title={model}>
                    {String(model).replace(/^.*\//, "")}
                  </span>
                ) : null}
              </div>
              {i < STEPS.length - 1 ? (
                <span className="flex items-center self-center text-[var(--cw-ink-faint)]">
                  <ChevronRight className="size-4" aria-hidden />
                </span>
              ) : null}
            </Fragment>
          );
        })}
      </div>

      {missing.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
          <AlertCircle className="size-3.5 text-[var(--cw-danger)]" aria-hidden />
          <span className="text-[var(--cw-ink-muted)]">
            {missing.map((m) => m.title).join(", ")} {missing.length === 1 ? "needs" : "need"} an API key.
          </span>
          {onConfigure ? (
            <button
              type="button"
              onClick={onConfigure}
              className="font-semibold text-[var(--cw-neon)] hover:underline"
            >
              Configure agents →
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
