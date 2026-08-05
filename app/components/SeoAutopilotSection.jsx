"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiCpu,
  FiPlay,
  FiRefreshCw,
  FiRotateCcw,
  FiSave,
  FiXCircle,
} from "react-icons/fi";
import { Bot } from "lucide-react";
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
import SeoAutopilotMark from "./seoAutopilot/SeoAutopilotMark";

const TABS = [
  { id: "overview", label: "Scorecard" },
  { id: "fixes", label: "Fixes" },
  { id: "gaps", label: "Gaps" },
  { id: "writer", label: "Blog seeds" },
  { id: "pitches", label: "Pitches" },
  { id: "agents", label: "Agents" },
  { id: "smtp", label: "SMTP" },
  { id: "schedule", label: "Schedule" },
  { id: "runs", label: "Run console" },
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
  const [loadingRunDetail, setLoadingRunDetail] = useState(false);
  const [cancellingRun, setCancellingRun] = useState(false);
  const [researching, setResearching] = useState(false);
  const [pitchBusyId, setPitchBusyId] = useState("");
  const [hideLivePin, setHideLivePin] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("seoAutopilot.hideLivePin") === "1";
    } catch {
      return false;
    }
  });
  const selectedRunIdRef = useRef(null);

  const setLivePinHidden = (hidden) => {
    setHideLivePin(hidden);
    try {
      window.localStorage.setItem("seoAutopilot.hideLivePin", hidden ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const fetchRunDetail = useCallback(async (runId) => {
    const id = String(runId || "").trim();
    if (!id) return null;
    selectedRunIdRef.current = id;
    setLoadingRunDetail(true);
    try {
      const res = await fetch(`/api/admin/seo-autopilot/runs/${id}`);
      const data = await res.json();
      if (!res.ok || !data.run) throw new Error(data.error || "Failed to load run");
      setActiveRun(data.run);
      return data.run;
    } catch {
      return null;
    } finally {
      setLoadingRunDetail(false);
    }
  }, []);

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

      const live = nextRuns.find((r) => ["queued", "running"].includes(r.status));
      const preferredId = live?.id || selectedRunIdRef.current || nextRuns[0]?.id || null;
      if (preferredId) {
        selectedRunIdRef.current = preferredId;
        // List is summarized — load full stage JSON for the selected / past run.
        const detailRes = await fetch(`/api/admin/seo-autopilot/runs/${preferredId}`);
        const detailData = await detailRes.json();
        if (detailRes.ok && detailData.run) {
          setActiveRun(detailData.run);
        } else {
          setActiveRun(live || nextRuns.find((r) => r.id === preferredId) || nextRuns[0] || null);
        }
      } else {
        selectedRunIdRef.current = null;
        setActiveRun(null);
      }
    } catch (err) {
      setError(err.message || "Failed to load Autopilot");
    } finally {
      setLoading(false);
    }
  }, [siteLink]);

  useEffect(() => {
    selectedRunIdRef.current = null;
    setActiveRun(null);
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
      setNotice("Autopilot run started — watch stages in the Run console.");
      setTab("runs");
      if (data.run?.id) {
        await fetchRunDetail(data.run.id);
      } else {
        setActiveRun(data.run || null);
      }
    } catch (err) {
      setRunning(false);
      setError(err.message || "Run failed");
    }
  };

  const cancelRunById = async (runId) => {
    const id = String(runId || "").trim();
    if (!id) return null;
    setCancellingRun(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/seo-autopilot/runs/${id}/cancel`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Cancel failed");
      const cancelled = data.run || null;
      if (cancelled) {
        setActiveRun(cancelled);
        setRuns((prev) => prev.map((r) => (r.id === cancelled.id ? { ...r, ...cancelled } : r)));
      }
      setRunning(false);
      setNotice("Autopilot run cancelled.");
      await loadAll();
      return cancelled;
    } catch (err) {
      setError(err.message || "Cancel failed");
      return null;
    } finally {
      setCancellingRun(false);
    }
  };

  const cancelActiveRun = async () => {
    if (!activeRun?.id) return;
    await cancelRunById(activeRun.id);
  };

  const cancelAllLiveRuns = async () => {
    if (!siteLink) return;
    setCancellingRun(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/seo-autopilot/site/cancel?siteLink=${encodeURIComponent(siteLink)}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Cancel failed");
      const count = Number(data.count || 0);
      setRunning(false);
      setNotice(
        count > 0
          ? `Cancelled ${count} Autopilot run${count === 1 ? "" : "s"}.`
          : "No live Autopilot runs to cancel."
      );
      if (data.runs?.[0]) setActiveRun(data.runs[0]);
      await loadAll();
    } catch (err) {
      setError(err.message || "Cancel failed");
    } finally {
      setCancellingRun(false);
    }
  };

  const liveRuns = runs.filter((r) => ["queued", "running"].includes(String(r.status || "")));
  const hasLiveAutopilot =
    liveRuns.length > 0 ||
    ["queued", "running"].includes(String(activeRun?.status || ""));

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
              <SeoAutopilotMark className="w-3.5 h-3.5 text-lime-300" />
              SEO Autopilot Studio
            </div>
            <div className="mt-3 flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-[#0EFF2A]">
                <SeoAutopilotMark className="h-6 w-6" strokeWidth={1.75} />
              </span>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                Audit → Diagnose → Fix → Pitch → Track
              </h2>
            </div>
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
            {hasLiveAutopilot ? (
              <button
                type="button"
                onClick={cancelAllLiveRuns}
                disabled={cancellingRun}
                className="inline-flex items-center gap-2 rounded-xl bg-red-500/90 border border-red-300/40 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-60"
              >
                {cancellingRun ? (
                  <FiRefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <FiXCircle className="w-4 h-4" />
                )}
                Cancel run{liveRuns.length > 1 ? "s" : ""}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => runNow()}
              disabled={running || hasLiveAutopilot}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0EFF2A] text-gray-900 px-4 py-2.5 text-sm font-bold hover:brightness-105 disabled:opacity-60"
            >
              {running || hasLiveAutopilot ? (
                <FiRefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <FiPlay className="w-4 h-4" />
              )}
              {running || hasLiveAutopilot ? "Running…" : "Run Autopilot"}
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
            {t.id === "runs" &&
            activeRun &&
            ["queued", "running"].includes(String(activeRun.status || "")) ? (
              <span className="ml-1.5 inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            ) : null}
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

        {/* Optional live pin on other tabs — can be hidden; preference is remembered */}
        {tab !== "runs" &&
        activeRun &&
        ["queued", "running"].includes(String(activeRun.status || "")) ? (
          hideLivePin ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2">
              <p className="text-xs font-semibold text-emerald-900">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse mr-1.5 align-middle" />
                Autopilot running in background
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="text-xs font-semibold text-emerald-900 hover:underline"
                  onClick={() => setLivePinHidden(false)}
                >
                  Show live panel
                </button>
                <button
                  type="button"
                  className="text-xs font-semibold text-emerald-900 hover:underline"
                  onClick={() => setTab("runs")}
                >
                  Open Run console →
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                  Live Autopilot run
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline disabled:opacity-50"
                    onClick={cancelActiveRun}
                    disabled={cancellingRun}
                  >
                    <FiXCircle className="h-3.5 w-3.5" />
                    {cancellingRun ? "Cancelling…" : "Cancel"}
                  </button>
                  <button
                    type="button"
                    className="text-xs font-semibold text-gray-600 hover:underline"
                    onClick={() => setLivePinHidden(true)}
                  >
                    Hide on other tabs
                  </button>
                  <button
                    type="button"
                    className="text-xs font-semibold text-emerald-800 hover:underline"
                    onClick={() => setTab("runs")}
                  >
                    Expand Run console →
                  </button>
                </div>
              </div>
              <AutopilotRunConsole
                run={activeRun}
                onCancel={cancelActiveRun}
                cancelling={cancellingRun}
              />
            </div>
          )
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
                    <SeoAutopilotMark className="w-3.5 h-3.5" />
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
              loadingDetail={loadingRunDetail}
              runArtifacts={
                activeRun?.id
                  ? artifacts.filter((a) => a.runId === activeRun.id)
                  : []
              }
            />

            <div>
              <div className="flex flex-wrap items-end justify-between gap-2 mb-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    Run history
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Open any past run to see full agent JSON, scorecard, and artifacts for that run.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {hasLiveAutopilot ? (
                    <button
                      type="button"
                      onClick={cancelAllLiveRuns}
                      disabled={cancellingRun}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline disabled:opacity-50"
                    >
                      <FiXCircle className="h-3.5 w-3.5" />
                      Cancel all live
                    </button>
                  ) : null}
                  <p className="text-[11px] font-semibold text-gray-500">
                    {runs.length} run{runs.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              {!runs.length ? (
                <p className="text-sm text-gray-500">No runs yet. Click Run Autopilot to start.</p>
              ) : (
                <div className="space-y-2 max-h-[28rem] overflow-auto pr-1">
                  {runs.map((r) => {
                    const selected = activeRun?.id === r.id;
                    const liveRow = ["queued", "running"].includes(String(r.status || ""));
                    const stageCount = Array.isArray(r.stagesJson) ? r.stagesJson.length : 0;
                    const doneCount = Array.isArray(r.stagesJson)
                      ? r.stagesJson.filter((s) =>
                          ["succeeded", "completed", "failed", "cancelled"].includes(
                            String(s.status || "")
                          )
                        ).length
                      : 0;
                    return (
                      <div
                        key={r.id}
                        className={`w-full rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-left transition ${
                          selected
                            ? "border-emerald-500 bg-emerald-50/50"
                            : "border-gray-100 bg-white hover:border-gray-200"
                        }`}
                      >
                        <button
                          type="button"
                          disabled={loadingRunDetail && selected}
                          onClick={() => fetchRunDetail(r.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="text-sm font-semibold text-gray-900">
                            <span className="capitalize">{r.status}</span>
                            {" · "}
                            {r.trigger || "manual"}
                            {liveRow ? " · live" : ""}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {new Date(r.createdAt).toLocaleString()}
                            {r.finishedAt
                              ? ` → ${new Date(r.finishedAt).toLocaleString()}`
                              : ""}
                            {r.totalCostUsd != null
                              ? ` · ~$${Number(r.totalCostUsd).toFixed(4)}`
                              : ""}
                            {stageCount ? ` · ${doneCount}/${stageCount} stages` : ""}
                          </p>
                          {r.errorMessage ? (
                            <p className="text-xs text-red-700 mt-1 line-clamp-2">{r.errorMessage}</p>
                          ) : null}
                        </button>
                        <div className="flex items-center gap-2 shrink-0">
                          {liveRow ? (
                            <button
                              type="button"
                              disabled={cancellingRun}
                              onClick={() => cancelRunById(r.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                            >
                              <FiXCircle className="h-3.5 w-3.5" />
                              Cancel
                            </button>
                          ) : null}
                          <span className="text-[11px] font-semibold text-emerald-800">
                            {selected
                              ? loadingRunDetail
                                ? "Loading…"
                                : "Viewing full run"
                              : "View full run"}
                          </span>
                        </div>
                      </div>
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
