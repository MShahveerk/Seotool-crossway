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
  FiEdit3,
  FiInbox,
  FiGrid,
  FiList,
  FiSettings,
  FiLayers,
  FiImage,
  FiClock,
  FiExternalLink,
} from "react-icons/fi";
import RunConsole from "./blogStudio/RunConsole";
import ExcelQueuePanel from "./blogStudio/ExcelQueuePanel";
import ContentInbox from "./blogStudio/ContentInbox";
import PipelinePreview from "./blogStudio/PipelinePreview";
import ModelCombobox from "./studioShared/ModelCombobox";
import StudioReferenceImages from "./studioShared/StudioReferenceImages";
import StudioBrandKit from "./studioShared/StudioBrandKit";
import TabRail from "./ui-shared/TabRail";
import Btn from "./ui-shared/Btn";
import LiveRunDock from "./studioShared/LiveRunDock";
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

const ZONES = [
  { id: "compose", label: "Compose", icon: FiEdit3 },
  { id: "library", label: "Library", icon: FiList },
  { id: "setup", label: "Setup", icon: FiSettings },
];

const SOURCES = [
  { id: "topic", label: "Topic", icon: FiEdit3 },
  { id: "inbox", label: "From Inbox", icon: FiInbox },
  { id: "excel", label: "Excel queue", icon: FiGrid },
];

const SETUP_TABS = [
  { id: "voice", label: "Voice & Seeds", icon: FiZap },
  { id: "brand", label: "Brand kit", icon: FiLayers },
  { id: "links", label: "Links", icon: FiLink },
  { id: "assets", label: "Assets", icon: FiImage },
  { id: "schedule", label: "Autopilot", icon: FiClock },
  { id: "agents", label: "Agents", icon: FiCpu },
  { id: "external", label: "External n8n", icon: FiExternalLink },
];

const surfaceCard = "rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-5";
const raisedCard = "rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] p-4";
const helpText = "text-sm text-[var(--cw-ink-muted)]";

function statusChip(status) {
  const s = String(status || "");
  const map = {
    succeeded: "border-[color-mix(in_srgb,var(--cw-neon)_45%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-neon)_12%,var(--cw-surface))] text-[var(--cw-neon)]",
    running: "border-amber-400/40 bg-amber-400/10 text-amber-300",
    queued: "border-amber-400/40 bg-amber-400/10 text-amber-300",
    failed: "border-[color-mix(in_srgb,var(--cw-danger)_45%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-danger)_12%,var(--cw-surface))] text-[var(--cw-danger)]",
    cancelled: "border-[var(--cw-hairline)] bg-[var(--cw-raised)] text-[var(--cw-ink-muted)]",
  };
  return map[s] || "border-[var(--cw-hairline)] bg-[var(--cw-raised)] text-[var(--cw-ink-muted)]";
}

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
  const [zone, setZone] = useState("compose");
  const [source, setSource] = useState("topic");
  const [setupTab, setSetupTab] = useState("voice");
  const [seedHandoffRunId, setSeedHandoffRunId] = useState("");
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

  // Deep-link handoff from SERP Analysis / Autopilot: land on Compose with the
  // Inbox source open and the freshly-sent batch highlighted.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let raw;
    try {
      raw = sessionStorage.getItem("cw:blogSeedHandoff");
    } catch {
      raw = null;
    }
    if (!raw) return;
    try {
      sessionStorage.removeItem("cw:blogSeedHandoff");
    } catch {}
    try {
      const h = JSON.parse(raw);
      if (h?.at && Date.now() - h.at > 120000) return;
      setZone("compose");
      setSource("inbox");
      if (h?.runId) setSeedHandoffRunId(h.runId);
    } catch {}
  }, []);

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
      setSaveMessage({ ok: true, text: "Studio run queued — watch it below." });
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
      setZone("setup");
      setSetupTab("voice");
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

  const openRun = useCallback(async (id) => {
    const res = await fetch(`/api/admin/blog-automation/runs/${id}`);
    const data = await res.json();
    if (res.ok) {
      setActiveRun(data.run);
      setZone("library");
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-8 text-sm text-[var(--cw-ink-muted)]">
        <FiRefreshCw className="animate-spin" /> Loading Blog Automation Studio…
      </div>
    );
  }

  const goAgents = () => {
    setZone("setup");
    setSetupTab("agents");
  };

  return (
    <div className="space-y-4">
      {/* Header + engine switch */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-[var(--cw-hairline)] pb-4">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-heading inline-flex items-center gap-2 text-lg font-semibold tracking-tight text-[var(--cw-ink)]">
            <FiZap className="h-4 w-4 text-[var(--cw-neon)]" />
            Blog Studio
          </h1>
          <span className="truncate font-mono text-[11px] text-[var(--cw-ink-faint)]">
            {selectedSite || "No site selected"}
          </span>
        </div>
        <TabRail
          size="sm"
          tabs={[
            { id: "internal", label: "Internal Studio" },
            { id: "external", label: "External n8n" },
          ]}
          value={isInternal ? "internal" : "external"}
          onChange={(id) => saveEngine(id)}
          ariaLabel="Automation engine"
        />
      </div>

      {loadError && (
        <p className="rounded-xl border border-[color-mix(in_srgb,var(--cw-danger)_35%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-danger)_10%,var(--cw-surface))] px-3 py-2 text-sm text-[var(--cw-danger)]">
          {loadError}
        </p>
      )}
      {saveMessage && String(saveMessage.text || "").trim() ? (
        <p
          className={`rounded-xl border px-3 py-2 text-sm ${
            saveMessage.ok
              ? "border-[color-mix(in_srgb,var(--cw-neon)_35%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-neon)_9%,var(--cw-surface))] text-[var(--cw-neon)]"
              : "border-[color-mix(in_srgb,var(--cw-danger)_35%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-danger)_10%,var(--cw-surface))] text-[var(--cw-danger)]"
          }`}
        >
          {String(saveMessage.text).trim()}
        </p>
      ) : null}

      {/* External-mode brand kit still available */}
      {siteConfig && selectedSite && !isInternal ? (
        <div className="space-y-2">
          <p className={helpText}>
            AI Brand kit is available here even in External mode. Switch to{" "}
            <button
              type="button"
              className="font-semibold text-[var(--cw-neon)] hover:underline"
              onClick={() => saveEngine("internal")}
            >
              Internal Studio
            </button>{" "}
            when you want image runs to apply this frame.
          </p>
          <StudioBrandKit
            brandKit={siteConfig.brandKitJson}
            apiUrl={`/api/admin/blog-automation/site/brand-kit${siteQ}`}
            onConfig={setSiteConfig}
            onMessage={(msg) =>
              setSaveMessage(
                typeof msg === "string" ? { ok: !/fail|error|missing/i.test(msg), text: msg } : msg
              )
            }
            onPatchLocal={(brandKitJson) => patchSite({ brandKitJson })}
          />
        </div>
      ) : null}

      {/* External engine: outbound webhook config (no internal pipeline). */}
      {!isInternal && (
        <div className={`${surfaceCard} max-w-2xl space-y-4`}>
          <div className="flex items-center gap-2 text-[var(--cw-neon)]">
            <FiLink />
            <h2 className="text-sm font-bold uppercase tracking-wide">External n8n webhook</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
                onChange={(e) => setGlobalConfig((c) => ({ ...c, intervalMinutes: Number(e.target.value) }))}
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
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-[var(--cw-ink-muted)]">
              <input
                type="checkbox"
                checked={Boolean(globalConfig.scheduleEnabled)}
                onChange={(e) => setGlobalConfig((c) => ({ ...c, scheduleEnabled: e.target.checked }))}
              />
              Enable external schedule
            </label>
            <Btn variant="primary" size="sm" icon={FiSave} onClick={saveExternal} loading={saving}>
              Save external
            </Btn>
          </div>
          <div className="border-t border-[var(--cw-hairline)] pt-4">
            <label className={labelClass}>Manual trigger prompt</label>
            <textarea
              className={`${inputClass} mt-1 min-h-[80px]`}
              value={manualPrompt}
              onChange={(e) => setManualPrompt(e.target.value)}
            />
            <Btn variant="secondary" size="sm" icon={triggeringExternal ? FiRefreshCw : FiSend} onClick={triggerExternal} disabled={triggeringExternal} className="mt-2">
              Trigger webhook
            </Btn>
          </div>
          {history.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--cw-ink-faint)]">
                Webhook history
              </p>
              <ul className="space-y-1 text-xs text-[var(--cw-ink-muted)]">
                {history.slice(0, 10).map((h, i) => (
                  <li key={i} className="flex justify-between gap-2 border-b border-[var(--cw-hairline)] py-1">
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

      {isInternal && siteConfig && (
        <>
          {/* Primary zone nav + always-available run controls */}
          <div className="flex flex-wrap items-center gap-3">
            <TabRail
              tabs={ZONES.map((z) =>
                z.id === "library" && hasLiveAutomation ? { ...z, live: true } : z
              )}
              value={zone}
              onChange={setZone}
              ariaLabel="Blog studio"
              className="min-w-0 flex-1"
            />
            <div className="ml-auto flex items-center gap-2">
              {hasLiveAutomation && (
                <Btn variant="danger" size="sm" icon={cancelling ? FiRefreshCw : FiXCircle} onClick={cancelAllLive} disabled={cancelling}>
                  {cancelling ? "Cancelling…" : "Cancel run"}
                </Btn>
              )}
              <Btn
                variant={siteConfig.autoEnabled ? "outline" : "secondary"}
                size="sm"
                icon={siteConfig.autoEnabled ? FiPlay : FiPause}
                onClick={toggleAuto}
              >
                Auto {siteConfig.autoEnabled ? "on" : "paused"}
              </Btn>
              <Btn variant="primary" size="sm" icon={FiSave} onClick={saveSiteConfig} loading={saving}>
                Save
              </Btn>
            </div>
          </div>

          {/* Live run docks on every zone, minimised, self-hiding. */}
          <LiveRunDock run={activeRun} label="Draft" onCancel={() => cancelRun(activeRun?.id)} cancelling={cancelling}>
            <RunConsole run={activeRun} onCancel={() => cancelRun(activeRun?.id)} cancelling={cancelling} />
          </LiveRunDock>

          {/* ── COMPOSE ─────────────────────────────────────────────── */}
          {zone === "compose" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <TabRail size="sm" tabs={SOURCES} value={source} onChange={setSource} ariaLabel="Content source" />
                <span className="hidden text-xs text-[var(--cw-ink-faint)] sm:inline">
                  Where the next draft comes from
                </span>
              </div>

              {source === "topic" && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
                  <div className={`${surfaceCard} space-y-4`}>
                    <div>
                      <label className={labelClass}>Topic for this draft</label>
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
                        className={`${inputClass} mt-1 min-h-[72px] font-mono text-xs`}
                        value={siteConfig.mustFollowKeywords || ""}
                        onChange={(e) => patchSite({ mustFollowKeywords: e.target.value })}
                        placeholder={"primary keyword\nsecondary keyword"}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>General / seed prompt</label>
                      <textarea
                        className={`${inputClass} mt-1 min-h-[96px]`}
                        value={siteConfig.seedPrompt || ""}
                        onChange={(e) => patchSite({ seedPrompt: e.target.value })}
                        placeholder="Standing brief for agents (brand voice, niche, what every post should cover)…"
                      />
                      <p className="mt-1 text-xs text-[var(--cw-ink-faint)]">
                        Standing seeds (audience, links, brand) live in Setup → Voice & Seeds and apply automatically.
                      </p>
                    </div>
                    <Btn variant="primary" size="lg" icon={running ? FiRefreshCw : FiSend} onClick={startRun} disabled={running || !selectedSite}>
                      {running ? "Queueing…" : "Generate draft"}
                    </Btn>
                  </div>
                  <div className="space-y-4">
                    <PipelinePreview config={siteConfig} onConfigure={goAgents} />
                    <div className={`${raisedCard} space-y-1`}>
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--cw-ink-faint)]">
                        Tips
                      </p>
                      <p className="text-xs text-[var(--cw-ink-muted)]">
                        Leave the topic blank to let the Strategist choose from your seeds. The Interpreter
                        only runs for document / Excel sources.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {source === "inbox" && (
                <div className={surfaceCard}>
                  <ContentInbox
                    siteLink={selectedSite}
                    highlightRunId={seedHandoffRunId}
                    onRan={async (run) => {
                      if (run?.id) setActiveRun(run);
                      setSaveMessage({ ok: true, text: "Studio run queued — watch stages above." });
                      await loadRuns();
                    }}
                  />
                </div>
              )}

              {source === "excel" && (
                <div className={surfaceCard}>
                  <ExcelQueuePanel
                    siteLink={selectedSite}
                    siteConfig={siteConfig}
                    onPatchSite={patchSite}
                    onMessage={setSaveMessage}
                    onToggleAuto={toggleAuto}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── LIBRARY ─────────────────────────────────────────────── */}
          {zone === "library" && (
            <div className="space-y-4">
              {!hasLiveAutomation ? (
                <RunConsole run={activeRun} onCancel={() => cancelRun(activeRun?.id)} cancelling={cancelling} />
              ) : null}

              {runs.length > 0 ? (
                <div className={surfaceCard}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--cw-ink-faint)]">
                      Recent runs
                    </p>
                    <Btn variant="ghost" size="xs" icon={FiRefreshCw} onClick={loadRuns}>
                      Refresh
                    </Btn>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                    {runs.map((r) => {
                      const live = r.status === "queued" || r.status === "running";
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => openRun(r.id)}
                          className="group flex flex-col gap-2 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] p-3.5 text-left transition-smooth hover:border-[color-mix(in_srgb,var(--cw-neon)_35%,var(--cw-hairline))] hover:bg-[var(--cw-overlay)]"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusChip(r.status)}`}>
                              {r.status}
                            </span>
                            <span className="font-mono text-[10px] text-[var(--cw-ink-faint)]">
                              {formatWhen(r.createdAt)}
                            </span>
                          </div>
                          <p className="line-clamp-2 text-sm font-semibold text-[var(--cw-ink)]">
                            {r.topic || "Untitled topic"}
                          </p>
                          <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-[11px] text-[var(--cw-ink-muted)]">
                            <span className="font-mono">
                              {r.totalCostUsd != null ? `$${Number(r.totalCostUsd).toFixed(4)}` : "—"}
                            </span>
                            <span className="truncate">{r.trigger}</span>
                          </div>
                          {live && (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                cancelRun(r.id);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.stopPropagation();
                                  cancelRun(r.id);
                                }
                              }}
                              className="inline-flex w-fit items-center gap-1 rounded-md border border-[color-mix(in_srgb,var(--cw-danger)_35%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-danger)_10%,var(--cw-surface))] px-2 py-1 text-[11px] font-semibold text-[var(--cw-danger)]"
                            >
                              <FiXCircle className="h-3 w-3" /> Cancel
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className={`${surfaceCard} text-center`}>
                  <FiList className="mx-auto h-6 w-6 text-[var(--cw-ink-faint)]" />
                  <p className="mt-2 text-sm font-semibold text-[var(--cw-ink)]">No runs yet</p>
                  <p className="mt-1 text-xs text-[var(--cw-ink-muted)]">
                    Head to Compose and generate your first draft — it will appear here.
                  </p>
                  <Btn variant="outline" size="sm" icon={FiEdit3} className="mt-3" onClick={() => setZone("compose")}>
                    Go to Compose
                  </Btn>
                </div>
              )}
            </div>
          )}

          {/* ── SETUP ───────────────────────────────────────────────── */}
          {zone === "setup" && (
            <div className="space-y-4">
              <TabRail size="sm" tabs={SETUP_TABS} value={setupTab} onChange={setSetupTab} ariaLabel="Studio setup" />

              <div className={surfaceCard}>
                {setupTab === "voice" && (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <p className={`md:col-span-2 ${helpText}`}>
                      Every filled field is injected into all three agents for <strong>manual Generate</strong> and{" "}
                      <strong>auto</strong> runs. Excel rows add a topic brief on top — they never wipe these standing seeds.
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

                {setupTab === "brand" && (
                  <StudioBrandKit
                    brandKit={siteConfig.brandKitJson}
                    apiUrl={`/api/admin/blog-automation/site/brand-kit${siteQ}`}
                    onConfig={setSiteConfig}
                    onMessage={(msg) =>
                      setSaveMessage(
                        typeof msg === "string" ? { ok: !/fail|error|missing/i.test(msg), text: msg } : msg
                      )
                    }
                    onPatchLocal={(brandKitJson) => patchSite({ brandKitJson })}
                  />
                )}

                {setupTab === "links" && (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div>
                      <label className={labelClass}>Internal links (JSON array)</label>
                      <p className="mb-1 text-[11px] text-[var(--cw-ink-faint)]">
                        {`[{ "url": "https://…", "anchor_text": "…", "title": "…" }]`}
                      </p>
                      <textarea
                        className={`${inputClass} min-h-[280px] font-mono text-xs`}
                        value={internalLinksText}
                        onChange={(e) => setInternalLinksText(e.target.value)}
                        spellCheck={false}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>External links (JSON array)</label>
                      <p className="mb-1 text-[11px] text-[var(--cw-ink-faint)]">
                        {`[{ "url": "https://…", "title": "…", "usage": "reference" }]`}
                      </p>
                      <textarea
                        className={`${inputClass} min-h-[280px] font-mono text-xs`}
                        value={externalLinksText}
                        onChange={(e) => setExternalLinksText(e.target.value)}
                        spellCheck={false}
                      />
                    </div>
                  </div>
                )}

                {setupTab === "assets" && (
                  <div className="space-y-4">
                    <p className={helpText}>
                      Style reference images + visual guidelines. For matte/logo branding, use the{" "}
                      <button
                        type="button"
                        className="font-semibold text-[var(--cw-neon)] hover:underline"
                        onClick={() => setSetupTab("brand")}
                      >
                        AI Brand kit
                      </button>{" "}
                      tab.
                    </p>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-4 py-3">
                      <input
                        type="checkbox"
                        className="mt-1 rounded border-[var(--cw-hairline)] text-[var(--cw-neon)] focus:ring-[var(--cw-neon)]"
                        checked={Boolean(siteConfig.generateBackupImages)}
                        onChange={(e) => patchSite({ generateBackupImages: e.target.checked })}
                      />
                      <span>
                        <span className="text-sm font-semibold text-[var(--cw-ink)]">Generate 3 backup images</span>
                        <span className="mt-0.5 block text-xs text-[var(--cw-ink-muted)]">
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
                      <p className="mt-1 text-xs text-[var(--cw-ink-faint)]">
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
                    <div className="rounded-xl border border-dashed border-[var(--cw-hairline-strong)] bg-[var(--cw-raised)] p-6 text-center">
                      <FiUpload className="mx-auto h-6 w-6 text-[var(--cw-neon)]" />
                      <p className="mt-2 text-sm font-semibold text-[var(--cw-ink)]">Interpreter upload</p>
                      <p className="mt-1 text-xs text-[var(--cw-ink-muted)]">.txt or .docx → fill SEO seed fields</p>
                      <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-surface)] px-3 py-2 text-xs font-semibold text-[var(--cw-ink)] hover:border-[var(--cw-neon)]">
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

                {setupTab === "schedule" && (
                  <div className="max-w-xl space-y-5">
                    <p className={helpText}>
                      Control how often Internal Studio creates the next draft for this site. Pause anytime to
                      run a specific manual topic without the queue advancing.
                    </p>
                    <div>
                      <label className={labelClass}>General prompt for auto</label>
                      <textarea
                        className={`${inputClass} mt-1 min-h-[120px]`}
                        value={siteConfig.seedPrompt || ""}
                        onChange={(e) => patchSite({ seedPrompt: e.target.value })}
                        placeholder="e.g. Write practical, trustworthy SEO blogs for shippers researching freight forwarding…"
                      />
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
                      <p className="mt-1.5 text-xs text-[var(--cw-ink-faint)]">
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
                                  ? "border-[color-mix(in_srgb,var(--cw-neon)_45%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-neon)_9%,var(--cw-surface))] shadow-sm"
                                  : "border-[var(--cw-hairline)] bg-[var(--cw-raised)] hover:border-[var(--cw-hairline-strong)]"
                              }`}
                            >
                              <p className="text-sm font-semibold text-[var(--cw-ink)]">{opt.label}</p>
                              <p className="mt-1 text-xs leading-snug text-[var(--cw-ink-muted)]">{opt.hint}</p>
                            </button>
                          );
                        })}
                      </div>
                      {siteConfig.autoSource === "excel" && (
                        <button
                          type="button"
                          onClick={() => {
                            setZone("compose");
                            setSource("excel");
                          }}
                          className="mt-2 text-xs font-semibold text-[var(--cw-neon)] hover:underline"
                        >
                          Open Excel queue →
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-[var(--cw-ink-faint)]">
                      Last auto: {formatWhen(siteConfig.lastAutoAt)} · Status:{" "}
                      <strong className="text-[var(--cw-ink)]">{siteConfig.autoEnabled ? "Running" : "Paused"}</strong>
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Btn variant="secondary" size="md" icon={siteConfig.autoEnabled ? FiPause : FiPlay} onClick={toggleAuto}>
                        {siteConfig.autoEnabled ? "Pause auto" : "Enable auto"}
                      </Btn>
                      <Btn variant="primary" size="md" icon={FiSave} onClick={saveSiteConfig} loading={saving}>
                        Save schedule
                      </Btn>
                    </div>
                  </div>
                )}

                {setupTab === "agents" && (
                  <div className="space-y-6">
                    <p className={helpText}>
                      Advanced. Pick a provider and model per agent. Image: OpenAI or OpenRouter (Flux, Gemini
                      Image, GPT Image…). Claude cannot generate images — use OpenRouter instead.
                    </p>
                    {[
                      ["interpreter", "Interpreter", "interpreterProvider", "interpreterModel", "interpreterPrompt", "chat"],
                      ["agent1", "Strategist (Agent 1)", "agent1Provider", "agent1Model", "agent1Prompt", "chat"],
                      ["agent2", "Architect (Agent 2)", "agent2Provider", "agent2Model", "agent2Prompt", "chat"],
                      ["agent3", "Writer (Agent 3)", "agent3Provider", "agent3Model", "agent3Prompt", "chat"],
                      ["image", "Image", "imageProvider", "imageModel", "imagePromptSystem", "image"],
                    ].map(([id, title, pKey, mKey, promptKey, kind]) => {
                      const providerList = kind === "image" ? IMAGE_PROVIDERS : PROVIDERS;
                      const providerValue = siteConfig[pKey] || "openai";
                      const modelList = modelsForProvider(providerValue, {
                        kind,
                        current: siteConfig[mKey] || "",
                      });
                      return (
                        <div key={id} className={raisedCard}>
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <FiCpu className="text-[var(--cw-neon)]" />
                              <h3 className="text-sm font-bold text-[var(--cw-ink)]">{title}</h3>
                            </div>
                            {BLOG_STUDIO_DEFAULT_PROMPTS[promptKey] ? (
                              <Btn
                                variant="ghost"
                                size="xs"
                                icon={FiRotateCcw}
                                onClick={() => patchSite({ [promptKey]: BLOG_STUDIO_DEFAULT_PROMPTS[promptKey] })}
                              >
                                Revert prompt
                              </Btn>
                            ) : null}
                          </div>
                          <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
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
                                className={`${inputClass} mt-1 text-sm font-semibold`}
                                value={siteConfig[mKey] || modelList[0]?.value || ""}
                                options={modelList}
                                onChange={(v) => patchSite({ [mKey]: v })}
                              />
                              <p className="mt-1 text-[11px] text-[var(--cw-ink-faint)]">
                                Suggestions for {providerValue} — or type any model id
                              </p>
                            </div>
                          </div>
                          <label className={labelClass}>System prompt</label>
                          <textarea
                            className={`${inputClass} mt-1 min-h-[160px] font-mono text-xs`}
                            value={siteConfig[promptKey] || ""}
                            onChange={(e) => patchSite({ [promptKey]: e.target.value })}
                          />
                        </div>
                      );
                    })}
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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

                {setupTab === "external" && (
                  <div className="max-w-2xl space-y-4">
                    <div className="flex items-center gap-2 text-[var(--cw-neon)]">
                      <FiLink />
                      <h2 className="text-sm font-bold uppercase tracking-wide">External n8n webhook</h2>
                    </div>
                    <p className={helpText}>
                      Configure the outbound webhook used when Engine is set to External n8n. These settings are
                      shared across sites.
                    </p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
                          onChange={(e) => setGlobalConfig((c) => ({ ...c, intervalMinutes: Number(e.target.value) }))}
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
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="inline-flex items-center gap-2 text-sm text-[var(--cw-ink-muted)]">
                        <input
                          type="checkbox"
                          checked={Boolean(globalConfig.scheduleEnabled)}
                          onChange={(e) => setGlobalConfig((c) => ({ ...c, scheduleEnabled: e.target.checked }))}
                        />
                        Enable external schedule
                      </label>
                      <Btn variant="primary" size="sm" icon={FiSave} onClick={saveExternal} loading={saving}>
                        Save external
                      </Btn>
                    </div>
                    <div className="border-t border-[var(--cw-hairline)] pt-4">
                      <label className={labelClass}>Manual trigger prompt</label>
                      <textarea
                        className={`${inputClass} mt-1 min-h-[80px]`}
                        value={manualPrompt}
                        onChange={(e) => setManualPrompt(e.target.value)}
                      />
                      <Btn variant="secondary" size="sm" icon={triggeringExternal ? FiRefreshCw : FiSend} onClick={triggerExternal} disabled={triggeringExternal} className="mt-2">
                        Trigger webhook
                      </Btn>
                    </div>
                    {history.length > 0 && (
                      <div>
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--cw-ink-faint)]">
                          Webhook history
                        </p>
                        <ul className="space-y-1 text-xs text-[var(--cw-ink-muted)]">
                          {history.slice(0, 10).map((h, i) => (
                            <li key={i} className="flex justify-between gap-2 border-b border-[var(--cw-hairline)] py-1">
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
            </div>
          )}
        </>
      )}

      {isInternal && !selectedSite && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-5 text-sm text-amber-200">
          Select a client site in the dashboard header to configure Internal Studio for that site.
        </div>
      )}
    </div>
  );
}
