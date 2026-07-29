"use client";

import { useEffect, useRef, useState } from "react";
import { usePlayContext } from "@playhtml/react";
import { formatScheduleShort } from "@/lib/timezone";
import { isBoardVideoPath, resolveBoardMedia } from "./resolveBoardMedia";

/**
 * Physically draggable board card (pointer capture + translate).
 * Lives inside PlayProvider for live cursors/room; status changes on drop into a column.
 */
export default function KanbanCard({
  item,
  columnId,
  boardId,
  locked,
  onMoveToColumn,
  index = 0,
}) {
  const { isLoading: playLoading } = usePlayContext();
  const [moving, setMoving] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const cardRef = useRef(null);
  const dragState = useRef(null);
  const onMoveRef = useRef(onMoveToColumn);
  onMoveRef.current = onMoveToColumn;

  const title = item.displayTitle || item.title || item.userEditedTitle || "Untitled";
  const media = resolveBoardMedia(item);
  const scheduleLabel = item.scheduledFor ? formatScheduleShort(item.scheduledFor) : "";
  const source = item.source && item.source !== "manual" ? item.source : "";

  useEffect(() => {
    setImgFailed(false);
  }, [media]);

  useEffect(() => {
    if (locked) return undefined;
    const el = cardRef.current;
    if (!el) return undefined;

    const clearTransform = () => {
      el.style.transform = "";
      el.style.zIndex = "";
      el.classList.remove("cw-board__card--dragging");
      document.querySelectorAll("[data-board-id][data-drop-active='true']").forEach((lane) => {
        lane.setAttribute("data-drop-active", "false");
      });
    };

    const hitColumnAt = (clientX, clientY) => {
      const lanes = document.querySelectorAll(`[data-board-id="${boardId}"][data-column-id]`);
      let hit = null;
      lanes.forEach((lane) => {
        const r = lane.getBoundingClientRect();
        const active = clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
        lane.setAttribute("data-drop-active", active ? "true" : "false");
        if (active) hit = lane.getAttribute("data-column-id");
      });
      return hit;
    };

    const onPointerDown = (e) => {
      if (e.button != null && e.button !== 0) return;
      if (moving) return;
      if (e.target?.closest?.("a,button,input,textarea,select")) return;

      dragState.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        dragging: false,
      };

      const onPointerMove = (ev) => {
        const st = dragState.current;
        if (!st || ev.pointerId !== st.pointerId) return;
        const dx = ev.clientX - st.startX;
        const dy = ev.clientY - st.startY;
        if (!st.dragging && Math.hypot(dx, dy) < 5) return;
        if (!st.dragging) {
          st.dragging = true;
          el.classList.add("cw-board__card--dragging");
          el.style.zIndex = "50";
          try {
            el.setPointerCapture(ev.pointerId);
          } catch {
            /* ignore */
          }
        }
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        hitColumnAt(ev.clientX, ev.clientY);
        ev.preventDefault();
      };

      const finish = async (ev) => {
        const st = dragState.current;
        if (!st || ev.pointerId !== st.pointerId) return;
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        dragState.current = null;
        try {
          el.releasePointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }

        const hit = st.dragging ? hitColumnAt(ev.clientX, ev.clientY) : null;
        clearTransform();

        if (!st.dragging || !hit || hit === columnId || hit === "published") return;

        setMoving(true);
        try {
          await onMoveRef.current(item, hit, columnId);
        } catch {
          /* toast handled upstream */
        } finally {
          setMoving(false);
          clearTransform();
        }
      };

      window.addEventListener("pointermove", onPointerMove, { passive: false });
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
    };

    el.addEventListener("pointerdown", onPointerDown);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
    };
  }, [locked, moving, columnId, boardId, item]);

  const body = (
    <>
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
    </>
  );

  return (
    <article
      ref={cardRef}
      id={`${boardId}-card-${item.id}`}
      className="cw-board__card"
      data-locked={locked ? "true" : "false"}
      data-moving={moving ? "true" : "false"}
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
    >
      {body}
    </article>
  );
}
