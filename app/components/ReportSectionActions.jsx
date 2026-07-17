"use client";

import { useSession } from "next-auth/react";
import { FiRefreshCw } from "react-icons/fi";
import ExportReportButton from "./ExportReportButton";
import SendReportsButton from "./SendReportsButton";

/**
 * Export + optional superadmin send + refresh controls for report sections.
 */
export default function ReportSectionActions({
  section,
  activeSite = "",
  onRefresh,
  loading = false,
  refreshLabel = "Refresh",
  showSend = true,
  month = "",
}) {
  const { data: session } = useSession();
  const isSuperAdmin = session?.user?.role === "super_admin";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <ExportReportButton
        section={section}
        activeSite={activeSite}
        isSuperAdmin={isSuperAdmin}
        label="Export report"
        month={month}
      />
      {isSuperAdmin && showSend ? <SendReportsButton activeSite={activeSite} /> : null}
      {onRefresh ? (
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          <FiRefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          {refreshLabel}
        </button>
      ) : null}
    </div>
  );
}
