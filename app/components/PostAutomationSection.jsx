"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiZap,
  FiSave,
  FiPlay,
  FiPause,
  FiRefreshCw,
  FiSend,
  FiCpu,
  FiXCircle,
  FiInfo,
  FiRotateCcw,
  FiEdit3,
  FiGrid,
  FiList,
  FiSettings,
  FiLayers,
  FiImage,
  FiClock,
  FiExternalLink,
} from "react-icons/fi";
import RunConsole from "./postsStudio/RunConsole";
import RunLibrary from "./postsStudio/RunLibrary";
import ExcelQueuePanel from "./postsStudio/ExcelQueuePanel";
import PipelinePreview from "./postsStudio/PipelinePreview";
import ModelCombobox from "./studioShared/ModelCombobox";
import StudioReferenceImages from "./studioShared/StudioReferenceImages";
import StudioBrandKit from "./studioShared/StudioBrandKit";
import TabRail from "./ui-shared/TabRail";
import Btn from "./ui-shared/Btn";
import LiveRunDock from "./studioShared/LiveRunDock";
import StudioComposerShell from "./studioShared/StudioComposerShell";
import { isLiveStatus } from "./studioShared/runFormat";
import { POST_STUDIO_DEFAULT_PROMPTS } from "../../lib/postsStudio/defaults";
import { useStudioProjectLabel } from "../hooks/useStudioProjectLabel";
import { uploadStudioOperatorImage } from "../../lib/studioOperatorImageClient";
import {
  INTERVAL_OPTIONS,
  AUTO_SOURCE_OPTIONS,
  PLATFORM_OPTIONS,
  PROVIDERS,
  IMAGE_PROVIDERS,
  IMAGE_ANTHROPIC_HINT,
  modelsForProvider,
  defaultModelForProvider,
  inputClass,
  labelClass,
  formatWhen,
} from "./postsStudio/studioConstants";
import { useGuidePrepare } from "@/lib/guideNav";

const ZONES = [
  { id: "compose", label: "Compose", icon: FiEdit3 },
  { id: "library", label: "Library", icon: FiList },
  { id: "setup", label: "Setup", icon: FiSettings },
];

const SOURCES = [
  { id: "topic", label: "Topic", icon: FiEdit3 },
  { id: "excel", label: "Excel queue", icon: FiGrid },
];

const SETUP_TABS = [
  { id: "voice", label: "Voice & Seeds", icon: FiZap },
  { id: "brand", label: "Brand kit", icon: FiLayers },
  { id: "assets", label: "Assets", icon: FiImage },
  { id: "schedule", label: "Autopilot", icon: FiClock },
  { id: "agents", label: "Agents", icon: FiCpu },
  { id: "external", label: "External", icon: FiExternalLink },
];

const BOTTOM_DOCK = [
  { id: "brief", label: "Brief", icon: FiEdit3 },
  { id: "excel", label: "Queue", icon: FiGrid },
  { id: "library", label: "Library", icon: FiList },
  { id: "setup", label: "Setup", icon: FiSettings },
];

const surfaceCard = "rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-5";
const raisedCard = "rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] p-4";
const helpText = "text-sm text-[var(--cw-ink-muted)]";

export default function PostAutomationSection({ selectedSite = "" }) {
  const projectLabel = useStudioProjectLabel(selectedSite);
  const [zone, setZone] = useState("compose");
  const [source, setSource] = useState("topic");
  const [setupTab, setSetupTab] = useState("voice");
  const [bottomTab, setBottomTab] = useState(null);

  const openBottomTab = useCallback((id) => {
    if (!id) {
      setBottomTab(null);
      setZone("compose");
      setSource("topic");
      return;
    }
    setBottomTab(id);
    if (id === "library") {
      setZone("library");
    setBottomTab("library");
      return;
    }
    if (id === "setup") {
      setZone("setup");
      return;
    }
    if (id === "brief") {
      setZone("compose");
      setSource("topic");
      return;
    }
    setZone("compose");
    setSource(id);
  }, []);

  useGuidePrepare((nav) => {
    if (nav.setupTab) {
      setZone("setup");
      setSetupTab(nav.setupTab);
      setBottomTab("setup");
      return;
    }
    if (nav.zone === "library") {
      setZone("library");
    setBottomTab("library");
      setBottomTab("library");
      return;
    }
    if (nav.zone === "setup") {
      setZone("setup");
      setBottomTab("setup");
      return;
    }
    if (nav.source && nav.source !== "topic") {
      setZone("compose");
      setSource(nav.source);
      setBottomTab(nav.source);
      return;
    }
    if (nav.zone) setZone(nav.zone);
    if (nav.source) setSource(nav.source);
    setBottomTab(null);
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [engineMode, setEngineMode] = useState("external");
  const [globalConfig, setGlobalConfig] = useState({});
  const [siteConfig, setSiteConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  const [topic, setTopic] = useState("");
  const [operatorImageFile, setOperatorImageFile] = useState(null);
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState([]);
  // The run in flight and the run you're reading are separate things: opening an
  // old run from the Library must not tear down the live dock.
  const [liveRun, setLiveRun] = useState(null);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedRunDetail, setSelectedRunDetail] = useState(null);
  const [runDetailLoading, setRunDetailLoading] = useState(false);
  const [runDetailError, setRunDetailError] = useState("");
  const [runDetailNonce, setRunDetailNonce] = useState(0);
  const [refreshingRuns, setRefreshingRuns] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const siteQ = useMemo(
    () => (selectedSite ? `?siteLink=${encodeURIComponent(selectedSite)}` : ""),
    [selectedSite]
  );
  const isInternal = engineMode === "internal";

  const loadGlobal = useCallback(async () => {
    const res = await fetch("/api/admin/post-automation");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load automation settings.");
    setGlobalConfig(data.config || {});
    setEngineMode(data.config?.engineMode === "internal" ? "internal" : "external");
  }, []);

  const loadSite = useCallback(async () => {
    if (!selectedSite) {
      setSiteConfig(null);
      return;
    }
    const res = await fetch(`/api/admin/post-automation/site${siteQ}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load site studio config.");
    setSiteConfig(data.config || null);
  }, [selectedSite, siteQ]);

  const loadRuns = useCallback(async () => {
    if (!selectedSite) {
      setRuns([]);
      return;
    }
    const res = await fetch(
      `/api/admin/post-automation/runs?siteLink=${encodeURIComponent(selectedSite)}&limit=25`
    );
    const data = await res.json();
    if (res.ok) setRuns(Array.isArray(data.runs) ? data.runs : []);
  }, [selectedSite]);

  const refreshRuns = useCallback(async () => {
    setRefreshingRuns(true);
    try {
      await loadRuns();
    } finally {
      setRefreshingRuns(false);
    }
  }, [loadRuns]);

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

  // The run in flight, taken from the list so runs started elsewhere (Excel
  // queue, autopilot, another tab) are picked up too.
  const liveRunFromList = useMemo(() => runs.find((r) => isLiveStatus(r.status)) || null, [runs]);
  const liveRunId = isLiveStatus(liveRun?.status) ? liveRun.id : liveRunFromList?.id || "";
  const hasLiveAutomation = Boolean(liveRunId);

  // Follow the live run closely — this is what feeds the dock and, when it's the
  // run you have open, the cockpit.
  useEffect(() => {
    if (!liveRunId) return undefined;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/admin/post-automation/runs/${liveRunId}`);
        const data = await res.json();
        if (!cancelled && res.ok && data.run) setLiveRun(data.run);
      } catch {
        /* ignore poll errors */
      }
    };
    tick();
    const t = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [liveRunId]);

  // Keep the library list itself moving while anything is live, so its cards
  // report progress instead of going stale until someone hits Refresh.
  useEffect(() => {
    if (!hasLiveAutomation) return undefined;
    const t = setInterval(() => {
      loadRuns();
    }, 4000);
    return () => clearInterval(t);
  }, [hasLiveAutomation, loadRuns]);

  // Whichever run the dock follows is already polled, so the Library reads it
  // off that object rather than fetching the same run twice.
  const selectedIsLiveRun =
    Boolean(selectedRunId) && (selectedRunId === liveRunId || selectedRunId === liveRun?.id);

  // The run you selected in the Library, for every run that isn't the live one.
  useEffect(() => {
    if (!selectedRunId || selectedIsLiveRun) {
      setRunDetailLoading(false);
      return undefined;
    }
    let cancelled = false;
    let timer = null;

    const load = async (initial) => {
      if (initial) {
        setRunDetailLoading(true);
        setRunDetailError("");
      }
      try {
        const res = await fetch(`/api/admin/post-automation/runs/${selectedRunId}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || "Failed to load this run.");
        setSelectedRunDetail(data.run);
        // A run can be live without being *the* live run (a queued Excel batch).
        if (isLiveStatus(data.run?.status)) timer = setTimeout(() => load(false), 2500);
      } catch (err) {
        if (!cancelled && initial) setRunDetailError(err.message || "Failed to load this run.");
      } finally {
        if (!cancelled && initial) setRunDetailLoading(false);
      }
    };

    load(true);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [selectedRunId, selectedIsLiveRun, runDetailNonce]);

  const selectedRun =
    selectedRunId && liveRun?.id === selectedRunId ? liveRun : selectedRunDetail;

  const selectRun = useCallback((id) => {
    const runId = String(id || "");
    if (!runId) return;
    setSelectedRunId(runId);
    setSelectedRunDetail(null);
    setRunDetailError("");
    setZone("library");
    setBottomTab("library");
  }, []);

  const closeRun = useCallback(() => {
    setSelectedRunId("");
    setSelectedRunDetail(null);
    setRunDetailError("");
  }, []);

  const patchSite = useCallback(
    (patch) => setSiteConfig((c) => (c ? { ...c, ...patch } : c)),
    []
  );

  const saveEngine = async (mode) => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/admin/post-automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engineMode: mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to switch engine.");
      setEngineMode(data.config?.engineMode === "internal" ? "internal" : "external");
      setGlobalConfig(data.config || {});
      setSaveMessage({
        ok: true,
        text: `Engine set to ${mode === "internal" ? "Internal Studio" : "External ingest"}.`,
      });
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
      const res = await fetch(`/api/admin/post-automation/site${siteQ}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(siteConfig),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save.");
      setSiteConfig(data.config);
      setSaveMessage({ ok: true, text: "Studio settings saved." });
    } catch (err) {
      setSaveMessage({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const startRun = async () => {
    if (!selectedSite) {
      setSaveMessage({ ok: false, text: "Select an account in the header first." });
      return;
    }
    setRunning(true);
    setSaveMessage(null);
    try {
      // Persist current compose fields before run
      await saveSiteConfig();
      let operatorImagePath = "";
      if (operatorImageFile) {
        operatorImagePath = await uploadStudioOperatorImage("post", operatorImageFile);
      }
      const res = await fetch(`/api/admin/post-automation/site/run${siteQ}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          generateImage: !operatorImagePath,
          operatorImagePath: operatorImagePath || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start run.");
      if (data.run) {
        setLiveRun(data.run);
        selectRun(data.run.id);
        setOperatorImageFile(null);
      }
      setSaveMessage({ ok: true, text: "Run queued — following it in the Library." });
      loadRuns();
    } catch (err) {
      setSaveMessage({ ok: false, text: err.message });
    } finally {
      setRunning(false);
    }
  };

  const cancelRun = async (runId) => {
    const id = runId || liveRunId;
    if (!selectedSite) return;
    setCancelling(true);
    setSaveMessage(null);
    try {
      const res = await fetch(`/api/admin/post-automation/site/cancel${siteQ}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { runId: id } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to cancel.");
      const cancelled = data.run || data.runs?.[0] || null;
      if (cancelled) {
        if (liveRun?.id === cancelled.id) setLiveRun(cancelled);
        if (selectedRunId === cancelled.id) setSelectedRunDetail(cancelled);
      }
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
      const res = await fetch(`/api/admin/post-automation/site/cancel${siteQ}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to cancel.");
      if (data.runs?.[0]) setLiveRun(data.runs[0]);
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
    const res = await fetch(`/api/admin/post-automation/site/pause${siteQ}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoEnabled: !siteConfig?.autoEnabled }),
    });
    const data = await res.json();
    if (res.ok) setSiteConfig(data.config);
    else setSaveMessage({ ok: false, text: data.error || "Failed to toggle auto." });
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-8 text-sm text-[var(--cw-ink-muted)]">
        <FiRefreshCw className="animate-spin" /> Loading Post Automation Studio…
      </div>
    );
  }

  const goAgents = () => {
    setSetupTab("agents");
    openBottomTab("setup");
  };

  // The dock is a pointer to the live run; in the Library with that run open
  // there is nothing left for it to point at.
  const dockedRun =
    bottomTab === "library" && selectedRunId && selectedRunId === liveRun?.id ? null : liveRun;

  const engineSwitch = (
    <TabRail
      size="sm"
      tabs={[
        { id: "internal", label: "Internal" },
        { id: "external", label: "External" },
      ]}
      value={isInternal ? "internal" : "external"}
      onChange={(id) => saveEngine(id)}
      ariaLabel="Automation engine"
    />
  );

  const banners = (
    <>
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
    </>
  );

  const externalModeUi = !isInternal ? (
    <div className="space-y-4">
      {siteConfig && selectedSite ? (
        <div className="space-y-2">
          <p className={helpText}>
            AI Brand kit is available here even in External mode. Switch to{" "}
            <button type="button" className="font-semibold text-[var(--cw-neon)] hover:underline" onClick={() => saveEngine("internal")}>
              Internal Studio
            </button>{" "}
            when you want image runs to apply this frame.
          </p>
          <StudioBrandKit
            brandKit={siteConfig.brandKitJson}
            apiUrl={`/api/admin/post-automation/site/brand-kit${siteQ}`}
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
      <div className={`${surfaceCard} max-w-2xl space-y-3`}>
        <div className="flex items-center gap-2 text-[var(--cw-neon)]">
          <FiInfo />
          <h2 className="text-sm font-bold uppercase tracking-wide">External mode active</h2>
        </div>
        <p className={helpText}>
          Inbound API, Meta pull, and email ingest remain the generators. Switch to{" "}
          <strong className="text-[var(--cw-ink)]">Internal Studio</strong> above to schedule
          Strategist + Copywriter + image runs that create pending Approvals.
        </p>
      </div>
    </div>
  ) : null;

  let sheetContent = null;
  if (isInternal && siteConfig && bottomTab === "brief") {
    sheetContent = (
      <div className="space-y-4" data-guide="studio-brief">
        <div>
          <label className={labelClass}>Hooks / keywords (rotating)</label>
          <textarea
            className={`${inputClass} mt-1 min-h-[72px] font-mono text-xs`}
            value={siteConfig.hooksOrKeywords || ""}
            onChange={(e) => patchSite({ hooksOrKeywords: e.target.value })}
            placeholder={"hook or keyword one\nhook or keyword two"}
          />
        </div>
        <div>
          <label className={labelClass}>General / seed prompt</label>
          <textarea
            className={`${inputClass} mt-1 min-h-[96px]`}
            value={siteConfig.seedPrompt || ""}
            onChange={(e) => patchSite({ seedPrompt: e.target.value })}
            placeholder="Standing brief: brand voice, audience, what every post should reinforce…"
          />
        </div>
        <PipelinePreview config={siteConfig} onConfigure={goAgents} />
        <div className={`${raisedCard} space-y-1`}>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--cw-ink-faint)]">Tips</p>
          <p className="text-xs text-[var(--cw-ink-muted)]">
            Leave the topic blank to let the Strategist pick from your hooks. The image is required —
            a run without a successful feed creative fails rather than shipping a caption on its own.
          </p>
        </div>
      </div>
    );
  } else if (isInternal && siteConfig && bottomTab === "excel") {
    sheetContent = (
      <ExcelQueuePanel
        siteLink={selectedSite}
        siteConfig={siteConfig}
        onPatchSite={patchSite}
        onMessage={setSaveMessage}
        onToggleAuto={toggleAuto}
      />
    );
  } else if (isInternal && siteConfig && bottomTab === "library") {
    sheetContent = (
      <div data-guide="studio-library">
        <RunLibrary
          runs={runs}
          selectedRunId={selectedRunId}
          selectedRun={selectedRun}
          detailLoading={runDetailLoading}
          detailError={runDetailError}
          liveRunId={liveRunId}
          refreshing={refreshingRuns}
          cancelling={cancelling}
          onSelect={selectRun}
          onClose={closeRun}
          onRefresh={refreshRuns}
          onRetryDetail={() => setRunDetailNonce((n) => n + 1)}
          onCancel={cancelRun}
          onGoCompose={() => openBottomTab(null)}
        />
      </div>
    );
  } else if (isInternal && siteConfig && bottomTab === "setup") {
    sheetContent = (
    <div className="space-y-4">
              <TabRail size="sm" tabs={SETUP_TABS} value={setupTab} onChange={setSetupTab} ariaLabel="Studio setup" />

              <div className={surfaceCard}>
                {setupTab === "voice" && (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <p className={`md:col-span-2 ${helpText}`}>
                      Every filled field is injected into the Strategist and Copywriter for{" "}
                      <strong className="text-[var(--cw-ink)]">manual Generate</strong> and{" "}
                      <strong className="text-[var(--cw-ink)]">auto</strong> runs. Excel rows add a topic brief
                      on top — they never wipe these standing seeds.
                    </p>
                    <div className="md:col-span-2">
                      <label className={labelClass}>General auto prompt</label>
                      <textarea
                        className={`${inputClass} mt-1 min-h-[100px]`}
                        value={siteConfig.seedPrompt || ""}
                        onChange={(e) => patchSite({ seedPrompt: e.target.value })}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className={labelClass}>Hooks / angles / keywords</label>
                      <textarea
                        className={`${inputClass} mt-1 min-h-[80px]`}
                        value={siteConfig.hooksOrKeywords || ""}
                        onChange={(e) => patchSite({ hooksOrKeywords: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Tone</label>
                      <input
                        className={`${inputClass} mt-1`}
                        value={siteConfig.tone || ""}
                        onChange={(e) => patchSite({ tone: e.target.value })}
                        placeholder="Expert, warm, punchy…"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Default platform</label>
                      <select
                        className={`${inputClass} mt-1`}
                        value={siteConfig.defaultPlatform || "both"}
                        onChange={(e) => patchSite({ defaultPlatform: e.target.value })}
                      >
                        {PLATFORM_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className={labelClass}>Hashtag policy</label>
                      <textarea
                        className={`${inputClass} mt-1 min-h-[80px]`}
                        value={siteConfig.hashtagPolicy || ""}
                        onChange={(e) => patchSite({ hashtagPolicy: e.target.value })}
                        placeholder="e.g. 3–8 relevant hashtags; mix brand + niche; no spammy tags"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>CTA text</label>
                      <input
                        className={`${inputClass} mt-1`}
                        value={siteConfig.ctaText || ""}
                        onChange={(e) => patchSite({ ctaText: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>CTA URL</label>
                      <input
                        className={`${inputClass} mt-1`}
                        value={siteConfig.ctaUrl || ""}
                        onChange={(e) => patchSite({ ctaUrl: e.target.value })}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className={labelClass}>Brand notes</label>
                      <textarea
                        className={`${inputClass} mt-1 min-h-[80px]`}
                        value={siteConfig.brandNotes || ""}
                        onChange={(e) => patchSite({ brandNotes: e.target.value })}
                      />
                    </div>
                  </div>
                )}

                {setupTab === "brand" && (
                  <StudioBrandKit
                    brandKit={siteConfig.brandKitJson}
                    apiUrl={`/api/admin/post-automation/site/brand-kit${siteQ}`}
                    onConfig={setSiteConfig}
                    onMessage={(msg) =>
                      setSaveMessage(
                        typeof msg === "string" ? { ok: !/fail|error|missing/i.test(msg), text: msg } : msg
                      )
                    }
                    onPatchLocal={(brandKitJson) => patchSite({ brandKitJson })}
                  />
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
                      tab. Image is required — runs fail without a successful feed creative.
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
                          Adds alternate creatives you can switch to on SMM Post Approvals before approving.
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
                    </div>
                    <StudioReferenceImages
                      paths={siteConfig.referenceImagePaths || (siteConfig.referenceImagePath ? [siteConfig.referenceImagePath] : [])}
                      uploadUrl={selectedSite ? `/api/admin/post-automation/site/asset${siteQ}` : ""}
                      onConfig={setSiteConfig}
                      onMessage={setSaveMessage}
                    />
                  </div>
                )}

                {setupTab === "schedule" && (
                  <div className="max-w-xl space-y-5">
                    <p className={helpText}>
                      Default cadence is every 12 hours. Pause anytime for a one-off manual topic without
                      advancing the Excel queue.
                    </p>
                    <div>
                      <label className={labelClass}>General prompt for auto</label>
                      <textarea
                        className={`${inputClass} mt-1 min-h-[120px]`}
                        value={siteConfig.seedPrompt || ""}
                        onChange={(e) => patchSite({ seedPrompt: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>How often</label>
                      <select
                        className={`${inputClass} mt-1`}
                        value={siteConfig.autoIntervalMinutes || 720}
                        onChange={(e) => patchSite({ autoIntervalMinutes: Number(e.target.value) })}
                      >
                        {INTERVAL_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1.5 text-xs text-[var(--cw-ink-faint)]">
                        Excel mode processes one row per tick. Seed mode generates from your hooks each tick.
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
                      Advanced. Strategist → Copywriter → required Image. Image provider: OpenAI,
                      Anthropic (Claude illustration, rasterized), or OpenRouter (Flux, Gemini Image,
                      GPT Image). Anthropic uses the Anthropic API key on this tab.
                    </p>
                    {[
                      ["agent1", "Strategist (Agent 1)", "agent1Provider", "agent1Model", "agent1Prompt", "chat"],
                      ["agent2", "Copywriter (Agent 2)", "agent2Provider", "agent2Model", "agent2Prompt", "chat"],
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
                            {POST_STUDIO_DEFAULT_PROMPTS[promptKey] ? (
                              <Btn
                                variant="ghost"
                                size="xs"
                                icon={FiRotateCcw}
                                onClick={() => patchSite({ [promptKey]: POST_STUDIO_DEFAULT_PROMPTS[promptKey] })}
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
                                id={`post-agents-tab-${id}`}
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
                          {kind === "image" && providerValue === "anthropic" ? (
                            <p className="mb-3 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-2 text-[12px] leading-relaxed text-[var(--cw-ink-muted)]">
                              {IMAGE_ANTHROPIC_HINT}
                            </p>
                          ) : null}
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
                  <div className="max-w-2xl space-y-3">
                    <div className="flex items-center gap-2 text-[var(--cw-neon)]">
                      <FiInfo />
                      <h3 className="text-sm font-bold uppercase tracking-wide">External ingest path</h3>
                    </div>
                    <p className={helpText}>
                      With Engine set to <strong className="text-[var(--cw-ink)]">External</strong>, Post Studio
                      auto generation is disabled. Posts still arrive through the existing paths:
                    </p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--cw-ink-muted)]">
                      <li>
                        Inbound API —{" "}
                        <code className="rounded border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-1 text-xs">
                          POST /api/posts/inbound
                        </code>
                      </li>
                      <li>Meta / page pull and email ingest (unchanged)</li>
                      <li>Manual Create Post and Post Board</li>
                    </ul>
                    <p className={helpText}>
                      Switch to Internal Studio when you want scheduled Strategist → Copywriter → Image runs to
                      create pending Approvals for this account. Notes:{" "}
                      {globalConfig.notes || "(none saved)"}
                    </p>
                  </div>
                )}
              </div>
            </div>
    );
  }

  const bottomTabs = BOTTOM_DOCK.map((t) =>
    t.id === "library"
      ? { ...t, live: hasLiveAutomation, badge: runs.length || undefined }
      : t
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      {!isInternal ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-heading text-lg font-semibold text-[var(--cw-ink)]">Post Studio</h1>
            {engineSwitch}
          </div>
          {banners}
          {externalModeUi}
        </div>
      ) : null}

      {isInternal && siteConfig ? (
        <StudioComposerShell
          kind="post"
          projectName={selectedSite}
          projectLabel={projectLabel}
          topic={topic}
          onTopicChange={setTopic}
          operatorImageFile={operatorImageFile}
          onOperatorImageChange={setOperatorImageFile}
          onSubmit={startRun}
          submitting={running}
          submitDisabled={!selectedSite}
          liveRun={dockedRun}
          liveLabel="Post"
          livePanel={<RunConsole run={liveRun} onCancel={() => cancelRun(liveRun?.id)} cancelling={cancelling} />}
          onCancelLive={() => cancelRun(liveRun?.id)}
          onOpenLive={liveRun?.id ? () => selectRun(liveRun.id) : undefined}
          cancelling={cancelling}
          bottomTabs={bottomTabs}
          activeBottomTab={bottomTab}
          onBottomTabChange={openBottomTab}
          sheetContent={sheetContent}
          engineSwitch={engineSwitch}
          autoEnabled={Boolean(siteConfig.autoEnabled)}
          onToggleAuto={toggleAuto}
          onSave={saveSiteConfig}
          saving={saving}
          onCancelAllLive={cancelAllLive}
          hasLiveAutomation={hasLiveAutomation}
          banners={banners}
        />
      ) : null}

      {isInternal && !selectedSite && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-5 text-sm text-amber-200">
          Select a project in the sidebar to configure Internal Studio for that account.
        </div>
      )}
    </div>
  );
}
