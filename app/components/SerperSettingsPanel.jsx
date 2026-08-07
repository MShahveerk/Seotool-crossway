"use client";

import { useCallback, useEffect, useState } from "react";
import { FiKey, FiRefreshCw, FiSave, FiCheckCircle } from "react-icons/fi";

export default function SerperSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [configured, setConfigured] = useState(false);
  const [maskedKey, setMaskedKey] = useState("");
  const [inputKey, setInputKey] = useState("");
  const [source, setSource] = useState("none");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/serper-config");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load Serper.dev settings");
      setConfigured(data.configured);
      setMaskedKey(data.maskedKey || "");
      setSource(data.source);
    } catch (e) {
      setError(e.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/serper-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: inputKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save API key");
      
      setConfigured(data.configured);
      setMaskedKey(data.maskedKey || "");
      setInputKey("");
      setSource(inputKey ? "database" : (process.env.SERPER_API_KEY ? "env" : "none"));
      setMessage(data.message || "API key updated successfully.");
    } catch (e) {
      setError(e.message || "Failed to save key");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 sm:px-6 py-5 border-b border-gray-200 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FiKey className="w-5 h-5 text-emerald-600" />
            <h2 className="text-xl font-bold text-gray-900">Serper.dev API Integration</h2>
          </div>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl">
            Configure your global <strong>Serper.dev</strong> API key to power live Google search queries, mapping coordinates, autocomplete keyword generation, and news streams.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
        >
          <FiRefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="px-4 sm:px-6 py-5 space-y-4">
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : null}
        {message ? (
          <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            {message}
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-gray-500">Loading settings...</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">Serper API Key Status</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {configured ? (
                    <>
                      <FiCheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-xs text-gray-600 font-medium">
                        Configured ({maskedKey})
                      </span>
                      <span className="text-[10px] text-gray-400 bg-gray-100 rounded px-1 uppercase tracking-wide font-semibold">
                        source: {source}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-rose-600 font-medium">Not configured</span>
                  )}
                </div>
              </div>
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label htmlFor="serperKeyInput" className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                  Update API Key
                </label>
                <div className="flex flex-col sm:flex-row gap-2 max-w-2xl">
                  <input
                    id="serperKeyInput"
                    type="password"
                    value={inputKey}
                    onChange={(e) => setInputKey(e.target.value)}
                    placeholder={configured ? "••••••••••••••••••••••••••••••••" : "Enter your serper.dev API key"}
                    className="flex-1 px-3.5 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none shadow-sm"
                  />
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center justify-center gap-1.5 px-4.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm shrink-0"
                  >
                    <FiSave className="w-4 h-4" />
                    {saving ? "Saving..." : "Save Key"}
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5 leading-snug">
                  Leave the field blank and save to clear the custom database key and fall back to the environment variable.
                </p>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
