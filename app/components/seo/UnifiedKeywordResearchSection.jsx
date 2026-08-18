"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { useSerankingStatus } from "../seranking/SerankingShell";
import SerankingKeywordsSection from "../seranking/SerankingKeywordsSection";
import KeywordResearchHubSection from "./KeywordResearchHubSection";

export default function UnifiedKeywordResearchSection({ selectedSite = "" }) {
  /* Keyword research is project-optional, so the status probe asks globally
     when nothing is selected rather than reporting "not configured". */
  const { status } = useSerankingStatus(selectedSite, { siteOptional: true });
  const seConfigured = status?.configured !== false;
  const [fallbackOpen, setFallbackOpen] = useState(false);

  if (!seConfigured) {
    return <KeywordResearchHubSection selectedSite={selectedSite} />;
  }

  return (
    <div className="space-y-6">
      <SerankingKeywordsSection selectedSite={selectedSite} />

      <div className="rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] shadow-sm">
        <button
          type="button"
          onClick={() => setFallbackOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-smooth hover:bg-[var(--cw-raised)]"
        >
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 size-5 shrink-0 text-[var(--cw-neon)]" aria-hidden />
            <div>
              <p className="font-semibold text-[var(--cw-ink)]">AI &amp; GSC keyword tools</p>
              <p className="mt-0.5 text-sm text-[var(--cw-ink-muted)]">
                Fallback when you need Search Console rankings, AI topic analysis, or autocomplete
                discovery without using API credits. Search Console rankings need a project selected.
              </p>
            </div>
          </div>
          {fallbackOpen ? (
            <ChevronUp className="size-5 shrink-0 text-[var(--cw-ink-faint)]" />
          ) : (
            <ChevronDown className="size-5 shrink-0 text-[var(--cw-ink-faint)]" />
          )}
        </button>
        {fallbackOpen ? (
          <div className="border-t border-[var(--cw-hairline)] px-2 pb-4 pt-2">
            <KeywordResearchHubSection selectedSite={selectedSite} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
