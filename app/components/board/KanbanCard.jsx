"use client";

import { useRef, useState } from "react";
import { CanMoveElement, usePlayContext } from "@playhtml/react";
import { formatScheduleShort } from "@/lib/timezone";

function isVideoPath(path) {
  return /\.(mp4|webm|mov)(\?|$)/i.test(String(path || ""));
}

/**
 * Draggable playhtml card. Dropping over a column commits a status change.
 * Published cards are locked (no CanMove).
 */
export default function KanbanCard({
  item,
  columnId,
  boardId,
  boundsSelector,
  locked,
  onMoveToColumn,
  index = 0,
}) {
  const { deleteElementData } = usePlayContext();
  const [moving, setMoving] = useState(false);
  const dragActive = useRef(false);
  const elementId = `${boardId}-card-${item.id}`;

  const title = item.displayTitle || item.title || item.userEditedTitle || "Untitled";
  const media = item.imagePath || item.featuredImagePath || "";
  const scheduleLabel = item.scheduledFor ? formatScheduleShort(item.scheduledFor) : "";
  const source = item.source && item.source !== "manual" ? item.source : "";

  const commitDrop = async (el) => {
    if (!el || locked || moving) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const lanes = document.querySelectorAll(`[data-board-id="${boardId}"][data-column-id]`);
    let hit = null;
    lanes.forEach((lane) => {
      const r = lane.getBoundingClientRect();
      if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) {
        hit = lane.getAttribute("data-column-id");
      }
    });

    const clearPlayPos = () => {
      try {
        deleteElementData?.(elementId);
      } catch {
        /* ignore */
      }
      if (el) {
        el.style.transform = "";
        el.style.left = "";
        el.style.top = "";
      }
    };

    if (!hit || hit === columnId) {
      clearPlayPos();
      return;
    }
    if (hit === "published") {
      clearPlayPos();
      return;
    }

    setMoving(true);
    try {
      await onMoveToColumn(item, hit, columnId);
      clearPlayPos();
    } catch {
      clearPlayPos();
    } finally {
      setMoving(false);
    }
  };

  const body = (
    <>
      {media ? (
        <div className="cw-board__card-media">
          {isVideoPath(media) ? (
            <video src={media} muted playsInline preload="metadata" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media} alt="" />
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
      </div>
    </>
  );

  if (locked) {
    return (
      <article
        className="cw-board__card"
        data-locked="true"
        style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
      >
        {body}
      </article>
    );
  }

  return (
    <CanMoveElement
      standalone
      bounds={boundsSelector}
      boundsMinVisible={0.35}
      boundsMinVisiblePx={40}
    >
      {({ ref }) => (
        <article
          ref={ref}
          id={elementId}
          className="cw-board__card"
          data-moving={moving ? "true" : "false"}
          style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
          onPointerDown={() => {
            dragActive.current = true;
          }}
          onPointerUp={(e) => {
            if (!dragActive.current) return;
            dragActive.current = false;
            const el = e.currentTarget;
            window.setTimeout(() => commitDrop(el), 40);
          }}
          onPointerCancel={() => {
            dragActive.current = false;
          }}
        >
          {body}
        </article>
      )}
    </CanMoveElement>
  );
}
