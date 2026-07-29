"use client";

import ApprovalsUserPanel from "./ApprovalsUserPanel";
import { Card, CardContent } from "@/components/ui/card";
import PageHeader from "./ui-shared/PageHeader";
import { HoverLift } from "./ui-shared/Motion";

export default function MyApprovalsSection({ selectedSite = "" }) {
  return (
    <HoverLift as={Card} className="border-border/80 shadow-sm">
      <CardContent className="space-y-6 p-5 sm:p-6">
        <PageHeader
          eyebrow="Social workflow"
          title="SMM Post Approvals"
          description="Every pending, edited, and closed post for the selected site — review media (including backup creatives), edit copy, then approve or decline."
        />
        <ApprovalsUserPanel selectedSite={selectedSite} />
      </CardContent>
    </HoverLift>
  );
}
