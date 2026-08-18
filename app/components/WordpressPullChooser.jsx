"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiCheck, FiClock, FiImage, FiLoader, FiRefreshCw, FiX } from "react-icons/fi";
import { formatScheduleShort } from "../../lib/timezone";

function statusChip(status) {
  const map = {
    draft: "bg-[var(--cw-raised)] text-[var(--cw-ink-dim)]",
    future: "bg-[color-mix(in_srgb,var(--cw-info)_14%,var(--cw-surface))] text-[var(--cw-info)]",
    pending: "bg-[color-mix(in_srgb,var(--cw-caution)_14%,var(--cw-surface))] text-[var(--cw-caution)]",
    publish: "bg-[color-mix(in_srgb,var(--cw-neon)_14%,var(--cw-surface))] text-[var(--cw-neon)]",
    private: "bg-[var(--cw-overlay)] text-[var(--cw-ink)]",
    trash: "bg-[color-mix(in_srgb,var(--cw-danger)_14%,var(--cw-surface))] text-[var(--cw-danger)]",
  };
  return map[status] || "bg-[var(--cw-raised)] text-[var(--cw-ink-dim)]";
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Modal to preview WordPress posts and choose which ones to pull into Crossway.
 * Always portaled to document.body so it is never clipped by parent layouts.
 */
export default function WordpressPullChooser({
  open,
  siteLink,
  onlyScheduled = false,
  includeTrash = false,
  onClose,
  onPulled,
}) {
  const [portalReady, setPortalReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [meta, setMeta] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [previewId, setPreviewId] = useState(null);
  const [hideInQueue, setHideInQueue] = useState(false);
  const [loadStartedAt, setLoadStartedAt] = useState(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const abortRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const load = useCallback(async () => {
    if (!siteLink) {
      setError("Select a site first.");
      setLoading(false);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;

    setLoading(true);
    setLoadStartedAt(Date.now());
    setElapsedSec(0);
    setError("");
    setMeta(null);

    try {
      const res = await fetch("/api/admin/wordpress/pull/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          siteLink,
          onlyScheduled,
          statuses: includeTrash
            ? ["draft", "future", "pending", "trash"]
            : ["draft", "future", "pending"],
        }),
      });

      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (requestId !== requestIdRef.current) return;
      if (!res.ok) throw new Error(data.error || `Failed to list WordPress posts (${res.status})`);

      const list = Array.isArray(data.candidates) ? data.candidates : [];
      setCandidates(list);
      setMeta({
        total: data.total ?? list.length,
        statusCounts: data.statusCounts || {},
        statuses: data.statuses || [],
        siteTimezone: data.siteTimezone || null,
        diagnosis: data.diagnosis || null,
      });
      setSelected(new Set(list.filter((c) => !c.alreadyInQueue).map((c) => String(c.externalId))));
      setPreviewId(list[0] ? String(list[0].externalId) : null);
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (requestId !== requestIdRef.current) return;
      setError(err.message || "Failed to load WordPress posts.");
      setCandidates([]);
      setSelected(new Set());
      setPreviewId(null);
      setMeta(null);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setLoadStartedAt(null);
      }
    }
  }, [siteLink, onlyScheduled, includeTrash]);

  const pullingRef = useRef(pulling);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    pullingRef.current = pulling;
  }, [pulling]);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      if (abortRef.current) abortRef.current.abort();
      return undefined;
    }

    setCandidates([]);
    setSelected(new Set());
    setPreviewId(null);
    setError("");
    setMeta(null);
    load();

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape" && !pullingRef.current) onCloseRef.current?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [open, load]);

  useEffect(() => {
    if (!loading || !loadStartedAt) return undefined;
    const tick = () => setElapsedSec(Math.floor((Date.now() - loadStartedAt) / 1000));
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [loading, loadStartedAt]);

  const visible = useMemo(() => {
    if (!hideInQueue) return candidates;
    return candidates.filter((c) => !c.alreadyInQueue);
  }, [candidates, hideInQueue]);

  const preview = useMemo(() => {
    if (!visible.length) return null;
    return visible.find((c) => String(c.externalId) === String(previewId)) || visible[0];
  }, [visible, previewId]);

  const allVisibleSelected =
    visible.length > 0 && visible.every((c) => selected.has(String(c.externalId)));

  const toggle = (id) => {
    const key = String(id);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visible.forEach((c) => next.delete(String(c.externalId)));
      } else {
        visible.forEach((c) => next.add(String(c.externalId)));
      }
      return next;
    });
  };

  const pullSelected = async () => {
    const ids = [...selected];
    if (!ids.length) {
      setError("Select at least one blog to pull.");
      return;
    }
    setPulling(true);
    setError("");
    try {
      const res = await fetch("/api/admin/wordpress/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteLink,
          wordpressPostIds: ids,
          includeTrash,
        }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      if (!res.ok) throw new Error(data.error || "Pull failed");
      onPulled?.(data);
      onClose?.();
    } catch (err) {
      setError(err.message || "Pull failed");
    } finally {
      setPulling(false);
    }
  };

  if (!open || !portalReady) return null;

  const statusSummary = meta?.statusCounts
    ? Object.entries(meta.statusCounts)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · ")
    : "";

  const modal = (
    <div
      className="fixed inset-0 z-[220] flex items-end justify-center bg-black/70 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wp-pull-chooser-title"
      aria-busy={loading || pulling}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pulling && !loading) onClose?.();
      }}
    >
      <div className="flex h-[100dvh] w-full max-w-5xl flex-col overflow-hidden bg-[var(--cw-surface)] shadow-2xl sm:h-[min(90vh,840px)] sm:rounded-2xl sm:ring-1 sm:ring-[var(--cw-hairline)]">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--cw-hairline)] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--cw-ink-faint)]">
              WordPress pull
            </p>
            <h2 id="wp-pull-chooser-title" className="text-lg font-semibold text-[var(--cw-ink)]">
              Choose blogs to import
            </h2>
            <p className="mt-0.5 truncate text-xs text-[var(--cw-ink-muted)]">
              {siteLink || "No site selected"}
              {onlyScheduled ? " · scheduled only" : ""}
              {includeTrash ? " · including trash" : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={load}
              disabled={loading || pulling}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--cw-hairline)] px-2.5 py-1.5 text-xs font-semibold text-[var(--cw-ink-dim)] disabled:opacity-50"
            >
              <FiRefreshCw className={loading ? "animate-spin" : ""} />
              {loading ? "Loading…" : "Refresh"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={pulling}
              className="rounded-lg border border-[var(--cw-hairline)] p-2 text-[var(--cw-ink-muted)] hover:bg-[var(--cw-overlay)] disabled:opacity-50"
              aria-label="Close"
            >
              <FiX className="h-4 w-4" />
            </button>
          </div>
        </header>

        {error ? (
          <div className="shrink-0 border-b border-[color-mix(in_srgb,var(--cw-danger)_35%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-danger)_10%,var(--cw-surface))] px-4 py-3 sm:px-5">
            <p className="text-sm font-medium text-[var(--cw-danger)]">{error}</p>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="mt-2 text-xs font-semibold text-[var(--cw-danger)] underline disabled:opacity-50"
            >
              Try again
            </button>
          </div>
        ) : null}

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--cw-hairline)] px-4 py-2.5 sm:px-5">
          <label className="inline-flex items-center gap-2 text-xs font-medium text-[var(--cw-ink-muted)]">
            <input
              type="checkbox"
              checked={hideInQueue}
              onChange={(e) => setHideInQueue(e.target.checked)}
              disabled={loading}
            />
            Hide already in Crossway
          </label>
          <p className="text-xs text-[var(--cw-ink-muted)]">
            {loading
              ? "Fetching from WordPress…"
              : `${selected.size} selected · ${visible.length} shown${meta?.total != null ? ` · ${meta.total} found` : ""}`}
          </p>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-[var(--cw-canvas)]">
          {loading ? (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-4 px-6 text-center">
              <div className="relative flex h-14 w-14 items-center justify-center">
                <span className="absolute inset-0 rounded-full border-2 border-[color-mix(in_srgb,var(--cw-neon)_35%,var(--cw-hairline))]" />
                <FiLoader className="h-7 w-7 animate-spin text-[var(--cw-neon)]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--cw-ink-dim)]">
                  Loading pullable blogs from WordPress…
                </p>
                <p className="mt-1 text-xs text-[var(--cw-ink-muted)]">
                  This can take a few seconds while we fetch drafts
                  {onlyScheduled ? " and scheduled posts" : ", future, and pending posts"}.
                  {elapsedSec > 0 ? ` (${elapsedSec}s)` : ""}
                </p>
                {elapsedSec >= 8 ? (
                  <p className="mt-2 text-xs text-[var(--cw-caution)]">
                    Still working — large sites or slow WordPress hosts can take longer.
                  </p>
                ) : null}
              </div>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--cw-raised)] text-[var(--cw-ink-faint)]">
                <FiImage className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--cw-ink-dim)]">No pullable blogs found</p>
                <p className="mt-1 max-w-md text-xs leading-relaxed text-[var(--cw-ink-muted)]">
                  {meta?.diagnosis ||
                    "Nothing matched this filter. Confirm WordPress credentials are saved, try Include trash, or use Pull by post ID."}
                </p>
                {statusSummary ? (
                  <p className="mt-2 text-xs text-[var(--cw-ink-muted)]">WP returned — {statusSummary}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={load}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] px-3 py-2 text-xs font-semibold text-[var(--cw-ink-dim)]"
              >
                <FiRefreshCw /> Refresh list
              </button>
            </div>
          ) : (
            <div className="grid h-full min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="min-h-0 overflow-y-auto border-b border-[var(--cw-hairline)] bg-[var(--cw-surface)] lg:border-b-0 lg:border-r">
                <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-[var(--cw-hairline)] bg-[var(--cw-surface)] px-3 py-2 backdrop-blur">
                  <button
                    type="button"
                    onClick={toggleAllVisible}
                    className="text-xs font-semibold text-[var(--cw-neon)] hover:underline"
                  >
                    {allVisibleSelected ? "Deselect all" : "Select all shown"}
                  </button>
                  {statusSummary ? (
                    <span className="truncate text-[11px] text-[var(--cw-ink-faint)]">{statusSummary}</span>
                  ) : null}
                </div>
                <ul className="divide-y divide-[var(--cw-hairline)]">
                  {visible.map((c) => {
                    const id = String(c.externalId);
                    const active = String(preview?.externalId) === id;
                    const checked = selected.has(id);
                    return (
                      <li key={id}>
                        <div
                          className={`flex items-start gap-3 px-3 py-3 transition ${
                            active
                              ? "bg-[color-mix(in_srgb,var(--cw-neon)_9%,var(--cw-surface))]"
                              : "hover:bg-[var(--cw-overlay)]"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={checked}
                            onChange={() => toggle(id)}
                            aria-label={`Select ${c.title || id}`}
                          />
                          <button
                            type="button"
                            onClick={() => setPreviewId(id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="truncate text-sm font-semibold text-[var(--cw-ink)]">
                                {c.title || `Post #${id}`}
                              </p>
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusChip(c.status)}`}
                              >
                                {c.status}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-[var(--cw-ink-muted)]">
                              <span>WP #{id}</span>
                              {c.isScheduled && c.scheduledFor ? (
                                <span className="inline-flex items-center gap-1 text-[var(--cw-info)]">
                                  <FiClock /> {formatScheduleShort(c.scheduledFor)}
                                </span>
                              ) : null}
                              {c.alreadyInQueue ? (
                                <span className="text-[var(--cw-caution)]">
                                  In queue{c.crosswayStatus ? ` (${c.crosswayStatus})` : ""}
                                </span>
                              ) : (
                                <span className="text-[var(--cw-neon)]">New</span>
                              )}
                            </div>
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <aside className="min-h-0 overflow-y-auto bg-[var(--cw-canvas)]">
                {preview ? (
                  <article className="space-y-3 px-5 py-5">
                    <div className="overflow-hidden rounded-xl bg-[var(--cw-surface)] ring-1 ring-[var(--cw-hairline)]">
                      {preview.featuredImageUrl ? (
                        <img
                          src={preview.featuredImageUrl}
                          alt=""
                          className="aspect-[16/9] w-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="flex aspect-[16/9] items-center justify-center gap-2 text-sm text-[var(--cw-ink-faint)]">
                          <FiImage /> No featured image
                        </div>
                      )}
                    </div>
                    <h3 className="text-xl font-semibold text-[var(--cw-ink)]">
                      {preview.title || `Post #${preview.externalId}`}
                    </h3>
                    {preview.excerpt ? (
                      <p className="text-sm leading-relaxed text-[var(--cw-ink-dim)]">
                        {stripHtml(preview.excerpt)}
                      </p>
                    ) : (
                      <p className="text-sm italic text-[var(--cw-ink-faint)]">No excerpt provided.</p>
                    )}
                    <dl className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <dt className="font-semibold uppercase tracking-wide text-[var(--cw-ink-faint)]">
                          WP status
                        </dt>
                        <dd className="mt-0.5 text-[var(--cw-ink-dim)]">{preview.status}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold uppercase tracking-wide text-[var(--cw-ink-faint)]">
                          Schedule
                        </dt>
                        <dd className="mt-0.5 text-[var(--cw-ink-dim)]">
                          {preview.scheduledFor
                            ? formatScheduleShort(preview.scheduledFor)
                            : "Unscheduled"}
                        </dd>
                      </div>
                      {preview.link ? (
                        <div className="col-span-2">
                          <dt className="font-semibold uppercase tracking-wide text-[var(--cw-ink-faint)]">
                            Link
                          </dt>
                          <dd className="mt-0.5 truncate">
                            <a
                              href={preview.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[var(--cw-neon)] underline"
                            >
                              {preview.link}
                            </a>
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </article>
                ) : null}
              </aside>
            </div>
          )}

          {pulling ? (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[color-mix(in_srgb,var(--cw-canvas)_80%,transparent)] backdrop-blur-[1px]">
              <FiLoader className="h-8 w-8 animate-spin text-[var(--cw-neon)]" />
              <p className="text-sm font-semibold text-[var(--cw-ink-dim)]">
                Pulling {selected.size} blog{selected.size === 1 ? "" : "s"} into Crossway…
              </p>
            </div>
          ) : null}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--cw-hairline)] bg-[var(--cw-surface)] px-4 py-3 sm:px-5">
          <p className="text-xs text-[var(--cw-ink-muted)]">
            Selected posts import (or refresh) into the Crossway approval queue.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pulling}
              className="rounded-xl border border-[var(--cw-hairline)] px-3.5 py-2 text-sm font-semibold text-[var(--cw-ink-dim)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={pullSelected}
              disabled={pulling || selected.size === 0 || loading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--cw-neon)] px-3.5 py-2 text-sm font-semibold text-[var(--cw-neon-ink)] hover:bg-[var(--cw-neon-deep)] disabled:opacity-50"
            >
              {pulling ? (
                <>
                  <FiLoader className="animate-spin" /> Pulling…
                </>
              ) : (
                <>
                  <FiCheck /> Pull {selected.size || 0} selected
                </>
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
