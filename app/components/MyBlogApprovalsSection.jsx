import BlogApprovalsPanel from "./BlogApprovalsPanel";

export default function MyBlogApprovalsSection({ selectedSite = "" }) {
  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Blog Approvals</h1>
        <p className="mt-1 text-sm text-gray-500">
          Review blog posts before they are published to your website.
        </p>
      </div>
      <BlogApprovalsPanel selectedSite={selectedSite} />
    </div>
  );
}
