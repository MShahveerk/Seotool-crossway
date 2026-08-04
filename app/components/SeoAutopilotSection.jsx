"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FiCpu,
  FiPlay,
  FiRefreshCw,
  FiRotateCcw,
  FiSave,
} from "react-icons/fi";
import { Bot, Sparkles } from "lucide-react";
import ModelCombobox from "./studioShared/ModelCombobox";
import {
  INTERVAL_OPTIONS,
  PROVIDERS,
  defaultModelForProvider,
  modelsForProvider,
} from "./blogStudio/studioConstants";
import {
  ScorecardDashboard,
  FixesDashboard,
  GapsDashboard,
} from "./seoAutopilot/ResultDashboards";
import BlogSeedsPanel from "./seoAutopilot/BlogSeedsPanel";
import PitchesPanel from "./seoAutopilot/PitchesPanel";
import AutopilotRunConsole from "./seoAutopilot/AutopilotRunConsole";

const TABS = [
  { id: "overview", label: "Scorecard" },
  { id: "fixes", label: "Fixes" },
  { id: "gaps", label: "Gaps" },
  { id: "writer", label: "Blog seeds" },
  { id: "pitches", label: "Pitches" },
  { id: "agents", label: "Agents" },
  { id: "smtp", label: "SMTP" },
  { id: "schedule", label: "Schedule" },
  { id: "runs", label: "Runs" },
];

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500";
const labelClass = "block text-[11px] font-semibold uppercase tracking-wide text-gray-500";

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(String(text || ""));
    return true;
  } catch {
    return false;
  }
}

export default function SeoAutopilotSection({ selectedSite = "" }) {
  const siteLink = String(selectedSite || "").trim();
  const [tab, setTab] = useState("overview");
  const [config, setConfig] = useState(null);
  const [runs, setRuns] = useState([]);
  const [artifacts, setArtifacts] = useState([]);
  const [pitches, setPitches] = useState([]);
  const [writerSends, setWriterSends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeRun, setActiveRun] = useState(null);
  const [cancellingRun, setCancellingRun] = useState(false);
  const [researching, setResearching] = useState(false);
  const [pitchBusyId, setPitchBusyId] = useState("");

  const agents = config?.agents || [];
  const defaultPrompts = config?.defaultPrompts || {};

  const patchConfig = useCallback((patch) => {
    setConfig((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const autoResearchSite = async () => {
    if (!siteLink) return;
    setResearching(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(
        `/api/admin/seo-autopilot/site/research?siteLink=${encodeURIComponent(siteLink)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ persist: true }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Site research failed");
      if (data.config) setConfig(data.config);
      else if (data.profile) patchConfig(data.profile);
      setNotice(
        data.meta?.model
          ? `Auto-filled from site data via Diagnoser (${data.meta.model}). Review and tweak if needed.`
          : "Auto-filled from site data. Review and tweak if needed."
      );
    } catch (err) {
      setError(err.message || "Site research failed");
    } finally {
      setResearching(false);
    }
  };

  const loadAll = useCallback(async () => {
    if (!siteLink) {
      setConfig(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const q = encodeURIComponent(siteLink);
      const [cRes, rRes, aRes, pRes, wRes] = await Promise.all([
        fetch(`/api/admin/seo-autopilot/site?siteLink=${q}`),
        fetch(`/api/admin/seo-autopilot/runs?siteLink=${q}`),
        fetch(`/api/admin/seo-autopilot/artifacts?siteLink=${q}`),
        fetch(`/api/admin/seo-autopilot/pitches?siteLink=${q}`),
        fetch(`/api/admin/seo-autopilot/writer-sends?siteLink=${q}`),
      ]);
      const cData = await cRes.json();
      const rData = await rRes.json();
      const aData = await aRes.json();
      const pData = await pRes.json();
      const wData = await wRes.json();
      if (!cRes.ok) throw new Error(cData.error || "Failed to load config");
      setConfig(cData.config);
      const nextRuns = rData.runs || [];
      setRuns(nextRuns);
      setArtifacts(aData.artifacts || []);
      setPitches(pData.pitches || []);
      setWriterSends(wRes.ok ? wData.sends || [] : []);
      setActiveRun((prev) => {
        if (prev?.id) {
          const match = nextRuns.find((r) => r.id === prev.id);
          if (match) return match;
        }
        const live = nextRuns.find((r) => ["queued", "running"].includes(r.status));
        return live || prev || nextRuns[0] || null;
      });
    } catch (err) {
      setError(err.message || "Failed to load Autopilot");
    } finally {
      setLoading(false);
    }
  }, [siteLink]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!activeRun?.id) return undefined;
    const live = ["queued", "running"].includes(String(activeRun.status || ""));
    if (!live) return undefined;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/seo-autopilot/runs/${activeRun.id}`);
        const data = await res.json();
        if (!res.ok || !data.run) return;
        setActiveRun(data.run);
        if (["completed", "failed", "cancelled"].includes(data.run.status)) {
          setRunning(false);
          loadAll();
        }
      } catch {
        /* keep polling */
      }
    }, 1500);
    return () => clearInterval(t);
  }, [activeRun?.id, activeRun?.status, loadAll]);

  const saveConfig = async () => {
    if (!siteLink || !config) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(
        `/api/admin/seo-autopilot/site?siteLink=${encodeURIComponent(siteLink)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setConfig(data.config);
      setNotice("Saved.");
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const runNow = async (agentIds = null) => {
    if (!siteLink) return;
    setRunning(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(
        `/api/admin/seo-autopilot/site/run?siteLink=${encodeURIComponent(siteLink)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(agentIds ? { agentIds } : {}),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Run failed");
      setActiveRun(data.run || null);
      setNotice("Autopilot run started — watch stages in the Run console.");
      setTab("runs");
      // Immediate refresh so pending stages show up quickly
      if (data.run?.id) {
        const rRes = await fetch(`/api/admin/seo-autopilot/runs/${data.run.id}`);
        const rData = await rRes.json();
        if (rRes.ok && rData.run) setActiveRun(rData.run);
      }
    } catch (err) {
      setRunning(false);
      setError(err.message || "Run failed");
    }
  };

  const cancelActiveRun = async () => {
    if (!activeRun?.id) return;
    setCancellingRun(true);
    try {
      await fetch(`/api/admin/seo-autopilot/runs/${activeRun.id}/cancel`, { method: "POST" });
      setNotice("Cancel requested…");
    } catch (err) {
      setError(err.message || "Cancel failed");
    } finally {
      setCancellingRun(false);
    }
  };

  const scorecard = config?.latestScorecardJson || runs[0]?.scorecardJson || null;

  if (!siteLink) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-600">
        Select a website to open SEO Autopilot.
      </div>
    );
  }

  if (loading && !config) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-10 text-sm text-gray-500">
        Loading SEO Autopilot…
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-2rem)] rounded-2xl border border-gray-200 bg-[#fafbfa] overflow-hidden">
      <div className="relative border-b border-gray-200 bg-gradient-to-r from-[#0b1f14] via-[#123524] to-[#1a4d32] px-6 py-6 text-white">
        <div className="absolute inset-0 opacity-[0.08] bg-[radial-gradient(circle_at_20%_20%,#0EFF2A,transparent_40%),radial-gradient(circle_at_80%_0%,#38bdf8,transparent_35%)]" />
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold tracking-wide uppercase">
              <Sparkles className="w-3.5 h-3.5 text-lime-300" />
              SEO Autopilot Studio
            </div>
            <h2 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight">
              Audit → Diagnose → Fix → Pitch → Track
            </h2>
            <p className="mt-2 text-sm text-white/70 max-w-2xl">
              Google + AI-search loop for{" "}
              <span className="text-white font-medium">{siteLink}</span>. Configure each agent like
              Blog Automation Studio, run on demand or on a schedule, and send outreach from here.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveConfig}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 border border-white/20 px-4 py-2.5 text-sm font-semibold hover:bg-white/15"
            >
              <FiSave className="w-4 h-4" />
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => runNow()}
              disabled={running}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0EFF2A] text-gray-900 px-4 py-2.5 text-sm font-bold hover:brightness-105 disabled:opacity-60"
            >
              {running ? <FiRefreshCw className="w-4 h-4 animate-spin" /> : <FiPlay className="w-4 h-4" />}
              {running ? "Running…" : "Run Autopilot"}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-gray-200 bg-white px-4 pt-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px ${
              tab === t.id
                ? "border-emerald-600 text-emerald-800 bg-emerald-50/60"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-5 space-y-4">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {notice}
          </div>
        ) : null}

        {tab === "overview" && (
          <div className="space-y-4">
            <ScorecardDashboard scorecard={scorecard} siteLink={siteLink} />
            <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Brand & niche profile</h3>
                  <p className="text-xs text-gray-500 mt-1 max-w-xl">
                    Auto-research uses your existing GSC / audit / opportunity data via the Diagnoser
                    agent keys. You can still edit anything after.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={researching || !siteLink}
                  onClick={autoResearchSite}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 text-white px-3.5 py-2 text-xs font-bold disabled:opacity-55"
                >
                  {researching ? (
                    <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  {researching ? "Researching…" : "Auto-research site"}
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  ["brandName", "Brand name"],
                  ["category", "Category / niche"],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label className={labelClass}>{label}</label>
                    <input
                      className={`${inputClass} mt-1`}
                      value={config?.[key] || ""}
                      onChange={(e) => patchConfig({ [key]: e.target.value })}
                    />
                  </div>
                ))}
                <div className="md:col-span-2">
                  <label className={labelClass}>Buying questions (one per line)</label>
                  <textarea
                    className={`${inputClass} mt-1 min-h-[90px]`}
                    value={config?.buyingQuestions || ""}
                    onChange={(e) => patchConfig({ buyingQuestions: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Competitors</label>
                  <textarea
                    className={`${inputClass} mt-1 min-h-[70px]`}
                    value={config?.competitors || ""}
                    onChange={(e) => patchConfig({ competitors: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Best proof point (for pitches)</label>
                  <textarea
                    className={`${inputClass} mt-1 min-h-[70px]`}
                    value={config?.proofPoint || ""}
                    onChange={(e) => patchConfig({ proofPoint: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "fixes" && (
          <FixesDashboard
            artifacts={artifacts}
            onCopy={async (text) => {
              const ok = await copyText(text);
              setNotice(ok ? "Copied." : "Could not copy.");
            }}
          />
        )}

        {tab === "gaps" && <GapsDashboard artifacts={artifacts} />}

        {tab === "writer" && (
          <BlogSeedsPanel
            siteLink={siteLink}
            mode="autopilot"
            sends={writerSends}
            loading={loading}
            onReload={loadAll}
          />
        )}

        {tab === "pitches" && (
          <PitchesPanel
            pitches={pitches}
            siteLink={siteLink}
            busyId={pitchBusyId}
            onReload={loadAll}
            onSave={async (id, patch) => {
              const res = await fetch(`/api/admin/seo-autopilot/pitches/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patch),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || "Save failed");
              await loadAll();
              return data.pitch;
            }}
            onMarkCompleted={async (id) => {
              setPitchBusyId(id);
              setError("");
              try {
                const res = await fetch(`/api/admin/seo-autopilot/pitches/${id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: "completed" }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Update failed");
                await loadAll();
              } catch (err) {
                setError(err.message || "Update failed");
              } finally {
                setPitchBusyId("");
              }
            }}
            onSend={async (id) => {
              setPitchBusyId(id);
              setError("");
              try {
                const res = await fetch(
                  `/api/admin/seo-autopilot/pitches/${id}/send?siteLink=${encodeURIComponent(siteLink)}`,
                  { method: "POST" }
                );
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Send failed");
                setNotice(`Sent to ${data.pitch?.targetEmail}`);
                await loadAll();
              } catch (err) {
                setError(err.message || "Send failed");
              } finally {
                setPitchBusyId("");
              }
            }}
          />
        )}

        {tab === "agents" && (
          <div className="space-y-6">
            <p className="text-sm text-gray-600">
              Same key → provider → model pattern as Blog / Post Automation Studios. Each Autopilot
              agent has its own prompt; revert restores the built-in default.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                ["openaiApiKey", "OpenAI API key", "openai"],
                ["anthropicApiKey", "Anthropic API key", "anthropic"],
                ["openrouterApiKey", "OpenRouter API key", "openrouter"],
              ].map(([key, label, statusKey]) => (
                <div key={key}>
                  <label className={labelClass}>
                    {label}
                    {config?.keyStatus?.[statusKey] ? (
                      <span className="ml-2 text-emerald-600 normal-case tracking-normal">ready</span>
                    ) : null}
                  </label>
                  <input
                    type="password"
                    className={`${inputClass} mt-1`}
                    value={config?.[key] || ""}
                    onChange={(e) => patchConfig({ [key]: e.target.value })}
                    placeholder="Leave masked to keep existing"
                  />
                </div>
              ))}
            </div>
            {agents.map((agent) => {
              const providerValue = config?.[agent.providerKey] || agent.defaultProvider || "openai";
              const modelList = modelsForProvider(providerValue, {
                kind: "chat",
                current: config?.[agent.modelKey] || "",
              });
              return (
                <div key={agent.id} className="rounded-2xl border border-gray-100 bg-white p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <FiCpu className="text-emerald-700" />
                      <div>
                        <h3 className="text-sm font-bold text-gray-900">{agent.title}</h3>
                        <p className="text-xs text-gray-500">{agent.subtitle}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700"
                      onClick={() =>
                        patchConfig({
                          [agent.promptKey]: defaultPrompts[agent.id] || "",
                        })
                      }
                    >
                      <FiRotateCcw className="w-3.5 h-3.5" /> Revert prompt
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className={labelClass}>Provider</label>
                      <select
                        className={`${inputClass} mt-1`}
                        value={providerValue}
                        onChange={(e) => {
                          const nextProvider = e.target.value;
                          patchConfig({
                            [agent.providerKey]: nextProvider,
                            [agent.modelKey]: defaultModelForProvider(nextProvider, "chat"),
                          });
                        }}
                      >
                        {PROVIDERS.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Model</label>
                      <ModelCombobox
                        id={`autopilot-${agent.id}`}
                        className={`${inputClass} mt-1 text-sm font-semibold border-emerald-500/35`}
                        value={config?.[agent.modelKey] || modelList[0]?.value || ""}
                        options={modelList}
                        onChange={(v) => patchConfig({ [agent.modelKey]: v })}
                      />
                    </div>
                  </div>
                  <label className={labelClass}>System prompt</label>
                  <textarea
                    className={`${inputClass} mt-1 font-mono text-xs min-h-[140px]`}
                    value={config?.[agent.promptKey] || defaultPrompts[agent.id] || ""}
                    onChange={(e) => patchConfig({ [agent.promptKey]: e.target.value })}
                  />
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => runNow([agent.id])}
                      className="text-xs font-semibold text-emerald-800 hover:underline"
                    >
                      Run only {agent.title}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "smtp" && (
          <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-3 max-w-3xl">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-emerald-700" />
              <h3 className="text-sm font-bold text-gray-900">Outreach SMTP</h3>
            </div>
            <p className="text-sm text-gray-600">
              Required to send pitches from Autopilot. Falls back to server SMTP_* env if left empty.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                ["smtpHost", "SMTP host"],
                ["smtpPort", "Port"],
                ["smtpUser", "Username"],
                ["smtpFrom", "From address"],
              ].map(([key, label]) => (
                <div key={key}>
                  <label className={labelClass}>{label}</label>
                  <input
                    className={`${inputClass} mt-1`}
                    value={config?.[key] ?? ""}
                    onChange={(e) =>
                      patchConfig({
                        [key]: key === "smtpPort" ? Number(e.target.value) || 587 : e.target.value,
                      })
                    }
                  />
                </div>
              ))}
              <div className="md:col-span-2">
                <label className={labelClass}>Password</label>
                <input
                  type="password"
                  className={`${inputClass} mt-1`}
                  value={config?.smtpPass || ""}
                  onChange={(e) => patchConfig({ smtpPass: e.target.value })}
                  placeholder="Leave masked to keep existing"
                />
              </div>
            </div>
          </div>
        )}

        {tab === "schedule" && (
          <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-4 max-w-2xl">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <input
                type="checkbox"
                checked={Boolean(config?.autoEnabled)}
                onChange={(e) => patchConfig({ autoEnabled: e.target.checked })}
              />
              Enable scheduled Autopilot runs
            </label>
            <div>
              <label className={labelClass}>Interval</label>
              <select
                className={`${inputClass} mt-1`}
                value={config?.autoIntervalMinutes || 10080}
                onChange={(e) => patchConfig({ autoIntervalMinutes: Number(e.target.value) })}
              >
                {INTERVAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Agents to run (comma-separated ids)</label>
              <input
                className={`${inputClass} mt-1 font-mono text-xs`}
                value={config?.enabledAgents || ""}
                onChange={(e) => patchConfig({ enabledAgents: e.target.value })}
                placeholder="auditor,geoSpy,diagnoser,writer,fixer,foundation,pitcher,tracker"
              />
            </div>
            <p className="text-xs text-gray-500">
              Last auto:{" "}
              {config?.lastAutoAt ? new Date(config.lastAutoAt).toLocaleString() : "never"}
            </p>
          </div>
        )}

        {tab === "runs" && (
          <div className="space-y-4">
            <AutopilotRunConsole
              run={activeRun}
              onCancel={cancelActiveRun}
              cancelling={cancellingRun}
            />

            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                Recent runs
              </p>
              {!runs.length ? (
                <p className="text-sm text-gray-500">No runs yet. Click Run Autopilot to start.</p>
              ) : (
                <div className="space-y-2">
                  {runs.map((r) => {
                    const selected = activeRun?.id === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={async () => {
                          setActiveRun(r);
                          try {
                            const res = await fetch(`/api/admin/seo-autopilot/runs/${r.id}`);
                            const data = await res.json();
                            if (res.ok && data.run) setActiveRun(data.run);
                          } catch {
                            /* keep list row */
                          }
                        }}
                        className={`w-full rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-left transition ${
                          selected
                            ? "border-emerald-500 bg-emerald-50/50"
                            : "border-gray-100 bg-white hover:border-gray-200"
                        }`}
                      >
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {r.status} · {r.trigger}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(r.createdAt).toLocaleString()}
                            {r.totalCostUsd != null
                              ? ` · ~$${Number(r.totalCostUsd).toFixed(4)}`
                              : ""}
                            {Array.isArray(r.stagesJson)
                              ? ` · ${r.stagesJson.length} stage(s)`
                              : ""}
                            {r.errorMessage ? ` · ${r.errorMessage}` : ""}
                          </p>
                        </div>
                        <span className="text-[11px] font-semibold text-emerald-800">
                          {selected ? "Viewing" : "Open console"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
