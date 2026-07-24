"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FiZap,
  FiSend,
  FiSave,
  FiRefreshCw,
  FiClock,
  FiCheckCircle,
  FiXCircle,
  FiLink,
  FiCpu,
} from "react-icons/fi";

const INTERVAL_OPTIONS = [
  { value: 30, label: "Every 30 minutes" },
  { value: 60, label: "Every hour" },
  { value: 180, label: "Every 3 hours" },
  { value: 360, label: "Every 6 hours" },
  { value: 720, label: "Every 12 hours" },
  { value: 1440, label: "Every day" },
  { value: 2880, label: "Every 2 days" },
  { value: 10080, label: "Every week" },
];

function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function BlogAutomationSection() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Settings form
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [intervalMinutes, setIntervalMinutes] = useState(1440);
  const [defaultPrompt, setDefaultPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null); // { ok, text }

  // Manual trigger
  const [manualPrompt, setManualPrompt] = useState("");
  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [triggerMessage, setTriggerMessage] = useState(null); // { ok, text }

  const [history, setHistory] = useState([]);

  const applyConfig = (config) => {
    setWebhookUrl(config.webhookUrl || "");
    setWebhookSecret(config.webhookSecret || "");
    setScheduleEnabled(Boolean(config.scheduleEnabled));
    setIntervalMinutes(Number(config.intervalMinutes) || 1440);
    setDefaultPrompt(config.defaultPrompt || "");
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/admin/blog-automation");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load settings.");
      applyConfig(data.config || {});
      setHistory(Array.isArray(data.history) ? data.history : []);
    } catch (err) {
      setLoadError(err.message || "Failed to load settings.");
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
    setSaveMessage(null);
    try {
      const res = await fetch("/api/admin/blog-automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhookUrl,
          webhookSecret,
          scheduleEnabled,
          intervalMinutes,
          defaultPrompt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save settings.");
      applyConfig(data.config || {});
      setSaveMessage({ ok: true, text: "Settings saved." });
    } catch (err) {
      setSaveMessage({ ok: false, text: err.message || "Failed to save settings." });
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePrompt = async () => {
    setGenerating(true);
    setTriggerMessage(null);
    try {
      const res = await fetch("/api/admin/blog-automation/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Prompt generation failed.");
      setManualPrompt(data.prompt || "");
    } catch (err) {
      setTriggerMessage({ ok: false, text: err.message || "Prompt generation failed." });
    } finally {
      setGenerating(false);
    }
  };

  const handleTrigger = async () => {
    setTriggering(true);
    setTriggerMessage(null);
    try {
      const res = await fetch("/api/admin/blog-automation/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: manualPrompt }),
      });
      const data = await res.json();
      if (Array.isArray(data.history)) setHistory(data.history);
      if (!res.ok) throw new Error(data.error || "Webhook trigger failed.");
      setTriggerMessage({
        ok: true,
        text: `Workflow triggered (HTTP ${data.run?.status ?? "OK"}).`,
      });
    } catch (err) {
      setTriggerMessage({ ok: false, text: err.message || "Webhook trigger failed." });
    } finally {
      setTriggering(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0EFF2A]/30 focus:border-[#0EFF2A]";

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 flex items-center justify-center">
        <div
          className="inline-block h-7 w-7 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"
          role="status"
          aria-label="Loading"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-[#dff7de] flex items-center justify-center">
            <FiZap className="w-5 h-5 text-[#1d9c35]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Blog Automation</h1>
            <p className="text-sm text-gray-500">
              Trigger your n8n blog-writing workflow manually or on a schedule, with an optional prompt.
            </p>
          </div>
        </div>
        {loadError && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-center justify-between gap-3">
            <span>{loadError}</span>
            <button type="button" onClick={load} className="underline font-medium shrink-0">
              Retry
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        {/* Webhook + schedule settings */}
        <form onSubmit={handleSave} className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <div className="flex items-center gap-2">
            <FiLink className="w-4 h-4 text-[#1d9c35]" />
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Webhook & Schedule</h2>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5" htmlFor="ba-webhook-url">
              n8n Webhook URL
            </label>
            <input
              id="ba-webhook-url"
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://your-n8n-host/webhook/blog-writer"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5" htmlFor="ba-webhook-secret">
              Secret (optional)
            </label>
            <input
              id="ba-webhook-secret"
              type="text"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder="Sent as X-Automation-Secret header"
              className={inputClass}
              autoComplete="off"
            />
            <p className="mt-1 text-[11px] text-gray-400">
              Leave the masked value unchanged to keep the saved secret.
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 p-4 space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="flex items-center gap-2 text-sm font-medium text-gray-800">
                <FiClock className="w-4 h-4 text-gray-500" />
                Recurring schedule
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={scheduleEnabled}
                onClick={() => setScheduleEnabled((v) => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  scheduleEnabled ? "bg-[#1d9c35]" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    scheduleEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </label>

            {scheduleEnabled && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5" htmlFor="ba-interval">
                    Trigger frequency
                  </label>
                  <select
                    id="ba-interval"
                    value={intervalMinutes}
                    onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                    className={inputClass}
                  >
                    {INTERVAL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                    {!INTERVAL_OPTIONS.some((o) => o.value === intervalMinutes) && (
                      <option value={intervalMinutes}>Every {intervalMinutes} minutes</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5" htmlFor="ba-default-prompt">
                    Default prompt for scheduled runs (optional)
                  </label>
                  <textarea
                    id="ba-default-prompt"
                    value={defaultPrompt}
                    onChange={(e) => setDefaultPrompt(e.target.value)}
                    rows={4}
                    placeholder="Left empty, the workflow is triggered without a prompt and decides on its own."
                    className={`${inputClass} resize-y`}
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1d9c35] px-4 py-2 text-sm font-semibold text-white hover:bg-[#178a2c] disabled:opacity-60 transition-colors"
            >
              <FiSave className="w-4 h-4" />
              {saving ? "Saving…" : "Save Settings"}
            </button>
            {saveMessage && (
              <span
                className={`text-sm flex items-center gap-1.5 ${
                  saveMessage.ok ? "text-[#1d9c35]" : "text-red-600"
                }`}
              >
                {saveMessage.ok ? <FiCheckCircle className="w-4 h-4" /> : <FiXCircle className="w-4 h-4" />}
                {saveMessage.text}
              </span>
            )}
          </div>
        </form>

        {/* Manual trigger */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <div className="flex items-center gap-2">
            <FiSend className="w-4 h-4 text-[#1d9c35]" />
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Trigger Now</h2>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5" htmlFor="ba-topic">
              Topic hint for the prompt generator (optional)
            </label>
            <div className="flex gap-2">
              <input
                id="ba-topic"
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. local SEO for dentists"
                className={inputClass}
              />
              <button
                type="button"
                onClick={handleGeneratePrompt}
                disabled={generating}
                className="inline-flex items-center gap-2 rounded-lg border border-[#c4edc2] bg-[#dff7de] px-3 py-2 text-sm font-semibold text-[#1d9c35] hover:bg-[#c4edc2] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
                title="Generate a prompt with AI"
              >
                <FiCpu className={`w-4 h-4 ${generating ? "animate-pulse" : ""}`} />
                {generating ? "Generating…" : "Generate Prompt"}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5" htmlFor="ba-manual-prompt">
              Prompt (optional)
            </label>
            <textarea
              id="ba-manual-prompt"
              value={manualPrompt}
              onChange={(e) => setManualPrompt(e.target.value)}
              rows={8}
              placeholder="Describe the blog post to produce, or leave empty to let the workflow decide. You can also generate one with AI above."
              className={`${inputClass} resize-y`}
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={handleTrigger}
              disabled={triggering}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1d9c35] px-4 py-2 text-sm font-semibold text-white hover:bg-[#178a2c] disabled:opacity-60 transition-colors"
            >
              <FiSend className={`w-4 h-4 ${triggering ? "animate-pulse" : ""}`} />
              {triggering ? "Triggering…" : "Trigger Workflow"}
            </button>
            {triggerMessage && (
              <span
                className={`text-sm flex items-center gap-1.5 ${
                  triggerMessage.ok ? "text-[#1d9c35]" : "text-red-600"
                }`}
              >
                {triggerMessage.ok ? <FiCheckCircle className="w-4 h-4" /> : <FiXCircle className="w-4 h-4" />}
                {triggerMessage.text}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Recent runs */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FiClock className="w-4 h-4 text-[#1d9c35]" />
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Recent Triggers</h2>
          </div>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            <FiRefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        {history.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">No triggers yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-4 font-semibold">Time</th>
                  <th className="py-2 pr-4 font-semibold">Source</th>
                  <th className="py-2 pr-4 font-semibold">Status</th>
                  <th className="py-2 pr-4 font-semibold">Prompt</th>
                  <th className="py-2 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody>
                {history.map((run, i) => (
                  <tr key={`${run.at}-${i}`} className="border-b border-gray-100 last:border-0">
                    <td className="py-2.5 pr-4 whitespace-nowrap text-gray-700">{formatDateTime(run.at)}</td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          run.source === "schedule"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {run.source === "schedule" ? "Scheduled" : "Manual"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">
                      {run.ok ? (
                        <span className="inline-flex items-center gap-1 text-[#1d9c35] font-medium">
                          <FiCheckCircle className="w-3.5 h-3.5" /> Sent
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                          <FiXCircle className="w-3.5 h-3.5" /> Failed
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 max-w-[280px]">
                      <span className="block truncate text-gray-600" title={run.prompt || ""}>
                        {run.prompt || <span className="text-gray-400">No prompt</span>}
                      </span>
                    </td>
                    <td className="py-2.5 text-gray-500">
                      {run.error ? (
                        <span className="text-red-600" title={run.error}>
                          {String(run.error).slice(0, 80)}
                        </span>
                      ) : (
                        <>
                          HTTP {run.status} · {Math.round((run.durationMs || 0) / 100) / 10}s
                          {run.triggeredBy && run.source === "manual" ? ` · ${run.triggeredBy}` : ""}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
