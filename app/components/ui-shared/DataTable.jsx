"use client";

/**
 * DataTable — the app's one table.
 *
 * Everything that made ~25 hand-rolled tables feel like different products is
 * decided here once: header treatment, row hairlines, hover, sort affordance,
 * numeric alignment, sticky header, and what "loading" and "empty" look like.
 *
 *   <DataTable
 *     columns={[
 *       { key: "keyword", label: "Keyword", grow: true },
 *       { key: "volume", label: "Volume", numeric: true, sortable: true },
 *       { key: "kd", label: "KD", numeric: true, render: (row) => <KdChip v={row.kd} /> },
 *     ]}
 *     rows={rows}
 *     defaultSort={{ key: "volume", dir: "desc" }}
 *     onRowClick={(row) => open(row)}
 *   />
 *
 * Column options:
 *   key        data key (also the sort key unless `sortKey` is given)
 *   label      header text
 *   render     (row, index) => node   — cell contents; defaults to row[key]
 *   numeric    right-aligns and uses tabular figures
 *   sortable   adds a sort affordance (numeric columns default to sortable)
 *   sortKey    override the value used for sorting
 *   sortValue  (row) => comparable    — full control over sorting
 *   align      "left" | "center" | "right"  (overrides `numeric`)
 *   width      CSS width for the column
 *   grow       let this column absorb spare width
 *   className  extra classes on the cell
 *   headerHint title attribute on the header
 */

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

const DENSITY = {
  comfortable: { head: "px-3.5 py-2.5", cell: "px-3.5 py-2.5 text-[13px]" },
  compact: { head: "px-3 py-1.5", cell: "px-3 py-1.5 text-xs" },
};

function defaultSortValue(row, col) {
  if (col.sortValue) return col.sortValue(row);
  return row?.[col.sortKey || col.key];
}

function compare(a, b) {
  const aNil = a == null || a === "";
  const bNil = b == null || b === "";
  if (aNil && bNil) return 0;
  if (aNil) return 1; // blanks always sink, in both directions
  if (bNil) return -1;

  const an = typeof a === "number" ? a : Number(String(a).replace(/[$,%\s]/g, ""));
  const bn = typeof b === "number" ? b : Number(String(b).replace(/[$,%\s]/g, ""));
  if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;

  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

export default function DataTable({
  columns = [],
  rows = [],
  getRowKey,
  onRowClick,
  rowClassName,
  defaultSort = null,
  sort: controlledSort,
  onSortChange,
  density = "comfortable",
  stickyHeader = true,
  maxHeight,
  loading = false,
  loadingRows = 6,
  emptyIcon: EmptyIcon = Inbox,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  footer,
  className = "",
  ariaLabel,
}) {
  const [innerSort, setInnerSort] = useState(defaultSort);
  const sort = controlledSort !== undefined ? controlledSort : innerSort;
  const d = DENSITY[density] || DENSITY.comfortable;

  const setSort = (next) => {
    if (onSortChange) onSortChange(next);
    if (controlledSort === undefined) setInnerSort(next);
  };

  const toggleSort = (col) => {
    const key = col.sortKey || col.key;
    if (sort?.key === key) {
      setSort({ key, dir: sort.dir === "asc" ? "desc" : "asc" });
    } else {
      // Numbers are almost always most-interesting-first.
      setSort({ key, dir: col.numeric ? "desc" : "asc" });
    }
  };

  const sorted = useMemo(() => {
    if (!sort?.key) return rows;
    const col = columns.find((c) => (c.sortKey || c.key) === sort.key);
    if (!col) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort(
      (a, b) => compare(defaultSortValue(a, col), defaultSortValue(b, col)) * dir
    );
  }, [rows, sort, columns]);

  const alignOf = (col) =>
    col.align || (col.numeric ? "right" : "left");

  const alignClass = (col) => {
    const a = alignOf(col);
    return a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";
  };

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)]",
        className
      )}
    >
      <div
        className="overflow-auto"
        style={maxHeight ? { maxHeight } : undefined}
      >
        <table className="w-full border-collapse" aria-label={ariaLabel}>
          <thead className={cn(stickyHeader && "sticky top-0 z-10")}>
            <tr>
              {columns.map((col) => {
                const key = col.sortKey || col.key;
                const sortable = col.sortable ?? Boolean(col.numeric);
                const active = sort?.key === key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    title={col.headerHint}
                    style={col.width ? { width: col.width } : undefined}
                    className={cn(
                      "border-b border-[var(--cw-hairline)] bg-[var(--cw-raised)]",
                      "text-[10px] font-bold tracking-[0.1em] whitespace-nowrap uppercase",
                      active ? "text-[var(--cw-neon)]" : "text-[var(--cw-ink-faint)]",
                      d.head,
                      alignClass(col),
                      col.grow && "w-full"
                    )}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col)}
                        className={cn(
                          "transition-smooth inline-flex items-center gap-1 hover:text-[var(--cw-ink)]",
                          alignOf(col) === "right" && "flex-row-reverse"
                        )}
                      >
                        {col.label}
                        {active ? (
                          sort.dir === "asc" ? (
                            <ArrowUp className="size-3" aria-hidden />
                          ) : (
                            <ArrowDown className="size-3" aria-hidden />
                          )
                        ) : (
                          <ChevronsUpDown className="size-3 opacity-40" aria-hidden />
                        )}
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {loading
              ? Array.from({ length: loadingRows }).map((_, i) => (
                  <tr key={`skeleton-${i}`}>
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn("border-t border-[var(--cw-hairline)]", d.cell)}
                      >
                        <span
                          className="shimmer-overlay block h-3 rounded-full bg-[var(--cw-raised)]"
                          style={{ width: col.grow ? "70%" : "48px" }}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              : sorted.map((row, i) => (
                  <tr
                    key={getRowKey ? getRowKey(row, i) : (row?.id ?? i)}
                    onClick={onRowClick ? () => onRowClick(row, i) : undefined}
                    className={cn(
                      "transition-colors duration-150",
                      "hover:bg-[color-mix(in_srgb,var(--cw-ink)_4%,transparent)]",
                      onRowClick && "cursor-pointer",
                      typeof rowClassName === "function" ? rowClassName(row, i) : rowClassName
                    )}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          "border-t border-[var(--cw-hairline)] text-[var(--cw-ink-dim)]",
                          d.cell,
                          alignClass(col),
                          col.numeric && "font-mono tabular-nums",
                          col.className
                        )}
                      >
                        {col.render ? col.render(row, i) : (row?.[col.key] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>

        {!loading && !sorted.length ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <EmptyIcon className="size-7 text-[var(--cw-ink-faint)]" strokeWidth={1.6} aria-hidden />
            <p className="font-heading mt-3 text-sm font-semibold text-[var(--cw-ink)]">
              {emptyTitle}
            </p>
            {emptyDescription ? (
              <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-[var(--cw-ink-muted)]">
                {emptyDescription}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {footer ? (
        <div className="border-t border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3.5 py-2 text-[11px] text-[var(--cw-ink-muted)]">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
