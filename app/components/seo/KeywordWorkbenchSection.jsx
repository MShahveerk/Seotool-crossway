"use client";

/**
 * KeywordWorkbenchSection — merges "Keywords" (research) and "Keyword Ideas"
 * (opportunities) into one workspace tab. Research is the primary surface for
 * volumes/difficulty/AI tooling; Ideas surfaces gap opportunities. One flat
 * shell + one sub-tab rail so the SEO workspace stays coherent.
 */

import { useState } from "react";
import TabRail from "../ui-shared/TabRail";
import UnifiedKeywordResearchSection from "./UnifiedKeywordResearchSection";
import KeywordOpportunitiesSection from "./KeywordOpportunitiesSection";
import { useGuidePrepare } from "@/lib/guideNav";

const TABS = [
  { id: "research", label: "Research" },
  { id: "ideas", label: "Keyword Ideas" },
];

export default function KeywordWorkbenchSection({ selectedSite = "", initialTab = "research" }) {
  const [tab, setTab] = useState(TABS.some((t) => t.id === initialTab) ? initialTab : "research");
  useGuidePrepare((nav) => {
    if (nav.kwTab) setTab(nav.kwTab);
  });

  return (
    <div className="min-h-[calc(100vh-3.5rem)] space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <TabRail
          tabs={TABS}
          value={tab}
          onChange={setTab}
          ariaLabel="Keyword tools"
          className="min-w-0"
        />
        <span className="hidden text-[10px] font-bold tracking-[0.16em] text-[var(--cw-ink-faint)] uppercase lg:inline">
          Keywords
        </span>
      </div>

      {tab === "research" ? <UnifiedKeywordResearchSection selectedSite={selectedSite} /> : null}
      {tab === "ideas" ? <KeywordOpportunitiesSection selectedSite={selectedSite} /> : null}
    </div>
  );
}
