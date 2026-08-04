"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiZap,
  FiSave,
  FiPlay,
  FiPause,
  FiRefreshCw,
  FiSend,
  FiLink,
  FiCpu,
  FiUpload,
  FiXCircle,
  FiRotateCcw,
} from "react-icons/fi";
import AgentRoster from "./blogStudio/AgentRoster";
import RunConsole from "./blogStudio/RunConsole";
import ExcelQueuePanel from "./blogStudio/ExcelQueuePanel";
import WriterSendsPanel from "./blogStudio/WriterSendsPanel";
import ModelCombobox from "./studioShared/ModelCombobox";
import StudioReferenceImages from "./studioShared/StudioReferenceImages";
import { BLOG_STUDIO_DEFAULT_PROMPTS } from "../../lib/blogStudio/defaults";
import {
  INTERVAL_OPTIONS,
  AUTO_SOURCE_OPTIONS,
  PROVIDERS,
  IMAGE_PROVIDERS,
  modelsForProvider,
  defaultModelForProvider,
  inputClass,
  labelClass,
  formatWhen,
} from "./blogStudio/studioConstants";

const TABS = [
  { id: "run", label: "Run" },
  { id: "writer-sends", label: "Writer sends" },
  { id: "agents", label: "Agents" },
  { id: "seeds", label: "SEO Seeds" },
  { id: "excel", label: "Excel queue" },
  { id: "links", label: "Links" },
  { id: "assets", label: "Assets" },
  { id: "schedule", label: "Schedule" },
  { id: "external", label: "External n8n" },
];

function linksToEditor(value) {
  try {
    return JSON.stringify(Array.isArray(value) ? value : [], null, 2);
  } catch {
    return "[]";
  }
}

function parseLinksEditor(text) {
  const parsed = JSON.parse(text || "[]");
  if (!Array.isArray(parsed)) throw new Error("Links must be a JSON array.");
  return parsed;
}

export default function BlogAutomationSection({ selectedSite = "" }) {
  const [tab, setTab] = useState("run");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [engineMode, setEngineMode] = useState("external");
  const [globalConfig, setGlobalConfig] = useState({});
  const [history, setHistory] = useState([]);
  const [siteConfig, setSiteConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  const [topic, setTopic] = useState("");
  const [running, setRunning] = useState(false);
  const [activeRun, setActiveRun] = useState(null);
  const [runs, setRuns] = useState([]);
  const [internalLinksText, setInternalLinksText] = useState("[]");
  const [externalLinksText, setExternalLinksText] = useState("[]");
  const [interpreting, setInterpreting] = useState(false);
  const [triggeringExternal, setTriggeringExternal] = useState(false);
  const [manualPrompt, setManualPrompt] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const siteQ = useMemo(
    () => (selectedSite ? `?siteLink=${encodeURIComponent(selectedSite)}` : ""),
    [selectedSite]
  );
  const isInternal = engineMode === "internal";

  const loadGlobal = useCallback(async () => {
    const res = await fetch("/api/admin/blog-automation");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load automation settings.");
    setGlobalConfig(data.config || {});
    setEngineMode(data.config?.engineMode === "internal" ? "internal" : "external");
    setHistory(Array.isArray(data.history) ? data.history : []);
  }, []);

  const loadSite = useCallback(async () => {
    if (!selectedSite) {
      setSiteConfig(null);
      return;
    }
    const res = await fetch(`/api/admin/blog-automation/site${siteQ}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load site studio config.");
    setSiteConfig(data.config || null);
    setInternalLinksText(linksToEditor(data.config?.internalLinksJson));
    setExternalLinksText(linksToEditor(data.config?.externalLinksJson));
  }, [selectedSite, siteQ]);

  const loadRuns = useCallback(async () => {
    if (!selectedSite) {
      setRuns([]);
      return;
    }
    const res = await fetch(
      `/api/admin/blog-automation/runs?siteLink=${encodeURIComponent(selectedSite)}&limit=15`
    );
    const data = await res.json();
    if (res.ok) setRuns(Array.isArray(data.runs) ? data.runs : []);
  }, [selectedSite]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      await loadGlobal();
      await loadSite();
      await loadRuns();
    } catch (err) {
      setLoadError(err.message || "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [loadGlobal, loadSite, loadRuns]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Poll active run
  useEffect(() => {
    if (!activeRun?.id) return undefined;
    if (["succeeded", "failed", "cancelled"].includes(activeRun.status)) return undefined;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/blog-automation/runs/${activeRun.id}`);
        const data = await res.json();
        if (res.ok && data.run) {
          setActiveRun(data.run);
          if (["succeeded", "failed", "cancelled"].includes(data.run.status)) {
            loadRuns();
          }
        }
      } catch {
        /* ignore poll errors */
      }
    }, 2000);
    return () => clearInterval(t);
  }, [activeRun?.id, activeRun?.status, loadRuns]);

  const patchSite = useCallback(
    (patch) => setSiteConfig((c) => (c ? { ...c, ...patch } : c)),
    []
  );

  const saveEngine = async (mode) => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/admin/blog-automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engineMode: mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to switch engine.");
      setEngineMode(data.config?.engineMode === "internal" ? "internal" : "external");
      setGlobalConfig(data.config || {});
      setSaveMessage({ ok: true, text: `Engine set to ${mode === "internal" ? "Internal Studio" : "External n8n"}.` });
    } catch (err) {
      setSaveMessage({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const saveSiteConfig = async () => {
    if (!selectedSite || !siteConfig) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      let internalLinksJson;
      let externalLinksJson;
      try {
        internalLinksJson = parseLinksEditor(internalLinksText);
        externalLinksJson = parseLinksEditor(externalLinksText);
      } catch (err) {
        throw new Error(`Links editor: ${err.message}`);
      }
      const res = await fetch(`/api/admin/blog-automation/site${siteQ}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...siteConfig, internalLinksJson, externalLinksJson }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save.");
      setSiteConfig(data.config);
      setInternalLinksText(linksToEditor(data.config?.internalLinksJson));
      setExternalLinksText(linksToEditor(data.config?.externalLinksJson));
      setSaveMessage({ ok: true, text: "Studio settings saved." });
    } catch (err) {
      setSaveMessage({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const saveExternal = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/admin/blog-automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(globalConfig),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save external settings.");
      setGlobalConfig(data.config || {});
      setSaveMessage({ ok: true, text: "External n8n settings saved." });
    } catch (err) {
      setSaveMessage({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const startRun = async () => {
    if (!selectedSite) {
      setSaveMessage({ ok: false, text: "Select a site in the header first." });
      return;
    }
    setRunning(true);
    setSaveMessage(null);
    try {
      // Persist current draft fields before run
      await saveSiteConfig();
      const res = await fetch(`/api/admin/blog-automation/site/run${siteQ}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, generateImage: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start run.");
      setActiveRun(data.run);
      setTab("run");
      setSaveMessage({ ok: true, text: "Studio run queued." });
      loadRuns();
    } catch (err) {
      setSaveMessage({ ok: false, text: err.message });
    } finally {
      setRunning(false);
    }
  };

  const liveRuns = useMemo(
    () => runs.filter((r) => r.status === "queued" || r.status === "running"),
    [runs]
  );
  const hasLiveAutomation =
    liveRuns.length > 0 ||
    ["queued", "running"].includes(String(activeRun?.status || ""));

  const cancelRun = async (runId) => {
    const id = runId || activeRun?.id || liveRuns[0]?.id;
    if (!selectedSite) return;
    setCancelling(true);
    setSaveMessage(null);
    try {
      const res = await fetch(`/api/admin/blog-automation/site/cancel${siteQ}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { runId: id } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to cancel.");
      const cancelled = data.run || data.runs?.[0] || null;
      if (cancelled) setActiveRun(cancelled);
      setSaveMessage({
        ok: true,
        text:
          data.count > 1
            ? `Cancelled ${data.count} running automations.`
            : "Automation cancelled. Excel row (if any) returned to pending.",
      });
      await loadRuns();
    } catch (err) {
      setSaveMessage({ ok: false, text: err.message });
    } finally {
      setCancelling(false);
    }
  };

  const cancelAllLive = async () => {
    if (!selectedSite) return;
    setCancelling(true);
    setSaveMessage(null);
    try {
      const res = await fetch(`/api/admin/blog-automation/site/cancel${siteQ}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to cancel.");
      if (data.runs?.[0]) setActiveRun(data.runs[0]);
      setSaveMessage({
        ok: true,
        text:
          data.count > 0
            ? `Cancelled ${data.count} automation${data.count === 1 ? "" : "s"}.`
            : "No running automations to cancel.",
      });
      await loadRuns();
    } catch (err) {
      setSaveMessage({ ok: false, text: err.message });
    } finally {
      setCancelling(false);
    }
  };

  const toggleAuto = async () => {
    if (!selectedSite) return;
    const res = await fetch(`/api/admin/blog-automation/site/pause${siteQ}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoEnabled: !siteConfig?.autoEnabled }),
    });
    const data = await res.json();
    if (res.ok) setSiteConfig(data.config);
    else setSaveMessage({ ok: false, text: data.error || "Failed to toggle auto." });
  };

  const onInterpret = async (file) => {
    if (!file || !selectedSite) return;
    setInterpreting(true);
    setSaveMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/admin/blog-automation/site/interpret${siteQ}`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Interpret failed.");
      const f = data.fields || {};
      patchSite({
        topic: f.topic || siteConfig.topic,
        seedPrompt: f.seedPrompt || siteConfig.seedPrompt,
        mustFollowKeywords: f.mustFollowKeywords || siteConfig.mustFollowKeywords,
        secondaryKeywords: f.secondaryKeywords || siteConfig.secondaryKeywords,
        targetAudience: f.targetAudience || siteConfig.targetAudience,
        location: f.location || siteConfig.location,
        ctaText: f.ctaText || siteConfig.ctaText,
        ctaUrl: f.ctaUrl || siteConfig.ctaUrl,
        wordCountRange: f.wordCountRange || siteConfig.wordCountRange,
        contentType: f.contentType || siteConfig.contentType,
        brandNotes: f.brandNotes || siteConfig.brandNotes,
        serpNotes: f.serpNotes || siteConfig.serpNotes,
        internalLinksJson: f.internalLinksJson?.length ? f.internalLinksJson : siteConfig.internalLinksJson,
        externalLinksJson: f.externalLinksJson?.length ? f.externalLinksJson : siteConfig.externalLinksJson,
      });
      if (f.topic) setTopic(f.topic);
      if (f.internalLinksJson?.length) setInternalLinksText(linksToEditor(f.internalLinksJson));
      if (f.externalLinksJson?.length) setExternalLinksText(linksToEditor(f.externalLinksJson));
      setSaveMessage({
        ok: true,
        text: `Interpreter filled fields (est. $${Number(data.usage?.costUsd || 0).toFixed(4)}). Review & save.`,
      });
      setTab("seeds");
    } catch (err) {
      setSaveMessage({ ok: false, text: err.message });
    } finally {
      setInterpreting(false);
    }
  };

  const triggerExternal = async () => {
    setTriggeringExternal(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/admin/blog-automation/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: manualPrompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Trigger failed.");
      setSaveMessage({ ok: true, text: "External webhook triggered." });
      loadGlobal();
    } catch (err) {
      setSaveMessage({ ok: false, text: err.message });
    } finally {
      setTriggeringExternal(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-sm text-gray-500 flex items-center gap-2">
        <FiRefreshCw className="animate-spin" /> Loading Blog Automation Studio…
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-[1400px]">
      {/* Hero / engine bar */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(29,156,53,0.12),_transparent_55%),linear-gradient(135deg,#ffffff_0%,#f4fbf4_100%)]" />
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 text-[#1d9c35]">
                <FiZap className="h-5 w-5" />
                <span className="text-xs font-bold uppercase tracking-[0.18em]">Blog Automation Studio</span>
          </div>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">
                Crossway content pipeline
              </h1>
              <p className="mt-1 text-sm text-gray-600 max-w-2xl">
                Configure three SEO agents, seed keywords, or an Excel campaign queue — then generate pending
                drafts in-app. Or keep External n8n. Only one engine can be active.
            </p>
          </div>
            <div className="flex flex-col items-end gap-2">
              <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => saveEngine("external")}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                    !isInternal ? "bg-[#1d9c35] text-white" : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  External n8n
                </button>
                <button
                  type="button"
                  onClick={() => saveEngine("internal")}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                    isInternal ? "bg-[#1d9c35] text-white" : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Internal Studio
            </button>
          </div>
              <p className="text-[11px] text-gray-500">
                Site: <span className="font-semibold text-gray-800">{selectedSite || "None selected"}</span>
              </p>
      </div>
          </div>

          {loadError && (
            <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{loadError}</p>
          )}
          {saveMessage && (
            <p
              className={`mt-3 text-sm rounded-lg px-3 py-2 border ${
                saveMessage.ok
                  ? "text-emerald-800 bg-emerald-50 border-emerald-100"
                  : "text-red-700 bg-red-50 border-red-100"
              }`}
            >
              {saveMessage.text}
            </p>
          )}
        </div>
          </div>

      {isInternal && siteConfig && (
        <>
          <AgentRoster config={siteConfig} onPatchSite={patchSite} />

          <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-1">
            {TABS.filter((t) => t.id !== "external").map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-3 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition ${
                  tab === t.id
                    ? "border-[#1d9c35] text-[#1d9c35]"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                {t.label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2 pb-1">
              {hasLiveAutomation && (
                <button
                  type="button"
                  onClick={cancelAllLive}
                  disabled={cancelling}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  {cancelling ? <FiRefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FiXCircle className="h-3.5 w-3.5" />}
                  Cancel automation
                </button>
              )}
              <button
                type="button"
                onClick={toggleAuto}
                className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 border ${
                  siteConfig.autoEnabled
                    ? "bg-[#dff7de] border-[#1d9c35]/40 text-[#145c22]"
                    : "bg-white border-gray-200 text-gray-600"
                }`}
              >
                {siteConfig.autoEnabled ? <FiPlay className="h-3.5 w-3.5" /> : <FiPause className="h-3.5 w-3.5" />}
                Auto {siteConfig.autoEnabled ? "on" : "paused"}
              </button>
              <button
                type="button"
                onClick={saveSiteConfig}
                disabled={saving}
                className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 bg-[#1d9c35] text-white hover:bg-[#178a2e] disabled:opacity-50"
              >
                <FiSave className="h-3.5 w-3.5" />
                Save
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            {tab === "run" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Topic for this run</label>
                    <input
                      className={`${inputClass} mt-1`}
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="e.g. How to choose a healthcare app partner"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Must-follow keywords (absolute)</label>
                    <textarea
                      className={`${inputClass} mt-1 font-mono text-xs min-h-[84px]`}
                      value={siteConfig.mustFollowKeywords || ""}
                      onChange={(e) => patchSite({ mustFollowKeywords: e.target.value })}
                      placeholder={"primary keyword\nsecondary keyword"}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>General / seed prompt</label>
                  <textarea
                    className={`${inputClass} mt-1 min-h-[100px]`}
                    value={siteConfig.seedPrompt || ""}
                    onChange={(e) => patchSite({ seedPrompt: e.target.value })}
                    placeholder="Standing brief for agents (brand voice, niche, what every post should cover)…"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Used for manual runs and Auto (seed mode). Also editable on Schedule.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={startRun}
                  disabled={running || !selectedSite}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#1d9c35] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#178a2e] disabled:opacity-50"
                >
                  {running ? <FiRefreshCw className="animate-spin" /> : <FiSend />}
                  Generate draft
                </button>
              </div>
            )}

            {tab === "agents" && (
              <div className="space-y-6">
                <p className="text-sm text-gray-600">
                  Pick a provider, then choose from the verified model list for that provider. Image
                  generation uses OpenAI image models only.
                </p>
                {[
                  ["interpreter", "Interpreter", "interpreterProvider", "interpreterModel", "interpreterPrompt", "chat"],
                  ["agent1", "Strategist (Agent 1)", "agent1Provider", "agent1Model", "agent1Prompt", "chat"],
                  ["agent2", "Architect (Agent 2)", "agent2Provider", "agent2Model", "agent2Prompt", "chat"],
                  ["agent3", "Writer (Agent 3)", "agent3Provider", "agent3Model", "agent3Prompt", "chat"],
                  ["image", "Image", "imageProvider", "imageModel", "imagePromptSystem", "image"],
                ].map(([id, title, pKey, mKey, promptKey, kind]) => {
                  const providerList = kind === "image" ? IMAGE_PROVIDERS : PROVIDERS;
                  const providerValue =
                    kind === "image"
                      ? "openai"
                      : siteConfig[pKey] || "openai";
                  const modelList = modelsForProvider(providerValue, {
                    kind,
                    current: siteConfig[mKey] || "",
                  });
                  return (
                  <div key={id} className="rounded-xl border border-gray-100 bg-gray-50/50 p-4">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <FiCpu className="text-[#1d9c35]" />
                        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
                      </div>
                      {BLOG_STUDIO_DEFAULT_PROMPTS[promptKey] ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700"
                          onClick={() =>
                            patchSite({ [promptKey]: BLOG_STUDIO_DEFAULT_PROMPTS[promptKey] })
                          }
                        >
                          <FiRotateCcw className="w-3.5 h-3.5" /> Revert prompt
                        </button>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className={labelClass}>Provider</label>
                        <select
                          className={`${inputClass} mt-1`}
                          value={providerValue}
                          onChange={(e) => {
                            const nextProvider = e.target.value;
                            const nextModel = defaultModelForProvider(
                              nextProvider,
                              kind === "image" ? "image" : "chat"
                            );
                            patchSite({ [pKey]: nextProvider, [mKey]: nextModel });
                          }}
                        >
                          {providerList.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Model</label>
                        <ModelCombobox
                          id={`agents-tab-${id}`}
                          className={`${inputClass} mt-1 text-sm font-semibold border-[#1d9c35]/35`}
                          value={siteConfig[mKey] || modelList[0]?.value || ""}
                          options={modelList}
                          onChange={(v) => patchSite({ [mKey]: v })}
                        />
                        <p className="mt-1 text-[11px] text-gray-500">
                          Suggestions for {providerValue} — or type any model id
                        </p>
                      </div>
                    </div>
                    <label className={labelClass}>System prompt</label>
                    <textarea
                      className={`${inputClass} mt-1 font-mono text-xs min-h-[160px]`}
                      value={siteConfig[promptKey] || ""}
                      onChange={(e) => patchSite({ [promptKey]: e.target.value })}
                    />
                  </div>
                  );
                })}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    ["openaiApiKey", "OpenAI API key"],
                    ["anthropicApiKey", "Anthropic API key"],
                    ["openrouterApiKey", "OpenRouter API key"],
                  ].map(([key, label]) => (
                    <div key={key}>
                      <label className={labelClass}>{label}</label>
                      <input
                        type="password"
                        className={`${inputClass} mt-1`}
                        value={siteConfig[key] || ""}
                        onChange={(e) => patchSite({ [key]: e.target.value })}
                        placeholder="Leave masked to keep existing"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "seeds" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <p className="md:col-span-2 text-sm text-gray-600">
                  Every filled Seeds field is injected into all three agents for{" "}
                  <strong>manual Generate</strong> and <strong>auto</strong> (seed cadence and Excel).
                  General prompt / must-follow keywords on Run are used the same way. Excel rows add a
                  topic brief on top — they do not wipe these standing Seeds.
                </p>
                {[
                  ["secondaryKeywords", "Secondary keywords", true],
                  ["targetAudience", "Target audience", true],
                  ["location", "Location", false],
                  ["wordCountRange", "Word count range", false],
                  ["contentType", "Content type", false],
                  ["ctaText", "CTA text", false],
                  ["ctaUrl", "CTA URL", false],
                  ["brandNotes", "Brand notes", true],
                  ["serpNotes", "SERP / research notes", true],
                ].map(([key, label, multi]) => (
                  <div key={key} className={multi ? "md:col-span-2" : ""}>
                    <label className={labelClass}>{label}</label>
                    {multi ? (
                      <textarea
                        className={`${inputClass} mt-1 min-h-[80px]`}
                        value={siteConfig[key] || ""}
                        onChange={(e) => patchSite({ [key]: e.target.value })}
                      />
                    ) : (
                      <input
                        className={`${inputClass} mt-1`}
                        value={siteConfig[key] || ""}
                        onChange={(e) => patchSite({ [key]: e.target.value })}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {tab === "links" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Internal links (JSON array)</label>
                  <p className="text-[11px] text-gray-500 mb-1">
                    {`[{ "url": "https://…", "anchor_text": "…", "title": "…" }]`}
                  </p>
                  <textarea
                    className={`${inputClass} font-mono text-xs min-h-[280px]`}
                    value={internalLinksText}
                    onChange={(e) => setInternalLinksText(e.target.value)}
                    spellCheck={false}
                  />
                </div>
                <div>
                  <label className={labelClass}>External links (JSON array)</label>
                  <p className="text-[11px] text-gray-500 mb-1">
                    {`[{ "url": "https://…", "title": "…", "usage": "reference" }]`}
                  </p>
                  <textarea
                    className={`${inputClass} font-mono text-xs min-h-[280px]`}
                    value={externalLinksText}
                    onChange={(e) => setExternalLinksText(e.target.value)}
                    spellCheck={false}
                  />
                </div>
              </div>
            )}

            {tab === "assets" && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Image system prompt (Agents), visual guidelines below, and the reference image are applied
                  on <strong>every</strong> manual and auto run (including Excel queue rows). Featured images
                  generate as optimized JPEG (1536×1024).
                </p>
                <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1 rounded border-gray-300 text-[#1d9c35] focus:ring-[#1d9c35]"
                    checked={Boolean(siteConfig.generateBackupImages)}
                    onChange={(e) => patchSite({ generateBackupImages: e.target.checked })}
                  />
                  <span>
                    <span className="text-sm font-semibold text-gray-900">Generate 3 backup images</span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      Adds alternate featured images you can switch to in Blog Approvals before approving.
                      Uses extra image API cost when enabled.
                    </span>
                  </span>
            </label>
                <div>
                  <label className={labelClass}>Image visual guidelines</label>
                  <textarea
                    className={`${inputClass} mt-1 min-h-[100px]`}
                    value={siteConfig.imagePrompt || ""}
                    onChange={(e) => patchSite({ imagePrompt: e.target.value })}
                    placeholder="Brand look: colors, lighting, composition, what to avoid…"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Standing style brief. Excel “image direction” and the writer’s image_prompt add topic
                    detail on top — they do not replace this.
                  </p>
                </div>
                <StudioReferenceImages
                  paths={siteConfig.referenceImagePaths || (siteConfig.referenceImagePath ? [siteConfig.referenceImagePath] : [])}
                  uploadUrl={selectedSite ? `/api/admin/blog-automation/site/asset${siteQ}` : ""}
                  onConfig={setSiteConfig}
                  onMessage={setSaveMessage}
                />
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
                  <FiUpload className="mx-auto h-6 w-6 text-[#1d9c35]" />
                  <p className="mt-2 text-sm font-semibold text-gray-800">Interpreter upload</p>
                  <p className="text-xs text-gray-500 mt-1">.txt or .docx → fill SEO seed fields</p>
                  <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:border-[#1d9c35]">
                    {interpreting ? "Interpreting…" : "Choose file"}
                    <input
                      type="file"
                      accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="sr-only"
                      disabled={interpreting}
                      onChange={(e) => onInterpret(e.target.files?.[0])}
                    />
                  </label>
                </div>
              </div>
            )}

            {tab === "writer-sends" && (
              <WriterSendsPanel
                siteLink={selectedSite}
                onRan={async (run) => {
                  setSaveMessage(
                    run?.id
                      ? `Queued Blog Studio run ${run.id} from Writer send.`
                      : "Queued Blog Studio run from Writer send."
                  );
                  await loadRuns();
                  setTab("run");
                }}
              />
            )}

            {tab === "excel" && (
              <ExcelQueuePanel
                siteLink={selectedSite}
                siteConfig={siteConfig}
                onPatchSite={patchSite}
                onMessage={setSaveMessage}
                onToggleAuto={toggleAuto}
              />
            )}

            {tab === "schedule" && (
              <div className="space-y-5 max-w-xl">
                <p className="text-sm text-gray-600">
                  Control how often Internal Studio creates the next draft for this site. Pause anytime to
                  run a specific manual topic without the queue advancing.
                </p>

                <div>
                  <label className={labelClass}>General prompt for auto</label>
                  <textarea
                    className={`${inputClass} mt-1 min-h-[120px]`}
                    value={siteConfig.seedPrompt || ""}
                    onChange={(e) => patchSite({ seedPrompt: e.target.value })}
                    placeholder="e.g. Write practical, trustworthy SEO blogs for shippers researching freight forwarding. Keep tone expert but clear. Always tie advice back to Crossway services when natural…"
                  />
                  <p className="mt-1.5 text-xs text-gray-500">
                    Standing instructions the agents always receive on auto (and manual) runs. Pair with
                    must-follow keywords on Run, or switch topic source to Excel queue.
                  </p>
                </div>

                <div>
                  <label className={labelClass}>How often</label>
                  <select
                    className={`${inputClass} mt-1`}
                    value={siteConfig.autoIntervalMinutes || 1440}
                    onChange={(e) => patchSite({ autoIntervalMinutes: Number(e.target.value) })}
                  >
                    {INTERVAL_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-xs text-gray-500">
                    Excel mode processes one row per tick. Seed mode generates from SEO Seeds each tick.
                  </p>
                </div>

                <div>
                  <label className={labelClass}>Topic source</label>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {AUTO_SOURCE_OPTIONS.map((opt) => {
                      const active = (siteConfig.autoSource || "seed") === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => patchSite({ autoSource: opt.value })}
                          className={`rounded-xl border px-3 py-3 text-left transition ${
                            active
                              ? "border-[#1d9c35] bg-[#f3faf4] shadow-sm"
                              : "border-gray-200 bg-white hover:border-gray-300"
                          }`}
                        >
                          <p className="text-sm font-semibold text-gray-900">{opt.label}</p>
                          <p className="mt-1 text-xs text-gray-500 leading-snug">{opt.hint}</p>
                        </button>
                      );
                    })}
                  </div>
                  {siteConfig.autoSource === "excel" && (
                    <button
                      type="button"
                      onClick={() => setTab("excel")}
                      className="mt-2 text-xs font-semibold text-[#1d9c35] hover:underline"
                    >
                      Open Excel queue →
                    </button>
                  )}
                </div>

                <p className="text-xs text-gray-500">
                  Last auto: {formatWhen(siteConfig.lastAutoAt)} · Status:{" "}
                  <strong>{siteConfig.autoEnabled ? "Running" : "Paused"}</strong>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleAuto}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    {siteConfig.autoEnabled ? <FiPause /> : <FiPlay />}
                    {siteConfig.autoEnabled ? "Pause auto" : "Enable auto"}
                  </button>
                  <button
                    type="button"
                    onClick={saveSiteConfig}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#1d9c35] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    <FiSave /> Save schedule
                  </button>
                </div>
              </div>
            )}
          </div>

          <RunConsole
            run={activeRun}
            onCancel={() => cancelRun(activeRun?.id)}
            cancelling={cancelling}
          />

          {runs.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Recent runs</p>
                {hasLiveAutomation && (
            <button
                    type="button"
                    onClick={cancelAllLive}
                    disabled={cancelling}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline disabled:opacity-50"
                  >
                    <FiXCircle /> Cancel running automation
            </button>
            )}
          </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b">
                      <th className="py-2 pr-3">When</th>
                      <th className="py-2 pr-3">Topic</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Cost</th>
                      <th className="py-2 pr-3">Trigger</th>
                      <th className="py-2"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => {
                      const live = r.status === "queued" || r.status === "running";
                      return (
                      <tr
                        key={r.id}
                        className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                        onClick={async () => {
                          const res = await fetch(`/api/admin/blog-automation/runs/${r.id}`);
                          const data = await res.json();
                          if (res.ok) setActiveRun(data.run);
                        }}
                      >
                        <td className="py-2 pr-3 text-xs text-gray-500 whitespace-nowrap">
                          {formatWhen(r.createdAt)}
                        </td>
                        <td className="py-2 pr-3 max-w-[240px] truncate">{r.topic || "—"}</td>
                        <td className="py-2 pr-3 font-semibold">{r.status}</td>
                        <td className="py-2 pr-3 font-mono text-xs">
                          {r.totalCostUsd != null ? `$${Number(r.totalCostUsd).toFixed(4)}` : "—"}
                        </td>
                        <td className="py-2 pr-3 text-xs text-gray-500">{r.trigger}</td>
                        <td className="py-2 text-right">
                          {live && (
                            <button
                              type="button"
                              disabled={cancelling}
                              onClick={(e) => {
                                e.stopPropagation();
                                cancelRun(r.id);
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                            >
                              <FiXCircle className="h-3 w-3" />
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {isInternal && !selectedSite && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Select a client site in the dashboard header to configure Internal Studio for that site.
        </div>
      )}

      {!isInternal && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-[#1d9c35]">
            <FiLink />
            <h2 className="text-sm font-bold uppercase tracking-wide">External n8n webhook</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className={labelClass}>Webhook URL</label>
              <input
                className={`${inputClass} mt-1`}
                value={globalConfig.webhookUrl || ""}
                onChange={(e) => setGlobalConfig((c) => ({ ...c, webhookUrl: e.target.value }))}
                placeholder="https://n8n.example.com/webhook/…"
              />
            </div>
          <div>
              <label className={labelClass}>Webhook secret</label>
              <input
                type="password"
                className={`${inputClass} mt-1`}
                value={globalConfig.webhookSecret || ""}
                onChange={(e) => setGlobalConfig((c) => ({ ...c, webhookSecret: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelClass}>Schedule interval</label>
              <select
                className={`${inputClass} mt-1`}
                value={globalConfig.intervalMinutes || 1440}
                onChange={(e) =>
                  setGlobalConfig((c) => ({ ...c, intervalMinutes: Number(e.target.value) }))
                }
              >
                {INTERVAL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Default prompt</label>
              <textarea
                className={`${inputClass} mt-1 min-h-[100px]`}
                value={globalConfig.defaultPrompt || ""}
                onChange={(e) => setGlobalConfig((c) => ({ ...c, defaultPrompt: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={Boolean(globalConfig.scheduleEnabled)}
                onChange={(e) =>
                  setGlobalConfig((c) => ({ ...c, scheduleEnabled: e.target.checked }))
                }
              />
              Enable external schedule
            </label>
            <button
              type="button"
              onClick={saveExternal}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1d9c35] px-3 py-2 text-xs font-semibold text-white"
            >
              <FiSave /> Save external
            </button>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <label className={labelClass}>Manual trigger prompt</label>
            <textarea
              className={`${inputClass} mt-1 min-h-[80px]`}
              value={manualPrompt}
              onChange={(e) => setManualPrompt(e.target.value)}
            />
            <button
              type="button"
              onClick={triggerExternal}
              disabled={triggeringExternal}
              className="mt-2 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {triggeringExternal ? <FiRefreshCw className="animate-spin" /> : <FiSend />}
              Trigger webhook
            </button>
          </div>
          {history.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase text-gray-500 mb-2">Webhook history</p>
              <ul className="space-y-1 text-xs text-gray-600">
                {history.slice(0, 10).map((h, i) => (
                  <li key={i} className="flex justify-between gap-2 border-b border-gray-50 py-1">
                    <span>
                      {formatWhen(h.at)} · {h.source} · {h.ok ? "OK" : "Fail"}
                      </span>
                    <span className="font-mono">{h.status || h.error || ""}</span>
                  </li>
                ))}
              </ul>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
