"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiRefreshCw,
  FiSearch,
  FiInbox,
  FiPlay,
  FiCheck,
  FiExternalLink,
  FiZap,
  FiX,
} from "react-icons/fi";
import { Sparkles, Radar, PenLine } from "lucide-react";
import { statusTone } from "@/lib/seoAutopilot/batchGroups";

const COMPETITOR_PREFIX = "competitor:";

function sourceOf(send) {
  return String(send?.runId || "").startsWith(COMPETITOR_PREFIX) ? "competitor" : "autopilot";
}

const SOURCE_META = {
  autopilot: {
    label: "Autopilot",
    icon: Sparkles,
    chip: "bg-violet-50 text-violet-700 border-violet-100",
    dot: "bg-violet-500",
  },
  competitor: {
    label: "SERP",
    icon: Radar,
    chip: "bg-sky-50 text-sky-700 border-sky-100",
    dot: "bg-sky-500",
  },
};

function statusBucket(status) {
  const s = String(status || "").toLowerCase();
  if (s === "queued" || s === "running") return "active";
  if (s === "completed" || s === "sent") return "done";
  return "new";
}

function splitLines(value) {
  return String(value || "")
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function Field({ label, children, wide }) {
  if (!children) return null;
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{children}</div>
    </div>
  );
}

/**
 * One inbox for every content idea — Autopilot Writer seeds and SERP-analysis
 * seeds together, with source + status filters, multi-select, and a bulk
 * "write these" action. Replaces the two look-alike seed tabs.
 */
export default function ContentInbox({ siteLink, highlightRunId = "", onRan }) {
  const [sends, setSends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [bulkRunning, setBulkRunning] = useState(false);

  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState(() => new Set());
  const [activeId, setActiveId] = useState("");

  const load = useCallback(
    async ({ soft = false } = {}) => {
      if (!siteLink) {
        setSends([]);
        setLoading(false);
        return;
      }
      if (!soft) setLoading(true);
      try {
        const res = await fetch(
          `/api/admin/blog-automation/writer-sends?siteLink=${encodeURIComponent(siteLink)}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load content inbox");
        setSends(data.sends || []);
        setError("");
      } catch (err) {
        if (!soft) setError(err.message || "Failed to load content inbox");
      } finally {
        if (!soft) setLoading(false);
      }
    },
    [siteLink]
  );

  useEffect(() => {
    load();
  }, [load]);

  // A fresh batch just arrived from SERP/Autopilot — surface it.
  useEffect(() => {
    if (!highlightRunId || !sends.length) return;
    const arrived = sends.filter((s) => s.runId === highlightRunId);
    if (!arrived.length) return;
    setSelected(new Set(arrived.map((s) => s.id)));
    setActiveId(arrived[0].id);
    setNotice(`${arrived.length} new idea${arrived.length === 1 ? "" : "s"} just landed — selected and ready to write.`);
  }, [highlightRunId, sends]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sends.filter((s) => {
      if (sourceFilter !== "all" && sourceOf(s) !== sourceFilter) return false;
      if (statusFilter !== "all" && statusBucket(s.status) !== statusFilter) return false;
      if (q) {
        const hay = `${s.title || ""} ${s.topic || ""} ${JSON.stringify(s.payloadJson || {})}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sends, query, sourceFilter, statusFilter]);

  useEffect(() => {
    if (!filtered.length) {
      setActiveId("");
      return;
    }
    if (!filtered.some((s) => s.id === activeId)) setActiveId(filtered[0].id);
  }, [filtered, activeId]);

  const active = filtered.find((s) => s.id === activeId) || filtered[0] || null;
  const payload =
    active?.payloadJson && typeof active.payloadJson === "object" ? active.payloadJson : {};
  const keywords = splitLines(payload.mustFollowKeywords);
  const secondary = splitLines(payload.secondaryKeywords);

  const counts = useMemo(() => {
    const c = { autopilot: 0, competitor: 0, new: 0, active: 0, done: 0 };
    for (const s of sends) {
      c[sourceOf(s)] += 1;
      c[statusBucket(s.status)] += 1;
    }
    return c;
  }, [sends]);

  const toggleSelect = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAllVisible = () => setSelected(new Set(filtered.map((s) => s.id)));
  const clearSelection = () => setSelected(new Set());

  const runOne = async (id) => {
    const res = await fetch(`/api/admin/blog-automation/writer-sends/${id}/run`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Run failed");
    return data.run;
  };

  const handleRun = async (id) => {
    setBusyId(id);
    setError("");
    try {
      const run = await runOne(id);
      onRan?.(run);
      await load({ soft: true });
      setNotice("Studio run queued — watch it in the Run console below.");
    } catch (err) {
      setError(err.message || "Run failed");
    } finally {
      setBusyId("");
    }
  };

  const handleBulkRun = async () => {
    const ids = filtered.filter((s) => selected.has(s.id)).map((s) => s.id);
    if (!ids.length) return;
    setBulkRunning(true);
    setError("");
    let lastRun = null;
    let ok = 0;
    for (const id of ids) {
      try {
        lastRun = await runOne(id);
        ok += 1;
      } catch (err) {
        setError(err.message || "One or more runs failed");
      }
    }
    if (lastRun) onRan?.(lastRun);
    await load({ soft: true });
    setBulkRunning(false);
    clearSelection();
    setNotice(`Queued ${ok} run${ok === 1 ? "" : "s"} — they’ll draft one after another in the Run console below.`);
  };

  const markCompleted = async (id) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/blog-automation/writer-sends/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Update failed");
      }
      await load({ soft: true });
    } catch (err) {
      setError(err.message || "Update failed");
    } finally {
      setBusyId("");
    }
  };

  if (!siteLink) {
    return <p className="text-sm text-gray-500">Select a site to view its content inbox.</p>;
  }

  const selectedCount = filtered.filter((s) => selected.has(s.id)).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-gray-100 bg-gradient-to-r from-white to-emerald-50/40 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <div className="shrink-0 rounded-xl border border-emerald-100 bg-emerald-50 p-2.5">
              <FiInbox className="h-4 w-4 text-emerald-700" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Content Inbox</h3>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-600">
                Every idea in one place — from{" "}
                <span className="font-semibold text-violet-700">SEO Autopilot</span> and{" "}
                <span className="font-semibold text-sky-700">SERP Analysis</span>. Filter, pick
                several, and write them into full drafts in one go.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-gray-300"
          >
            <FiRefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> {notice}
          </span>
          <button type="button" onClick={() => setNotice("")} className="text-emerald-500 hover:text-emerald-800">
            <FiX className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ideas, keywords, briefs…"
            className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1">
          {[
            { id: "all", label: `All ${sends.length}` },
            { id: "autopilot", label: `Autopilot ${counts.autopilot}` },
            { id: "competitor", label: `SERP ${counts.competitor}` },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setSourceFilter(f.id)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                sourceFilter === f.id ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1">
          {[
            { id: "all", label: "Any" },
            { id: "new", label: `New ${counts.new}` },
            { id: "active", label: `Queued ${counts.active}` },
            { id: "done", label: `Done ${counts.done}` },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                statusFilter === f.id ? "bg-emerald-600 text-white" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !sends.length ? (
        <p className="text-sm text-gray-500">Loading content inbox…</p>
      ) : !sends.length ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
          <PenLine className="mx-auto h-8 w-8 text-emerald-700/70" />
          <p className="mt-3 text-sm font-semibold text-gray-900">Your inbox is empty</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
            Generate ideas from <span className="font-semibold">SERP Analysis</span> (“Turn into
            content”) or run <span className="font-semibold">SEO Autopilot</span>. They’ll land here
            ready to write.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                onClick={selectedCount === filtered.length ? clearSelection : selectAllVisible}
                className="text-[11px] font-semibold text-gray-500 hover:text-gray-800"
              >
                {selectedCount === filtered.length && filtered.length > 0
                  ? "Clear selection"
                  : "Select all shown"}
              </button>
              <span className="text-[11px] text-gray-400">{filtered.length} shown</span>
            </div>

            <div className="max-h-[30rem] space-y-1.5 overflow-y-auto pr-1">
              {filtered.map((s) => {
                const src = SOURCE_META[sourceOf(s)];
                const SrcIcon = src.icon;
                const isActive = s.id === active?.id;
                const isChecked = selected.has(s.id);
                return (
                  <div
                    key={s.id}
                    className={`flex items-start gap-2 rounded-xl border p-2.5 transition ${
                      isActive
                        ? "border-emerald-300 bg-emerald-50/70 shadow-sm"
                        : isChecked
                          ? "border-emerald-200 bg-emerald-50/30"
                          : "border-gray-100 bg-white hover:border-gray-200"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleSelect(s.id)}
                      className="mt-1 size-4 shrink-0 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setActiveId(s.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="line-clamp-2 text-sm font-semibold text-gray-900">
                        {s.title || s.topic || "Untitled idea"}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${src.chip}`}
                        >
                          <SrcIcon className="h-2.5 w-2.5" /> {src.label}
                        </span>
                        <span
                          className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusTone(
                            s.status
                          )}`}
                        >
                          {s.status}
                        </span>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detail */}
          {active ? (
            <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-base font-bold text-gray-900">{active.title || active.topic}</h4>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusTone(
                        active.status
                      )}`}
                    >
                      {active.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    From {SOURCE_META[sourceOf(active)].label} · seeded{" "}
                    {new Date(active.createdAt).toLocaleString()}
                    {active.blogRunId ? ` · run ${active.blogRunId.slice(0, 8)}…` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === active.id || bulkRunning}
                    onClick={() => handleRun(active.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    <FiPlay className="h-3.5 w-3.5" />
                    {active.blogRunId ? "Re-run" : "Write this"}
                  </button>
                  {active.status !== "completed" ? (
                    <button
                      type="button"
                      disabled={busyId === active.id}
                      onClick={() => markCompleted(active.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-50"
                    >
                      <FiCheck className="h-3.5 w-3.5" /> Done
                    </button>
                  ) : null}
                </div>
              </div>

              {payload.why ? (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                    Why this idea
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-gray-800">{payload.why}</p>
                </div>
              ) : null}

              {keywords.length || secondary.length ? (
                <div className="space-y-2">
                  {keywords.length ? (
                    <div>
                      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                        Must-follow keywords
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {keywords.map((k) => (
                          <span
                            key={k}
                            className="rounded-md border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-900"
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {secondary.length ? (
                    <div>
                      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                        Secondary keywords
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {secondary.map((k) => (
                          <span
                            key={k}
                            className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-700"
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Topic">{active.topic || payload.topic}</Field>
                <Field label="Content type">{payload.contentType}</Field>
                <Field label="Word count">{payload.wordCountRange}</Field>
                <Field label="Audience">{payload.targetAudience}</Field>
                <Field label="Location">{payload.location}</Field>
                <Field label="CTA">
                  {payload.ctaText || payload.ctaUrl ? (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {payload.ctaText || "—"}
                      {payload.ctaUrl ? (
                        <a
                          href={payload.ctaUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-semibold text-emerald-800 hover:underline"
                        >
                          Link <FiExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </span>
                  ) : null}
                </Field>
                <Field label="Brief (seed prompt)" wide>
                  {payload.seedPrompt ? (
                    <div className="max-h-56 overflow-auto rounded-xl border border-gray-100 bg-gray-50 p-3">
                      {payload.seedPrompt}
                    </div>
                  ) : null}
                </Field>
                <Field label="SERP / competitor notes" wide>
                  {payload.serpNotes}
                </Field>
                <Field label="Image prompt" wide>
                  {payload.imagePrompt}
                </Field>
              </div>

              {active.errorMessage ? (
                <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {active.errorMessage}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500">
              No ideas match these filters.
            </div>
          )}
        </div>
      )}

      {/* Sticky bulk action bar */}
      {selectedCount > 0 ? (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-900/10 bg-gray-900 px-5 py-3 text-white shadow-xl">
          <span className="text-sm font-semibold">
            {selectedCount} idea{selectedCount === 1 ? "" : "s"} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-300 hover:text-white"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleBulkRun}
              disabled={bulkRunning}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-400 disabled:opacity-50"
            >
              {bulkRunning ? <FiRefreshCw className="h-4 w-4 animate-spin" /> : <FiZap className="h-4 w-4" />}
              {bulkRunning ? "Queuing…" : `Write ${selectedCount} selected`}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
