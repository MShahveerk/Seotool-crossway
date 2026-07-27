import ApprovalsUserPanel from "./ApprovalsUserPanel";
import { Card, CardContent } from "@/components/ui/card";
import PageHeader from "./ui-shared/PageHeader";
import { HoverLift } from "./ui-shared/Motion";

export default function MyApprovalsSection({ selectedSite = "" }) {
  return (
    <HoverLift as={Card} className="border-border/80 shadow-sm">
      <CardContent className="space-y-6 p-5 sm:p-6">
        <PageHeader
          eyebrow="Workflow"
          title="My Approvals"
          description="Review, edit, and approve content assigned to you by administrators."
        />
        <ApprovalsUserPanel selectedSite={selectedSite} />
      </CardContent>
    </HoverLift>
  );
}
