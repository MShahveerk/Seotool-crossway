"use client";

import { AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import EmptyState from "../ui-shared/EmptyState";
import { useSerankingStatus } from "../seranking/SerankingShell";
import SerankingAuditSection from "../seranking/SerankingAuditSection";

/**
 * SE Ranking is the only audit anyone sees.
 *
 * There used to be a toggle here between SE Ranking and our own crawler. Two
 * sources meant two different health scores for the same site depending on which
 * screen you happened to be on, and no way to tell which one a client had been
 * shown. The internal crawler still runs and still feeds Autopilot's reasoning,
 * but it no longer reaches a display.
 */
export default function UnifiedSiteAuditSection({ selectedSite = "" }) {
  const { status } = useSerankingStatus(selectedSite);

  if (status?.configured === false) {
    return (
      <Card className="border-border/80 shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <EmptyState
            icon={AlertCircle}
            title="Site audit not configured"
            description="Site audits come from SE Ranking. Ask an administrator to add SE Ranking credentials in Admin → Data sources to turn this on."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="min-h-[calc(100vh-2rem)]">
      <SerankingAuditSection
        selectedSite={selectedSite}
        title="Site Audit"
        description="Technical SEO crawl — each issue includes full details and step-by-step fix guidance."
      />
    </div>
  );
}
