"use client";

/**
 * SiteIntelligenceSection — one home for the three site-analysis tools that
 * used to be separate, inconsistent tabs (Authority & Performance, Site Audit,
 * Site Explorer / Backlinks). They share one flat shell and one sub-tab rail so
 * the SEO workspace reads as a single coherent surface instead of a grab-bag.
 *
 * Depth is preserved: each sub-tab mounts the existing tool. The third sub-tab
 * folds Explorer and the deep Backlink Profile together behind a small toggle.
 */

import { useState } from "react";
import TabRail from "../ui-shared/TabRail";
import SiteHealthSection from "./SiteHealthSection";
import UnifiedSiteAuditSection from "./UnifiedSiteAuditSection";
import UnifiedSiteExplorerSection from "./UnifiedSiteExplorerSection";
import SerankingBacklinksSection from "../seranking/SerankingBacklinksSection";

const TABS = [
  { id: "authority", label: "Authority & Performance" },
  { id: "audit", label: "Technical Audit" },
  { id: "backlinks", label: "Backlinks & Explorer" },
];

const BACKLINK_MODES = [
  { id: "explorer", label: "Explorer" },
  { id: "profile", label: "Backlink profile" },
];

export default function SiteIntelligenceSection({
  selectedSite = "",
  initialTab = "authority",
  initialBacklinkMode = "explorer",
  onNavigateSection,
}) {
  const [tab, setTab] = useState(TABS.some((t) => t.id === initialTab) ? initialTab : "authority");
  const [blMode, setBlMode] = useState(
    BACKLINK_MODES.some((m) => m.id === initialBacklinkMode) ? initialBacklinkMode : "explorer"
  );

  return (
    <div className="min-h-[calc(100vh-3.5rem)] space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <TabRail
          tabs={TABS}
          value={tab}
          onChange={setTab}
          ariaLabel="Site intelligence tools"
          className="min-w-0"
        />
        <span className="hidden text-[10px] font-bold tracking-[0.16em] text-[var(--cw-ink-faint)] uppercase lg:inline">
          Site Intelligence
        </span>
      </div>

      {tab === "authority" ? <SiteHealthSection selectedSite={selectedSite} /> : null}

      {tab === "audit" ? (
        <UnifiedSiteAuditSection selectedSite={selectedSite} onNavigateSection={onNavigateSection} />
      ) : null}

      {tab === "backlinks" ? (
        <div className="space-y-4">
          <div className="inline-flex rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-raised)] p-0.5">
            {BACKLINK_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setBlMode(m.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  blMode === m.id
                    ? "bg-[var(--cw-surface)] text-[var(--cw-ink)] shadow-sm"
                    : "text-[var(--cw-ink-muted)] hover:text-[var(--cw-ink)]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          {blMode === "explorer" ? (
            <UnifiedSiteExplorerSection selectedSite={selectedSite} />
          ) : (
            <SerankingBacklinksSection selectedSite={selectedSite} />
          )}
        </div>
      ) : null}
    </div>
  );
}
