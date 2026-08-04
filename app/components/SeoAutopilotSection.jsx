"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiCpu,
  FiCopy,
  FiMail,
  FiPlay,
  FiRefreshCw,
  FiCheck,
  FiRotateCcw,
  FiSave,
} from "react-icons/fi";
import { Bot, Radar, Sparkles } from "lucide-react";
import ModelCombobox from "./studioShared/ModelCombobox";
import {
  INTERVAL_OPTIONS,
  PROVIDERS,
  defaultModelForProvider,
  modelsForProvider,
} from "./blogStudio/studioConstants";

const TABS = [
  { id: "overview", label: "Scorecard" },
  { id: "fixes", label: "Fixes" },
  { id: "gaps", label: "Gaps" },
  { id: "pitches", label: "Pitches" },
  { id: "agents", label: "Agents" },
  { id: "smtp", label: "SMTP" },
  { id: "schedule", label: "Schedule" },
  { id: "runs", label: "Runs" },
];

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500";
const labelClass = "block text-[11px] font-semibold uppercase tracking-wide text-gray-500";

function ScoreRing({ label, value, tone = "emerald" }) {
  const n = Number(value);
  const show = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
  const color =
    tone === "sky"
      ? "from-sky-500 to-cyan-400"
      : "from-emerald-600 to-lime-400";
  return (
    <div className="rounded-2xl border border-gray-100 bg-gradient-to-br from-white to-gray-50 p-5 shadow-[0_2px_16px_rgba(0,0,0,0.04)]">
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <p
        className={`mt-3 text-5xl font-semibold tracking-tight bg-gradient-to-br ${color} bg-clip-text text-transparent`}
      >
        {show != null ? show : "—"}
      </p>
      <p className="mt-1 text-xs text-gray-500">/ 100</p>
    </div>
  );
}

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeRunId, setActiveRunId] = useState(null);

  const agents = config?.agents || [];
  const defaultPrompts = config?.defaultPrompts || {};

  const patchConfig = useCallback((patch) => {
    setConfig((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

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
      const [cRes, rRes, aRes, pRes] = await Promise.all([
        fetch(`/api/admin/seo-autopilot/site?siteLink=${q}`),
        fetch(`/api/admin/seo-autopilot/runs?siteLink=${q}`),
        fetch(`/api/admin/seo-autopilot/artifacts?siteLink=${q}`),
        fetch(`/api/admin/seo-autopilot/pitches?siteLink=${q}`),
      ]);
      const cData = await cRes.json();
      const rData = await rRes.json();
      const aData = await aRes.json();
      const pData = await pRes.json();
      if (!cRes.ok) throw new Error(cData.error || "Failed to load config");
      setConfig(cData.config);
      setRuns(rData.runs || []);
      setArtifacts(aData.artifacts || []);
      setPitches(pData.pitches || []);
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
    if (!activeRunId) return undefined;
    const t = setInterval(async () => {
      const res = await fetch(`/api/admin/seo-autopilot/runs/${activeRunId}`);
      const data = await res.json();
      if (!res.ok) return;
      if (["completed", "failed", "cancelled"].includes(data.run?.status)) {
        setActiveRunId(null);
        setRunning(false);
        loadAll();
      }
    }, 2500);
    return () => clearInterval(t);
  }, [activeRunId, loadAll]);

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
      setActiveRunId(data.run?.id || null);
      setNotice("Autopilot run started.");
      setTab("runs");
    } catch (err) {
      setRunning(false);
      setError(err.message || "Run failed");
    }
  };

  const scorecard = config?.latestScorecardJson || runs[0]?.scorecardJson || null;

  const fixArtifacts = useMemo(
    () =>
      artifacts.filter((a) =>
        ["robots_txt", "llms_txt", "faq_schema", "answer_block"].includes(a.kind)
      ),
    [artifacts]
  );
  const gapArtifacts = useMemo(
    () => artifacts.filter((a) => ["diagnoser", "geo_spy", "tracker", "foundation_list"].includes(a.kind)),
    [artifacts]
  );

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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <ScoreRing label="Google health" value={scorecard?.googleHealthScore} />
              <ScoreRing
                label="GEO readiness"
                value={scorecard?.geoReadinessScore ?? scorecard?.geo?.overallVisibilityScore}
                tone="sky"
              />
              <div className="rounded-2xl border border-gray-100 bg-white p-5 sm:col-span-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Latest summary
                </p>
                <p className="mt-2 text-sm text-gray-800 leading-relaxed">
                  {scorecard?.summary ||
                    "No scorecard yet. Add API keys on Agents, save brand details, then Run Autopilot."}
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-5">
              <div className="flex items-center gap-2 mb-3">
                <Radar className="w-4 h-4 text-emerald-700" />
                <h3 className="text-sm font-bold text-gray-900">Top problems</h3>
              </div>
              <div className="space-y-2">
                {(scorecard?.topProblems || []).length ? (
                  scorecard.topProblems.map((p, i) => (
                    <div
                      key={`${p.title}-${i}`}
                      className="rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{p.title}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wide rounded-full bg-white border border-gray-200 px-2 py-0.5 text-gray-600">
                          {p.impact || "—"} impact
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-600">{p.fix}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500">Problems will appear after the Auditor runs.</p>
                )}
              </div>
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
        )}

        {tab === "fixes" && (
          <div className="space-y-3">
            {!fixArtifacts.length ? (
              <p className="text-sm text-gray-500">
                No fixes yet. Run the Fixer agent to generate robots.txt, llms.txt, schema, and answer
                blocks.
              </p>
            ) : (
              fixArtifacts.map((a) => (
                <div key={a.id} className="rounded-2xl border border-gray-100 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">{a.title || a.kind}</h3>
                      {a.pageUrl ? (
                        <p className="text-xs text-gray-500 mt-0.5">{a.pageUrl}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700"
                      onClick={async () => {
                        const ok = await copyText(a.contentText || JSON.stringify(a.contentJson, null, 2));
                        setNotice(ok ? "Copied." : "Could not copy.");
                      }}
                    >
                      <FiCopy className="w-3.5 h-3.5" /> Copy
                    </button>
                  </div>
                  <pre className="mt-3 max-h-64 overflow-auto rounded-xl bg-gray-50 border border-gray-100 p-3 text-xs text-gray-800 whitespace-pre-wrap">
                    {a.contentText || JSON.stringify(a.contentJson, null, 2)}
                  </pre>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "gaps" && (
          <div className="space-y-3">
            {!gapArtifacts.length ? (
              <p className="text-sm text-gray-500">
                Diagnoser / GEO Spy / Tracker / Foundation outputs will land here.
              </p>
            ) : (
              gapArtifacts.map((a) => (
                <div key={a.id} className="rounded-2xl border border-gray-100 bg-white p-4">
                  <h3 className="text-sm font-bold text-gray-900">{a.title || a.kind}</h3>
                  <pre className="mt-3 max-h-72 overflow-auto rounded-xl bg-gray-50 border border-gray-100 p-3 text-xs text-gray-800 whitespace-pre-wrap">
                    {a.contentText || JSON.stringify(a.contentJson, null, 2)}
                  </pre>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "pitches" && (
          <div className="space-y-3">
            {!pitches.length ? (
              <p className="text-sm text-gray-500">
                No pitches yet. Run Foundation + Pitch agents, configure SMTP, then send.
              </p>
            ) : (
              pitches.map((p) => (
                <div key={p.id} className="rounded-2xl border border-gray-100 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">{p.title}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {p.targetName || "—"} · {p.targetEmail || "no email"} ·{" "}
                        <span className="uppercase font-semibold">{p.status}</span>
                        {p.domainAuthority != null ? ` · DA ${p.domainAuthority}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold"
                        onClick={async () => {
                          const res = await fetch(`/api/admin/seo-autopilot/pitches/${p.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ status: "completed" }),
                          });
                          const data = await res.json();
                          if (!res.ok) setError(data.error || "Update failed");
                          else loadAll();
                        }}
                      >
                        <FiCheck className="w-3.5 h-3.5" /> Mark completed
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg bg-gray-900 text-white px-2.5 py-1.5 text-xs font-semibold"
                        onClick={async () => {
                          const res = await fetch(
                            `/api/admin/seo-autopilot/pitches/${p.id}/send?siteLink=${encodeURIComponent(siteLink)}`,
                            { method: "POST" }
                          );
                          const data = await res.json();
                          if (!res.ok) setError(data.error || "Send failed");
                          else {
                            setNotice(`Sent to ${data.pitch?.targetEmail}`);
                            loadAll();
                          }
                        }}
                      >
                        <FiMail className="w-3.5 h-3.5" /> Send email
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 text-xs font-semibold text-gray-700">{p.subject}</p>
                  <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-gray-50 border border-gray-100 p-3 text-xs text-gray-800 whitespace-pre-wrap">
                    {p.bodyText}
                  </pre>
                </div>
              ))
            )}
          </div>
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
                placeholder="auditor,geoSpy,diagnoser,fixer,foundation,pitcher,tracker"
              />
            </div>
            <p className="text-xs text-gray-500">
              Last auto:{" "}
              {config?.lastAutoAt ? new Date(config.lastAutoAt).toLocaleString() : "never"}
            </p>
          </div>
        )}

        {tab === "runs" && (
          <div className="space-y-2">
            {!runs.length ? (
              <p className="text-sm text-gray-500">No runs yet.</p>
            ) : (
              runs.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-gray-100 bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {r.status} · {r.trigger}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(r.createdAt).toLocaleString()}
                      {r.totalCostUsd != null ? ` · ~$${Number(r.totalCostUsd).toFixed(4)}` : ""}
                      {r.errorMessage ? ` · ${r.errorMessage}` : ""}
                    </p>
                  </div>
                  {["queued", "running"].includes(r.status) ? (
                    <button
                      type="button"
                      className="text-xs font-semibold text-red-700"
                      onClick={() =>
                        fetch(`/api/admin/seo-autopilot/runs/${r.id}/cancel`, { method: "POST" })
                      }
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
