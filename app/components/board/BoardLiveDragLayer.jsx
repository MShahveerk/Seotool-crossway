"use client";

function readDragPayload(view) {
  if (!view || typeof view !== "object") return null;
  if (view.itemId) return view;
  if (view.data?.itemId) return view.data;
  return null;
}

/**
 * Renders other users' in-flight card drags (ephemeral presence).
 */
export default function BoardLiveDragLayer({ presences }) {
  const ghosts = [];
  if (presences && typeof presences.forEach === "function") {
    presences.forEach((view, key) => {
      if (view?.isMe) return;
      const drag = readDragPayload(view);
      if (!drag?.itemId || drag.x == null || drag.y == null) return;
      ghosts.push({
        key: String(key),
        title: drag.title || "Moving…",
        x: Number(drag.x) || 0,
        y: Number(drag.y) || 0,
        w: Math.max(120, Number(drag.w) || 200),
        h: Math.max(80, Number(drag.h) || 120),
        color: view?.playerIdentity?.color || view?.color || "#1d9c35",
      });
    });
  }

  if (!ghosts.length) return null;

  return (
    <div className="cw-board__live-drags" aria-hidden="true">
      {ghosts.map((g) => (
        <div
          key={g.key}
          className="cw-board__live-drag-ghost"
          style={{
            left: g.x,
            top: g.y,
            width: g.w,
            height: g.h,
            borderColor: g.color,
            boxShadow: `0 12px 40px rgba(0,0,0,0.35), 0 0 0 1px ${g.color}`,
          }}
        >
          <div className="cw-board__live-drag-ghost-title">{g.title}</div>
          <div className="cw-board__live-drag-ghost-hint">Moving</div>
        </div>
      ))}
    </div>
  );
}
