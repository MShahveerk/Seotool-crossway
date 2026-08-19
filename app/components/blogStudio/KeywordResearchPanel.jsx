"use client";

import PipelinePreview from "../studioShared/PipelinePreview";
import Btn from "../ui-shared/Btn";
import KeywordResearchBoard, {
  ResearchEmptyProject,
  ResearchLiveHint,
  ResearchShield,
} from "./KeywordResearchBoard";
import { estimateResearchCredits, RESEARCH_MARKETS } from "../../../lib/blogStudio/researchDefaults";
import { labelClass, inputClass } from "./studioConstants";
import { FiRefreshCw, FiSearch } from "react-icons/fi";

const RESEARCH_STEPS = [
  { id: "researcher", title: "Researcher", subtitle: "Read the project", readyKey: "researcher", modelKey: "researcherModel" },
  { id: "scout", title: "Scout", subtitle: "Harvest keywords", readyKey: "scout", modelKey: "scoutModel" },
];

export default function KeywordResearchPanel({
  selectedSite,
  isWebsite,
  siteConfig,
  depth,
  market,
  onDepth,
  onMarket,
  onStart,
  onConfigure,
  starting,
  running,
  result,
}) {
  if (!selectedSite || !isWebsite) return <ResearchEmptyProject />;

  const estimate = estimateResearchCredits(depth);
  const estimateLabel =
    depth === "standard"
      ? `~${estimate.toLocaleString()} credits cold (peek)`
      : `~${estimate.toLocaleString()} credits cold (cached hits are free)`;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-4 rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--cw-ink-faint)]">
            Project keyword library
          </p>
          <h2 className="mt-1 text-lg font-bold text-[var(--cw-ink)]">Research this project</h2>
          <p className="mt-1.5 text-sm text-[var(--cw-ink-muted)]">
            The Site Researcher reads the live site and Crossway SEO data. The Keyword Scout then
            pulls SE Ranking — similar, related, questions, long-tail, plus rival lists — and indexes
            every term under a topic. Manual only.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Depth</label>
            <select
              className={`${inputClass} mt-1`}
              value={depth}
              onChange={(e) => onDepth(e.target.value)}
              disabled={running || starting}
            >
              <option value="deep">Deep — full library (recommended)</option>
              <option value="standard">Standard — cheaper peek</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Market</label>
            <select
              className={`${inputClass} mt-1`}
              value={market}
              onChange={(e) => onMarket(e.target.value)}
              disabled={running || starting}
            >
              {RESEARCH_MARKETS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="text-xs text-[var(--cw-ink-faint)]">{estimateLabel}</p>
        <ResearchShield />

        <Btn
          variant="primary"
          size="lg"
          icon={starting || running ? FiRefreshCw : FiSearch}
          onClick={onStart}
          disabled={starting || running}
        >
          {starting || running ? "Researching…" : "Research this project"}
        </Btn>
        {running ? <ResearchLiveHint /> : null}
      </div>

      <div className="space-y-4">
        <PipelinePreview
          steps={RESEARCH_STEPS}
          config={siteConfig}
          estimate={depth === "deep" ? "~3–8 min" : "~1–2 min"}
          eyebrow="Pipeline · what runs on Research"
          onConfigure={onConfigure}
        />
      </div>

      {result ? (
        <div className="lg:col-span-2">
          <KeywordResearchBoard result={result} />
        </div>
      ) : null}
    </div>
  );
}
