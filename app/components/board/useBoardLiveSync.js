"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePageData, usePlayContext } from "@playhtml/react";

const EVENT_TYPE = "crossway-board-refresh";

/**
 * Cross-device live sync for kanban boards via playhtml page data + events.
 * Local drag only moves the card on your screen; column changes hit the API.
 * This broadcasts a room signal so other devices refetch immediately.
 */
export function useBoardLiveSync(roomId, onRemoteChange) {
  const channel = `board-sync:${roomId || "default"}`;
  const { isLoading, dispatchPlayEvent, registerPlayEventListener, removePlayEventListener } =
    usePlayContext();
  const [signal, setSignal] = usePageData(channel, { rev: 0, at: 0, src: "" });
  const localTokenRef = useRef(`local-${Math.random().toString(36).slice(2)}`);
  const lastSeenRev = useRef(null);
  const onRemoteRef = useRef(onRemoteChange);
  onRemoteRef.current = onRemoteChange;

  const publish = useCallback(() => {
    const nextRev = Date.now();
    setSignal({
      rev: nextRev,
      at: nextRev,
      src: localTokenRef.current,
    });
    try {
      dispatchPlayEvent?.({
        type: EVENT_TYPE,
        eventPayload: { roomId, rev: nextRev, src: localTokenRef.current },
      });
    } catch {
      /* playhtml not ready */
    }
  }, [dispatchPlayEvent, roomId, setSignal]);

  // Page-data path (persists briefly; good if a client joins mid-move)
  useEffect(() => {
    if (signal == null || typeof signal !== "object") return;
    const rev = Number(signal.rev) || 0;
    if (lastSeenRev.current == null) {
      lastSeenRev.current = rev;
      return;
    }
    if (rev === lastSeenRev.current) return;
    lastSeenRev.current = rev;
    if (signal.src && signal.src === localTokenRef.current) return;
    onRemoteRef.current?.({ reason: "page-data", signal });
  }, [signal]);

  // Event path (instant for everyone currently connected)
  useEffect(() => {
    if (typeof registerPlayEventListener !== "function") return undefined;
    const handler = (payload) => {
      const data = payload?.eventPayload || payload || {};
      if (data.roomId && data.roomId !== roomId) return;
      if (data.src && data.src === localTokenRef.current) return;
      if (data.rev) lastSeenRev.current = Number(data.rev) || lastSeenRev.current;
      onRemoteRef.current?.({ reason: "event", signal: data });
    };

    let unsub;
    try {
      unsub = registerPlayEventListener(EVENT_TYPE, handler);
    } catch {
      try {
        // Some builds expect (name, { type, onEvent })
        unsub = registerPlayEventListener(EVENT_TYPE, { type: EVENT_TYPE, onEvent: handler });
      } catch {
        unsub = undefined;
      }
    }

    return () => {
      try {
        if (typeof unsub === "function") unsub();
        else removePlayEventListener?.(EVENT_TYPE, handler);
      } catch {
        /* ignore */
      }
    };
  }, [registerPlayEventListener, removePlayEventListener, roomId]);

  return {
    publish,
    connected: !isLoading,
  };
}
