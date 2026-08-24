"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleHelp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAuthGuide, getPageGuide, guideStorageKey } from "@/lib/pageGuides";

const PAD = 8;
const VIEW_PAD = 12;
const GAP = 12;
const DIM = "rgba(5, 11, 24, 0.72)";

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function measureHole(id) {
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

function clampTip(hole, tw, th, vw, vh) {
  const maxLeft = Math.max(VIEW_PAD, vw - tw - VIEW_PAD);
  const maxTop = Math.max(VIEW_PAD, vh - th - VIEW_PAD);

  if (!hole) {
    return {
      top: Math.max(VIEW_PAD, Math.min((vh - th) / 2, maxTop)),
      left: Math.max(VIEW_PAD, Math.min((vw - tw) / 2, maxLeft)),
    };
  }

  const below = hole.top + hole.height + GAP;
  const above = hole.top - th - GAP;
  let top;
  if (below + th <= vh - VIEW_PAD) top = below;
  else if (above >= VIEW_PAD) top = above;
  else top = Math.max(VIEW_PAD, Math.min(hole.top, maxTop));

  let left = hole.left + hole.width / 2 - tw / 2;
  left = Math.max(VIEW_PAD, Math.min(left, maxLeft));
  top = Math.max(VIEW_PAD, Math.min(top, maxTop));
  return { top, left };
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
      {open ? <GuideOverlay scope={scope} guide={guide} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function GuideOverlay({ scope, guide, onClose }) {
  const steps = guide.steps;
  const [index, setIndex] = useState(0);
  const [hole, setHole] = useState(null);
  const [tip, setTip] = useState({ top: VIEW_PAD, left: VIEW_PAD });
  const [ready, setReady] = useState(false);
  const tipRef = useRef(null);
  const step = steps[index];

  const place = useCallback(() => {
    const next = step ? measureHole(step.id) : null;
    setHole(next);
    const card = tipRef.current;
    if (!card) return;
    const nextTip = clampTip(
      next,
      card.offsetWidth,
      card.offsetHeight,
      window.innerWidth,
      window.innerHeight
    );
    setTip(nextTip);
    setReady(true);
  }, [step]);

  useLayoutEffect(() => {
    setReady(false);
    const el = step ? document.querySelector(`[data-guide="${step.id}"]`) : null;
    const reduced = prefersReducedMotion();
    if (el) {
      el.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: reduced ? "auto" : "smooth",
      });
    }
    place();
    const raf = requestAnimationFrame(place);
    const t = window.setTimeout(place, reduced ? 40 : 280);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [step, place]);

  useEffect(() => {
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [place]);

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

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] overflow-hidden animate-[page-guide-in_180ms_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="page-guide-title"
    >
      {hole ? (
        <div className="absolute inset-0" onClick={onClose} />
      ) : (
        <div className="absolute inset-0" style={{ backgroundColor: DIM }} onClick={onClose} />
      )}

      {hole ? (
        <div
          className="pointer-events-none absolute rounded-[14px] ring-2 ring-[var(--cw-neon)]"
          style={{
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
            boxShadow: `0 0 0 9999px ${DIM}`,
          }}
        />
      ) : null}

      <div
        ref={tipRef}
        className="absolute z-[1] w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-4 shadow-[var(--cw-shadow-lg)] pointer-events-auto"
        style={{
          top: tip.top,
          left: tip.left,
          opacity: ready ? 1 : 0,
        }}
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
    </div>,
    document.body
  );
}

export default PageGuideButton;
