"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FiClock, FiExternalLink, FiRefreshCw } from "react-icons/fi";

const GROUP_ORDER = ["ops", "publish", "ingest", "reports", "seo"];

function Toggle({ checked, disabled, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors ${
        checked ? "bg-[var(--cw-neon)]" : "bg-[var(--cw-hairline-strong)]"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-[var(--cw-ink)] shadow mt-1 transition ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function statusChip(job) {
  if (job.effectiveEnabled) {
    return (
      <span className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--cw-neon)_12%,var(--cw-surface))] px-2 py-0.5 text-[11px] font-semibold text-[var(--cw-neon)] border border-[color-mix(in_srgb,var(--cw-neon)_35%,var(--cw-hairline))]">
        Running
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-[var(--cw-raised)] px-2 py-0.5 text-[11px] font-semibold text-[var(--cw-ink-muted)] border border-[var(--cw-hairline)]">
      Off
    </span>
  );
}

export default function CronJobsPanel({ onNavigate } = {}) {
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [jobs, setJobs] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/cron-jobs", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load cron jobs");
      setJobs(data.jobs || []);
    } catch (e) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = {};
    for (const job of jobs) {
      const g = job.group || "ops";
      if (!map[g]) map[g] = [];
      map[g].push(job);
    }
    return GROUP_ORDER.filter((g) => map[g]?.length).map((g) => ({
      id: g,
      label: map[g][0]?.groupLabel || g,
      jobs: map[g],
    }));
  }, [jobs]);

  const persist = async (id, patch) => {
    setSavingId(id);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/cron-jobs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setMessage(
        data.sitesCleared
          ? `Updated ${id}. Cleared ${data.sitesCleared.updated || 0} per-site toggle(s).`
          : `Updated ${id}.`
      );
      await load();
    } catch (e) {
      setError(e.message || "Failed to save");
    } finally {
      setSavingId("");
    }
  };

  return (
    <div className="rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] overflow-hidden mb-6">
      <div className="px-4 sm:px-6 py-5 border-b border-[var(--cw-hairline)] flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FiClock className="w-5 h-5 text-[var(--cw-neon)]" />
            <h2 className="text-xl font-bold text-[var(--cw-ink)]">Cron jobs</h2>
          </div>
          <p className="text-sm text-[var(--cw-ink-muted)] mt-1 max-w-3xl">
            Master switches for every scheduled job. Jobs marked &quot;Also configured elsewhere&quot;
            still need their section toggles — this global switch can stop them cold, and you can
            clear per-site enables from here.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--cw-hairline)] text-sm font-semibold text-[var(--cw-ink-dim)] hover:bg-[var(--cw-overlay)]"
        >
          <FiRefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="px-4 sm:px-6 py-5 space-y-5">
        {error ? (
          <div className="rounded-lg border border-[color-mix(in_srgb,var(--cw-danger)_35%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-danger)_12%,var(--cw-surface))] px-3 py-2 text-sm text-[var(--cw-danger)]">
            {error}
          </div>
        ) : null}
        {message ? (
          <div className="rounded-lg border border-[color-mix(in_srgb,var(--cw-neon)_35%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-neon)_12%,var(--cw-surface))] px-3 py-2 text-sm text-[var(--cw-neon)]">
            {message}
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-[var(--cw-ink-muted)]">Loading cron schedules…</p>
        ) : (
          grouped.map((group) => (
            <section key={group.id} className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-[var(--cw-ink-faint)]">
                {group.label}
              </h3>
              <div className="space-y-2">
                {group.jobs.map((job) => {
                  const busy = savingId === job.id;
                  const toggleOn = job.effectiveEnabled;
                  const dep = job.dependency;
                  const depStat = job.dependencyStatus;
                  return (
                    <div
                      key={job.id}
                      className="rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-4 py-3 flex flex-col gap-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-[var(--cw-ink)]">{job.label}</p>
                            {statusChip(job)}
                            {dep ? (
                              <span className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--cw-caution)_12%,var(--cw-surface))] px-2 py-0.5 text-[11px] font-semibold text-[var(--cw-caution)] border border-[color-mix(in_srgb,var(--cw-caution)_35%,var(--cw-hairline))]">
                                Also configured elsewhere
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs text-[var(--cw-ink-muted)]">{job.description}</p>
                          <p className="text-[11px] text-[var(--cw-ink-faint)] font-mono">
                            {job.when} · <span className="opacity-70">{job.schedule}</span>
                            {job.envFallback ? (
                              <span>
                                {" "}
                                · env {job.envFallback}
                                {job.envFlagOn ? " (on)" : " (off)"}
                              </span>
                            ) : null}
                          </p>
                          {dep ? (
                            <div className="mt-1 rounded-lg border border-[color-mix(in_srgb,var(--cw-caution)_30%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-caution)_10%,var(--cw-raised))] px-3 py-2 text-xs text-[var(--cw-caution)] space-y-1">
                              <p>
                                <span className="font-semibold">Depends on:</span>{" "}
                                {dep.sectionLabel}
                              </p>
                              <p className="text-[var(--cw-ink-muted)]">{dep.note}</p>
                              {depStat ? (
                                <p>
                                  Per-site status:{" "}
                                  <span className="font-semibold">
                                    {depStat.enabledSites}/{depStat.totalSites} enabled
                                  </span>
                                  {depStat.detail ? ` · ${depStat.detail}` : ""}
                                </p>
                              ) : null}
                              <div className="flex flex-wrap gap-2 pt-1">
                                {dep.section && typeof onNavigate === "function" ? (
                                  <button
                                    type="button"
                                    onClick={() => onNavigate(dep.section)}
                                    className="inline-flex items-center gap-1 rounded-md border border-[color-mix(in_srgb,var(--cw-caution)_40%,var(--cw-hairline))] bg-[var(--cw-surface)] px-2 py-1 text-[11px] font-semibold text-[var(--cw-caution)] hover:bg-[var(--cw-overlay)]"
                                  >
                                    Open section <FiExternalLink className="w-3 h-3" />
                                  </button>
                                ) : null}
                                {dep.type === "per-site" ? (
                                  <button
                                    type="button"
                                    disabled={busy || !depStat?.enabledSites}
                                    onClick={() => {
                                      if (
                                        !window.confirm(
                                          `Turn off all per-site toggles for “${job.label}”? Global cron switch is unchanged.`
                                        )
                                      ) {
                                        return;
                                      }
                                      persist(job.id, { disableAllSites: true });
                                    }}
                                    className="inline-flex items-center rounded-md border border-[color-mix(in_srgb,var(--cw-caution)_40%,var(--cw-hairline))] bg-[var(--cw-surface)] px-2 py-1 text-[11px] font-semibold text-[var(--cw-caution)] hover:bg-[var(--cw-overlay)] disabled:opacity-40"
                                  >
                                    Disable all sites
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs text-[var(--cw-ink-muted)] sm:hidden">
                            {toggleOn ? "On" : "Off"}
                          </span>
                          <Toggle
                            checked={toggleOn}
                            disabled={busy}
                            label={`Toggle ${job.label}`}
                            onChange={(next) => persist(job.id, { enabled: next })}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
