"use client";

import { useState } from "react";
import { formatScheduleShort } from "@/lib/timezone";

function isVideoPath(path) {
  return /\.(mp4|webm|mov)(\?|$)/i.test(String(path || ""));
}

/** HTML5 drag fallback when playhtml is unavailable. */
export default function NativeKanbanCard({ item, columnId, locked, onMoveToColumn, index = 0 }) {
  const [moving, setMoving] = useState(false);
  const title = item.displayTitle || item.title || item.userEditedTitle || "Untitled";
  const media = item.imagePath || item.featuredImagePath || "";
  const scheduleLabel = item.scheduledFor ? formatScheduleShort(item.scheduledFor) : "";

  if (locked) {
    return (
      <article className="cw-board__card" data-locked="true" style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}>
        <div className="cw-board__card-title">{title}</div>
      </article>
    );
  }

  return (
    <article
      className="cw-board__card"
      draggable
      data-moving={moving ? "true" : "false"}
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/cw-board-item", JSON.stringify({ id: item.id, from: columnId }));
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={async (e) => {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const lane = el?.closest?.("[data-column-id]");
        const hit = lane?.getAttribute("data-column-id");
        if (!hit || hit === columnId || hit === "published") return;
        setMoving(true);
        try {
          await onMoveToColumn(item, hit, columnId);
        } finally {
          setMoving(false);
        }
      }}
    >
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
        {scheduleLabel ? <span className="cw-board__card-tag cw-board__card-tag--warn">{scheduleLabel}</span> : null}
      </div>
    </article>
  );
}
