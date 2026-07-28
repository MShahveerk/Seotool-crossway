"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { useSerankingStatus } from "../seranking/SerankingShell";
import SerankingKeywordsSection from "../seranking/SerankingKeywordsSection";
import KeywordResearchHubSection from "./KeywordResearchHubSection";

export default function UnifiedKeywordResearchSection({ selectedSite = "" }) {
  const { status } = useSerankingStatus(selectedSite);
  const seConfigured = status?.configured !== false;
  const [fallbackOpen, setFallbackOpen] = useState(false);

  if (!seConfigured) {
    return <KeywordResearchHubSection selectedSite={selectedSite} />;
  }

  return (
    <div className="space-y-6">
      <SerankingKeywordsSection selectedSite={selectedSite} />

      <div className="mx-5 rounded-2xl border border-gray-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setFallbackOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        >
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 size-5 shrink-0 text-indigo-600" aria-hidden />
            <div>
              <p className="font-semibold text-gray-900">AI &amp; GSC keyword tools</p>
              <p className="mt-0.5 text-sm text-gray-500">
                Fallback when you need Search Console rankings, AI topic analysis, or autocomplete discovery without using API credits.
              </p>
            </div>
          </div>
          {fallbackOpen ? <ChevronUp className="size-5 text-gray-400" /> : <ChevronDown className="size-5 text-gray-400" />}
        </button>
        {fallbackOpen ? (
          <div className="border-t border-gray-100 px-2 pb-4 pt-2">
            <KeywordResearchHubSection selectedSite={selectedSite} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
