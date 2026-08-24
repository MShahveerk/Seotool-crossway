"use client";

import { useRef, useState } from "react";
import { FiDownload, FiUpload, FiTrash2, FiRefreshCw } from "react-icons/fi";
import Btn from "../ui-shared/Btn";
import { inputClass, labelClass } from "./studioConstants";

export default function OperatorKeywordBank({ siteQ, config, onPatch, onMessage }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState("");
  const keywords = Array.isArray(config?.operatorKeywords) ? config.operatorKeywords : [];
  const enabled = Boolean(config?.useOperatorKeywords);
  const importedAt = config?.operatorKeywordsImportedAt || null;

  const applyPayload = (data) => {
    onPatch?.({
      operatorKeywords: data.keywords || [],
      useOperatorKeywords: Boolean(data.useOperatorKeywords),
      operatorKeywordsImportedAt: data.importedAt || "",
    });
  };

  const onToggle = async (checked) => {
    setBusy("toggle");
    try {
      const res = await fetch(`/api/admin/blog-automation/site/keywords${siteQ}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useOperatorKeywords: checked }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save toggle.");
      applyPayload(data);
      onMessage?.({
        ok: true,
        text: checked
          ? "Decider will use your uploaded keywords instead of Research."
          : "Decider will use the Research library again.",
      });
    } catch (err) {
      onMessage?.({ ok: false, text: err.message });
    } finally {
      setBusy("");
    }
  };

  const onUpload = async (file) => {
    if (!file) return;
    setBusy("upload");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/admin/blog-automation/site/keywords${siteQ}`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed.");
      applyPayload(data);
      onMessage?.({
        ok: true,
        text: `Imported ${data.imported || data.keywords?.length || 0} keywords. Turn on the toggle to use them instead of Research.`,
      });
    } catch (err) {
      onMessage?.({ ok: false, text: err.message });
    } finally {
      setBusy("");
    }
  };

  const onClear = async () => {
    if (!keywords.length) return;
    setBusy("clear");
    try {
      const res = await fetch(`/api/admin/blog-automation/site/keywords${siteQ}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to clear.");
      applyPayload(data);
      onMessage?.({ ok: true, text: "Keyword bank cleared." });
    } catch (err) {
      onMessage?.({ ok: false, text: err.message });
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className={labelClass}>Your keywords</p>
          <p className="mt-1 text-xs text-[var(--cw-ink-muted)]">
            Upload a list the Decider must pick from. Template download, then import .xlsx / .csv.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--cw-ink-dim)]">
          <input
            type="checkbox"
            className="rounded border-[var(--cw-hairline)] text-[var(--cw-neon)] focus:ring-[var(--cw-neon)]"
            checked={enabled}
            disabled={Boolean(busy) || !keywords.length}
            onChange={(e) => onToggle(e.target.checked)}
          />
          Use these instead of Research
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <a
          href="/api/admin/blog-automation/site/keywords/template"
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--cw-ink-dim)] hover:border-[color-mix(in_srgb,var(--cw-neon)_40%,var(--cw-hairline))]"
        >
          <FiDownload className="h-3.5 w-3.5" />
          Download template
        </a>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[var(--cw-neon)] px-3 py-1.5 text-xs font-semibold text-[var(--cw-neon-ink)]">
          {busy === "upload" ? <FiRefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FiUpload className="h-3.5 w-3.5" />}
          {busy === "upload" ? "Importing…" : "Import spreadsheet"}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            className="sr-only"
            disabled={Boolean(busy)}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onUpload(f);
            }}
          />
        </label>
        {keywords.length ? (
          <Btn variant="ghost" size="xs" icon={FiTrash2} onClick={onClear} disabled={Boolean(busy)} loading={busy === "clear"}>
            Clear
          </Btn>
        ) : null}
      </div>

      {keywords.length ? (
        <div className="space-y-1">
          <p className="text-[11px] text-[var(--cw-ink-faint)]">
            {keywords.length} phrase{keywords.length === 1 ? "" : "s"}
            {importedAt
              ? ` · imported ${new Date(importedAt).toLocaleString([], { month: "short", day: "numeric" })}`
              : ""}
            {enabled ? " · Decider uses this list" : " · Research library still in use until you toggle"}
          </p>
          <p className={`${inputClass} max-h-24 overflow-y-auto py-2 font-mono text-[11px] leading-relaxed`}>
            {keywords
              .slice(0, 24)
              .map((k) => k.keyword)
              .join(" · ")}
            {keywords.length > 24 ? ` · +${keywords.length - 24} more` : ""}
          </p>
        </div>
      ) : (
        <p className="text-[11px] text-[var(--cw-ink-faint)]">No bank yet. Download the template, fill Keyword / Volume / KD, import.</p>
      )}
    </div>
  );
}
