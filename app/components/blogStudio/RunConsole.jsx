"use client";

import { FiExternalLink, FiLoader, FiXCircle } from "react-icons/fi";
import { formatMoney, formatWhen, statusTone } from "./studioConstants";

export default function RunConsole({ run, onCancel, cancelling }) {
  if (!run) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/80 p-8 text-center text-sm text-gray-500">
        Run a draft to see live stages, cost estimates, and HTML preview here.
      </div>
    );
  }

  const stages = Array.isArray(run.stagesJson) ? run.stagesJson : [];
  const preview = run.draftPreviewJson || {};
  const live = run.status === "running" || run.status === "queued";

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-[#f4fbf4] to-white px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Run console</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5">{run.topic || "Untitled topic"}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${statusTone(run.status)}`}>
            {live && <FiLoader className="inline h-3 w-3 mr-1 animate-spin" />}
            {run.status}
          </span>
          <span className="text-xs font-mono text-gray-600 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1">
            est. {formatMoney(run.totalCostUsd)}
          </span>
          {live && (
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelling}
              className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 border border-red-200 bg-red-50 rounded-lg px-2.5 py-1.5 hover:bg-red-100 disabled:opacity-50"
            >
              <FiXCircle className="h-3.5 w-3.5" />
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-0">
        <div className="p-4 border-b xl:border-b-0 xl:border-r border-gray-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Stages</p>
          <ol className="space-y-2">
            {stages.length === 0 && (
              <li className="text-sm text-gray-500">Waiting for first stage…</li>
            )}
            {stages.map((stage, idx) => (
              <li
                key={`${stage.agent}-${idx}`}
                className={`rounded-lg border px-3 py-2 transition-all ${
                  stage.status === "running"
                    ? "border-[#1d9c35] bg-[#dff7de]/40 shadow-[0_0_0_3px_rgba(29,156,53,0.08)] animate-pulse"
                    : "border-gray-200 bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{stage.role || stage.agent}</p>
                    <p className="text-[11px] text-gray-500 font-mono">
                      {stage.provider || "—"} · {stage.model || "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusTone(stage.status)}`}>
                      {stage.status}
                    </span>
                    <p className="text-[11px] text-gray-500 mt-1">{formatMoney(stage.costUsd)}</p>
                  </div>
                </div>
                {stage.error && (
                  <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-red-50 border border-red-100 p-2 text-[11px] text-red-700 whitespace-pre-wrap break-words">
                    {String(stage.error)}
                  </pre>
                )}
                {stage.preview && stage.status === "succeeded" && (
                  <pre className="mt-2 max-h-24 overflow-auto rounded bg-gray-50 border border-gray-100 p-2 text-[10px] text-gray-600 whitespace-pre-wrap">
                    {String(stage.preview).slice(0, 500)}
                  </pre>
                )}
              </li>
            ))}
          </ol>
          {run.errorMessage && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-xs font-bold uppercase tracking-wide text-red-800">Run failed</p>
              <pre className="mt-1 max-h-48 overflow-auto text-sm text-red-800 whitespace-pre-wrap break-words font-sans">
                {run.errorMessage}
              </pre>
            </div>
          )}
          <p className="mt-3 text-[11px] text-gray-400">
            Started {formatWhen(run.startedAt || run.createdAt)}
            {run.finishedAt ? ` · Finished ${formatWhen(run.finishedAt)}` : ""}
          </p>
        </div>

        <div className="p-4 bg-[#fafcfa]">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Draft preview</p>
            {preview.blogPostId && (
              <a
                href={`/?section=my-blog-approvals`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#1d9c35] hover:underline"
              >
                Open approvals <FiExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          {preview.title ? (
            <div className="animate-soft-rise">
              <h3 className="text-lg font-semibold text-gray-900">{preview.title}</h3>
              {preview.excerpt && <p className="mt-1 text-sm text-gray-600">{preview.excerpt}</p>}
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-500">
                {preview.slug && <span className="font-mono bg-white border rounded px-2 py-0.5">/{preview.slug}</span>}
                {preview.seoTitle && <span className="bg-white border rounded px-2 py-0.5">SEO: {preview.seoTitle}</span>}
              </div>
              {preview.featuredImagePath && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={
                    preview.featuredImagePath.startsWith("/") ||
                    /^(https?:|data:|blob:)/i.test(preview.featuredImagePath)
                      ? preview.featuredImagePath
                      : `/api/uploads/${preview.featuredImagePath}`
                  }
                  alt=""
                  className="mt-3 w-full max-h-40 object-cover rounded-lg border border-gray-200"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const el = e.currentTarget;
                    if (el.dataset.retried === "1") return;
                    el.dataset.retried = "1";
                    const base = String(el.src || "").split("?")[0];
                    if (base) el.src = `${base}?v=${Date.now()}`;
                  }}
                />
              )}
              {preview.html && (
                <div
                  className="mt-3 max-h-72 overflow-auto rounded-lg border border-gray-200 bg-white p-4 prose prose-sm max-w-none text-gray-800"
                  dangerouslySetInnerHTML={{ __html: preview.html }}
                />
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              {live ? "Draft will appear when the writer finishes…" : "No draft preview for this run."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
