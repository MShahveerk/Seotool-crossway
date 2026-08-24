"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { CircleHelp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAuthGuide, getPageGuide, guideStorageKey } from "@/lib/pageGuides";

const PAD = 10;
const TOOLTIP_W = 320;

function measure(id) {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(`[data-guide="${id}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 4 && r.height < 4) return null;
  return {
    top: r.top - PAD,
    left: r.left - PAD,
    width: r.width + PAD * 2,
    height: r.height + PAD * 2,
  };
}

function tooltipPos(hole, vw, vh) {
  if (!hole) {
    return { top: Math.max(24, vh / 2 - 90), left: Math.max(16, (vw - TOOLTIP_W) / 2) };
  }
  const below = hole.top + hole.height + 12;
  const above = hole.top - 12;
  const left = Math.min(Math.max(16, hole.left), vw - TOOLTIP_W - 16);
  if (below + 180 < vh) return { top: below, left };
  if (above > 200) return { top: above - 160, left };
  return { top: Math.min(below, vh - 200), left };
}

export function PageGuideButton({ sectionId, className }) {
  const guide = getPageGuide(sectionId);
  return <GuideLauncher scope={sectionId} guide={guide} className={className} />;
}

export function AuthGuideButton({ pathname, className }) {
  const guide = getAuthGuide(pathname);
  return <GuideLauncher scope={`auth:${pathname}`} guide={guide} compact className={className} />;
}

function GuideLauncher({ scope, guide, compact = false, className }) {
  const [open, setOpen] = useState(false);

  if (!guide?.steps?.length) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-2.5 py-1.5 text-xs font-semibold text-[var(--cw-ink-dim)] transition-smooth hover:border-[color-mix(in_srgb,var(--cw-neon)_40%,var(--cw-hairline))] hover:text-[var(--cw-neon)]",
          className
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CircleHelp className="size-3.5" aria-hidden />
        {compact ? "Guide" : "Guide"}
      </button>
      {open ? (
        <GuideOverlay
          scope={scope}
          guide={guide}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function GuideOverlay({ scope, guide, onClose }) {
  const steps = guide.steps;
  const [index, setIndex] = useState(0);
  const [hole, setHole] = useState(null);
  const step = steps[index];

  const refresh = useCallback(() => {
    const next = step ? measure(step.id) : null;
    setHole(next);
    if (next) {
      const el = document.querySelector(`[data-guide="${step.id}"]`);
      el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }
  }, [step]);

  useLayoutEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, true);
    return () => {
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
    };
  }, [refresh]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        setIndex((i) => Math.min(steps.length - 1, i + 1));
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, steps.length]);

  const finish = () => {
    try {
      localStorage.setItem(guideStorageKey(scope), "1");
    } catch {
      /* ignore */
    }
    onClose();
  };

  const last = index === steps.length - 1;
  const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const tip = tooltipPos(hole, vw, vh);

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-labelledby="page-guide-title">
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <mask id="page-guide-mask">
            <rect width="100%" height="100%" fill="white" />
            {hole ? (
              <rect
                x={Math.max(0, hole.left)}
                y={Math.max(0, hole.top)}
                width={hole.width}
                height={hole.height}
                rx="14"
                fill="black"
              />
            ) : null}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(5, 11, 24, 0.72)" mask="url(#page-guide-mask)" />
      </svg>
      {hole ? (
        <div
          className="pointer-events-none absolute rounded-[14px] ring-2 ring-[var(--cw-neon)] shadow-[var(--cw-glow)]"
          style={{
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
          }}
        />
      ) : null}

      <div
        className="absolute w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-4 shadow-[var(--cw-shadow-lg)]"
        style={{ top: tip.top, left: tip.left }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--cw-neon)]">
              {guide.title} · {index + 1} of {steps.length}
            </p>
            <h2 id="page-guide-title" className="font-heading mt-1 text-sm font-semibold text-[var(--cw-ink)]">
              {step.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[var(--cw-ink-faint)] hover:bg-[var(--cw-raised)] hover:text-[var(--cw-ink)]"
            aria-label="Close guide"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-[var(--cw-ink-dim)]">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--cw-ink-muted)] hover:text-[var(--cw-ink)] disabled:opacity-30"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => (last ? finish() : setIndex((i) => i + 1))}
            className="rounded-lg bg-[var(--cw-neon)] px-3 py-1.5 text-xs font-semibold text-[var(--cw-neon-ink)]"
          >
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PageGuideButton;
