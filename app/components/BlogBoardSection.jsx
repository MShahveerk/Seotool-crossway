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
          .map((b) => {
            const payload = b.payload && typeof b.payload === "object" ? b.payload : {};
            return {
              ...b,
              displayTitle: b.title,
              imagePath:
                b.featuredImagePath ||
                b.featuredImageUrl ||
                payload.featuredImageUrl ||
                payload.featured_image ||
                "",
            };
          })
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
              imagePath:
                updated.featuredImagePath ||
                updated.featuredImageUrl ||
                updated.payload?.featuredImageUrl ||
                row.imagePath ||
                "",
            }
          : row
      )
    );
  }, []);

  const getColumn = useCallback((item) => getBlogBoardColumn(item), []);
  const room = useMemo(() => roomKey(selectedSite), [selectedSite]);

  const boardProps = {
    boardId: `blogs-${room}`,
    brand: "Blog Board",
    subtitle:
      "Drag to change status · double-click to preview & edit. Draft → Pending sends approval emails.",
    columns: BLOG_BOARD_COLUMNS,
    autoMoves: BLOG_AUTO_MOVES,
    items,
    getColumn,
    onMoveToColumn,
    onItemSaved,
    loading,
    error,
    siteLabel: selectedSite || "All sites",
    itemKind: "blog",
  };

  return (
    <BoardErrorBoundary fallback={() => <KanbanBoard {...boardProps} playhtml={false} />}>
      <PlayBoardShell room={room}>
        <KanbanBoard {...boardProps} playhtml />
      </PlayBoardShell>
    </BoardErrorBoundary>
  );
}
