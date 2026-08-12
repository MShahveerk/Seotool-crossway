"use client";

import { useEffect, useMemo, useState } from "react";
import { FiCopy, FiExternalLink, FiRefreshCw } from "react-icons/fi";
import { Feather, PenLine, Sparkles } from "lucide-react";
import {
  formatBatchLabel,
  groupByTimestampBatch,
  statusTone,
} from "@/lib/seoAutopilot/batchGroups";

function splitLines(value) {
  return String(value || "")
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function Field({ label, children, wide }) {
  if (!children) return null;
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <div className="mt-1 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{children}</div>
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

/**
 * Autopilot view: browse Writer → Blog Studio seed payloads by run timestamp.
 * mode="studio" adds Run / Mark completed actions (Blog Automation Studio).
 */
export default function BlogSeedsPanel({
  siteLink,
  mode = "autopilot",
  label,
  blurb,
  sends: controlledSends,
  onReload,
  onRun,
  onMarkCompleted,
  busyId = "",
  loading = false,
  error = "",
}) {
  const [localSends, setLocalSends] = useState([]);
  const [localLoading, setLocalLoading] = useState(mode === "autopilot");
  const [localError, setLocalError] = useState("");
  const [notice, setNotice] = useState("");
  const [batchKey, setBatchKey] = useState("");
  const [seedId, setSeedId] = useState("");

  const isControlled = Array.isArray(controlledSends);

  const load = async () => {
    if (!siteLink || isControlled) return;
    setLocalLoading(true);
    setLocalError("");
    try {
      const res = await fetch(
        `/api/admin/seo-autopilot/writer-sends?siteLink=${encodeURIComponent(siteLink)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load blog seeds");
      setLocalSends(data.sends || []);
    } catch (err) {
      setLocalError(err.message || "Failed to load blog seeds");
    } finally {
      setLocalLoading(false);
    }
  };

  useEffect(() => {
    if (!isControlled) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteLink, isControlled]);

  const sends = isControlled ? controlledSends : localSends;
  const isLoading = isControlled ? loading : localLoading;
  const err = error || localError;

  const batches = useMemo(() => groupByTimestampBatch(sends), [sends]);

  useEffect(() => {
    if (!batches.length) {
      setBatchKey("");
      setSeedId("");
      return;
    }
    if (!batches.some((b) => b.key === batchKey)) {
      setBatchKey(batches[0].key);
      setSeedId(batches[0].items[0]?.id || "");
    }
  }, [batches, batchKey]);

  const activeBatch = batches.find((b) => b.key === batchKey) || batches[0] || null;
  const activeSeeds = activeBatch?.items || [];

  useEffect(() => {
    if (!activeSeeds.length) {
      setSeedId("");
      return;
    }
    if (!activeSeeds.some((s) => s.id === seedId)) {
      setSeedId(activeSeeds[0].id);
    }
  }, [activeSeeds, seedId]);

  const active = activeSeeds.find((s) => s.id === seedId) || activeSeeds[0] || null;
  const payload = active?.payloadJson && typeof active.payloadJson === "object" ? active.payloadJson : {};
  const keywords = splitLines(payload.mustFollowKeywords);
  const secondary = splitLines(payload.secondaryKeywords);

  if (!siteLink) {
    return <p className="text-sm text-gray-500">Select a site to view blog seeds.</p>;
  }

  if (isLoading && !sends.length) {
    return <p className="text-sm text-gray-500">Loading blog seeds…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-gradient-to-r from-white to-emerald-50/40 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex gap-3 min-w-0">
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-2.5 shrink-0">
              <PenLine className="w-4 h-4 text-emerald-700" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">
                {label || (mode === "studio" ? "Autopilot seeds" : "Blog seeds")}
              </h3>
              <p className="mt-1 text-sm text-gray-600 max-w-2xl leading-relaxed">
                {blurb ? (
                  blurb
                ) : mode === "studio" ? (
                  <>
                    Incoming Blog Studio run payloads from SEO Autopilot’s Writer agent. Pick a
                    timestamped batch, review the seed, then run it through Studio agents 1–3.
                  </>
                ) : (
                  <>
                    Writer turns Diagnoser gaps into full Blog Studio seeds (brief, keywords, CTA,
                    image ask). Batches are grouped by Autopilot run time — open one to inspect
                    everything that will be seeded. Run them from{" "}
                    <span className="font-semibold">Blog Automation Studio → Autopilot seeds</span>.
                  </>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => (onReload ? onReload() : load())}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700"
          >
            <FiRefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {err && String(err).trim() ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {String(err).trim()}
        </div>
      ) : null}
      {notice && String(notice).trim() ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {String(notice).trim()}
        </div>
      ) : null}

      {!sends.length ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
          <Feather className="mx-auto h-8 w-8 text-emerald-700/70" />
          <p className="mt-3 text-sm font-semibold text-gray-900">No blog seeds yet</p>
          <p className="mt-1 text-sm text-gray-500 max-w-md mx-auto">
            In SEO Autopilot, run <span className="font-semibold">Diagnoser</span> then{" "}
            <span className="font-semibold">Writer</span> (or a full Autopilot run). Seeds will land
            here in timestamped batches.
          </p>
        </div>
      ) : (
        <>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
              Batches by time
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {batches.map((b) => {
                const selected = b.key === (activeBatch?.key || batchKey);
                return (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => {
                      setBatchKey(b.key);
                      setSeedId(b.items[0]?.id || "");
                    }}
                    className={`shrink-0 rounded-xl border px-3.5 py-2.5 text-left transition ${
                      selected
                        ? "border-emerald-600 bg-emerald-50 shadow-sm"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <p
                      className={`text-xs font-bold ${selected ? "text-emerald-900" : "text-gray-900"}`}
                    >
                      {formatBatchLabel(b.latestAt, b.items.length, "seed")}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {b.runId ? `Run ${b.runId.slice(0, 8)}…` : "Ungrouped hour"}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-3">
            <div className="rounded-2xl border border-gray-100 bg-white p-2 space-y-1 max-h-[28rem] overflow-y-auto">
              <p className="px-2 pt-1 pb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Seeds in batch
              </p>
              {activeSeeds.map((s) => {
                const selected = s.id === (active?.id || seedId);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSeedId(s.id)}
                    className={`w-full rounded-xl px-3 py-2.5 text-left border transition ${
                      selected
                        ? "border-emerald-200 bg-emerald-50/80"
                        : "border-transparent hover:bg-gray-50"
                    }`}
                  >
                    <p className="text-sm font-semibold text-gray-900 line-clamp-2">
                      {s.title || s.topic || "Untitled seed"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wide rounded-full border px-1.5 py-0.5 ${statusTone(s.status)}`}
                      >
                        {s.status}
                      </span>
                      <span className="text-[10px] text-gray-500">
                        {new Date(s.createdAt).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {active ? (
              <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-base font-bold text-gray-900">
                        {active.title || active.topic}
                      </h4>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wide rounded-full border px-2 py-0.5 ${statusTone(active.status)}`}
                      >
                        {active.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Seeded {new Date(active.createdAt).toLocaleString()}
                      {active.lastRunAt
                        ? ` · last Studio run ${new Date(active.lastRunAt).toLocaleString()}`
                        : ""}
                      {active.blogRunId ? ` · run ${active.blogRunId.slice(0, 8)}…` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700"
                      onClick={async () => {
                        const ok = await copyText(JSON.stringify(payload, null, 2));
                        setNotice(ok ? "Seed payload copied." : "Could not copy.");
                      }}
                    >
                      <FiCopy className="w-3.5 h-3.5" /> Copy JSON
                    </button>
                    {mode === "studio" ? (
                      <>
                        <button
                          type="button"
                          disabled={busyId === active.id}
                          onClick={() => onRun?.(active.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 text-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                        >
                          {active.blogRunId ? "Re-run in Studio" : "Run in Studio"}
                        </button>
                        {active.status !== "completed" ? (
                          <button
                            type="button"
                            disabled={busyId === active.id}
                            onClick={() => onMarkCompleted?.(active.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-50"
                          >
                            Mark completed
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800">
                        <Sparkles className="w-3.5 h-3.5" />
                        Run from Blog Studio
                      </span>
                    )}
                  </div>
                </div>

                {(payload.why || active.topic) && (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                      Why this seed
                    </p>
                    <p className="mt-1 text-sm text-gray-800 leading-relaxed">
                      {payload.why ||
                        `Topic “${active.topic}” was prioritized from Autopilot Diagnoser gaps for Blog Studio.`}
                    </p>
                  </div>
                )}

                {keywords.length || secondary.length ? (
                  <div className="space-y-2">
                    {keywords.length ? (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                          Must-follow keywords
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {keywords.map((k) => (
                            <span
                              key={k}
                              className="rounded-md bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-900"
                            >
                              {k}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {secondary.length ? (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                          Secondary keywords
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {secondary.map((k) => (
                            <span
                              key={k}
                              className="rounded-md bg-gray-50 border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-700"
                            >
                              {k}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Topic">{active.topic || payload.topic}</Field>
                  <Field label="Content type">{payload.contentType}</Field>
                  <Field label="Word count">{payload.wordCountRange}</Field>
                  <Field label="Audience">{payload.targetAudience}</Field>
                  <Field label="Location">{payload.location}</Field>
                  <Field label="CTA">
                    {payload.ctaText || payload.ctaUrl ? (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {payload.ctaText || "—"}
                        {payload.ctaUrl ? (
                          <a
                            href={payload.ctaUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-emerald-800 font-semibold hover:underline"
                          >
                            Link <FiExternalLink className="w-3 h-3" />
                          </a>
                        ) : null}
                      </span>
                    ) : null}
                  </Field>
                  <Field label="Seed prompt (Blog Studio brief)" wide>
                    {payload.seedPrompt ? (
                      <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 max-h-56 overflow-auto">
                        {payload.seedPrompt}
                      </div>
                    ) : null}
                  </Field>
                  <Field label="Brand notes" wide>
                    {payload.brandNotes}
                  </Field>
                  <Field label="SERP / competitor notes" wide>
                    {payload.serpNotes}
                  </Field>
                  <Field label="Image prompt" wide>
                    {payload.imagePrompt}
                  </Field>
                </div>

                {active.errorMessage ? (
                  <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    {active.errorMessage}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
