"use client";

import { useSession } from "next-auth/react";
import { FiRefreshCw } from "react-icons/fi";
import ExportReportButton from "./ExportReportButton";
import SendReportsButton from "./SendReportsButton";
import { sessionHasGlobalSiteAccess } from "@/lib/clientPermissions";

/**
 * Export + optional superadmin send + refresh controls for report sections.
 * Tool-specific section IDs map to the website slide deck on the server.
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
  const canPassUrl = sessionHasGlobalSiteAccess(session);

  const exportSection =
    section === "smm" ? "smm" : section === "combined" || section === "full" ? "combined" : "website";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <ExportReportButton
        section={exportSection}
        activeSite={activeSite}
        canPassUrl={canPassUrl}
        label={
          exportSection === "smm"
            ? "Export SMM deck"
            : exportSection === "combined"
              ? "Export combined deck"
              : "Export website deck"
        }
        month={month}
      />
      {exportSection === "website" ? (
        <ExportReportButton
          section="combined"
          activeSite={activeSite}
          canPassUrl={canPassUrl}
          label="Export combined"
          month={month}
        />
      ) : null}
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
