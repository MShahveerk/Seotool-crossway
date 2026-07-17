"use client";

import { useCallback, useEffect, useState } from "react";
import { FiDownload, FiX } from "react-icons/fi";
import { formatYearMonth, getCalendarMonthYmdBounds, humanMonthYear } from "../../lib/smmReportMonthRange";
import { buildStandardFollowerRows, buildUnifiedMarketingReportPdfBytes } from "../../lib/unifiedMarketingReportPdf";

function siteFileSlug(url) {
  try {
    return new URL(url).hostname.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 48) || "site";
  } catch {
    return "site";
  }
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Math.round(Number(value || 0)));
}

export default function SmmDownloadReportModal({
  open = false,
  onClose,
  activeSite = "",
  isSuperAdmin = false,
  platform = "all",
  initialMonth = "",
}) {
  const maxMonth = formatYearMonth(new Date());
  const [reportMonth, setReportMonth] = useState(() => initialMonth || maxMonth);
  const [includeWebsite, setIncludeWebsite] = useState(true);
  const [websiteReportsAvailable, setWebsiteReportsAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [smmPayload, setSmmPayload] = useState(null);
  const [gscPayload, setGscPayload] = useState(null);
  const [gscError, setGscError] = useState("");
  const [baselineRows, setBaselineRows] = useState([]);
  const [pdfWorking, setPdfWorking] = useState(false);

  useEffect(() => {
    if (open) {
      const m = initialMonth && initialMonth <= maxMonth ? initialMonth : maxMonth;
      setReportMonth(m);
      setError("");
      setGscError("");
    }
  }, [open, initialMonth, maxMonth]);

  useEffect(() => {
    if (!open || !activeSite) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const q = new URLSearchParams();
        if (isSuperAdmin) q.set("url", activeSite);
        const res = await fetch(`/api/reports/context?${q.toString()}`);
        const data = await res.json();
        if (!cancelled && res.ok) {
          const canInclude = data.includeWebsiteReports === true;
          setWebsiteReportsAvailable(canInclude);
          setIncludeWebsite(canInclude);
        }
      } catch {
        /* keep default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, activeSite, isSuperAdmin]);

  const loadPreview = useCallback(async () => {
    if (!activeSite) {
      setError("No site is selected.");
      setSmmPayload(null);
      setGscPayload(null);
      setBaselineRows([]);
      return;
    }
    setLoading(true);
    setError("");
    setGscError("");
    setBaselineRows([]);
    try {
      const smmQ = new URLSearchParams({
        endMonth: reportMonth,
        monthSpan: "1",
        platform: "all",
        range: "28d",
        ...(isSuperAdmin ? { url: activeSite } : {}),
      });
      const smmRes = await fetch(`/api/smm/stats?${smmQ.toString()}`);
      const smmData = await smmRes.json();
      if (!smmRes.ok) throw new Error(smmData.error || "Could not load social metrics.");
      setSmmPayload(smmData);

      const baseParams = new URLSearchParams();
      if (isSuperAdmin) baseParams.set("url", activeSite);
      const bRes = await fetch(`/api/smm/baseline?${baseParams.toString()}`);
      const bData = await bRes.json();
      if (bRes.ok) setBaselineRows(Array.isArray(bData.baselines) ? bData.baselines : []);
      else setBaselineRows([]);

      if (includeWebsite) {
        const bounds = getCalendarMonthYmdBounds(reportMonth);
        if (!bounds) {
          setGscPayload(null);
          setGscError("Invalid month.");
        } else {
          const gq = new URLSearchParams({
            range: "custom",
            startDate: bounds.startDate,
            endDate: bounds.endDate,
            pageSize: "50",
            page: "1",
            ...(isSuperAdmin ? { url: activeSite } : {}),
          });
          const gscRes = await fetch(`/api/searchconsole/performance?${gq.toString()}`);
          const gscData = await gscRes.json();
          if (!gscRes.ok) {
            setGscPayload(null);
            setGscError(
              gscData.userMessage ||
                gscData.error ||
                "Search performance could not be loaded (property may be unverified or API unavailable)."
            );
          } else {
            setGscPayload(gscData);
            setGscError("");
          }
        }
      } else {
        setGscPayload(null);
        setGscError("");
      }
    } catch (e) {
      setSmmPayload(null);
      setGscPayload(null);
      setBaselineRows([]);
      setError(e.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [activeSite, includeWebsite, isSuperAdmin, reportMonth]);

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => {
      loadPreview();
    }, 280);
    return () => clearTimeout(t);
  }, [open, loadPreview]);

  const downloadPdf = async () => {
    if (!smmPayload?.siteUrl) return;
    setPdfWorking(true);
    setError("");
    try {
      const boundsPdf = getCalendarMonthYmdBounds(reportMonth);
      const websiteStats = includeWebsite
        ? {
            periodLabel: gscPayload?.dateRange
              ? `${gscPayload.dateRange.startDate} → ${gscPayload.dateRange.endDate}`
              : boundsPdf
                ? `${boundsPdf.startDate} → ${boundsPdf.endDate}`
                : reportMonth,
            totals: gscPayload?.totals ?? null,
            topQueries: gscPayload?.topQueries?.queries ?? [],
            topPages: gscPayload?.topPages?.pages ?? [],
            errorNote: gscError || undefined,
          }
        : null;

      const bytes = await buildUnifiedMarketingReportPdfBytes({
        siteUrl: smmPayload.siteUrl,
        reportTitle: "SMM & website statistics report",
        smmPeriodLabel: smmPayload.reportMeta?.periodLabel || humanMonthYear(reportMonth),
        smmPlatformCards: baselineRows,
        platformFilter: platform,
        websiteStats,
        seoOpportunities: null,
        includeSeo: false,
        internal: false,
      });
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `site-report-${siteFileSlug(smmPayload.siteUrl)}-${reportMonth}.pdf`;
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="smm-report-modal-title">
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
              Choose a month. Follower accounts and counts come from <strong>SMM baseline</strong> data for the
              selected site (same source as User Management → SMM baseline). Optional <strong>Search</strong> section
              adds clicks, impressions, and top queries/pages.
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
            <label htmlFor="report-month-input" className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
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
            <p className="text-xs text-gray-500 mt-1.5">{humanMonthYear(reportMonth)}</p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-gray-300"
              checked={includeWebsite}
              onChange={(e) => setIncludeWebsite(e.target.checked)}
              disabled={!websiteReportsAvailable}
            />
            <span>
              <span className="block text-sm font-semibold text-gray-900">Include website statistics</span>
              <span className="block text-xs text-gray-600 mt-0.5">
                Adds Google Search totals, top queries, and landing page URLs for the same calendar month (when data is
                available). Disabled for Meta-only accounts without a linked website and GTM container.
              </span>
            </span>
          </label>

          {error ? <p className="text-sm text-red-700 rounded-lg bg-red-50 border border-red-100 px-3 py-2">{error}</p> : null}

          {loading ? (
            <p className="text-sm text-gray-500 py-4 text-center">Loading preview…</p>
          ) : smmPayload ? (
            <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 text-sm space-y-2">
              <p className="font-semibold text-gray-900">Preview</p>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Followers (SMM baseline)</p>
              <ul className="text-gray-800 space-y-1">
                {buildStandardFollowerRows(baselineRows).map((c) => (
                  <li key={c.platform} className="flex justify-between gap-2">
                    <span className="truncate">
                      {c.platform}
                      {c.accountName && c.accountName !== "—" ? (
                        <span className="text-gray-500"> · {String(c.accountName).slice(0, 28)}</span>
                      ) : null}
                    </span>
                    <span className="tabular-nums shrink-0">{formatNumber(c.followers)}</span>
                  </li>
                ))}
              </ul>
              {includeWebsite ? (
                gscError ? (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
                    Search data: {gscError}
                  </p>
                ) : gscPayload?.totals ? (
                  <p className="text-gray-700">
                    <span className="text-gray-500">Search clicks:</span> {formatNumber(gscPayload.totals.clicks)}
                    &nbsp;|&nbsp;
                    <span className="text-gray-500">Impressions:</span>{" "}
                    {formatNumber(gscPayload.totals.impressions)}
                  </p>
                ) : (
                  <p className="text-xs text-gray-500">Search data: nothing returned for this range.</p>
                )
              ) : null}
            </div>
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
            disabled={pdfWorking || !smmPayload || loading}
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
