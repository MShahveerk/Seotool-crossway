"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiUpload,
  FiSave,
  FiRefreshCw,
  FiChevronDown,
  FiChevronUp,
  FiSkipForward,
  FiCheck,
  FiAlertCircle,
} from "react-icons/fi";
import { inputClass, labelClass, formatWhen } from "./studioConstants";

const COLUMNS = [
  { key: "topic", label: "Topic", wide: true },
  { key: "keywords", label: "Keywords", wide: true },
  { key: "seedContext", label: "Context / brief", wide: true },
  { key: "imagePrompt", label: "Image direction", wide: true },
  { key: "audience", label: "Audience" },
  { key: "ctaText", label: "CTA" },
  { key: "ctaUrl", label: "CTA URL" },
  { key: "notes", label: "Notes" },
];

function rowTone(status) {
  switch (String(status || "")) {
    case "done":
      return "border-l-[#1d9c35] bg-emerald-50/40";
    case "processing":
      return "border-l-amber-400 bg-amber-50/50";
    case "failed":
      return "border-l-red-400 bg-red-50/40";
    case "skipped":
      return "border-l-gray-300 bg-gray-50/80 opacity-70";
    default:
      return "border-l-[#1d9c35]/40 bg-white";
  }
}

function statusBadge(status) {
  const s = String(status || "pending");
  const map = {
    pending: "bg-[#e8f7eb] text-[#146b24]",
    processing: "bg-amber-100 text-amber-900",
    done: "bg-emerald-100 text-emerald-900",
    failed: "bg-red-100 text-red-800",
    skipped: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${map[s] || map.pending}`}>
      {s}
    </span>
  );
}

export default function ExcelQueuePanel({
  siteLink,
  siteConfig,
  onPatchSite,
  onMessage,
}) {
  const [campaign, setCampaign] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [useAi, setUseAi] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [maxRows, setMaxRows] = useState(50);

  const siteQ = siteLink ? `?siteLink=${encodeURIComponent(siteLink)}` : "";

  const load = useCallback(async () => {
    if (!siteLink) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/blog-automation/site/excel${siteQ}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load queue.");
      setCampaign(data.campaign || null);
      setMaxRows(data.maxRows || 50);
      const next = {};
      for (const r of data.campaign?.rows || []) {
        next[r.id] = {
          topic: r.topic || "",
          keywords: r.keywords || "",
          seedContext: r.seedContext || "",
          imagePrompt: r.imagePrompt || "",
          audience: r.audience || "",
          ctaText: r.ctaText || "",
          ctaUrl: r.ctaUrl || "",
          notes: r.notes || "",
        };
      }
      setDrafts(next);
      setDirty(false);
    } catch (err) {
      onMessage?.({ ok: false, text: err.message });
    } finally {
      setLoading(false);
    }
  }, [siteLink, siteQ, onMessage]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = campaign?.rows || [];
  const visible = showAll ? rows : rows.slice(0, 10);
  const pendingCount = rows.filter((r) => r.status === "pending").length;
  const doneCount = rows.filter((r) => r.status === "done").length;

  const progressPct = useMemo(() => {
    if (!rows.length) return 0;
    return Math.round(((doneCount + rows.filter((r) => r.status === "skipped").length) / rows.length) * 100);
  }, [rows, doneCount]);

  const setCell = (id, key, value) => {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], [key]: value } }));
    setDirty(true);
  };

  const onUpload = async (file) => {
    if (!file || !siteLink) return;
    setUploading(true);
    onMessage?.(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("useAi", useAi ? "1" : "0");
      const res = await fetch(`/api/admin/blog-automation/site/excel${siteQ}`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      setCampaign(data.campaign);
      onPatchSite?.({ autoSource: "excel" });
      const cost = data.usage?.costUsd != null ? ` · interpret ~$${Number(data.usage.costUsd).toFixed(4)}` : "";
      onMessage?.({
        ok: true,
        text: `Imported ${data.campaign?.rowCount || 0} rows from ${data.campaign?.fileName || "spreadsheet"}${cost}. Review cells, then enable Auto on Schedule.`,
      });
      await load();
    } catch (err) {
      onMessage?.({ ok: false, text: err.message });
    } finally {
      setUploading(false);
    }
  };

  const saveEdits = async () => {
    if (!dirty || !rows.length) return;
    setSaving(true);
    try {
      const payload = rows.map((r) => ({ id: r.id, ...(drafts[r.id] || {}) }));
      const res = await fetch(`/api/admin/blog-automation/site/excel${siteQ}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed.");
      setCampaign(data.campaign);
      setDirty(false);
      onMessage?.({ ok: true, text: "Queue cells saved." });
    } catch (err) {
      onMessage?.({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const skipRow = async (row) => {
    try {
      const res = await fetch(`/api/admin/blog-automation/site/excel${siteQ}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: [{ id: row.id, status: "skipped" }] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Skip failed.");
      setCampaign(data.campaign);
      onMessage?.({ ok: true, text: `Skipped row ${row.rowIndex + 1}.` });
    } catch (err) {
      onMessage?.({ ok: false, text: err.message });
    }
  };

  if (!siteLink) {
    return (
      <p className="text-sm text-gray-600">Select a site to manage the Excel campaign queue.</p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-[#1d9c35]/20 bg-gradient-to-br from-[#f3faf4] via-white to-[#eef6f0] p-5">
        <div
          className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full opacity-30"
          style={{ background: "radial-gradient(circle, #1d9c35 0%, transparent 70%)" }}
        />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#1d9c35]">
              Campaign queue
            </p>
            <h3 className="mt-1 font-serif text-2xl tracking-tight text-gray-900">
              Excel → one blog per interval
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              Upload any .xlsx / .xls / .csv (max {maxRows} rows). The interpreter maps columns into
              topic, keywords, brief, and image direction. SEO can edit every cell before Auto runs
              the next pending row.
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <label className="inline-flex items-center gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={useAi}
                onChange={(e) => setUseAi(e.target.checked)}
                className="rounded border-gray-300 text-[#1d9c35] focus:ring-[#1d9c35]"
              />
              AI column mapping
            </label>
            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#1d9c35] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#178c2e] disabled:opacity-50">
              {uploading ? <FiRefreshCw className="animate-spin" /> : <FiUpload />}
              {uploading ? "Importing…" : "Upload spreadsheet"}
              <input
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) onUpload(f);
                }}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <p className={labelClass}>Auto source</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">
            {siteConfig?.autoSource === "excel" ? "Excel queue" : "Seed prompt"}
          </p>
          <p className="mt-1 text-xs text-gray-500">Switch on the Schedule tab.</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <p className={labelClass}>Queue progress</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">
            {doneCount}/{rows.length || 0} done · {pendingCount} pending
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-[#1d9c35] transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <p className={labelClass}>Active file</p>
          <p className="mt-1 truncate text-sm font-semibold text-gray-900">
            {campaign?.fileName || "No campaign yet"}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {campaign ? `Uploaded ${formatWhen(campaign.createdAt)}` : "Upload to begin"}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <FiRefreshCw className="animate-spin" /> Loading queue…
        </div>
      ) : !campaign ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/80 px-6 py-12 text-center">
          <FiUpload className="mx-auto h-8 w-8 text-[#1d9c35]" />
          <p className="mt-3 text-sm font-semibold text-gray-800">No spreadsheet campaign yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-gray-500">
            Columns can be anything — Topic, Keywords, Brief, Image prompt, Audience, CTA… The
            interpreter normalizes them into the editable grid below.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-gray-500">
              Showing {visible.length} of {rows.length}
              {!showAll && rows.length > 10 ? " · top 10 by default" : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {rows.length > 10 && (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-[#1d9c35]/40"
                >
                  {showAll ? <FiChevronUp /> : <FiChevronDown />}
                  {showAll ? "Show top 10" : `Show all ${rows.length}`}
                </button>
              )}
              <button
                type="button"
                onClick={load}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                <FiRefreshCw /> Refresh
              </button>
              <button
                type="button"
                onClick={saveEdits}
                disabled={!dirty || saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#1d9c35] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                {saving ? <FiRefreshCw className="animate-spin" /> : dirty ? <FiSave /> : <FiCheck />}
                {dirty ? "Save cell edits" : "Saved"}
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
                <thead>
                  <tr className="bg-[#f7faf8] text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    <th className="sticky left-0 z-10 bg-[#f7faf8] px-3 py-3 w-14">#</th>
                    <th className="px-2 py-3 w-24">Status</th>
                    {COLUMNS.map((c) => (
                      <th key={c.key} className={`px-2 py-3 ${c.wide ? "min-w-[180px]" : "min-w-[120px]"}`}>
                        {c.label}
                      </th>
                    ))}
                    <th className="px-3 py-3 w-20"> </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => {
                    const editable = ["pending", "failed"].includes(row.status);
                    const d = drafts[row.id] || {};
                    return (
                      <tr
                        key={row.id}
                        className={`border-t border-gray-100 border-l-4 align-top transition-colors ${rowTone(row.status)}`}
                      >
                        <td className="sticky left-0 z-10 bg-inherit px-3 py-2 font-mono text-xs text-gray-500">
                          {row.rowIndex + 1}
                        </td>
                        <td className="px-2 py-2">
                          {statusBadge(row.status)}
                          {row.errorMessage && (
                            <p className="mt-1 flex items-start gap-1 text-[10px] text-red-600 max-w-[120px]">
                              <FiAlertCircle className="mt-0.5 shrink-0" />
                              <span className="line-clamp-2">{row.errorMessage}</span>
                            </p>
                          )}
                        </td>
                        {COLUMNS.map((c) => (
                          <td key={c.key} className="px-2 py-2">
                            {editable ? (
                              c.key === "seedContext" || c.key === "imagePrompt" || c.key === "notes" ? (
                                <textarea
                                  className={`${inputClass} min-h-[64px] text-xs leading-snug`}
                                  value={d[c.key] || ""}
                                  onChange={(e) => setCell(row.id, c.key, e.target.value)}
                                  placeholder={c.label}
                                />
                              ) : (
                                <input
                                  className={`${inputClass} text-xs`}
                                  value={d[c.key] || ""}
                                  onChange={(e) => setCell(row.id, c.key, e.target.value)}
                                  placeholder={c.label}
                                />
                              )
                            ) : (
                              <p className="text-xs text-gray-700 whitespace-pre-wrap line-clamp-4 px-1">
                                {d[c.key] || "—"}
                              </p>
                            )}
                          </td>
                        ))}
                        <td className="px-2 py-2">
                          {row.status === "pending" && (
                            <button
                              type="button"
                              title="Skip this row"
                              onClick={() => skipRow(row)}
                              className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:border-amber-300 hover:text-amber-700"
                            >
                              <FiSkipForward className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
