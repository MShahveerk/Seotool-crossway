import ApprovalsUserPanel from "./ApprovalsUserPanel";

export default function MyApprovalsSection() {
  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Approvals</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Review, edit, and approve content assigned to you by administrators.
        </p>
      </div>
      <ApprovalsUserPanel />
    </div>
  );
}