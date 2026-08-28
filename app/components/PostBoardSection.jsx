"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PlayBoardShell from "./board/PlayBoardShell";
import BoardErrorBoundary from "./board/BoardErrorBoundary";
import BoardLiveBody from "./board/BoardLiveBody";
import KanbanBoard from "./board/KanbanBoard";
import {
  POST_AUTO_MOVES,
  POST_BOARD_COLUMNS,
  getPostBoardColumn,
} from "@/lib/boardMeta";

function roomKey(site) {
  const raw = String(site || "all").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80);
  return `crossway-post-board-${raw}`;
}

function mapApprovals(approvals) {
  return (approvals || []).map((a) => ({
    ...a,
    displayTitle: a.userEditedTitle || a.title,
    imagePath: a.imagePath || a.mediaPath || "",
  }));
}

export default function PostBoardSection({ selectedSite = "" }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const busyRef = useRef(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (busyRef.current && silent) return;
    busyRef.current = true;
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      const query = selectedSite ? `?site=${encodeURIComponent(selectedSite)}` : "";
      const res = await fetch(`/api/admin/approvals${query}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load posts");
      setItems(mapApprovals(data.approvals));
      if (!silent) setError("");
    } catch (err) {
      if (!silent) {
        setError(err.message || "Failed to load posts");
        setItems([]);
      }
    } finally {
      busyRef.current = false;
      if (!silent) setLoading(false);
    }
  }, [selectedSite]);

  const refreshSilent = useCallback(() => load({ silent: true }), [load]);

  useEffect(() => {
    load({ silent: false });
    const onRefresh = () => load({ silent: true });
    window.addEventListener("approvals:admin-refresh", onRefresh);
    window.addEventListener("approvals:user-updated", onRefresh);
    return () => {
      window.removeEventListener("approvals:admin-refresh", onRefresh);
      window.removeEventListener("approvals:user-updated", onRefresh);
    };
  }, [load]);

  const onMoveToColumn = useCallback(async (item, toColumn) => {
    const res = await fetch(`/api/admin/board/posts/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ column: toColumn }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not move post");
    setItems((prev) =>
      prev.map((row) => (row.id === item.id ? { ...row, ...data.approval } : row))
    );
    window.dispatchEvent(new CustomEvent("approvals:admin-refresh"));
    window.dispatchEvent(new CustomEvent("approvals:user-updated"));
    return data;
  }, []);

  const onItemSaved = useCallback((updated) => {
    setItems((prev) =>
      prev.map((row) =>
        row.id === updated.id
          ? {
              ...row,
              ...updated,
              displayTitle: updated.userEditedTitle || updated.title,
              imagePath: updated.imagePath || updated.mediaPath || row.imagePath || "",
            }
          : row
      )
    );
    window.dispatchEvent(new CustomEvent("approvals:admin-refresh"));
    window.dispatchEvent(new CustomEvent("approvals:user-updated"));
  }, []);

  const getColumn = useCallback((item) => getPostBoardColumn(item), []);
  const room = useMemo(() => roomKey(selectedSite), [selectedSite]);

  const boardProps = {
    boardId: `posts-${room}`,
    brand: "Post Board",
    subtitle:
      "Drag to change status · drop onto Published to go live now (schedule is ignored). Double-click to preview and edit.",
    columns: POST_BOARD_COLUMNS,
    autoMoves: POST_AUTO_MOVES,
    items,
    getColumn,
    loading,
    error,
    siteLabel: selectedSite || "All Meta / site accounts",
    itemKind: "post",
  };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <BoardErrorBoundary
        fallback={() => (
          <KanbanBoard
            {...boardProps}
            playhtml={false}
            liveConnected={false}
            onMoveToColumn={onMoveToColumn}
            onItemSaved={onItemSaved}
          />
        )}
      >
        <PlayBoardShell room={room}>
          <BoardLiveBody
            room={room}
            boardProps={boardProps}
            refreshSilent={refreshSilent}
            onMoveToColumn={onMoveToColumn}
            onItemSaved={onItemSaved}
          />
        </PlayBoardShell>
      </BoardErrorBoundary>
    </div>
  );
}
