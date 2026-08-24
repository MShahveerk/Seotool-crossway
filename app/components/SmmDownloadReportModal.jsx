"use client";

import { useEffect, useState } from "react";
import { FiDownload, FiX } from "react-icons/fi";
import { useSession } from "next-auth/react";
import { formatYearMonth, humanMonthYear } from "../../lib/smmReportMonthRange";
import { sessionHasGlobalSiteAccess } from "@/lib/clientPermissions";

function siteFileSlug(url) {
  try {
    return new URL(url).hostname.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 48) || "site";
  } catch {
    return String(url || "site")
      .replace(/[^a-z0-9]+/gi, "-")
      .slice(0, 48);
  }
}

/**
 * Download landscape slide decks: SMM, Website, or Combined.
 */
export default function SmmDownloadReportModal({
  open = false,
  onClose,
  activeSite = "",
  isSuperAdmin = false,
  platform = "all",
  initialMonth = "",
}) {
  const { data: session } = useSession();
  const maxMonth = formatYearMonth(new Date());
  const [reportMonth, setReportMonth] = useState(() => initialMonth || maxMonth);
  const [deckKind, setDeckKind] = useState("smm");
  const [websiteReportsAvailable, setWebsiteReportsAvailable] = useState(true);
  const [error, setError] = useState("");
  const [pdfWorking, setPdfWorking] = useState(false);

  const canPassUrl = isSuperAdmin || sessionHasGlobalSiteAccess(session);

  useEffect(() => {
    if (open) {
      const m = initialMonth && initialMonth <= maxMonth ? initialMonth : maxMonth;
      setReportMonth(m);
      setError("");
    }
  }, [open, initialMonth, maxMonth]);

  useEffect(() => {
    if (!open || !activeSite) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const q = new URLSearchParams();
        if (canPassUrl) q.set("url", activeSite);
        const res = await fetch(`/api/reports/context?${q.toString()}`);
        const data = await res.json();
        if (!cancelled && res.ok) {
          const canInclude = data.includeWebsiteReports === true;
          setWebsiteReportsAvailable(canInclude);
          if (!canInclude && deckKind !== "smm") setDeckKind("smm");
        }
      } catch {
        /* keep default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, activeSite, canPassUrl, deckKind]);

  const downloadPdf = async () => {
    if (!activeSite) return;
    setPdfWorking(true);
    setError("");
    try {
      const section = deckKind === "combined" ? "combined" : deckKind === "website" ? "website" : "smm";
      const q = new URLSearchParams({ section, month: reportMonth });
      if (canPassUrl) q.set("url", activeSite);
      const res = await fetch(`/api/reports/export?${q.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Export failed");
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const match = /filename="([^"]+)"/.exec(cd);
      const filename = match?.[1] || `crossway-${section}-${siteFileSlug(activeSite)}-${reportMonth}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message || "Could not build PDF.");
    } finally {
      setPdfWorking(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="smm-report-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 bg-gray-50/90">
          <div>
            <h2 id="smm-report-modal-title" className="text-lg font-semibold text-gray-900">
              Download report
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Landscape RoboSEO.Ai slide decks — social, website, or combined for {humanMonthYear(reportMonth)}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-200/80 hover:text-gray-900"
            aria-label="Close"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
          <div>
            <label
              htmlFor="report-month-input"
              className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5"
            >
              Report month
            </label>
            <input
              id="report-month-input"
              type="month"
              value={reportMonth}
              max={maxMonth}
              onChange={(e) => setReportMonth(e.target.value || maxMonth)}
              className="w-full max-w-xs px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 bg-white"
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Deck type</legend>
            {[
              { id: "smm", label: "Social media", hint: "Platform KPIs and content" },
              {
                id: "website",
                label: "Website performance",
                hint: "GSC, audience map, keywords, audit",
                disabled: !websiteReportsAvailable,
              },
              {
                id: "combined",
                label: "Combined",
                hint: "Website + social in one deck",
                disabled: !websiteReportsAvailable,
              },
            ].map((opt) => (
              <label
                key={opt.id}
                className={`flex items-start gap-3 cursor-pointer rounded-xl border px-4 py-3 ${
                  opt.disabled ? "opacity-50 cursor-not-allowed border-gray-100" : "border-gray-200 bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="deckKind"
                  className="mt-1 h-4 w-4 border-gray-300"
                  checked={deckKind === opt.id}
                  disabled={opt.disabled}
                  onChange={() => setDeckKind(opt.id)}
                />
                <span>
                  <span className="block text-sm font-semibold text-gray-900">{opt.label}</span>
                  <span className="block text-xs text-gray-600 mt-0.5">{opt.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {error ? (
            <p className="text-sm text-red-700 rounded-lg bg-red-50 border border-red-100 px-3 py-2">{error}</p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-5 py-4 border-t border-gray-100 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={downloadPdf}
            disabled={pdfWorking || !activeSite}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50"
          >
            <FiDownload className="w-4 h-4" />
            {pdfWorking ? "Building PDF…" : "Download PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
