"use client";

import { useEffect, useMemo, useState } from "react";
import { FiCheck, FiClock, FiImage, FiRefreshCw, FiX } from "react-icons/fi";
import { formatScheduleShort } from "../../lib/timezone";

function statusChip(status) {
  const map = {
    draft: "bg-slate-100 text-slate-700",
    future: "bg-sky-50 text-sky-900",
    pending: "bg-amber-50 text-amber-900",
    publish: "bg-emerald-50 text-emerald-900",
    private: "bg-violet-50 text-violet-900",
    trash: "bg-red-50 text-red-800",
  };
  return map[status] || "bg-slate-100 text-slate-700";
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Modal to preview WordPress posts and choose which ones to pull into Crossway.
 */
export default function WordpressPullChooser({
  open,
  siteLink,
  onlyScheduled = false,
  includeTrash = false,
  onClose,
  onPulled,
}) {
  const [loading, setLoading] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [previewId, setPreviewId] = useState(null);
  const [hideInQueue, setHideInQueue] = useState(false);

  const load = async () => {
    if (!siteLink) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/wordpress/pull/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteLink,
          onlyScheduled,
          statuses: includeTrash
            ? ["draft", "future", "pending", "trash"]
            : ["draft", "future", "pending"],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to list WordPress posts");
      const list = data.candidates || [];
      setCandidates(list);
      setSelected(new Set(list.filter((c) => !c.alreadyInQueue).map((c) => c.externalId)));
      setPreviewId(list[0]?.externalId || null);
    } catch (err) {
      setError(err.message);
      setCandidates([]);
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    load();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape" && !pulling) onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, siteLink, onlyScheduled, includeTrash]);

  const visible = useMemo(() => {
    if (!hideInQueue) return candidates;
    return candidates.filter((c) => !c.alreadyInQueue);
  }, [candidates, hideInQueue]);

  const preview = useMemo(
    () => visible.find((c) => c.externalId === previewId) || visible[0] || null,
    [visible, previewId]
  );

  const allVisibleSelected =
    visible.length > 0 && visible.every((c) => selected.has(c.externalId));

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visible.forEach((c) => next.delete(c.externalId));
      } else {
        visible.forEach((c) => next.add(c.externalId));
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Pull failed");
      onPulled?.(data);
      onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setPulling(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wp-pull-chooser-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pulling) onClose?.();
      }}
    >
      <div className="flex h-[100dvh] w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl sm:h-[min(90vh,820px)] sm:rounded-2xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              WordPress pull
            </p>
            <h2 id="wp-pull-chooser-title" className="text-lg font-semibold text-slate-900">
              Choose blogs to import
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {siteLink}
              {onlyScheduled ? " · scheduled only" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={load}
              disabled={loading || pulling}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
            >
              <FiRefreshCw className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={pulling}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              aria-label="Close"
            >
              <FiX className="h-4 w-4" />
            </button>
          </div>
        </header>

        {error ? (
          <p className="shrink-0 border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700 sm:px-5">
            {error}
          </p>
        ) : null}

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 sm:px-5">
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={hideInQueue}
              onChange={(e) => setHideInQueue(e.target.checked)}
            />
            Hide already in Crossway
          </label>
          <p className="text-xs text-slate-500">
            {selected.size} selected · {visible.length} shown
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Loading pullable blogs from WordPress…
            </div>
          ) : visible.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-slate-500">
              <p>No pullable blogs found for this filter.</p>
              <p className="text-xs">Check credentials, statuses, or try including trash.</p>
            </div>
          ) : (
            <div className="grid h-full min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="min-h-0 overflow-y-auto border-b border-slate-200 lg:border-b-0 lg:border-r">
                <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-100 bg-white/95 px-3 py-2 backdrop-blur">
                  <button
                    type="button"
                    onClick={toggleAllVisible}
                    className="text-xs font-semibold text-[#167a2a] hover:underline"
                  >
                    {allVisibleSelected ? "Deselect all" : "Select all shown"}
                  </button>
                </div>
                <ul className="divide-y divide-slate-100">
                  {visible.map((c) => {
                    const active = preview?.externalId === c.externalId;
                    const checked = selected.has(c.externalId);
                    return (
                      <li key={c.externalId}>
                        <div
                          className={`flex items-start gap-3 px-3 py-3 transition ${
                            active ? "bg-emerald-50/60" : "hover:bg-slate-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={checked}
                            onChange={() => toggle(c.externalId)}
                            aria-label={`Select ${c.title}`}
                          />
                          <button
                            type="button"
                            onClick={() => setPreviewId(c.externalId)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {c.title || `Post #${c.externalId}`}
                              </p>
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusChip(c.status)}`}
                              >
                                {c.status}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
                              <span>WP #{c.externalId}</span>
                              {c.isScheduled && c.scheduledFor ? (
                                <span className="inline-flex items-center gap-1 text-sky-800">
                                  <FiClock /> {formatScheduleShort(c.scheduledFor)}
                                </span>
                              ) : null}
                              {c.alreadyInQueue ? (
                                <span className="text-amber-800">
                                  In queue{c.crosswayStatus ? ` (${c.crosswayStatus})` : ""}
                                </span>
                              ) : (
                                <span className="text-emerald-700">New</span>
                              )}
                            </div>
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <aside className="min-h-0 overflow-y-auto bg-[linear-gradient(180deg,#f8faf8_0%,#f1f5f2_100%)]">
                {preview ? (
                  <article className="space-y-3 px-5 py-5">
                    <div className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
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
                        <div className="flex aspect-[16/9] items-center justify-center gap-2 text-sm text-slate-400">
                          <FiImage /> No featured image
                        </div>
                      )}
                    </div>
                    <h3 className="text-xl font-semibold text-slate-900">
                      {preview.title || `Post #${preview.externalId}`}
                    </h3>
                    {preview.excerpt ? (
                      <p className="text-sm leading-relaxed text-slate-600">
                        {stripHtml(preview.excerpt)}
                      </p>
                    ) : (
                      <p className="text-sm italic text-slate-400">No excerpt provided.</p>
                    )}
                    <dl className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <dt className="font-semibold uppercase tracking-wide text-slate-400">
                          WP status
                        </dt>
                        <dd className="mt-0.5 text-slate-800">{preview.status}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold uppercase tracking-wide text-slate-400">
                          Schedule
                        </dt>
                        <dd className="mt-0.5 text-slate-800">
                          {preview.scheduledFor
                            ? formatScheduleShort(preview.scheduledFor)
                            : "Unscheduled"}
                        </dd>
                      </div>
                      {preview.link ? (
                        <div className="col-span-2">
                          <dt className="font-semibold uppercase tracking-wide text-slate-400">
                            Link
                          </dt>
                          <dd className="mt-0.5 truncate">
                            <a
                              href={preview.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#167a2a] underline"
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
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 sm:px-5">
          <p className="text-xs text-slate-500">
            Selected posts import (or refresh) into the Crossway approval queue.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pulling}
              className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={pullSelected}
              disabled={pulling || selected.size === 0 || loading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#1d9c35] px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <FiCheck /> {pulling ? "Pulling…" : `Pull ${selected.size || ""} selected`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
