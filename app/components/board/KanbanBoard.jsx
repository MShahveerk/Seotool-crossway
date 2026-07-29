"use client";

import { useMemo, useState } from "react";
import { Syne } from "next/font/google";
import { formatScheduleShort } from "@/lib/timezone";
import AutoMoveArrows from "./AutoMoveArrows";
import KanbanCard from "./KanbanCard";
import NativeKanbanCard from "./NativeKanbanCard";

const syne = Syne({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-board-display",
});

function groupByColumn(items, getColumn, columnIds) {
  const map = Object.fromEntries(columnIds.map((id) => [id, []]));
  for (const item of items) {
    const col = getColumn(item);
    if (map[col]) map[col].push(item);
    else if (map.pending) map.pending.push(item);
  }
  return map;
}

export default function KanbanBoard({
  boardId,
  brand,
  subtitle,
  columns,
  autoMoves,
  items,
  getColumn,
  onMoveToColumn,
  loading,
  error,
  siteLabel,
  playhtml = true,
}) {
  const [toast, setToast] = useState("");
  const boundsId = `${boardId}-bounds`;
  const columnIds = useMemo(() => columns.map((c) => c.id), [columns]);
  const grouped = useMemo(
    () => groupByColumn(items, getColumn, columnIds),
    [items, getColumn, columnIds]
  );
  const Card = playhtml ? KanbanCard : NativeKanbanCard;

  const resolvedAutoMoves = useMemo(() => {
    const approved = grouped.approved || [];
    const nextSched = approved
      .map((i) => (i.scheduledFor ? new Date(i.scheduledFor).getTime() : NaN))
      .filter((t) => !Number.isNaN(t) && t > Date.now())
      .sort((a, b) => a - b)[0];
    const nextLabel = nextSched ? formatScheduleShort(new Date(nextSched)) : null;

    return (autoMoves || []).map((move) => {
      const fromCount = (grouped[move.from] || []).length;
      if (move.to === "published" && nextLabel && fromCount > 0) {
        return {
          ...move,
          label: `Next ${nextLabel}`,
          detail: `${move.detail} · ${fromCount} waiting`,
        };
      }
      if (move.from === "draft" && fromCount > 0) {
        return {
          ...move,
          label: `Daily 09:00 · ${fromCount}`,
          detail: move.detail,
        };
      }
      return move;
    });
  }, [autoMoves, grouped]);

  const handleMove = async (item, toColumn, fromColumn) => {
    setToast("");
    try {
      await onMoveToColumn(item, toColumn, fromColumn);
      setToast(`Moved to ${columns.find((c) => c.id === toColumn)?.label || toColumn}`);
      window.setTimeout(() => setToast(""), 2200);
    } catch (err) {
      setToast(err.message || "Move failed");
      window.setTimeout(() => setToast(""), 3200);
      throw err;
    }
  };

  return (
    <div className={`cw-board ${syne.variable}`}>
      <div className="cw-board__atmosphere" aria-hidden="true" />
      <div className="cw-board__inner">
        <header className="cw-board__header">
          <div>
            <h1 className="cw-board__brand">{brand}</h1>
            <p className="cw-board__sub">{subtitle}</p>
          </div>
          <div className="cw-board__meta">
            <span className="cw-board__chip cw-board__chip--live">Live board</span>
            <span className="cw-board__chip">{siteLabel || "All accounts"}</span>
            <span className="cw-board__chip">{items.length} items</span>
          </div>
        </header>

        {error ? <div className="cw-board__error">{error}</div> : null}

        <div className="cw-board__scroller" data-board-scroller={boardId} id={boundsId}>
          <div className="cw-board__lanes" style={{ position: "relative" }}>
            <AutoMoveArrows boardId={boardId} autoMoves={resolvedAutoMoves} columns={columns} />
            {columns.map((col) => {
              const list = grouped[col.id] || [];
              return (
                <section
                  key={col.id}
                  className="cw-board__lane"
                  data-board-id={boardId}
                  data-column-id={col.id}
                  data-locked={col.locked ? "true" : "false"}
                  data-drop-active="false"
                >
                  <div className="cw-board__lane-head">
                    <div className="cw-board__lane-title">
                      <span>{col.label}</span>
                      <span className="cw-board__count">{list.length}</span>
                    </div>
                    <p className="cw-board__lane-hint">{col.hint}</p>
                    <span className="cw-board__lane-tone" data-tone={col.tone} />
                  </div>
                  <div className="cw-board__cards">
                    {loading && list.length === 0 ? (
                      <p className="cw-board__empty">Loading…</p>
                    ) : null}
                    {!loading && list.length === 0 ? (
                      <p className="cw-board__empty">Drop cards here</p>
                    ) : null}
                    {list.map((item, index) => (
                      <Card
                        key={item.id}
                        item={item}
                        columnId={col.id}
                        boardId={boardId}
                        boundsSelector={`#${boundsId}`}
                        locked={Boolean(col.locked) || getColumn(item) === "published"}
                        onMoveToColumn={handleMove}
                        index={index}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
      {toast ? <div className="cw-board__toast" role="status">{toast}</div> : null}
    </div>
  );
}
