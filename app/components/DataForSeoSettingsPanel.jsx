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
    <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
            <Database className="size-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">DataForSEO Integration</h3>
            <p className="text-xs text-gray-500">
              Configure your DataForSEO API account credentials for live keyword volume, CPC, difficulty, SERP rankings, and backlinks.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status?.configured ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
              <CheckCircle className="size-3.5 text-emerald-600" />
              Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 border border-amber-200">
              <AlertCircle className="size-3.5 text-amber-600" />
              Not Configured
            </span>
          )}
        </div>
      </div>

      {message && (
        <div
          className={`mt-4 rounded-xl p-3 text-xs font-medium ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave} className="mt-5 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-gray-700">DataForSEO Account Email / Login</label>
            <div className="relative mt-1">
              <input
                type="text"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="e.g. shahveer@crosswayconsulting.com"
                required
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2.5 text-xs text-gray-900 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700">API Key / Password</label>
            <div className="relative mt-1">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={status?.configured ? "••••••••••••••••" : "Enter API password"}
                required={!status?.configured}
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2.5 text-xs text-gray-900 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <p className="text-[11px] text-gray-500 font-medium">
            Stored securely as an encrypted AppSetting record. Credentials enable live search volume & SERP queries.
          </p>

          <button
            type="submit"
            disabled={saving || loading}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-50"
          >
            {saving ? <RefreshCw className="size-4 animate-spin" /> : <Save className="size-4" />}
            {saving ? "Saving…" : "Save DataForSEO Credentials"}
          </button>
        </div>
      </form>
    </div>
  );
}
