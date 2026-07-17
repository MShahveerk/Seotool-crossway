"use client";

import { useCallback, useEffect, useState } from "react";
import { FiMail, FiPlus, FiTrash2, FiRefreshCw, FiGlobe } from "react-icons/fi";

export default function SeoDigestSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [recipients, setRecipients] = useState([]);
  const [sites, setSites] = useState([]);
  const [recipientSource, setRecipientSource] = useState("");
  const [resolvedRecipients, setResolvedRecipients] = useState([]);
  const [newEmail, setNewEmail] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [showSites, setShowSites] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/seo-digest");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load digest settings");
      setEnabled(data.enabled === true || (data.enabled == null && data.effectiveEnabled));
      setRecipients(data.recipients || []);
      setSites(data.sites || []);
      setRecipientSource(data.recipientSource || "");
      setResolvedRecipients(data.resolvedRecipients || []);
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
      setMessage(next ? "Weekly SEO digest enabled." : "Weekly SEO digest disabled.");
      setRecipientSource(data.recipientSource || "");
      setResolvedRecipients(data.resolvedRecipients || []);
    } catch (e) {
      setError(e.message || "Failed to save");
      setEnabled(!next);
    } finally {
      setSaving(false);
    }
  };

  const addRecipient = async (e) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/seo-digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail.trim(), label: newLabel.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add recipient");
      setRecipients(data.recipients || []);
      setNewEmail("");
      setNewLabel("");
      setMessage("Recipient added.");
      await load();
    } catch (err) {
      setError(err.message || "Failed to add recipient");
    } finally {
      setSaving(false);
    }
  };

  const removeRecipient = async (id) => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/admin/seo-digest?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove");
      setRecipients(data.recipients || []);
      setMessage("Recipient removed.");
      await load();
    } catch (err) {
      setError(err.message || "Failed to remove");
    } finally {
      setSaving(false);
    }
  };

  const sourceLabel =
    recipientSource === "database"
      ? "Using the list below"
      : recipientSource === "env"
        ? "Using SEO_DIGEST_RECIPIENTS env (add emails below to override)"
        : "Falling back to all super_admin emails (add people below to customize)";

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 sm:px-6 py-5 border-b border-gray-200 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FiMail className="w-5 h-5 text-[#1d9c35]" />
            <h2 className="text-xl font-bold text-gray-900">Weekly SEO Digest</h2>
          </div>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl">
            One Monday email summarizing SEO opportunities for{" "}
            <strong>all websites</strong> in the system (from Manage Sites &amp; Tracking — not Meta-only
            pages). Recipients you add here override env / super_admin defaults.
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
          <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            {message}
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-gray-500">Loading digest settings…</p>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">Send weekly digest email</p>
                <p className="text-xs text-gray-500 mt-0.5">Mondays 06:00 server time · requires SMTP</p>
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

            <div className="rounded-xl border border-gray-100 px-4 py-3">
              <button
                type="button"
                onClick={() => setShowSites((v) => !v)}
                className="flex items-center gap-2 text-sm font-semibold text-gray-900"
              >
                <FiGlobe className="w-4 h-4 text-[#1d9c35]" />
                Included websites ({sites.length})
                <span className="text-xs font-medium text-gray-500">{showSites ? "Hide" : "Show"}</span>
              </button>
              {showSites ? (
                sites.length === 0 ? (
                  <p className="mt-2 text-sm text-gray-500">
                    No websites found yet. Add them under Manage Sites &amp; Tracking.
                  </p>
                ) : (
                  <ul className="mt-2 max-h-40 overflow-y-auto space-y-1">
                    {sites.map((s) => (
                      <li key={s} className="text-xs text-gray-600 break-all">
                        {s}
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </div>

            <div>
              <p className="text-sm font-semibold text-gray-900 mb-1">Digest recipients</p>
              <p className="text-xs text-gray-500 mb-3">{sourceLabel}</p>

              <form onSubmit={addRecipient} className="flex flex-col sm:flex-row gap-2 mb-3">
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="email@agency.com"
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#1d9c35]/40 focus:border-[#1d9c35]"
                />
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Label (optional)"
                  className="sm:w-40 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#1d9c35]/40 focus:border-[#1d9c35]"
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#1d9c35] text-white text-sm font-semibold hover:bg-[#178a2d] disabled:opacity-50"
                >
                  <FiPlus className="w-4 h-4" />
                  Add
                </button>
              </form>

              {recipients.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center">
                  <p className="text-sm text-gray-500">No custom recipients yet.</p>
                  {resolvedRecipients.length > 0 ? (
                    <p className="text-xs text-gray-400 mt-2">
                      Currently sending to: {resolvedRecipients.join(", ")}
                    </p>
                  ) : null}
                </div>
              ) : (
                <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {recipients.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{r.email}</p>
                        {r.label ? <p className="text-xs text-gray-500">{r.label}</p> : null}
                      </div>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => removeRecipient(r.id)}
                        className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <FiTrash2 className="w-3.5 h-3.5" />
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
