"use client";

import { useSerankingStatus } from "../seranking/SerankingShell";
import SerankingExplorerSection from "../seranking/SerankingExplorerSection";
import SiteExplorerSection from "./SiteExplorerSection";
import { LoadingSpinner } from "../ui-shared/LoadingBlock";

export default function UnifiedSiteExplorerSection({ selectedSite = "" }) {
  const { status, loading } = useSerankingStatus(selectedSite, { siteOptional: true });
  const seConfigured = status?.configured !== false;

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-2rem)] items-center justify-center rounded-xl border border-gray-200 bg-white">
        <LoadingSpinner label="Loading site explorer" />
      </div>
    );
  }

  if (seConfigured) {
    return <SerankingExplorerSection selectedSite={selectedSite} />;
  }

  return <SiteExplorerSection selectedSite={selectedSite} />;
}
