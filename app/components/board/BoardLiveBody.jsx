"use client";

import { useCallback, useEffect } from "react";
import BoardDragPresence from "./BoardDragPresence";
import KanbanBoard from "./KanbanBoard";
import { useBoardLiveSync } from "./useBoardLiveSync";

/**
 * Must render under PlayProvider. Wires playhtml room signals so other
 * devices refetch the board as soon as a card moves / is saved.
 */
export default function BoardLiveBody({
  room,
  boardProps,
  refreshSilent,
  onMoveToColumn,
  onItemSaved,
}) {
  const { publish, connected } = useBoardLiveSync(room, () => {
    refreshSilent?.();
  });

  // Backup poll while the tab is visible (playhtml can flake; API is source of truth)
  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      refreshSilent?.();
    };
    const id = window.setInterval(tick, 4000);
    const onVis = () => {
      if (document.visibilityState === "visible") refreshSilent?.();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refreshSilent]);

  const move = useCallback(
    async (item, toColumn, fromColumn) => {
      const result = await onMoveToColumn(item, toColumn, fromColumn);
      publish();
      return result;
    },
    [onMoveToColumn, publish]
  );

  const saved = useCallback(
    (updated) => {
      onItemSaved?.(updated);
      publish();
    },
    [onItemSaved, publish]
  );

  return (
    <BoardDragPresence boardId={boardProps?.boardId || room}>
      <KanbanBoard
        {...boardProps}
        playhtml
        liveConnected={connected}
        onMoveToColumn={move}
        onItemSaved={saved}
      />
    </BoardDragPresence>
  );
}
