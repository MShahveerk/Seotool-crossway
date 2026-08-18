"use client";

import { useState, useEffect } from "react";
import { Database, Key, CheckCircle, AlertCircle, Save, RefreshCw } from "lucide-react";

export default function DataForSeoSettingsPanel() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const loadConfig = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/dataforseo-config");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load config");
      setStatus(data);
      if (data.fullLogin) setLogin(data.fullLogin);
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/dataforseo-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save credentials");
      setMessage({ type: "success", text: "DataForSEO API credentials saved successfully!" });
      loadConfig();
      setPassword("");
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-5 sm:p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--cw-hairline)] pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--cw-neon)_12%,var(--cw-surface))] text-[var(--cw-neon)] border border-[color-mix(in_srgb,var(--cw-neon)_30%,var(--cw-hairline))]">
            <Database className="size-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--cw-ink)]">DataForSEO Integration</h3>
            <p className="text-xs text-[var(--cw-ink-muted)]">
              Configure your DataForSEO API account credentials for live keyword volume, CPC, difficulty, SERP rankings, and backlinks.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status?.configured ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--cw-neon)_12%,var(--cw-surface))] px-2.5 py-1 text-xs font-semibold text-[var(--cw-neon)] border border-[color-mix(in_srgb,var(--cw-neon)_35%,var(--cw-hairline))]">
              <CheckCircle className="size-3.5 text-[var(--cw-neon)]" />
              Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--cw-caution)_12%,var(--cw-surface))] px-2.5 py-1 text-xs font-semibold text-[var(--cw-caution)] border border-[color-mix(in_srgb,var(--cw-caution)_35%,var(--cw-hairline))]">
              <AlertCircle className="size-3.5 text-[var(--cw-caution)]" />
              Not Configured
            </span>
          )}
        </div>
      </div>

      {message && (
        <div
          className={`mt-4 rounded-xl p-3 text-xs font-medium ${
            message.type === "success"
              ? "bg-[color-mix(in_srgb,var(--cw-neon)_12%,var(--cw-surface))] text-[var(--cw-neon)] border border-[color-mix(in_srgb,var(--cw-neon)_35%,var(--cw-hairline))]"
              : "bg-[color-mix(in_srgb,var(--cw-danger)_12%,var(--cw-surface))] text-[var(--cw-danger)] border border-[color-mix(in_srgb,var(--cw-danger)_35%,var(--cw-hairline))]"
          }`}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave} className="mt-5 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-[var(--cw-ink-dim)]">DataForSEO Account Email / Login</label>
            <div className="relative mt-1">
              <input
                type="text"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="e.g. shahveer@crosswayconsulting.com"
                required
                className="w-full rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3.5 py-2.5 text-xs text-[var(--cw-ink)] placeholder:text-[var(--cw-ink-faint)] focus:border-[var(--cw-neon)] focus:bg-[var(--cw-raised)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--cw-neon)_28%,transparent)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--cw-ink-dim)]">API Key / Password</label>
            <div className="relative mt-1">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={status?.configured ? "••••••••••••••••" : "Enter API password"}
                required={!status?.configured}
                className="w-full rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3.5 py-2.5 text-xs text-[var(--cw-ink)] placeholder:text-[var(--cw-ink-faint)] focus:border-[var(--cw-neon)] focus:bg-[var(--cw-raised)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--cw-neon)_28%,transparent)]"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <p className="text-[11px] text-[var(--cw-ink-muted)] font-medium">
            Stored securely as an encrypted AppSetting record. Credentials enable live search volume & SERP queries.
          </p>

          <button
            type="submit"
            disabled={saving || loading}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--cw-neon)] px-4 py-2.5 text-xs font-semibold text-[var(--cw-neon-ink)] shadow-sm transition-colors hover:bg-[var(--cw-neon-deep)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--cw-neon)_40%,transparent)] disabled:opacity-50"
          >
            {saving ? <RefreshCw className="size-4 animate-spin" /> : <Save className="size-4" />}
            {saving ? "Saving…" : "Save DataForSEO Credentials"}
          </button>
        </div>
      </form>
    </div>
  );
}
