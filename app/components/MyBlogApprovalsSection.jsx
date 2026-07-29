import BlogApprovalsPanel from "./BlogApprovalsPanel";
import { Card, CardContent } from "@/components/ui/card";
import PageHeader from "./ui-shared/PageHeader";
import { HoverLift } from "./ui-shared/Motion";

export default function MyBlogApprovalsSection({ selectedSite = "" }) {
  return (
    <HoverLift as={Card} className="border-border/80 shadow-sm">
      <CardContent className="space-y-6 p-5 sm:p-6">
        <PageHeader
          eyebrow="Workflow"
          title="Blog Approvals"
          description="Open a blog to review content, featured image, SEO, and schedule — then approve, edit, or decline."
        />
        <BlogApprovalsPanel selectedSite={selectedSite} />
      </CardContent>
    </HoverLift>
  );
}
