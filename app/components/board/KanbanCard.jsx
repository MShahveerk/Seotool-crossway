"use client";

import { useEffect, useRef, useState } from "react";
import { usePlayContext } from "@playhtml/react";
import { formatScheduleShort } from "@/lib/timezone";
import { isBoardVideoPath, resolveBoardMedia } from "./resolveBoardMedia";
import { useBoardDragPresence } from "./BoardDragPresence";
import { useKanbanPointerDrag } from "./useKanbanPointerDrag";

/**
 * Physically draggable board card. A body-level clone follows the pointer so
 * the card stays visible over every column.
 */
export default function KanbanCard({
  item,
  columnId,
  boardId,
  locked,
  onMoveToColumn,
  onOpenDetails,
  index = 0,
  focused = false,
}) {
  const { isLoading: playLoading } = usePlayContext();
  const { broadcastDrag, clearDrag } = useBoardDragPresence();
  const [moving, setMoving] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const onOpenRef = useRef(onOpenDetails);
  onOpenRef.current = onOpenDetails;

  const { cardRef, didDragRef } = useKanbanPointerDrag({
    locked,
    moving,
    columnId,
    boardId,
    item,
    onMoveToColumn: async (nextItem, hit, from) => {
      setMoving(true);
      try {
        await onMoveToColumn(nextItem, hit, from);
      } finally {
        setMoving(false);
      }
    },
    broadcastDrag,
    clearDrag,
  });

  const title = item.displayTitle || item.title || item.userEditedTitle || "Untitled";
  const media = resolveBoardMedia(item);
  const scheduleLabel = item.scheduledFor ? formatScheduleShort(item.scheduledFor) : "";
  const source = item.source && item.source !== "manual" ? item.source : "";

  useEffect(() => {
    setImgFailed(false);
  }, [media]);

  useEffect(() => {
    if (!focused || !cardRef.current) return undefined;
    const node = cardRef.current;
    const id = window.requestAnimationFrame(() => {
      node.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [focused, cardRef]);

  const openDetails = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (didDragRef.current) return;
    onOpenRef.current?.(item);
  };

  return (
    <article
      ref={cardRef}
      id={`${boardId}-card-${item.id}`}
      className={`cw-board__card${focused ? " cw-board__card--focus" : ""}`}
      data-locked={locked ? "true" : "false"}
      data-moving={moving ? "true" : "false"}
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
      onDoubleClick={openDetails}
      title="Double-click for details"
    >
      {media && !imgFailed ? (
        <div className="cw-board__card-media">
          {isBoardVideoPath(media) ? (
            <video src={media} muted playsInline preload="metadata" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={media}
              alt=""
              loading="eager"
              decoding="async"
              referrerPolicy="no-referrer"
              draggable={false}
              onError={() => setImgFailed(true)}
            />
          )}
        </div>
      ) : null}
      <div className="cw-board__card-title">{title}</div>
      <div className="cw-board__card-meta">
        {item.assignee?.name || item.assignee?.email ? (
          <span className="cw-board__card-tag">{item.assignee?.name || item.assignee?.email}</span>
        ) : null}
        {scheduleLabel ? <span className="cw-board__card-tag cw-board__card-tag--warn">{scheduleLabel}</span> : null}
        {source ? <span className="cw-board__card-tag">{source}</span> : null}
        {item.publishError ? <span className="cw-board__card-tag cw-board__card-tag--danger">error</span> : null}
        {locked ? <span className="cw-board__card-tag">locked</span> : null}
        {!locked && playLoading ? <span className="cw-board__card-tag">syncing</span> : null}
      </div>
    </article>
  );
}
