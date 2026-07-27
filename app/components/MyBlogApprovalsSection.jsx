import BlogApprovalsPanel from "./BlogApprovalsPanel";
import { Card, CardContent } from "@/components/ui/card";
import PageHeader from "./ui-shared/PageHeader";

export default function MyBlogApprovalsSection({ selectedSite = "" }) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardContent className="space-y-6 p-5 sm:p-6">
        <PageHeader
          eyebrow="Workflow"
          title="Blog Approvals"
          description="Review blog posts before they are published to your website."
        />
        <BlogApprovalsPanel selectedSite={selectedSite} />
      </CardContent>
    </Card>
  );
}
