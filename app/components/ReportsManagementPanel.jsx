"use client";

import { useCallback, useEffect, useState } from "react";
import { FiFileText, FiMail, FiRefreshCw, FiSend } from "react-icons/fi";

export default function ReportsManagementPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [recipients, setRecipients] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [manualSiteKey, setManualSiteKey] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/client-reports");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load report settings");
      setEnabled(data.enabled === true || (data.enabled == null && data.effectiveEnabled));
      setRecipients(data.recipients || []);
      setRecentLogs(data.recentLogs || []);
    } catch (e) {
      setError(e.message || "Failed to load");
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
      const res = await fetch("/api/admin/client-reports", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setEnabled(data.enabled === true);
      setMessage(next ? "Weekly report delivery enabled." : "Weekly report delivery disabled.");
    } catch (e) {
      setError(e.message || "Failed to save");
      setEnabled(!next);
    } finally {
      setSaving(false);
    }
  };

  const sendAll = async (siteKey) => {
    setSending(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/client-reports/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(siteKey ? { siteKey } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed");
      const sent = (data.results || []).filter((r) => r.ok).length;
      setMessage(
        siteKey
          ? `Sent ${sent} monthly report email(s) for that site.`
          : `Sent ${sent} monthly report email(s).`
      );
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
            <FiFileText className="w-5 h-5 text-[var(--cw-neon)]" />
            <h2 className="text-xl font-bold text-[var(--cw-ink)]">Monthly reports</h2>
          </div>
          <p className="text-sm text-[var(--cw-ink-muted)] mt-1 max-w-2xl">
            Landscape slide-deck PDFs (website, social, or combined) emailed from each user&apos;s report
            toggles. Each client&apos;s slide/stat template from{" "}
            <span className="font-semibold text-[var(--cw-ink-dim)]">Reports → Report Studio</span> is applied to
            Send all and the Monday cron. Super admins receive all sites (one email per site).
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
          <div className="rounded-lg border border-[color-mix(in_srgb,var(--cw-neon)_35%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-neon)_12%,var(--cw-surface))] px-3 py-2 text-sm text-[var(--cw-neon)]">{message}</div>
        ) : null}

        {loading ? (
          <p className="text-sm text-[var(--cw-ink-muted)]">Loading report settings…</p>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-[var(--cw-ink)]">Send weekly reports</p>
                <p className="text-xs text-[var(--cw-ink-muted)] mt-0.5">
                  Mondays 07:00 · {recipients.length} recipient(s) · requires SMTP
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
                Send monthly reports now
              </p>
              <p className="text-xs text-[var(--cw-ink-muted)]">
                Builds RoboSEO.Ai landscape decks from live GSC / organic SEO / Meta data using each site&apos;s
                Report Studio template, then emails users who opted in.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={manualSiteKey}
                  onChange={(e) => setManualSiteKey(e.target.value)}
                  placeholder="Site key (URL or Meta page ID) — optional"
                  className="flex-1 px-3 py-2 border border-[var(--cw-hairline)] bg-[var(--cw-raised)] text-[var(--cw-ink)] placeholder:text-[var(--cw-ink-faint)] rounded-lg text-sm focus:outline-none focus:border-[var(--cw-neon)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--cw-neon)_28%,transparent)]"
                />
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => sendAll(manualSiteKey.trim())}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[var(--cw-neon)] text-[var(--cw-neon-ink)] text-sm font-semibold hover:bg-[var(--cw-neon-deep)] disabled:opacity-50"
                >
                  <FiMail className="w-4 h-4" />
                  {sending ? "Sending…" : manualSiteKey.trim() ? "Send for site" : "Send all"}
                </button>
              </div>
            </div>

            {recipients.length > 0 ? (
              <div>
                <p className="text-sm font-semibold text-[var(--cw-ink)] mb-2">Who gets what</p>
                <ul className="max-h-56 overflow-y-auto divide-y divide-[var(--cw-hairline)] rounded-lg border border-[var(--cw-hairline)] text-xs">
                  {recipients.slice(0, 80).map((t) => (
                    <li key={`${t.email}-${t.role}`} className="px-3 py-2 flex flex-col sm:flex-row sm:justify-between gap-1">
                      <span className="text-[var(--cw-ink-dim)] truncate">
                        {t.email} <span className="text-[var(--cw-ink-faint)]">({t.role})</span>
                      </span>
                      <span className="text-[var(--cw-ink-muted)] shrink-0">
                        {[
                          t.receiveWebsiteReport ? "website" : null,
                          t.receiveSmmReport ? "smm" : null,
                          t.receiveCombinedReport ? "combined" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {recentLogs.length > 0 ? (
              <div>
                <p className="text-sm font-semibold text-[var(--cw-ink)] mb-2">Recent activity</p>
                <ul className="max-h-40 overflow-y-auto divide-y divide-[var(--cw-hairline)] rounded-lg border border-[var(--cw-hairline)] text-xs">
                  {recentLogs.slice(0, 15).map((log) => (
                    <li key={log.id} className="px-3 py-2">
                      <span className="font-medium text-[var(--cw-ink-dim)]">{log.recipientEmail}</span>
                      <span className="text-[var(--cw-ink-muted)]"> · {log.status}</span>
                      <span className="text-[var(--cw-ink-faint)]"> · {log.siteKey}</span>
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
