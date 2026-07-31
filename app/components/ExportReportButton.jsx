"use client";

import { useState } from "react";
import { FiDownload } from "react-icons/fi";
import { useSession } from "next-auth/react";
import { sessionHasGlobalSiteAccess } from "@/lib/clientPermissions";

/**
 * Download a landscape slide-deck PDF via /api/reports/export.
 * @param {string} section - website | smm | combined | legacy tool ids (mapped server-side)
 */
export default function ExportReportButton({
  section = "smm",
  activeSite = "",
  isSuperAdmin = false,
  canPassUrl,
  label = "Export report",
  className = "",
  month = "",
}) {
  const { data: session } = useSession();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const passUrl =
    typeof canPassUrl === "boolean"
      ? canPassUrl
      : isSuperAdmin || sessionHasGlobalSiteAccess(session);

  const handleExport = async () => {
    if (!activeSite) {
      setError("No site selected.");
      return;
    }
    setWorking(true);
    setError("");
    try {
      const q = new URLSearchParams({ section });
      if (passUrl) q.set("url", activeSite);
      if (month) q.set("month", month);
      const res = await fetch(`/api/reports/export?${q.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Export failed");
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const match = /filename="([^"]+)"/.exec(cd);
      const filename = match?.[1] || `${section}-report.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message || "Export failed");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleExport}
        disabled={working || !activeSite}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
        title={error || undefined}
      >
        <FiDownload className="w-4 h-4" />
        {working ? "Exporting…" : label}
      </button>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
