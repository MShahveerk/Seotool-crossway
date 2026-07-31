"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { usePresence } from "@playhtml/react";
import { boardDragChannel } from "./boardDragChannel";
import BoardLiveDragLayer from "./BoardLiveDragLayer";

const BoardDragCtx = createContext({
  broadcastDrag: () => {},
  clearDrag: () => {},
});

export function useBoardDragPresence() {
  return useContext(BoardDragCtx);
}

/**
 * One presence subscription per board: broadcast in-flight card drags to peers.
 */
export default function BoardDragPresence({ boardId, children }) {
  const { setMyPresence, presences } = usePresence(boardDragChannel(boardId));

  const broadcastDrag = useCallback(
    (payload) => {
      try {
        setMyPresence(payload);
      } catch {
        /* room not ready */
      }
    },
    [setMyPresence]
  );

  const clearDrag = useCallback(() => {
    try {
      setMyPresence(null);
    } catch {
      try {
        setMyPresence({ itemId: "", x: 0, y: 0, w: 0, h: 0, title: "" });
      } catch {
        /* ignore */
      }
    }
  }, [setMyPresence]);

  const value = useMemo(
    () => ({ broadcastDrag, clearDrag }),
    [broadcastDrag, clearDrag]
  );

  return (
    <BoardDragCtx.Provider value={value}>
      {children}
      <BoardLiveDragLayer presences={presences} />
    </BoardDragCtx.Provider>
  );
}
