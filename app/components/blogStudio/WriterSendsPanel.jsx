"use client";

import { useCallback, useEffect, useState } from "react";
import { FiCheck, FiPlay, FiRefreshCw } from "react-icons/fi";

export default function WriterSendsPanel({ siteLink, onRan }) {
  const [sends, setSends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    if (!siteLink) {
      setSends([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/blog-automation/writer-sends?siteLink=${encodeURIComponent(siteLink)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load writer sends");
      setSends(data.sends || []);
    } catch (err) {
      setError(err.message || "Failed to load writer sends");
    } finally {
      setLoading(false);
    }
  }, [siteLink]);

  useEffect(() => {
    load();
  }, [load]);

  const runSend = async (id) => {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/blog-automation/writer-sends/${id}/run`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Run failed");
      await load();
      onRan?.(data.run);
    } catch (err) {
      setError(err.message || "Run failed");
    } finally {
      setBusyId("");
    }
  };

  const markCompleted = async (id) => {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/blog-automation/writer-sends/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      await load();
    } catch (err) {
      setError(err.message || "Update failed");
    } finally {
      setBusyId("");
    }
  };

  if (!siteLink) {
    return <p className="text-sm text-gray-500">Select a site to view Writer sends.</p>;
  }

  if (loading) {
    return <p className="text-sm text-gray-500">Loading Writer sends…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900">SEO Autopilot → Writer sends</h3>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl">
            Each card is a full Blog Studio seed payload (keywords, brief, CTA, etc.) from Autopilot’s
            Writer agent. Run once with that payload, re-run anytime, or mark completed.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700"
        >
          <FiRefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {!sends.length ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-5 py-8 text-sm text-gray-600">
          No Writer sends yet. In <span className="font-semibold">SEO Autopilot</span>, run the{" "}
          <span className="font-semibold">Diagnoser</span> then <span className="font-semibold">Writer</span>{" "}
          agents (or a full Autopilot run). Payloads will land here.
        </div>
      ) : (
        <div className="space-y-3">
          {sends.map((s) => {
            const payload = s.payloadJson || {};
            const keywords = String(payload.mustFollowKeywords || "")
              .split(/\n+/)
              .map((x) => x.trim())
              .filter(Boolean)
              .slice(0, 6);
            const busy = busyId === s.id;
            return (
              <div key={s.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-bold text-gray-900">{s.title || s.topic}</h4>
                      <span className="text-[10px] font-bold uppercase tracking-wide rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-gray-600">
                        {s.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(s.createdAt).toLocaleString()}
                      {s.blogRunId ? ` · last Blog run ${s.blogRunId.slice(0, 8)}…` : ""}
                      {s.lastRunAt ? ` · ran ${new Date(s.lastRunAt).toLocaleString()}` : ""}
                    </p>
                    {payload.why ? (
                      <p className="text-sm text-gray-700 mt-2">{payload.why}</p>
                    ) : null}
                    {keywords.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {keywords.map((k) => (
                          <span
                            key={k}
                            className="rounded-md bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-900"
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => runSend(s.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 text-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                    >
                      <FiPlay className="w-3.5 h-3.5" />
                      {s.blogRunId ? "Re-run" : "Run once"}
                    </button>
                    {s.status !== "completed" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => markCompleted(s.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-50"
                      >
                        <FiCheck className="w-3.5 h-3.5" /> Mark completed
                      </button>
                    ) : null}
                  </div>
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-gray-600">
                    View Blog Studio payload
                  </summary>
                  <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-gray-50 border border-gray-100 p-3 text-[11px] text-gray-800 whitespace-pre-wrap">
                    {JSON.stringify(payload, null, 2)}
                  </pre>
                </details>
                {s.errorMessage ? (
                  <p className="mt-2 text-xs text-red-700">{s.errorMessage}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
