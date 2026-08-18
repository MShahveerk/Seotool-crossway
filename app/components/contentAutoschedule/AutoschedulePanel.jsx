"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiSave,
  FiPlay,
  FiRefreshCw,
  FiCalendar,
  FiClock,
  FiToggleLeft,
  FiToggleRight,
} from "react-icons/fi";

const inputClass =
  "w-full border border-[var(--cw-hairline)] rounded-lg px-3 py-2 text-sm bg-[var(--cw-raised)] text-[var(--cw-ink)] placeholder:text-[var(--cw-ink-faint)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--cw-neon)_28%,transparent)] focus:border-[var(--cw-neon)]";
const labelClass =
  "text-xs font-semibold uppercase tracking-wide text-[var(--cw-ink-faint)]";

function formatWhen(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * @param {{ kind: "post"|"blog", selectedSite: string, title: string, subtitle: string }} props
 */
export default function AutoschedulePanel({
  kind,
  selectedSite = "",
  title = "Autoscheduler",
  subtitle = "",
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState(null);
  const [config, setConfig] = useState(null);
  const [preview, setPreview] = useState(null);

  const qs = useMemo(() => {
    if (!selectedSite) return "";
    return `?kind=${encodeURIComponent(kind)}&siteLink=${encodeURIComponent(selectedSite)}`;
  }, [kind, selectedSite]);

  const load = useCallback(async () => {
    if (!selectedSite) {
      setConfig(null);
      setPreview(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const [cfgRes, prevRes] = await Promise.all([
        fetch(`/api/admin/content-autoschedule${qs}`),
        fetch(`/api/admin/content-autoschedule/preview${qs}`),
      ]);
      const cfgData = await cfgRes.json();
      const prevData = await prevRes.json();
      if (!cfgRes.ok) throw new Error(cfgData.error || "Failed to load config.");
      if (!prevRes.ok) throw new Error(prevData.error || "Failed to load preview.");
      setConfig(cfgData.config);
      setPreview(prevData.preview);
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setLoading(false);
    }
  }, [qs, selectedSite]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = (p) => setConfig((c) => (c ? { ...c, ...p } : c));

  const save = async () => {
    if (!selectedSite || !config) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/content-autoschedule${qs}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: config.enabled,
          horizonDays: Number(config.horizonDays) || 14,
          itemsPerDay: Number(config.itemsPerDay) || 1,
          scheduleHour: Number(config.scheduleHour) ?? 10,
          scheduleMinute: Number(config.scheduleMinute) ?? 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed.");
      setConfig(data.config);
      setMessage({ ok: true, text: "Autoscheduler settings saved." });
      await load();
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    if (!selectedSite) return;
    setRunning(true);
    setMessage(null);
    try {
      // Persist knobs first so Run uses current UI values
      if (config) {
        await fetch(`/api/admin/content-autoschedule${qs}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enabled: config.enabled,
            horizonDays: Number(config.horizonDays) || 14,
            itemsPerDay: Number(config.itemsPerDay) || 1,
            scheduleHour: Number(config.scheduleHour) ?? 10,
            scheduleMinute: Number(config.scheduleMinute) ?? 0,
          }),
        });
      }
      const res = await fetch(`/api/admin/content-autoschedule/run${qs}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Run failed.");
      const n = data.result?.applied?.length || 0;
      setMessage({
        ok: true,
        text:
          n > 0
            ? `Assigned ${n} item${n === 1 ? "" : "s"} to free weekdays.`
            : "No new assignments — pool empty or no free weekdays in the horizon.",
      });
      await load();
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setRunning(false);
    }
  };

  const timeValue = useMemo(() => {
    if (!config) return "10:00";
    const h = String(config.scheduleHour ?? 10).padStart(2, "0");
    const m = String(config.scheduleMinute ?? 0).padStart(2, "0");
    return `${h}:${m}`;
  }, [config]);

  if (!selectedSite) {
    return (
      <div className="rounded-xl border border-[color-mix(in_srgb,var(--cw-caution)_35%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-caution)_10%,var(--cw-surface))] p-5 text-sm text-[var(--cw-caution)]">
        Select a client site in the dashboard header to configure the autoscheduler.
      </div>
    );
  }

  if (loading || !config) {
    return (
      <div className="rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-8 text-sm text-[var(--cw-ink-muted)] flex items-center gap-2">
        <FiRefreshCw className="animate-spin" /> Loading autoscheduler…
      </div>
    );
  }

  const proposals = preview?.proposals || [];

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="relative overflow-hidden rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-5 shadow-sm">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(14,255,42,0.10),_transparent_55%),linear-gradient(135deg,var(--cw-surface)_0%,var(--cw-raised)_100%)]" />
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--cw-neon)]">
                {kind === "blog" ? "Blog" : "Post"} Autoscheduler
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--cw-ink)]">{title}</h1>
              <p className="mt-1 text-sm text-[var(--cw-ink-muted)] max-w-xl">{subtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => patch({ enabled: !config.enabled })}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                config.enabled
                  ? "border-[color-mix(in_srgb,var(--cw-neon)_40%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-neon)_9%,var(--cw-surface))] text-[var(--cw-neon)]"
                  : "border-[var(--cw-hairline)] bg-[var(--cw-surface)] text-[var(--cw-ink-muted)]"
              }`}
            >
              {config.enabled ? (
                <FiToggleRight className="h-5 w-5 text-[var(--cw-neon)]" />
              ) : (
                <FiToggleLeft className="h-5 w-5" />
              )}
              {config.enabled ? "Enabled" : "Disabled"}
            </button>
          </div>
          {message && (
            <p
              className={`mt-3 text-sm rounded-lg px-3 py-2 border ${
                message.ok
                  ? "text-[var(--cw-neon)] bg-[color-mix(in_srgb,var(--cw-neon)_9%,var(--cw-surface))] border-[color-mix(in_srgb,var(--cw-neon)_40%,var(--cw-hairline))]"
                  : "text-[var(--cw-danger)] bg-[color-mix(in_srgb,var(--cw-danger)_10%,var(--cw-surface))] border-[color-mix(in_srgb,var(--cw-danger)_35%,var(--cw-hairline))]"
              }`}
            >
              {message.text}
            </p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-5 shadow-sm space-y-4">
        <p className="text-sm text-[var(--cw-ink-muted)]">
          Fills blank schedule dates only — Mon–Fri days that don’t already have a{" "}
          {kind === "blog" ? "blog" : "post"} for this site. Edit or clear dates anytime in Content
          Calendar.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Horizon (days)</label>
            <input
              type="number"
              min={1}
              max={60}
              className={`${inputClass} mt-1`}
              value={config.horizonDays ?? 14}
              onChange={(e) => patch({ horizonDays: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className={labelClass}>Items per day</label>
            <input
              type="number"
              min={1}
              max={5}
              className={`${inputClass} mt-1`}
              value={config.itemsPerDay ?? 1}
              onChange={(e) => patch({ itemsPerDay: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className={labelClass}>Time (app timezone)</label>
            <input
              type="time"
              className={`${inputClass} mt-1`}
              value={timeValue}
              onChange={(e) => {
                const [h, m] = String(e.target.value || "10:00").split(":").map(Number);
                patch({ scheduleHour: h, scheduleMinute: m });
              }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--cw-neon)] px-3 py-2 text-sm font-semibold text-[var(--cw-canvas)] hover:bg-[color-mix(in_srgb,var(--cw-neon)_85%,#000)] disabled:opacity-50"
          >
            {saving ? <FiRefreshCw className="animate-spin" /> : <FiSave />}
            Save
          </button>
          <button
            type="button"
            onClick={runNow}
            disabled={running}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-surface)] px-3 py-2 text-sm font-semibold text-[var(--cw-ink-dim)] hover:border-[color-mix(in_srgb,var(--cw-neon)_40%,var(--cw-hairline))] disabled:opacity-50"
          >
            {running ? <FiRefreshCw className="animate-spin" /> : <FiPlay />}
            Run now
          </button>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-surface)] px-3 py-2 text-sm font-semibold text-[var(--cw-ink-muted)] hover:bg-[var(--cw-overlay)]"
          >
            <FiRefreshCw /> Refresh preview
          </button>
        </div>

        <p className="text-xs text-[var(--cw-ink-muted)]">
          Last run: {formatWhen(config.lastRunAt)} · When enabled, cron fills gaps automatically.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] px-4 py-3">
          <p className={labelClass}>Unscheduled pool</p>
          <p className="mt-1 text-2xl font-bold text-[var(--cw-ink)]">{preview?.poolCount ?? 0}</p>
          <p className="text-xs text-[var(--cw-ink-muted)]">draft / pending / edited / approved</p>
        </div>
        <div className="rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] px-4 py-3">
          <p className={labelClass}>Free weekdays</p>
          <p className="mt-1 text-2xl font-bold text-[var(--cw-ink)]">
            {preview?.freeWeekdays?.length ?? 0}
          </p>
          <p className="text-xs text-[var(--cw-ink-muted)]">in horizon · no existing item</p>
        </div>
        <div className="rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] px-4 py-3">
          <p className={labelClass}>Next assignments</p>
          <p className="mt-1 text-2xl font-bold text-[var(--cw-ink)]">{proposals.length}</p>
          <p className="text-xs text-[var(--cw-ink-muted)]">would be written on Run</p>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <FiCalendar className="text-[var(--cw-neon)]" />
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--cw-ink-faint)]">
            Proposed schedule
          </p>
        </div>
        {proposals.length === 0 ? (
          <p className="text-sm text-[var(--cw-ink-muted)]">
            Nothing to assign right now. Add unscheduled items or free up a weekday.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--cw-hairline)]">
            {proposals.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--cw-ink)] truncate">{p.title}</p>
                  <p className="text-[11px] text-[var(--cw-ink-faint)] uppercase">{p.status}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--cw-ink-dim)] bg-[var(--cw-raised)] border border-[var(--cw-hairline)] rounded-lg px-2.5 py-1">
                  <FiClock className="h-3.5 w-3.5 text-[var(--cw-neon)]" />
                  {formatWhen(p.scheduledFor)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
