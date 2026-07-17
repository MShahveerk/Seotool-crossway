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
  const [targets, setTargets] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [approverCount, setApproverCount] = useState(0);
  const [manualSiteKey, setManualSiteKey] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/client-reports");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load report settings");
      setEnabled(data.enabled === true || (data.enabled == null && data.effectiveEnabled));
      setTargets(data.targets || []);
      setRecentLogs(data.recentLogs || []);
      setApproverCount(data.approverCount || 0);
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
      setMessage(next ? "Weekly approver reports enabled." : "Weekly approver reports disabled.");
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
      setMessage(siteKey ? `Sent ${sent} report pack(s) for that site.` : `Sent ${sent} report pack(s) across all approvers.`);
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
            <h2 className="text-xl font-bold text-gray-900">Client Reports (Approvers)</h2>
          </div>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl">
            Auto-email PDF report packs to <strong>approver</strong> users for sites assigned to them. Meta-only
            pages without website + GTM get <strong>SMM reports only</strong>. Internal weekly SEO digest is managed
            separately above.
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
                <p className="text-sm font-semibold text-gray-900">Send weekly reports to approvers</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Mondays 07:00 server time · {approverCount} approver(s) · {targets.length} site assignment(s) · requires
                  SMTP
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
                Send reports now
              </p>
              <p className="text-xs text-gray-500">
                Sends all applicable PDFs (SMM + website/SEO when linked) to approvers for the selected site, or
                everyone if no site is specified.
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

            {targets.length > 0 ? (
              <div>
                <p className="text-sm font-semibold text-gray-900 mb-2">Approver assignments</p>
                <ul className="max-h-48 overflow-y-auto divide-y divide-gray-100 rounded-lg border border-gray-200 text-xs">
                  {targets.slice(0, 50).map((t, i) => (
                    <li key={`${t.email}-${t.siteKey}-${i}`} className="px-3 py-2 flex justify-between gap-2">
                      <span className="text-gray-700 truncate">{t.email}</span>
                      <span className="text-gray-500 truncate max-w-[45%]">{t.siteKey}</span>
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
                      <span className="text-gray-500"> · {log.trigger} · {log.status}</span>
                      <span className="block text-gray-400 truncate">{log.siteKey}</span>
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
