"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiAlertTriangle,
  FiTarget,
  FiTrendingDown,
  FiLayers,
  FiChevronDown,
} from "react-icons/fi";
import SeoPanelShell, { formatNum, formatPct, formatPos } from "./SeoPanelShell";
import ReportSectionActions from "../ReportSectionActions";
import {
  buildGuidedSeoTasks,
  guideForStrikingQuery,
  guideForCannibalization,
  guideForDecayingQuery,
  guideForDecayingPage,
} from "../../../lib/seoOpportunityGuides";

function SeverityBadge({ severity }) {
  const s = severity || "medium";
  const cls =
    s === "high"
      ? "bg-red-50 text-red-700 border-red-200"
      : s === "low"
        ? "bg-gray-50 text-gray-600 border-gray-200"
        : "bg-amber-50 text-amber-800 border-amber-200";
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${cls}`}>
      {s}
    </span>
  );
}

function StepsDropdown({ summary, steps = [], defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1d9c35] hover:underline"
      >
        <FiChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        {open ? "Hide" : "Show"} step-by-step guide ({steps.length} steps)
      </button>
      {open ? (
        <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
          {summary ? <p className="text-sm text-gray-700 mb-3 leading-relaxed">{summary}</p> : null}
          <ol className="space-y-3">
            {steps.map((s, i) => (
              <li key={`${s.title}-${i}`} className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
                <p className="text-sm font-semibold text-gray-900">
                  <span className="text-[#1d9c35] mr-1.5">{i + 1}.</span>
                  {s.title}
                </p>
                <p className="mt-1.5 text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{s.detail}</p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

function GuidedTaskRow({ task }) {
  const [open, setOpen] = useState(false);
  const steps = task.steps || [];
  return (
    <li className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-3 py-3 flex items-start gap-3 hover:bg-gray-50/80"
        aria-expanded={open}
      >
        <FiChevronDown
          className={`w-4 h-4 mt-0.5 shrink-0 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
        <SeverityBadge severity={task.severity} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{task.group}</p>
          <p className="text-sm text-gray-900 mt-0.5 font-medium">{task.label}</p>
          {!open ? (
            <p className="text-xs text-gray-400 mt-1">Expand for complete start-to-finish guidance ({steps.length} steps)</p>
          ) : null}
        </div>
      </button>
      {open ? (
        <div className="border-t border-gray-100 px-4 py-4 bg-gray-50/40">
          {task.summary ? (
            <p className="text-sm text-gray-700 mb-4 leading-relaxed">{task.summary}</p>
          ) : null}
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
            Complete guide — start to finish
          </p>
          <ol className="space-y-3">
            {steps.map((s, i) => (
              <li key={`${task.id}-${i}`} className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-sm font-semibold text-gray-900">
                  <span className="text-[#1d9c35] mr-2">{i + 1}.</span>
                  {s.title}
                </p>
                <p className="mt-1.5 text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{s.detail}</p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </li>
  );
}

function TaskCard({ icon: Icon, title, count, children }) {
  return (
    <section className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 text-[#1d9c35] shrink-0" />
          <h2 className="text-sm font-bold text-gray-900 truncate">{title}</h2>
        </div>
        <span className="text-xs font-semibold tabular-nums text-gray-500">{formatNum(count)}</span>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function ExpandableItem({ title, subtitle, guide }) {
  return (
    <div className="border-b border-gray-50 pb-3 last:border-0 last:pb-0">
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      {subtitle ? <p className="text-xs text-gray-500 mt-1">{subtitle}</p> : null}
      <StepsDropdown summary={guide.summary} steps={guide.steps} />
    </div>
  );
}

export default function SeoOpportunitiesSection({ selectedSite = "" }) {
  const [range, setRange] = useState("28d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pack, setPack] = useState(null);

  const load = useCallback(async () => {
    if (!selectedSite) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ url: selectedSite, range });
      const res = await fetch(`/api/searchconsole/opportunities?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load opportunities");
      setPack(data);
    } catch (e) {
      setError(e.message || "Failed to load opportunities");
      setPack(null);
    } finally {
      setLoading(false);
    }
  }, [selectedSite, range]);

  useEffect(() => {
    load();
  }, [load]);

  const weeklyTasks = useMemo(() => buildGuidedSeoTasks(pack), [pack]);

  return (
    <SeoPanelShell
      title="SEO Opportunities"
      description="Actionable queue for this week with complete step-by-step guidance: striking distance, cannibalization, traffic decay, device gaps, and sitemap health."
      selectedSite={selectedSite}
      range={range}
      onRangeChange={setRange}
      loading={loading}
      error={error}
      action={
        <ReportSectionActions
          section="seo-opportunities"
          activeSite={selectedSite}
          onRefresh={load}
          loading={loading}
        />
      }
    >
      {pack ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Tasks this week</p>
              <p className="mt-2 text-3xl font-bold text-gray-900 tabular-nums">{formatNum(weeklyTasks.length)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Striking distance</p>
              <p className="mt-2 text-3xl font-bold text-gray-900 tabular-nums">
                {formatNum((pack.strikingDistance || []).length)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Cannibalization</p>
              <p className="mt-2 text-3xl font-bold text-gray-900 tabular-nums">
                {formatNum((pack.cannibalization || []).length)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Decaying queries</p>
              <p className="mt-2 text-3xl font-bold text-gray-900 tabular-nums">
                {formatNum((pack.decayingQueries || []).length)}
              </p>
            </div>
          </div>

          <section className="rounded-xl border border-gray-200 p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <FiAlertTriangle className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">SEO tasks this week</h2>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Expand any task for a complete start-to-finish playbook tailored to this site’s data.
            </p>
            {weeklyTasks.length === 0 ? (
              <p className="text-sm text-gray-500">No urgent SEO tasks for this period — keep monitoring.</p>
            ) : (
              <ul className="space-y-2">
                {weeklyTasks.map((t) => (
                  <GuidedTaskRow key={t.id} task={t} />
                ))}
              </ul>
            )}
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <TaskCard icon={FiTarget} title="Striking distance (pos 8–20)" count={(pack.strikingDistance || []).length}>
              {(pack.strikingDistance || []).length === 0 ? (
                <p className="text-sm text-gray-500">No striking-distance queries in this range.</p>
              ) : (
                <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
                  {(pack.strikingDistance || []).slice(0, 25).map((r) => {
                    const guide = guideForStrikingQuery(r, pack.siteUrl);
                    return (
                      <ExpandableItem
                        key={r.query}
                        title={r.query}
                        subtitle={`Pos ${formatPos(r.position)} · ${formatNum(r.impressions)} impr · CTR ${formatPct(r.ctr)}`}
                        guide={guide}
                      />
                    );
                  })}
                </div>
              )}
            </TaskCard>

            <TaskCard icon={FiLayers} title="Keyword cannibalization" count={(pack.cannibalization || []).length}>
              {(pack.cannibalization || []).length === 0 ? (
                <p className="text-sm text-gray-500">No multi-URL query conflicts detected.</p>
              ) : (
                <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
                  {(pack.cannibalization || []).slice(0, 20).map((c) => {
                    const guide = guideForCannibalization(c, pack.siteUrl);
                    return (
                      <ExpandableItem
                        key={c.query}
                        title={c.query}
                        subtitle={`${c.pageCount} pages · ${formatNum(c.totalImpressions)} impr · primary: ${c.primaryPage || "—"}`}
                        guide={guide}
                      />
                    );
                  })}
                </div>
              )}
            </TaskCard>

            <TaskCard icon={FiTrendingDown} title="Decaying queries" count={(pack.decayingQueries || []).length}>
              {(pack.decayingQueries || []).length === 0 ? (
                <p className="text-sm text-gray-500">No significant query decay vs prior period.</p>
              ) : (
                <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
                  {(pack.decayingQueries || []).slice(0, 25).map((r) => {
                    const guide = guideForDecayingQuery(r, pack.siteUrl);
                    return (
                      <ExpandableItem
                        key={r.query}
                        title={r.query}
                        subtitle={`${formatNum(r.clicks)} ← ${formatNum(r.previousClicks)} clicks (${Number(r.clickChangePct || 0).toFixed(0)}%)`}
                        guide={guide}
                      />
                    );
                  })}
                </div>
              )}
            </TaskCard>

            <TaskCard icon={FiTrendingDown} title="Decaying pages" count={(pack.decayingPages || []).length}>
              {(pack.decayingPages || []).length === 0 ? (
                <p className="text-sm text-gray-500">No significant page decay vs prior period.</p>
              ) : (
                <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
                  {(pack.decayingPages || []).slice(0, 25).map((r) => {
                    const guide = guideForDecayingPage(r, pack.siteUrl);
                    return (
                      <ExpandableItem
                        key={r.page}
                        title={r.page}
                        subtitle={`${formatNum(r.clicks)} ← ${formatNum(r.previousClicks)} clicks (${Number(r.clickChangePct || 0).toFixed(0)}%)`}
                        guide={guide}
                      />
                    );
                  })}
                </div>
              )}
            </TaskCard>
          </div>
        </>
      ) : null}
    </SeoPanelShell>
  );
}
