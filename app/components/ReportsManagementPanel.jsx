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
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 sm:px-6 py-5 border-b border-gray-200 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FiFileText className="w-5 h-5 text-[#1d9c35]" />
            <h2 className="text-xl font-bold text-gray-900">Monthly reports</h2>
          </div>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl">
            Landscape slide-deck PDFs (website, social, or combined) emailed from each user&apos;s report
            toggles. Each client&apos;s slide/stat template from{" "}
            <span className="font-semibold text-gray-800">Reports → Report Studio</span> is applied to
            Send all and the Monday cron. Super admins receive all sites (one email per site).
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          <FiRefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="px-4 sm:px-6 py-5 space-y-5">
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : null}
        {message ? (
          <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{message}</div>
        ) : null}

        {loading ? (
          <p className="text-sm text-gray-500">Loading report settings…</p>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">Send weekly reports</p>
                <p className="text-xs text-gray-500 mt-0.5">
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
                  enabled ? "bg-[#1d9c35]" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow mt-1 transition ${
                    enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div className="rounded-xl border border-gray-100 px-4 py-4 space-y-3">
              <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <FiSend className="w-4 h-4 text-[#1d9c35]" />
                Send monthly reports now
              </p>
              <p className="text-xs text-gray-500">
                Builds Crossway landscape decks from live GSC / organic SEO / Meta data using each site&apos;s
                Report Studio template, then emails users who opted in.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={manualSiteKey}
                  onChange={(e) => setManualSiteKey(e.target.value)}
                  placeholder="Site key (URL or Meta page ID) — optional"
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => sendAll(manualSiteKey.trim())}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50"
                >
                  <FiMail className="w-4 h-4" />
                  {sending ? "Sending…" : manualSiteKey.trim() ? "Send for site" : "Send all"}
                </button>
              </div>
            </div>

            {recipients.length > 0 ? (
              <div>
                <p className="text-sm font-semibold text-gray-900 mb-2">Who gets what</p>
                <ul className="max-h-56 overflow-y-auto divide-y divide-gray-100 rounded-lg border border-gray-200 text-xs">
                  {recipients.slice(0, 80).map((t) => (
                    <li key={`${t.email}-${t.role}`} className="px-3 py-2 flex flex-col sm:flex-row sm:justify-between gap-1">
                      <span className="text-gray-700 truncate">
                        {t.email} <span className="text-gray-400">({t.role})</span>
                      </span>
                      <span className="text-gray-500 shrink-0">
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
                <p className="text-sm font-semibold text-gray-900 mb-2">Recent activity</p>
                <ul className="max-h-40 overflow-y-auto divide-y divide-gray-100 rounded-lg border border-gray-200 text-xs">
                  {recentLogs.slice(0, 15).map((log) => (
                    <li key={log.id} className="px-3 py-2">
                      <span className="font-medium text-gray-800">{log.recipientEmail}</span>
                      <span className="text-gray-500"> · {log.status}</span>
                      <span className="text-gray-400"> · {log.siteKey}</span>
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
