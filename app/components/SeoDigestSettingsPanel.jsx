"use client";

import { useCallback, useEffect, useState } from "react";
import { FiMail, FiRefreshCw, FiSend } from "react-icons/fi";

export default function SeoDigestSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [digestUsers, setDigestUsers] = useState([]);
  const [manualSiteKey, setManualSiteKey] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/seo-digest");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load digest settings");
      setEnabled(data.enabled === true || (data.enabled == null && data.effectiveEnabled));
      setDigestUsers(data.digestUsers || []);
    } catch (e) {
      setError(e.message || "Failed to load digest settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const persistEnabled = async (next) => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/seo-digest", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setEnabled(data.enabled === true);
      setMessage(next ? "Weekly staff digests enabled." : "Weekly staff digests disabled.");
    } catch (e) {
      setError(e.message || "Failed to save");
      setEnabled(!next);
    } finally {
      setSaving(false);
    }
  };

  const sendNow = async () => {
    setSending(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/seo-digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(manualSiteKey.trim() ? { siteKey: manualSiteKey.trim() } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed");
      const sent = (data.results || []).filter((r) => r.ok).length;
      setMessage(`Sent ${sent} digest email(s).`);
      await load();
    } catch (e) {
      setError(e.message || "Send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] overflow-hidden">
      <div className="px-4 sm:px-6 py-5 border-b border-[var(--cw-hairline)] flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FiMail className="w-5 h-5 text-[var(--cw-neon)]" />
            <h2 className="text-xl font-bold text-[var(--cw-ink)]">Weekly staff digests</h2>
          </div>
          <p className="text-sm text-[var(--cw-ink-muted)] mt-1 max-w-2xl">
            Landscape PDF digests for users with <strong>Weekly staff digest</strong> enabled (per user in Admin).
            Super admins always receive digests for every site. Global recipient lists have been removed.
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
          <div className="rounded-lg border border-[color-mix(in_srgb,var(--cw-danger)_35%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-danger)_12%,var(--cw-surface))] px-3 py-2 text-sm text-[var(--cw-danger)]">{error}</div>
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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-[var(--cw-ink)]">Weekly digest sends</p>
                <p className="text-xs text-[var(--cw-ink-muted)] mt-0.5">
                  Mondays 06:00 · {digestUsers.length} user(s) · global kill-switch
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                disabled={saving}
                onClick={() => {
                  const next = !enabled;
                  setEnabled(next);
                  persistEnabled(next);
                }}
                className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors ${
                  enabled ? "bg-[var(--cw-neon)]" : "bg-[var(--cw-hairline-strong)]"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-[var(--cw-ink)] shadow mt-1 transition ${
                    enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div className="rounded-xl border border-[var(--cw-hairline)] px-4 py-4 space-y-3">
              <p className="text-sm font-semibold text-[var(--cw-ink)] flex items-center gap-2">
                <FiSend className="w-4 h-4 text-[var(--cw-neon)]" />
                Send digests now
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={manualSiteKey}
                  onChange={(e) => setManualSiteKey(e.target.value)}
                  placeholder="Optional site key filter"
                  className="flex-1 px-3 py-2 border border-[var(--cw-hairline)] bg-[var(--cw-raised)] text-[var(--cw-ink)] placeholder:text-[var(--cw-ink-faint)] rounded-lg text-sm"
                />
                <button
                  type="button"
                  disabled={sending}
                  onClick={sendNow}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[var(--cw-neon)] text-[var(--cw-neon-ink)] text-sm font-semibold hover:bg-[var(--cw-neon-deep)] disabled:opacity-50"
                >
                  <FiMail className="w-4 h-4" />
                  {sending ? "Sending…" : "Send digests"}
                </button>
              </div>
            </div>

            {digestUsers.length > 0 ? (
              <div>
                <p className="text-sm font-semibold text-[var(--cw-ink)] mb-2">Digest recipients (from user prefs)</p>
                <ul className="max-h-48 overflow-y-auto divide-y divide-[var(--cw-hairline)] rounded-lg border border-[var(--cw-hairline)] text-xs">
                  {digestUsers.slice(0, 60).map((u) => (
                    <li key={u.email} className="px-3 py-2 flex justify-between gap-2">
                      <span className="text-[var(--cw-ink-dim)] truncate">
                        {u.email} <span className="text-[var(--cw-ink-faint)]">({u.role})</span>
                      </span>
                      <span className="text-[var(--cw-ink-muted)] truncate max-w-[45%]">
                        {u.sites?.length ? `${u.sites.length} site(s)` : "all / none"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
