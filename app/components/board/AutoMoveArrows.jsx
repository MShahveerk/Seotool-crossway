"use client";

import { useEffect, useState } from "react";

/**
 * Light dashed arrows between columns that will auto-advance (cron / schedule).
 */
export default function AutoMoveArrows({ boardId, autoMoves, columns }) {
  const [paths, setPaths] = useState([]);

  useEffect(() => {
    if (!autoMoves?.length) {
      setPaths([]);
      return undefined;
    }

    const measure = () => {
      const next = [];
      for (const move of autoMoves) {
        const fromEl = document.querySelector(
          `[data-board-id="${boardId}"][data-column-id="${move.from}"]`
        );
        const toEl = document.querySelector(
          `[data-board-id="${boardId}"][data-column-id="${move.to}"]`
        );
        const scroller = document.querySelector(`[data-board-scroller="${boardId}"]`);
        if (!fromEl || !toEl || !scroller) continue;

        const s = scroller.getBoundingClientRect();
        const a = fromEl.getBoundingClientRect();
        const b = toEl.getBoundingClientRect();
        const x1 = a.right - s.left + scroller.scrollLeft - 6;
        const y1 = a.top - s.top + 28;
        const x2 = b.left - s.left + scroller.scrollLeft + 6;
        const y2 = b.top - s.top + 28;
        const midX = (x1 + x2) / 2;
        const midY = Math.min(y1, y2) - 18;
        next.push({
          key: `${move.from}-${move.to}`,
          d: `M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`,
          labelX: midX,
          labelY: midY - 4,
          label: move.label,
          detail: move.detail,
          soft: move.to === "published",
        });
      }
      setPaths(next);
    };

    measure();
    const scroller = document.querySelector(`[data-board-scroller="${boardId}"]`);
    scroller?.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    const t = window.setInterval(measure, 1200);
    return () => {
      scroller?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      window.clearInterval(t);
    };
  }, [autoMoves, boardId, columns]);

  if (!paths.length) return null;

  return (
    <svg className="cw-board__arrows" aria-hidden="true">
      <defs>
        <marker id={`cw-arrow-${boardId}`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" fill="rgba(14,255,42,0.45)" />
        </marker>
        <marker id={`cw-arrow-soft-${boardId}`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" fill="rgba(125,211,252,0.5)" />
        </marker>
      </defs>
      {paths.map((p) => (
        <g key={p.key}>
          <path
            className={`cw-board__arrow-path${p.soft ? " cw-board__arrow-path--soft" : ""}`}
            d={p.d}
            markerEnd={`url(#${p.soft ? `cw-arrow-soft-${boardId}` : `cw-arrow-${boardId}`})`}
          >
            <title>{p.detail || p.label}</title>
          </path>
          <text className="cw-board__arrow-label" x={p.labelX} y={p.labelY} textAnchor="middle">
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
