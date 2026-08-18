"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiUpload,
  FiSave,
  FiRefreshCw,
  FiChevronDown,
  FiChevronUp,
  FiSkipForward,
  FiCheck,
  FiAlertCircle,
  FiClock,
  FiPlay,
  FiPause,
  FiCalendar,
  FiXCircle,
  FiDownload,
} from "react-icons/fi";
import { INTERVAL_OPTIONS, inputClass, labelClass, formatWhen } from "./studioConstants";

const COLUMNS = [
  { key: "topic", label: "Post title / angle", wide: true },
  { key: "keywords", label: "Keywords / hashtags", wide: true },
  { key: "seedContext", label: "Caption brief", wide: true },
  { key: "imagePrompt", label: "Image direction", wide: true },
  { key: "platform", label: "Platform" },
  { key: "ctaText", label: "CTA" },
  { key: "ctaUrl", label: "CTA URL" },
  { key: "notes", label: "Notes" },
];

function rowTone(status, isToday) {
  if (isToday)
    return "border-l-[var(--cw-neon)] bg-[color-mix(in_srgb,var(--cw-neon)_12%,var(--cw-surface))] ring-1 ring-inset ring-[color-mix(in_srgb,var(--cw-neon)_25%,transparent)]";
  switch (String(status || "")) {
    case "done":
      return "border-l-[var(--cw-neon)] bg-[color-mix(in_srgb,var(--cw-neon)_7%,var(--cw-surface))]";
    case "processing":
      return "border-l-[var(--cw-caution)] bg-[color-mix(in_srgb,var(--cw-caution)_10%,var(--cw-surface))]";
    case "failed":
      return "border-l-[var(--cw-danger)] bg-[color-mix(in_srgb,var(--cw-danger)_10%,var(--cw-surface))]";
    case "skipped":
      return "border-l-[var(--cw-hairline-strong)] bg-[var(--cw-raised)] opacity-70";
    default:
      return "border-l-[color-mix(in_srgb,var(--cw-neon)_40%,var(--cw-hairline))] bg-[var(--cw-surface)]";
  }
}

function statusBadge(status) {
  const s = String(status || "pending");
  const map = {
    pending: "bg-[color-mix(in_srgb,var(--cw-neon)_12%,var(--cw-surface))] text-[var(--cw-neon)]",
    processing: "bg-[color-mix(in_srgb,var(--cw-caution)_14%,var(--cw-surface))] text-[var(--cw-caution)]",
    done: "bg-[color-mix(in_srgb,var(--cw-neon)_16%,var(--cw-surface))] text-[var(--cw-neon)]",
    failed: "bg-[color-mix(in_srgb,var(--cw-danger)_14%,var(--cw-surface))] text-[var(--cw-danger)]",
    skipped: "bg-[var(--cw-raised)] text-[var(--cw-ink-muted)]",
  };
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${map[s] || map.pending}`}>
      {s}
    </span>
  );
}

function formatNextRun(iso, due) {
  if (due) return "Next cron tick (due now)";
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const today = new Date();
    const sameDay =
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate();
    const time = d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    return sameDay ? `Today · ${time}` : time;
  } catch {
    return iso;
  }
}

export default function ExcelQueuePanel({
  siteLink,
  siteConfig,
  onPatchSite,
  onMessage,
  onToggleAuto,
}) {
  const [campaign, setCampaign] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [cancellingRun, setCancellingRun] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [useAi, setUseAi] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [maxRows, setMaxRows] = useState(50);

  const siteQ = siteLink ? `?siteLink=${encodeURIComponent(siteLink)}` : "";

  // Keep parent callbacks in refs so load() does not re-fire when parent re-renders.
  const onPatchSiteRef = useRef(onPatchSite);
  const onMessageRef = useRef(onMessage);
  const siteConfigRef = useRef(siteConfig);
  useEffect(() => {
    onPatchSiteRef.current = onPatchSite;
  }, [onPatchSite]);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);
  useEffect(() => {
    siteConfigRef.current = siteConfig;
  }, [siteConfig]);

  const load = useCallback(async () => {
    if (!siteLink) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/post-automation/site/excel${siteQ}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load queue.");
      setCampaign(data.campaign || null);
      setSchedule(data.schedule || null);
      setMaxRows(data.maxRows || 50);

      // Only sync schedule fields when they actually differ (avoids parent update loops).
      if (data.config) {
        const cur = siteConfigRef.current || {};
        const patch = {};
        if (cur.autoIntervalMinutes !== data.config.autoIntervalMinutes) {
          patch.autoIntervalMinutes = data.config.autoIntervalMinutes;
        }
        if (Boolean(cur.autoEnabled) !== Boolean(data.config.autoEnabled)) {
          patch.autoEnabled = data.config.autoEnabled;
        }
        if ((cur.autoSource || "seed") !== (data.config.autoSource || "seed")) {
          patch.autoSource = data.config.autoSource;
        }
        const curLast = cur.lastAutoAt ? String(cur.lastAutoAt) : "";
        const nextLast = data.config.lastAutoAt ? String(data.config.lastAutoAt) : "";
        if (curLast !== nextLast) patch.lastAutoAt = data.config.lastAutoAt;
        if (Object.keys(patch).length) onPatchSiteRef.current?.(patch);
      }

      const next = {};
      for (const r of data.campaign?.rows || []) {
        next[r.id] = {
          topic: r.topic || "",
          keywords: r.keywords || "",
          seedContext: r.seedContext || "",
          imagePrompt: r.imagePrompt || "",
          platform: r.platform || "",
          ctaText: r.ctaText || "",
          ctaUrl: r.ctaUrl || "",
          notes: r.notes || "",
        };
      }
      setDrafts(next);
      setDirty(false);
    } catch (err) {
      onMessageRef.current?.({ ok: false, text: err.message });
    } finally {
      setLoading(false);
    }
  }, [siteLink, siteQ]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = campaign?.rows || [];
  const todaysRowId = schedule?.todaysRowId || null;

  const visible = useMemo(() => {
    const base = showAll ? rows : rows.slice(0, 10);
    if (!showAll && todaysRowId && !base.some((r) => r.id === todaysRowId)) {
      const today = rows.find((r) => r.id === todaysRowId);
      if (today) return [...base, today];
    }
    return base;
  }, [rows, showAll, todaysRowId]);

  const pendingCount = schedule?.pendingCount ?? rows.filter((r) => r.status === "pending").length;
  const doneCount = schedule?.doneCount ?? rows.filter((r) => r.status === "done").length;

  const progressPct = useMemo(() => {
    if (!rows.length) return 0;
    return Math.round(((doneCount + rows.filter((r) => r.status === "skipped").length) / rows.length) * 100);
  }, [rows, doneCount]);

  const intervalLabel =
            INTERVAL_OPTIONS.find((o) => o.value === Number(siteConfig?.autoIntervalMinutes || schedule?.intervalMinutes || 720))
      ?.label || `Every ${siteConfig?.autoIntervalMinutes || 720} minutes`;

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
      const res = await fetch(`/api/admin/post-automation/site/excel${siteQ}`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      onPatchSite?.({ autoSource: "excel" });
      const cost = data.usage?.costUsd != null ? ` · interpret ~$${Number(data.usage.costUsd).toFixed(4)}` : "";
      onMessage?.({
        ok: true,
        text: `Imported ${data.campaign?.rowCount || 0} rows from ${data.campaign?.fileName || "spreadsheet"}${cost}. Set frequency below and enable Auto.`,
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
      const res = await fetch(`/api/admin/post-automation/site/excel${siteQ}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed.");
      setCampaign(data.campaign);
      if (data.schedule) setSchedule(data.schedule);
      setDirty(false);
      onMessage?.({ ok: true, text: "Queue cells saved." });
    } catch (err) {
      onMessage?.({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const saveExcelSchedule = async ({ flipAuto = false } = {}) => {
    if (!siteLink) return;
    setSavingSchedule(true);
    onMessage?.(null);
    try {
      const nextEnabled = flipAuto ? !siteConfig?.autoEnabled : Boolean(siteConfig?.autoEnabled);
      const res = await fetch(`/api/admin/post-automation/site${siteQ}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          autoSource: "excel",
          autoIntervalMinutes: Number(siteConfig?.autoIntervalMinutes) || 720,
          autoEnabled: nextEnabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save Excel schedule.");
      onPatchSite?.(data.config || { autoSource: "excel", autoEnabled: nextEnabled });
      onMessage?.({
        ok: true,
        text: flipAuto
          ? `Excel Auto ${nextEnabled ? "enabled" : "paused"} · ${intervalLabel}.`
          : `Excel frequency saved · ${intervalLabel}.`,
      });
      await load();
    } catch (err) {
      onMessage?.({ ok: false, text: err.message });
    } finally {
      setSavingSchedule(false);
    }
  };

  const cancelRunningAutomation = async () => {
    if (!siteLink) return;
    setCancellingRun(true);
    onMessage?.(null);
    try {
      const res = await fetch(`/api/admin/post-automation/site/cancel${siteQ}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to cancel.");
      onMessage?.({
        ok: true,
        text:
          data.count > 0
            ? `Cancelled ${data.count} automation${data.count === 1 ? "" : "s"}. Queue row unlocked.`
            : "No running automations to cancel.",
      });
      await load();
    } catch (err) {
      onMessage?.({ ok: false, text: err.message });
    } finally {
      setCancellingRun(false);
    }
  };

  const skipRow = async (row) => {
    try {
      const res = await fetch(`/api/admin/post-automation/site/excel${siteQ}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: [{ id: row.id, status: "skipped" }] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Skip failed.");
      setCampaign(data.campaign);
      if (data.schedule) setSchedule(data.schedule);
      onMessage?.({ ok: true, text: `Skipped row ${row.rowIndex + 1}.` });
      await load();
    } catch (err) {
      onMessage?.({ ok: false, text: err.message });
    }
  };

  if (!siteLink) {
    return (
      <p className="text-sm text-[var(--cw-ink-muted)]">Select a site to manage the Excel campaign queue.</p>
    );
  }

  const todaysTopic = schedule?.todaysTopic || schedule?.nextTopic;
  const todaysNum =
    schedule?.todaysRowIndex != null
      ? schedule.todaysRowIndex + 1
      : schedule?.nextRowIndex != null
        ? schedule.nextRowIndex + 1
        : null;

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--cw-neon)_22%,var(--cw-hairline))] bg-gradient-to-br from-[color-mix(in_srgb,var(--cw-neon)_10%,var(--cw-surface))] via-[var(--cw-surface)] to-[var(--cw-raised)] p-5">
        <div
          className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full opacity-30"
          style={{ background: "radial-gradient(circle, var(--cw-neon) 0%, transparent 70%)" }}
        />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--cw-neon)]">
              Campaign queue
            </p>
            <h3 className="mt-1 font-serif text-2xl tracking-tight text-[var(--cw-ink)]">
              Excel → one social post per interval
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--cw-ink-muted)]">
              Upload any .xlsx / .xls / .csv (max {maxRows} rows). Set how often a row runs, see which
              row is scheduled today, then enable Auto. Posts land as pending Approvals.
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <label className="inline-flex items-center gap-2 text-xs text-[var(--cw-ink-muted)]">
              <input
                type="checkbox"
                checked={useAi}
                onChange={(e) => setUseAi(e.target.checked)}
                className="rounded border-[var(--cw-hairline)] text-[var(--cw-neon)] focus:ring-[var(--cw-neon)]"
              />
              AI column mapping
            </label>
            <a
              href="/api/admin/post-automation/site/excel/template"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-4 py-2.5 text-sm font-semibold text-[var(--cw-ink-dim)] shadow-sm transition hover:border-[color-mix(in_srgb,var(--cw-neon)_40%,var(--cw-hairline))] hover:bg-[var(--cw-overlay)]"
            >
              <FiDownload />
              Download template
            </a>
            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[var(--cw-neon)] px-4 py-2.5 text-sm font-semibold text-[var(--cw-neon-ink)] shadow-sm transition hover:bg-[var(--cw-neon-deep)] disabled:opacity-50">
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

      {/* Today's row + frequency */}
      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div
          className={`rounded-2xl border px-4 py-4 ${
            schedule?.scheduledForToday || schedule?.due
              ? "border-[color-mix(in_srgb,var(--cw-neon)_35%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-neon)_9%,var(--cw-surface))]"
              : "border-[var(--cw-hairline)] bg-[var(--cw-raised)]"
          }`}
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--cw-neon)_14%,var(--cw-surface))] text-[var(--cw-neon)]">
              <FiCalendar className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className={labelClass}>Scheduled for today</p>
              {todaysNum != null && (schedule?.scheduledForToday || schedule?.due || schedule?.todaysRowId) ? (
                <>
                  <p className="mt-1 text-lg font-semibold text-[var(--cw-ink)] truncate">
                    Row {todaysNum}
                    {todaysTopic ? ` · ${todaysTopic}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-[var(--cw-ink-muted)]">
                    {schedule?.statusLabel || "—"}
                    {schedule?.todaysStatus ? ` · status ${schedule.todaysStatus}` : ""}
                  </p>
                </>
              ) : schedule?.nextRowIndex != null ? (
                <>
                  <p className="mt-1 text-lg font-semibold text-[var(--cw-ink)] truncate">
                    No row due today
                  </p>
                  <p className="mt-1 text-xs text-[var(--cw-ink-muted)]">
                    Next up: Row {schedule.nextRowIndex + 1}
                    {schedule.nextTopic ? ` · ${schedule.nextTopic}` : ""} ·{" "}
                    {formatNextRun(schedule.nextRunAt, schedule.due)}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-lg font-semibold text-[var(--cw-ink)]">Nothing queued</p>
                  <p className="mt-1 text-xs text-[var(--cw-ink-muted)]">
                    {schedule?.statusLabel || "Upload a spreadsheet or wait for pending rows."}
                  </p>
                </>
              )}
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-[var(--cw-ink-muted)]">
                <FiClock className="h-3.5 w-3.5" />
                Next run: {formatNextRun(schedule?.nextRunAt, schedule?.due)} · Last:{" "}
                {formatWhen(schedule?.lastAutoAt || siteConfig?.lastAutoAt)}
              </p>
              {(schedule?.todaysStatus === "processing" || schedule?.statusLabel === "Running now") && (
                <button
                  type="button"
                  onClick={cancelRunningAutomation}
                  disabled={cancellingRun}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--cw-danger)_35%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-danger)_10%,var(--cw-surface))] px-3 py-1.5 text-xs font-semibold text-[var(--cw-danger)] hover:bg-[color-mix(in_srgb,var(--cw-danger)_18%,var(--cw-surface))] disabled:opacity-50"
                >
                  {cancellingRun ? <FiRefreshCw className="animate-spin" /> : <FiXCircle />}
                  Cancel running automation
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-4 py-4 space-y-3">
          <div>
            <p className={labelClass}>Excel run frequency</p>
            <p className="mt-0.5 text-xs text-[var(--cw-ink-muted)]">How often the next pending row is processed.</p>
          </div>
          <select
            className={inputClass}
            value={siteConfig?.autoIntervalMinutes || schedule?.intervalMinutes || 720}
            onChange={(e) =>
              onPatchSite?.({
                autoIntervalMinutes: Number(e.target.value),
                autoSource: "excel",
              })
            }
          >
            {INTERVAL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={saveExcelSchedule}
              disabled={savingSchedule}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--cw-neon)] px-3 py-2 text-xs font-semibold text-[var(--cw-neon-ink)] hover:bg-[var(--cw-neon-deep)] disabled:opacity-50"
            >
              {savingSchedule ? <FiRefreshCw className="animate-spin" /> : <FiSave />}
              Save frequency
            </button>
            <button
              type="button"
              onClick={() => saveExcelSchedule({ flipAuto: true })}
              disabled={savingSchedule}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${
                siteConfig?.autoEnabled
                  ? "border-[color-mix(in_srgb,var(--cw-neon)_35%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-neon)_12%,var(--cw-surface))] text-[var(--cw-neon)]"
                  : "border-[var(--cw-hairline)] bg-[var(--cw-raised)] text-[var(--cw-ink-dim)] hover:bg-[var(--cw-overlay)]"
              }`}
            >
              {siteConfig?.autoEnabled ? <FiPause /> : <FiPlay />}
              Auto {siteConfig?.autoEnabled ? "on" : "paused"}
            </button>
          </div>
          <p className="text-[11px] text-[var(--cw-ink-muted)]">
            Source locked to <strong>Excel queue</strong> when you save here · {intervalLabel}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-4 py-3">
          <p className={labelClass}>Auto source</p>
          <p className="mt-1 text-sm font-semibold text-[var(--cw-ink)]">
            {(siteConfig?.autoSource || schedule?.autoSource) === "excel" ? "Excel queue" : "Seed prompt"}
          </p>
          <p className="mt-1 text-xs text-[var(--cw-ink-muted)]">Saving frequency sets Excel as source.</p>
        </div>
        <div className="rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-4 py-3">
          <p className={labelClass}>Queue progress</p>
          <p className="mt-1 text-sm font-semibold text-[var(--cw-ink)]">
            {doneCount}/{rows.length || 0} done · {pendingCount} pending
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--cw-overlay)]">
            <div
              className="h-full rounded-full bg-[var(--cw-neon)] transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
        <div className="rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-4 py-3">
          <p className={labelClass}>Active file</p>
          <p className="mt-1 truncate text-sm font-semibold text-[var(--cw-ink)]">
            {campaign?.fileName || "No campaign yet"}
          </p>
          <p className="mt-1 text-xs text-[var(--cw-ink-muted)]">
            {campaign ? `Uploaded ${formatWhen(campaign.createdAt)}` : "Upload to begin"}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--cw-ink-muted)]">
          <FiRefreshCw className="animate-spin" /> Loading queue…
        </div>
      ) : !campaign ? (
        <div className="rounded-2xl border border-dashed border-[var(--cw-hairline-strong)] bg-[var(--cw-raised)] px-6 py-12 text-center">
          <FiUpload className="mx-auto h-8 w-8 text-[var(--cw-neon)]" />
          <p className="mt-3 text-sm font-semibold text-[var(--cw-ink-dim)]">No spreadsheet campaign yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-[var(--cw-ink-muted)]">
            Download the template if you don’t have a sheet, or upload your own. Columns can be
            anything — Angle, Keywords, Caption brief, Image direction, Platform, CTA… The interpreter maps them.
          </p>
          <a
            href="/api/admin/post-automation/site/excel/template"
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-2 text-xs font-semibold text-[var(--cw-ink-dim)] hover:border-[color-mix(in_srgb,var(--cw-neon)_40%,var(--cw-hairline))] hover:bg-[var(--cw-overlay)]"
          >
            <FiDownload /> Download Excel template
          </a>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[var(--cw-ink-muted)]">
              Showing {visible.length} of {rows.length}
              {!showAll && rows.length > 10 ? " · top 10 by default" : ""}
              {todaysRowId ? " · today’s row highlighted" : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {rows.length > 10 && (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-1.5 text-xs font-semibold text-[var(--cw-ink-dim)] hover:border-[color-mix(in_srgb,var(--cw-neon)_40%,var(--cw-hairline))] hover:bg-[var(--cw-overlay)]"
                >
                  {showAll ? <FiChevronUp /> : <FiChevronDown />}
                  {showAll ? "Show top 10" : `Show all ${rows.length}`}
                </button>
              )}
              <button
                type="button"
                onClick={load}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-1.5 text-xs font-semibold text-[var(--cw-ink-dim)] hover:bg-[var(--cw-overlay)]"
              >
                <FiRefreshCw /> Refresh
              </button>
              <button
                type="button"
                onClick={saveEdits}
                disabled={!dirty || saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--cw-neon)] px-3 py-1.5 text-xs font-semibold text-[var(--cw-neon-ink)] hover:bg-[var(--cw-neon-deep)] disabled:opacity-40"
              >
                {saving ? <FiRefreshCw className="animate-spin" /> : dirty ? <FiSave /> : <FiCheck />}
                {dirty ? "Save cell edits" : "Saved"}
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
                <thead>
                  <tr className="bg-[var(--cw-raised)] text-[10px] font-bold uppercase tracking-wider text-[var(--cw-ink-faint)]">
                    <th className="sticky left-0 z-10 bg-[var(--cw-raised)] px-3 py-3 w-14">#</th>
                    <th className="px-2 py-3 w-28">Status</th>
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
                    const isToday = row.id === todaysRowId;
                    return (
                      <tr
                        key={row.id}
                        className={`border-t border-[var(--cw-hairline)] border-l-4 align-top transition-colors ${rowTone(row.status, isToday)}`}
                      >
                        <td className="sticky left-0 z-10 bg-inherit px-3 py-2 font-mono text-xs text-[var(--cw-ink-muted)]">
                          <div className="flex flex-col gap-1">
                            <span>{row.rowIndex + 1}</span>
                            {isToday && (
                              <span className="inline-flex w-fit rounded bg-[var(--cw-neon)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--cw-neon-ink)]">
                                Today
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          {statusBadge(row.status)}
                          {row.errorMessage && (
                            <p className="mt-1 flex items-start gap-1 text-[10px] text-[var(--cw-danger)] max-w-[120px]">
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
                              ) : c.key === "platform" ? (
                                <select
                                  className={`${inputClass} text-xs`}
                                  value={d[c.key] || "both"}
                                  onChange={(e) => setCell(row.id, c.key, e.target.value)}
                                >
                                  <option value="both">both</option>
                                  <option value="facebook">facebook</option>
                                  <option value="instagram">instagram</option>
                                </select>
                              ) : (
                                <input
                                  className={`${inputClass} text-xs`}
                                  value={d[c.key] || ""}
                                  onChange={(e) => setCell(row.id, c.key, e.target.value)}
                                  placeholder={c.label}
                                />
                              )
                            ) : (
                              <p className="text-xs text-[var(--cw-ink-dim)] whitespace-pre-wrap line-clamp-4 px-1">
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
                              className="rounded-lg border border-[var(--cw-hairline)] p-1.5 text-[var(--cw-ink-muted)] hover:border-[color-mix(in_srgb,var(--cw-caution)_35%,var(--cw-hairline))] hover:text-[var(--cw-caution)]"
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
