"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FiChevronDown,
  FiCheck,
  FiRefreshCw,
  FiList,
  FiX,
} from "react-icons/fi";

function issueLabel(type) {
  const map = {
    noindex: "Noindex",
    robots_blocked: "Robots.txt",
    soft_404: "Soft 404",
    not_found: "Not found",
    server_error: "Server error",
    redirect: "Redirect",
    canonical_duplicate: "Canonical / duplicate",
    discovered_not_indexed: "Discovered (not indexed)",
    crawled_not_indexed: "Crawled (not indexed)",
    access_blocked: "Access blocked",
    http_blocked: "HTTP blocked",
    sitemap_issue: "Sitemap",
    generic_not_indexed: "Not indexed",
  };
  return map[type] || type || "Not indexed";
}

function TaskCard({ task, onStatus }) {
  const [open, setOpen] = useState(false);
  const steps = Array.isArray(task.steps) ? task.steps : [];

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50/80"
        aria-expanded={open}
      >
        <FiChevronDown
          className={`w-4 h-4 mt-1 shrink-0 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border border-red-200 bg-red-50 text-red-800">
              {issueLabel(task.issueType)}
            </span>
            {task.coverageState ? (
              <span className="text-[11px] text-gray-500 truncate max-w-[240px]">{task.coverageState}</span>
            ) : null}
          </div>
          <p className="text-sm font-semibold text-gray-900">{task.title}</p>
          <p className="text-xs text-gray-500 mt-1 break-all">{task.pageUrl}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            title="Mark done"
            onClick={() => onStatus(task.id, "done")}
            className="p-2 rounded-lg text-[#1d9c35] hover:bg-emerald-50"
          >
            <FiCheck className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Dismiss"
            onClick={() => onStatus(task.id, "dismissed")}
            className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>
      </button>

      {open ? (
        <div className="border-t border-gray-100 px-4 py-4 bg-gray-50/50">
          {task.summary ? (
            <p className="text-sm text-gray-700 mb-4 leading-relaxed">{task.summary}</p>
          ) : null}
          {task.cause ? (
            <p className="text-xs text-gray-500 mb-4">
              <span className="font-semibold text-gray-600">Google signal: </span>
              {task.cause}
            </p>
          ) : null}

          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
            Step-by-step fix ({steps.length} steps)
          </p>
          <ol className="space-y-3">
            {steps.map((s, i) => (
              <li key={`${task.id}-step-${i}`} className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-sm font-semibold text-gray-900">
                  <span className="text-[#1d9c35] mr-2">{i + 1}.</span>
                  {s.title}
                </p>
                <p className="mt-1.5 text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{s.detail}</p>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="px-4 pb-3 pl-11">
          <p className="text-xs text-gray-400">
            Expand for {steps.length} detailed steps
          </p>
        </div>
      )}
    </div>
  );
}

export default function IndexingTasksPanel({ selectedSite = "" }) {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState("open");

  const load = useCallback(async () => {
    if (!selectedSite) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ url: selectedSite, status: filter });
      const res = await fetch(`/api/searchconsole/indexing-tasks?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load tasks");
      setTasks(data.tasks || []);
    } catch (e) {
      setError(e.message || "Failed to load tasks");
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [selectedSite, filter]);

  useEffect(() => {
    load();
  }, [load]);

  const syncFromLatest = async () => {
    setSyncing(true);
    setError("");
    try {
      const res = await fetch("/api/searchconsole/indexing-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: selectedSite, syncFromLatest: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setFilter("open");
      setTasks(data.tasks || []);
    } catch (e) {
      setError(e.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const onStatus = async (id, status) => {
    try {
      const res = await fetch(`/api/searchconsole/indexing-tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      await load();
    } catch (e) {
      setError(e.message || "Update failed");
    }
  };

  return (
    <section className="mt-8 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FiList className="w-5 h-5 text-[#1d9c35]" />
            <h2 className="text-lg font-bold text-gray-900">Indexing tasks</h2>
          </div>
          <p className="text-xs text-gray-500 mt-1 max-w-2xl">
            Auto-created from not-indexed pages after each daily inspection. Expand a task for a full
            step-by-step fix guide.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
          >
            <option value="open">Open</option>
            <option value="done">Done</option>
            <option value="dismissed">Dismissed</option>
            <option value="all">All</option>
          </select>
          <button
            type="button"
            onClick={syncFromLatest}
            disabled={syncing || !selectedSite}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <FiRefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            Sync from latest run
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <p className="text-sm text-gray-500 py-8 text-center">Loading indexing tasks…</p>
      ) : tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-gray-500">
          No {filter === "all" ? "" : filter} indexing tasks yet. After a daily inspection finds not-indexed
          URLs, tasks appear here automatically — or click <strong>Sync from latest run</strong>.
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} onStatus={onStatus} />
          ))}
        </div>
      )}
    </section>
  );
}
