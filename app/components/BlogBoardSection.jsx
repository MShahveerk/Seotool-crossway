"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PlayBoardShell from "./board/PlayBoardShell";
import BoardErrorBoundary from "./board/BoardErrorBoundary";
import BoardLiveBody from "./board/BoardLiveBody";
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

function mapBlogs(blogs) {
  return (blogs || [])
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
    });
}

export default function BlogBoardSection({
  selectedSite = "",
  focusItemId = "",
  onClearFocus,
  onFocusItem,
}) {
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
      const res = await fetch(`/api/admin/blogs${query}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load blogs");
      setItems(mapBlogs(data.blogs));
      if (!silent) setError("");
    } catch (err) {
      if (!silent) {
        setError(err.message || "Failed to load blogs");
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
    window.addEventListener("blogs:admin-refresh", onRefresh);
    window.addEventListener("blogs:user-updated", onRefresh);
    return () => {
      window.removeEventListener("blogs:admin-refresh", onRefresh);
      window.removeEventListener("blogs:user-updated", onRefresh);
    };
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
    window.dispatchEvent(new CustomEvent("blogs:admin-refresh"));
    window.dispatchEvent(new CustomEvent("blogs:user-updated"));
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
    window.dispatchEvent(new CustomEvent("blogs:admin-refresh"));
    window.dispatchEvent(new CustomEvent("blogs:user-updated"));
  }, []);

  const getColumn = useCallback((item) => getBlogBoardColumn(item), []);
  const room = useMemo(() => roomKey(selectedSite), [selectedSite]);

  const boardProps = {
    boardId: `blogs-${room}`,
    brand: "Blog Board",
    subtitle:
      "Drag to change status · double-click to preview & edit. Draft → Pending sends approval emails. Live sync across open boards.",
    columns: BLOG_BOARD_COLUMNS,
    autoMoves: BLOG_AUTO_MOVES,
    items,
    getColumn,
    loading,
    error,
    siteLabel: selectedSite || "All sites",
    itemKind: "blog",
    focusItemId,
    onClearFocus,
    onFocusItem,
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
