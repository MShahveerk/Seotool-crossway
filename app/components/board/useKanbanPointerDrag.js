"use client";

import { useEffect, useRef } from "react";

/**
 * Pointer-capture drag that floats a card clone on document.body.
 * Lane overflow / backdrop-filter otherwise clip translate() so the card
 * vanishes the moment it leaves its column, even though drop still hits.
 */
export function useKanbanPointerDrag({
  locked,
  moving,
  columnId,
  boardId,
  item,
  onMoveToColumn,
  broadcastDrag,
  clearDrag,
}) {
  const cardRef = useRef(null);
  const didDragRef = useRef(false);
  const dragState = useRef(null);
  const ghostRef = useRef(null);
  const lastBroadcast = useRef(0);
  const onMoveRef = useRef(onMoveToColumn);
  const broadcastRef = useRef(broadcastDrag);
  const clearDragRef = useRef(clearDrag);
  const itemRef = useRef(item);
  const columnIdRef = useRef(columnId);
  onMoveRef.current = onMoveToColumn;
  broadcastRef.current = broadcastDrag;
  clearDragRef.current = clearDrag;
  itemRef.current = item;
  columnIdRef.current = columnId;

  useEffect(() => {
    if (locked) return undefined;
    const el = cardRef.current;
    if (!el) return undefined;

    const clearLiveDrag = () => {
      clearDragRef.current?.();
    };

    const removeGhost = () => {
      ghostRef.current?.remove();
      ghostRef.current = null;
      el.classList.remove("cw-board__card--origin");
      document.body.classList.remove("cw-board-dragging");
    };

    const ensureGhost = (width, height) => {
      if (ghostRef.current) return ghostRef.current;
      const ghost = el.cloneNode(true);
      ghost.removeAttribute("id");
      ghost.removeAttribute("data-guide");
      ghost.setAttribute("aria-hidden", "true");
      ghost.classList.add("cw-board__card--float");
      ghost.classList.remove("cw-board__card--origin", "cw-board__card--focus");
      ghost.style.cssText = [
        "position:fixed",
        "left:0",
        "top:0",
        `width:${Math.round(width)}px`,
        `min-height:${Math.round(height || el.offsetHeight || 120)}px`,
        "margin:0",
        "z-index:2147483000",
        "pointer-events:none",
        "touch-action:none",
        "animation:none",
        "transition:none",
        "transform:translate3d(-9999px,-9999px,0)",
        "will-change:transform",
      ].join(";");
      document.body.appendChild(ghost);
      ghostRef.current = ghost;
      el.classList.add("cw-board__card--origin");
      document.body.classList.add("cw-board-dragging");
      return ghost;
    };

    const placeGhost = (clientX, clientY, offsetX, offsetY, width, height) => {
      const ghost = ensureGhost(width, height);
      const x = Math.round(clientX - offsetX);
      const y = Math.round(clientY - offsetY);
      ghost.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      return {
        x,
        y,
        w: Math.round(ghost.offsetWidth || width),
        h: Math.round(ghost.offsetHeight || height || 120),
      };
    };

    const broadcastLiveDrag = (pos) => {
      const now = Date.now();
      if (now - lastBroadcast.current < 40) return;
      lastBroadcast.current = now;
      const current = itemRef.current;
      if (!current) return;
      broadcastRef.current?.({
        itemId: String(current.id),
        title: String(current.displayTitle || current.title || current.userEditedTitle || "Card"),
        x: pos.x,
        y: pos.y,
        w: pos.w,
        h: pos.h,
      });
    };

    const hitColumnAt = (clientX, clientY) => {
      const lanes = document.querySelectorAll(`[data-board-id="${boardId}"][data-column-id]`);
      let hit = null;
      lanes.forEach((lane) => {
        const r = lane.getBoundingClientRect();
        const active =
          clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
        lane.setAttribute("data-drop-active", active ? "true" : "false");
        if (active) hit = lane.getAttribute("data-column-id");
      });
      return hit;
    };

    const clearDropHints = () => {
      document.querySelectorAll("[data-board-id][data-drop-active='true']").forEach((lane) => {
        lane.setAttribute("data-drop-active", "false");
      });
    };

    const onPointerDown = (e) => {
      if (e.button != null && e.button !== 0) return;
      if (moving) return;
      if (e.target?.closest?.("a,button,input,textarea,select")) return;

      didDragRef.current = false;
      const rect = el.getBoundingClientRect();
      dragState.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
        width: rect.width,
        height: rect.height,
        dragging: false,
      };

      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      const onPointerMove = (ev) => {
        const st = dragState.current;
        if (!st || ev.pointerId !== st.pointerId) return;
        const dx = ev.clientX - st.startX;
        const dy = ev.clientY - st.startY;
        if (!st.dragging && Math.hypot(dx, dy) < 5) return;
        if (!st.dragging) {
          st.dragging = true;
          didDragRef.current = true;
        }
        const pos = placeGhost(
          ev.clientX,
          ev.clientY,
          st.offsetX,
          st.offsetY,
          st.width,
          st.height
        );
        broadcastLiveDrag(pos);
        hitColumnAt(ev.clientX, ev.clientY);
        ev.preventDefault();
      };

      const finish = async (ev) => {
        const st = dragState.current;
        if (!st || ev.pointerId !== st.pointerId) return;
        window.removeEventListener("pointermove", onPointerMove, true);
        window.removeEventListener("pointerup", finish, true);
        window.removeEventListener("pointercancel", finish, true);
        dragState.current = null;
        try {
          el.releasePointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }

        const hit = st.dragging ? hitColumnAt(ev.clientX, ev.clientY) : null;
        removeGhost();
        clearDropHints();
        clearLiveDrag();

        const fromColumn = columnIdRef.current;
        const current = itemRef.current;
        if (!st.dragging || !hit || hit === fromColumn || hit === "published" || !current) return;

        try {
          await onMoveRef.current(current, hit, fromColumn);
        } catch {
          /* toast handled upstream */
        }
      };

      window.addEventListener("pointermove", onPointerMove, { passive: false, capture: true });
      window.addEventListener("pointerup", finish, { capture: true });
      window.addEventListener("pointercancel", finish, { capture: true });
    };

    el.addEventListener("pointerdown", onPointerDown);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      removeGhost();
      clearDropHints();
      clearLiveDrag();
    };
  }, [locked, moving, boardId, item?.id]);

  return { cardRef, didDragRef };
}
