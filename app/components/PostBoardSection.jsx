"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PlayBoardShell from "./board/PlayBoardShell";
import BoardErrorBoundary from "./board/BoardErrorBoundary";
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

export default function PostBoardSection({ selectedSite = "" }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = selectedSite ? `?site=${encodeURIComponent(selectedSite)}` : "";
      const res = await fetch(`/api/admin/approvals${query}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load posts");
      setItems(
        (data.approvals || []).map((a) => ({
          ...a,
          displayTitle: a.userEditedTitle || a.title,
          imagePath: a.imagePath || a.mediaPath || "",
        }))
      );
    } catch (err) {
      setError(err.message || "Failed to load posts");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [selectedSite]);

  useEffect(() => {
    load();
    const onRefresh = () => load();
    window.addEventListener("approvals:admin-refresh", onRefresh);
    window.addEventListener("approvals:user-updated", onRefresh);
    const poll = window.setInterval(load, 60_000);
    return () => {
      window.removeEventListener("approvals:admin-refresh", onRefresh);
      window.removeEventListener("approvals:user-updated", onRefresh);
      window.clearInterval(poll);
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
  }, []);

  const getColumn = useCallback((item) => getPostBoardColumn(item), []);
  const room = useMemo(() => roomKey(selectedSite), [selectedSite]);

  const boardProps = {
    boardId: `posts-${room}`,
    brand: "Post Board",
    subtitle:
      "Drag cards across statuses. Published is locked. Soft arrows show automatic pipeline moves and when they fire.",
    columns: POST_BOARD_COLUMNS,
    autoMoves: POST_AUTO_MOVES,
    items,
    getColumn,
    onMoveToColumn,
    loading,
    error,
    siteLabel: selectedSite || "All Meta / site accounts",
  };

  return (
    <BoardErrorBoundary fallback={() => <KanbanBoard {...boardProps} playhtml={false} />}>
      <PlayBoardShell room={room}>
        <KanbanBoard {...boardProps} playhtml />
      </PlayBoardShell>
    </BoardErrorBoundary>
  );
}
