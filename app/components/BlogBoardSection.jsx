"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PlayBoardShell from "./board/PlayBoardShell";
import BoardErrorBoundary from "./board/BoardErrorBoundary";
import KanbanBoard from "./board/KanbanBoard";
import {
  BLOG_AUTO_MOVES,
  BLOG_BOARD_COLUMNS,
  getBlogBoardColumn,
} from "@/lib/boardMeta";

function roomKey(site) {
  const raw = String(site || "all").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80);
  return `crossway-blog-board-${raw}`;
}

export default function BlogBoardSection({ selectedSite = "" }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = selectedSite ? `?site=${encodeURIComponent(selectedSite)}` : "";
      const res = await fetch(`/api/admin/blogs${query}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load blogs");
      setItems(
        (data.blogs || [])
          .filter((b) => b.status !== "deleted")
          .map((b) => ({
            ...b,
            displayTitle: b.title,
            imagePath: b.featuredImagePath || b.featuredImageUrl || "",
          }))
      );
    } catch (err) {
      setError(err.message || "Failed to load blogs");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [selectedSite]);

  useEffect(() => {
    load();
    const poll = window.setInterval(load, 60_000);
    return () => window.clearInterval(poll);
  }, [load]);

  const onMoveToColumn = useCallback(async (item, toColumn) => {
    const res = await fetch(`/api/admin/board/blogs/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ column: toColumn }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not move blog");
    setItems((prev) =>
      prev.map((row) => (row.id === item.id ? { ...row, ...data.blog } : row))
    );
  }, []);

  const getColumn = useCallback((item) => getBlogBoardColumn(item), []);
  const room = useMemo(() => roomKey(selectedSite), [selectedSite]);

  const boardProps = {
    boardId: `blogs-${room}`,
    brand: "Blog Board",
    subtitle:
      "Trello-style blog pipeline. Drag to change status — except Published, which stays locked. Arrows mark scheduled auto-publishes.",
    columns: BLOG_BOARD_COLUMNS,
    autoMoves: BLOG_AUTO_MOVES,
    items,
    getColumn,
    onMoveToColumn,
    loading,
    error,
    siteLabel: selectedSite || "All sites",
  };

  return (
    <BoardErrorBoundary fallback={() => <KanbanBoard {...boardProps} playhtml={false} />}>
      <PlayBoardShell room={room}>
        <KanbanBoard {...boardProps} playhtml />
      </PlayBoardShell>
    </BoardErrorBoundary>
  );
}
