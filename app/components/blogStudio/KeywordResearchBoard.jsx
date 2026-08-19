"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  Gauge,
  Hash,
  Layers,
  MousePointerClick,
  Search,
  Shield,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const POSTURE = {
  defend: { label: "Defend", className: "text-[var(--cw-neon)] border-[color-mix(in_srgb,var(--cw-neon)_40%,var(--cw-hairline))]" },
  strike: { label: "Strike", className: "text-[var(--cw-caution)] border-[color-mix(in_srgb,var(--cw-caution)_40%,var(--cw-hairline))]" },
  gap: { label: "Gap", className: "text-[var(--cw-info)] border-[color-mix(in_srgb,var(--cw-info)_40%,var(--cw-hairline))]" },
  ask: { label: "Ask", className: "text-[var(--cw-ink-muted)] border-[var(--cw-hairline)]" },
};

const TYPE_LABEL = {
  service: "Service",
  local: "Local",
  informational: "Informational",
  comparison: "Comparison",
  branded: "Branded",
};

function compactNum(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    Number(n)
  );
}

function PostureBadge({ value }) {
  const p = POSTURE[value] || POSTURE.gap;
  return (
    <span className={cn("inline-flex rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide", p.className)}>
      {p.label}
    </span>
  );
}

export default function KeywordResearchBoard({ result, onUseTopic }) {
  const topics = Array.isArray(result?.topics) ? result.topics : [];
  const [activeId, setActiveId] = useState(topics[0]?.id || "");
  const [showAll, setShowAll] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);

  const active = useMemo(
    () => topics.find((t) => t.id === activeId) || topics[0] || null,
    [topics, activeId]
  );

  const keywords = active?.keywords || [];
  const featuredSet = new Set((active?.featured || []).map((k) => String(k).toLowerCase()));
  const visible = showAll
    ? keywords
    : keywords.filter(
        (k) =>
          featuredSet.has(String(k.keyword).toLowerCase()) ||
          String(k.keyword).toLowerCase() === String(active?.primary || "").toLowerCase()
      );
  const shown = visible.length ? visible : keywords.slice(0, 10);

  if (!topics.length) {
    return (
      <div className="rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] px-5 py-10 text-center text-sm text-[var(--cw-ink-muted)]">
        No topics in this research run.
      </div>
    );
  }

  const brief = result.brief || {};

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryChip icon={Hash} label="Keywords" value={compactNum(result.unique ?? result.universe?.length)} />
        <SummaryChip icon={Layers} label="Topics" value={String(topics.length)} />
        <SummaryChip icon={Sparkles} label="SE Ranking credits" value={compactNum(result.creditsSpent)} />
        <SummaryChip
          icon={Gauge}
          label="Cache hits"
          value={`${result.cacheHits || 0} / ${(result.cacheHits || 0) + (result.liveCalls || 0)}`}
        />
      </div>

      {brief.brandName || brief.category || brief.services?.length ? (
        <div className="rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)]">
          <button
            type="button"
            onClick={() => setBriefOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
          >
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--cw-ink-faint)]">
              Site brief · {brief.brandName || brief.category || "Researcher"}
            </span>
            <ChevronDown className={cn("size-4 text-[var(--cw-ink-faint)] transition-transform", briefOpen && "rotate-180")} />
          </button>
          {briefOpen ? (
            <div className="space-y-2 border-t border-[var(--cw-hairline)] px-4 py-3 text-sm text-[var(--cw-ink-dim)]">
              {brief.category ? <p><span className="text-[var(--cw-ink-faint)]">Category · </span>{brief.category}</p> : null}
              {brief.geo ? <p><span className="text-[var(--cw-ink-faint)]">Geo · </span>{brief.geo}</p> : null}
              {brief.audience ? <p><span className="text-[var(--cw-ink-faint)]">Audience · </span>{brief.audience}</p> : null}
              {brief.services?.length ? (
                <p>
                  <span className="text-[var(--cw-ink-faint)]">Services · </span>
                  {brief.services.map((s) => s.name || s).join(", ")}
                </p>
              ) : null}
              {brief.seeds?.length ? (
                <p className="font-mono text-xs text-[var(--cw-ink-muted)]">
                  Seeds: {brief.seeds.map((s) => s.phrase || s).join(" · ")}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <ul className="space-y-1.5 lg:max-h-[32rem] lg:overflow-y-auto lg:pr-1">
          {topics.map((t) => {
            const selected = t.id === (active?.id || "");
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveId(t.id);
                    setShowAll(false);
                  }}
                  className={cn(
                    "w-full rounded-xl border px-3 py-2.5 text-left transition-smooth",
                    selected
                      ? "border-[color-mix(in_srgb,var(--cw-neon)_50%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-neon)_10%,transparent)]"
                      : "border-[var(--cw-hairline)] bg-[var(--cw-raised)] hover:border-[var(--cw-hairline-strong)]"
                  )}
                >
                  <p className="truncate text-[13px] font-semibold text-[var(--cw-ink)]">{t.name}</p>
                  <p className="mt-0.5 flex items-center gap-2 text-[10px] text-[var(--cw-ink-faint)]">
                    <span>{TYPE_LABEL[t.type] || t.type}</span>
                    <span className="tabular-nums">{t.keywordCount || t.keywords?.length || 0} kws</span>
                    {t.easiestKd != null ? <span>KD {Math.round(t.easiestKd)}+</span> : null}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="min-w-0 rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-4">
          {active ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--cw-ink-faint)]">
                    {TYPE_LABEL[active.type] || active.type}
                    {active.contentType ? ` · ${active.contentType}` : ""}
                  </p>
                  <h3 className="mt-0.5 text-lg font-bold text-[var(--cw-ink)]">{active.name}</h3>
                  {active.why ? <p className="mt-1 text-sm text-[var(--cw-ink-muted)]">{active.why}</p> : null}
                  <p className="mt-2 text-sm text-[var(--cw-ink-dim)]">
                    Primary · <span className="font-semibold text-[var(--cw-ink)]">{active.primary}</span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {typeof onUseTopic === "function" ? (
                    <button
                      type="button"
                      onClick={() => onUseTopic(active.primary || active.name)}
                      className="rounded-lg bg-[var(--cw-neon)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--cw-neon-ink)]"
                    >
                      Use as draft topic
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setShowAll((v) => !v)}
                    className="rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--cw-neon)]"
                  >
                    {showAll ? "Show featured" : `Show all ${active.keywordCount || keywords.length}`}
                  </button>
                </div>
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[32rem] text-left text-[12px]">
                  <thead className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--cw-ink-faint)]">
                    <tr>
                      <th className="pb-2 pr-3 font-bold">Keyword</th>
                      <th className="pb-2 pr-3 font-bold">Vol</th>
                      <th className="pb-2 pr-3 font-bold">KD</th>
                      <th className="pb-2 pr-3 font-bold">Pos</th>
                      <th className="pb-2 font-bold">Posture</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((row) => {
                      const isPrimary =
                        String(row.keyword).toLowerCase() === String(active.primary || "").toLowerCase();
                      return (
                        <tr key={row.key || row.keyword} className="border-t border-[var(--cw-hairline)]">
                          <td className="py-2 pr-3">
                            <span className={cn("text-[var(--cw-ink)]", isPrimary && "font-bold")}>
                              {row.keyword}
                            </span>
                          </td>
                          <td className="py-2 pr-3 tabular-nums text-[var(--cw-ink-dim)]">
                            {compactNum(row.volume)}
                          </td>
                          <td className="py-2 pr-3 tabular-nums text-[var(--cw-ink-dim)]">
                            {row.difficulty == null ? "—" : Math.round(row.difficulty)}
                          </td>
                          <td className="py-2 pr-3 tabular-nums text-[var(--cw-ink-dim)]">
                            {row.position == null ? "—" : Math.round(row.position)}
                          </td>
                          <td className="py-2">
                            <PostureBadge value={row.posture} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!showAll && keywords.length > shown.length ? (
                <p className="mt-2 text-[11px] text-[var(--cw-ink-faint)]">
                  Showing {shown.length} of {keywords.length}. Open all for the full associated bag — that
                  list is what a later topic selector will read.
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SummaryChip({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-2">
      <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--cw-ink-faint)]">
        <Icon className="size-3" /> {label}
      </p>
      <p className="mt-0.5 text-[15px] font-bold tabular-nums text-[var(--cw-ink)]">{value}</p>
    </div>
  );
}

export function ResearchEmptyProject() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] px-6 py-16 text-center">
      <Search className="size-8 text-[var(--cw-ink-faint)]" />
      <p className="mt-3 text-sm font-semibold text-[var(--cw-ink)]">Select a website project</p>
      <p className="mt-1 max-w-sm text-xs text-[var(--cw-ink-muted)]">
        Keyword research reads the live site and SE Ranking. Meta-only projects have no domain to
        harvest.
      </p>
    </div>
  );
}

export function ResearchLiveHint() {
  return (
    <p className="flex items-center gap-1.5 text-xs text-[var(--cw-ink-muted)]">
      <MousePointerClick className="size-3.5" />
      Follow the run in the dock. The topic board appears here when the Scout finishes.
    </p>
  );
}

export function ResearchShield() {
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-[var(--cw-ink-faint)]">
      <Shield className="size-3.5" />
      Manual only. Does not write a draft and does not run on a schedule.
    </p>
  );
}
