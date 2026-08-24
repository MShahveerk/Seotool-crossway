"use client";

import { useCallback, useEffect, useState } from "react";
import { FiDatabase, FiKey, FiRefreshCw, FiSave } from "react-icons/fi";

const inputClass =
  "w-full rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-2 text-sm text-[var(--cw-ink)] placeholder:text-[var(--cw-ink-faint)]";

function ReadyChip({ ok, label }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        ok
          ? "border-[color-mix(in_srgb,var(--cw-neon)_40%,var(--cw-hairline))] text-[var(--cw-neon)]"
          : "border-[var(--cw-hairline)] text-[var(--cw-ink-faint)]"
      }`}
    >
      {label}
    </span>
  );
}

export default function DataSourcesPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [serpApiKey, setSerpApiKey] = useState("");
  const [checkGoogleDuplicates, setCheckGoogleDuplicates] = useState(true);
  const [deciderFallback, setDeciderFallback] = useState("harvest");
  const [ready, setReady] = useState({ trends: false, serp: false, seranking: false, gsc: false });
  const [keySource, setKeySource] = useState("missing");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/data-sources");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load data sources");
      const cfg = data.config || {};
      setSerpApiKey(cfg.serpApiKey || "");
      setCheckGoogleDuplicates(cfg.checkGoogleDuplicates !== false);
      setDeciderFallback(cfg.deciderFallback === "gsc" ? "gsc" : "harvest");
      setReady(cfg.ready || {});
      setKeySource(cfg.keySource?.serpapi || "missing");
    } catch (e) {
      setError(e.message || "Failed to load data sources");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/data-sources", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serpApiKey, checkGoogleDuplicates, deciderFallback }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      const cfg = data.config || {};
      setSerpApiKey(cfg.serpApiKey || "");
      setCheckGoogleDuplicates(cfg.checkGoogleDuplicates !== false);
      setDeciderFallback(cfg.deciderFallback === "gsc" ? "gsc" : "harvest");
      setReady(cfg.ready || {});
      setKeySource(cfg.keySource?.serpapi || "missing");
      setMessage("Data source credentials saved.");
    } catch (e) {
      setError(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[var(--cw-hairline)] px-4 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FiDatabase className="h-5 w-5 text-[var(--cw-neon)]" />
            <h2 className="text-xl font-bold text-[var(--cw-ink)]">Credentials</h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-[var(--cw-ink-muted)]">
            Keys for live search data. Google has no public Trends API — we use SerpAPI&apos;s Trends
            engines plus live Google SERP. SE Ranking stays in the server environment.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--cw-hairline)] px-3 py-2 text-sm font-semibold text-[var(--cw-ink-dim)] hover:bg-[var(--cw-overlay)]"
        >
          <FiRefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="space-y-5 px-4 py-5 sm:px-6">
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
          <p className="text-sm text-[var(--cw-ink-muted)]">Loading…</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              <ReadyChip ok={ready.trends} label="Trends" />
              <ReadyChip ok={ready.serp} label="Live SERP" />
              <ReadyChip ok={ready.seranking} label="SE Ranking" />
              <ReadyChip ok={ready.gsc} label="Search Console" />
            </div>

            <div className="space-y-3 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-4 py-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-[var(--cw-ink)]">
                <FiKey className="h-4 w-4 text-[var(--cw-neon)]" />
                Google Trends and live SERP (SerpAPI)
              </p>
              <p className="text-xs text-[var(--cw-ink-muted)]">
                Powers Blog Studio topic trends, optional duplicate-title checks, and SERP Analysis.
                {keySource === "env" ? " Currently using the environment key." : ""}
                {keySource === "saved" ? " Using the key saved here." : ""}
                {keySource === "missing" ? " No key yet — drafts still use the keyword library; world-trend hooks stay off." : ""}
              </p>
              <input
                type="password"
                autoComplete="off"
                className={inputClass}
                value={serpApiKey}
                onChange={(e) => setSerpApiKey(e.target.value)}
                placeholder="SerpAPI key"
              />
              <label className="flex items-start gap-2 text-sm text-[var(--cw-ink-dim)]">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={checkGoogleDuplicates}
                  onChange={(e) => setCheckGoogleDuplicates(e.target.checked)}
                />
                <span>
                  Check Google for duplicate titles
                  <span className="mt-0.5 block text-xs text-[var(--cw-ink-faint)]">
                    One quoted search per draft. Off = in-app titles only.
                  </span>
                </span>
              </label>
            </div>

            <div className="space-y-3 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-4 py-4">
              <p className="text-sm font-semibold text-[var(--cw-ink)]">Keyword library ranking</p>
              <p className="text-xs text-[var(--cw-ink-muted)]">
                When SerpAPI is on, the Decider prefers relevant world trends, then overlap
                (library×trend or Search Console ∩ library), then the keyword library. This ranking
                is the library lane when Trends are off, or when no on-niche world trend exists.
              </p>
              <label className="flex items-start gap-2 text-sm text-[var(--cw-ink-dim)]">
                <input
                  type="radio"
                  className="mt-1"
                  name="deciderFallback"
                  value="harvest"
                  checked={deciderFallback === "harvest"}
                  onChange={() => setDeciderFallback("harvest")}
                />
                <span>
                  Research library
                  <span className="ml-1.5 rounded-md border border-[color-mix(in_srgb,var(--cw-neon)_40%,var(--cw-hairline))] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--cw-neon)]">
                    Best
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--cw-ink-faint)]">
                    Featured and universe keywords from the last Research run. Prefers gap/strike,
                    low KD, real volume — not dump cluster titles.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm text-[var(--cw-ink-dim)]">
                <input
                  type="radio"
                  className="mt-1"
                  name="deciderFallback"
                  value="gsc"
                  checked={deciderFallback === "gsc"}
                  onChange={() => setDeciderFallback("gsc")}
                />
                <span>
                  Search Console ∩ library
                  <span className="mt-0.5 block text-xs text-[var(--cw-ink-faint)]">
                    Rank library keywords that also appear in Search Console. Silent library-only if
                    GSC is not connected.
                  </span>
                </span>
              </label>
            </div>

            <div className="rounded-xl border border-[var(--cw-hairline)] px-4 py-4">
              <p className="text-sm font-semibold text-[var(--cw-ink)]">SE Ranking</p>
              <p className="mt-1 text-xs text-[var(--cw-ink-muted)]">
                {ready.seranking
                  ? "Configured via SERANKING_API_KEY in the server environment."
                  : "Not configured. Set SERANKING_API_KEY in the server environment (.env / host secrets)."}
              </p>
            </div>

            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--cw-neon)] px-4 py-2 text-sm font-semibold text-[var(--cw-neon-ink)] hover:bg-[var(--cw-neon-soft)] disabled:opacity-50"
            >
              <FiSave className="h-4 w-4" />
              {saving ? "Saving…" : "Save credentials"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
