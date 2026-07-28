"use client";

import { useState } from "react";
import { Shield } from "lucide-react";
import { useSerankingStatus } from "../seranking/SerankingShell";
import SerankingAuditSection from "../seranking/SerankingAuditSection";
import SiteAuditSection from "../SiteAuditSection";

export default function UnifiedSiteAuditSection({ selectedSite = "", onNavigateSection }) {
  const { status } = useSerankingStatus(selectedSite);
  const seConfigured = status?.configured !== false;
  const [mode, setMode] = useState("se");

  const showSe = seConfigured && mode !== "internal";
  const showInternal = !seConfigured || mode === "internal";

  return (
    <div className="min-h-[calc(100vh-2rem)]">
      {seConfigured ? (
        <div className="mb-4 flex flex-wrap gap-2 border-b border-gray-100 pb-3 px-1">
          <button
            type="button"
            onClick={() => setMode("se")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              showSe ? "bg-violet-100 text-violet-900" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Shield className="size-4" aria-hidden />
            SE Ranking audit
          </button>
          <button
            type="button"
            onClick={() => setMode("internal")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              showInternal && seConfigured ? "bg-emerald-100 text-emerald-900" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            Internal crawl
          </button>
          <span className="self-center text-xs text-gray-500">SE Ranking is primary when configured; internal crawl is the fallback.</span>
        </div>
      ) : null}

      {showSe ? (
        <SerankingAuditSection
          selectedSite={selectedSite}
          title="Site Audit"
          description="Technical SEO crawl via SE Ranking — each issue includes full details and step-by-step fix guidance. Switch to Internal crawl for our built-in crawler."
        />
      ) : null}
      {showInternal ? <SiteAuditSection selectedSite={selectedSite} onNavigateSection={onNavigateSection} /> : null}
    </div>
  );
}
