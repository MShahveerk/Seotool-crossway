"use client";

import { useEffect, useMemo, useState } from "react";
import { FiCheck, FiCopy, FiExternalLink, FiMail, FiSave } from "react-icons/fi";
import { Link2, Megaphone, Target } from "lucide-react";
import {
  formatBatchLabel,
  groupByTimestampBatch,
  statusTone,
} from "@/lib/seoAutopilot/batchGroups";

const SOURCE_META = {
  foundation: {
    label: "Foundation profile",
    blurb:
      "Most directories are filled on their own submission page — not by emailing a random inbox. Open the link, paste your draft, then mark completed.",
  },
  editorial: {
    label: "Editorial outreach",
    blurb:
      "Pitch a journalist or editor. Send email works when SMTP is configured and you have a real contact address.",
  },
  roundup: {
    label: "Roundup / listicle",
    blurb: "Ask to be included in a curated list. Prefer a named editor email + the page URL.",
  },
  journalist: {
    label: "Journalist / expert request",
    blurb: "Expert-source pitch. Email send is appropriate when a contact address is real.",
  },
};

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/25 focus:border-sky-500";
const labelClass = "block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1";

function sourceMeta(source) {
  const key = String(source || "editorial").toLowerCase();
  return (
    SOURCE_META[key] || {
      label: source || "Outreach",
      blurb: "Outbound pitch drafted by Autopilot.",
    }
  );
}

function pitchWhy(p) {
  const meta = p.metaJson && typeof p.metaJson === "object" ? p.metaJson : {};
  if (meta.why) return String(meta.why);
  if (p.source === "foundation") {
    return `Claiming ${p.targetName || "this directory"} strengthens foundation authority${
      p.domainAuthority != null ? ` (est. DA ${p.domainAuthority})` : ""
    }. Submit on their page — email alone usually does not create the listing.`;
  }
  return `Outreach to ${p.targetName || "this outlet"} using your proof point.`;
}

function draftFromPitch(p) {
  if (!p) return null;
  return {
    subject: p.subject || "",
    bodyText: p.bodyText || "",
  };
}

function isListingPitch(p) {
  return String(p?.source || "").toLowerCase() === "foundation";
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(String(text || ""));
    return true;
  } catch {
    return false;
  }
}

function ensureHttp(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return `https://${u}`;
}

export default function PitchesPanel({
  pitches = [],
  siteLink,
  onSend,
  onMarkCompleted,
  onSave,
  busyId = "",
}) {
  const [batchKey, setBatchKey] = useState("");
  const [pitchId, setPitchId] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const batches = useMemo(() => groupByTimestampBatch(pitches), [pitches]);

  useEffect(() => {
    if (!batches.length) {
      setBatchKey("");
      setPitchId("");
      return;
    }
    if (!batches.some((b) => b.key === batchKey)) {
      setBatchKey(batches[0].key);
      setPitchId(batches[0].items[0]?.id || "");
    }
  }, [batches, batchKey]);

  const activeBatch = batches.find((b) => b.key === batchKey) || batches[0] || null;
  const batchItems = activeBatch?.items || [];

  useEffect(() => {
    if (!batchItems.length) {
      setPitchId("");
      return;
    }
    if (!batchItems.some((p) => p.id === pitchId)) {
      setPitchId(batchItems[0].id);
    }
  }, [batchItems, pitchId]);

  const active = batchItems.find((p) => p.id === pitchId) || batchItems[0] || null;

  useEffect(() => {
    setDraft(draftFromPitch(active));
    setNotice("");
  }, [active?.id, active?.updatedAt]);

  const meta = sourceMeta(active?.source);
  const isFoundation = isListingPitch(active);
  const submitUrl = ensureHttp(active?.targetUrl || "");
  const why = active ? pitchWhy(active) : "";
  const dirty =
    active &&
    draft &&
    (draft.subject !== (active.subject || "") || draft.bodyText !== (active.bodyText || ""));

  const patchDraft = (key, value) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  const saveDraft = async () => {
    if (!active || !draft || !onSave) return;
    setSaving(true);
    setNotice("");
    try {
      await onSave(active.id, {
        subject: draft.subject,
        bodyText: draft.bodyText,
      });
      setNotice("Draft saved.");
    } catch (err) {
      setNotice(err.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  if (!pitches.length) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
        <Megaphone className="mx-auto h-8 w-8 text-emerald-700/70" />
        <p className="mt-3 text-sm font-semibold text-gray-900">No pitches yet</p>
        <p className="mt-1 text-sm text-gray-500 max-w-md mx-auto">
          Run <span className="font-semibold">Foundation</span> and/or{" "}
          <span className="font-semibold">Pitch</span>, then edit drafts here, open submission pages,
          or send email when SMTP + a real address are set.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-gradient-to-r from-white to-sky-50/40 p-5">
        <div className="flex gap-3">
          <div className="rounded-xl bg-sky-50 border border-sky-100 p-2.5 shrink-0">
            <Megaphone className="w-4 h-4 text-sky-700" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Outreach pitches</h3>
            <p className="mt-1 text-sm text-gray-600 max-w-3xl leading-relaxed">
              Grouped by Autopilot run time. Listings use the submission link (no email send). Editorial
              pitches can email via SMTP. Only subject and draft body are editable — target facts stay
              locked.
            </p>
          </div>
        </div>
      </div>

      {notice ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            /fail|error/i.test(notice)
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-900"
          }`}
        >
          {notice}
        </div>
      ) : null}

      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
          Batches by time
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {batches.map((b) => {
            const selected = b.key === (activeBatch?.key || batchKey);
            const ready = b.items.filter((p) =>
              ["ready", "draft"].includes(String(p.status || "").toLowerCase())
            ).length;
            return (
              <button
                key={b.key}
                type="button"
                onClick={() => {
                  setBatchKey(b.key);
                  setPitchId(b.items[0]?.id || "");
                }}
                className={`shrink-0 rounded-xl border px-3.5 py-2.5 text-left transition ${
                  selected
                    ? "border-sky-600 bg-sky-50 shadow-sm"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <p className={`text-xs font-bold ${selected ? "text-sky-900" : "text-gray-900"}`}>
                  {formatBatchLabel(b.latestAt, b.items.length, "pitch")}
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {ready ? `${ready} ready` : "All handled"}
                  {b.runId ? ` · ${b.runId.slice(0, 8)}…` : ""}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-2 space-y-1 max-h-[36rem] overflow-y-auto">
          <p className="px-2 pt-1 pb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Targets in batch
          </p>
          {batchItems.map((p) => {
            const selected = p.id === (active?.id || pitchId);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPitchId(p.id)}
                className={`w-full rounded-xl px-3 py-2.5 text-left border transition ${
                  selected
                    ? "border-sky-200 bg-sky-50/80"
                    : "border-transparent hover:bg-gray-50"
                }`}
              >
                <p className="text-sm font-semibold text-gray-900 line-clamp-2">
                  {p.title || p.targetName || "Untitled pitch"}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                  {p.targetName || "—"}
                  {p.domainAuthority != null ? ` · DA ${p.domainAuthority}` : ""}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide rounded-full border px-1.5 py-0.5 ${statusTone(p.status)}`}
                  >
                    {p.status}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-gray-600">
                    {p.source || "—"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {active && draft ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-base font-bold text-gray-900">
                    {active.title || active.targetName || "Pitch"}
                  </h4>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide rounded-full border px-2 py-0.5 ${statusTone(active.status)}`}
                  >
                    {active.status}
                  </span>
                  {dirty ? (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700">
                      Unsaved
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Drafted {new Date(active.createdAt).toLocaleString()}
                  {active.sentAt ? ` · sent ${new Date(active.sentAt).toLocaleString()}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving || !dirty}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-50"
                  onClick={saveDraft}
                >
                  <FiSave className="w-3.5 h-3.5" />
                  {saving ? "Saving…" : "Save draft"}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700"
                  onClick={async () => {
                    const ok = await copyText(
                      [`Subject: ${draft.subject}`, "", draft.bodyText].join("\n")
                    );
                    setNotice(ok ? "Draft copied." : "Could not copy.");
                  }}
                >
                  <FiCopy className="w-3.5 h-3.5" /> Copy
                </button>
                {submitUrl ? (
                  <a
                    href={submitUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 text-white px-2.5 py-1.5 text-xs font-semibold hover:bg-emerald-800"
                  >
                    <FiExternalLink className="w-3.5 h-3.5" />
                    {isFoundation ? "Open submission page" : "Open target page"}
                  </a>
                ) : null}
                {active.status !== "completed" && active.status !== "sent" ? (
                  <button
                    type="button"
                    disabled={busyId === active.id}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
                    onClick={() => onMarkCompleted?.(active.id)}
                  >
                    <FiCheck className="w-3.5 h-3.5" /> Mark completed
                  </button>
                ) : null}
                {!isFoundation ? (
                  <button
                    type="button"
                    disabled={
                      busyId === active.id ||
                      saving ||
                      !String(active.targetEmail || "").trim()
                    }
                    className="inline-flex items-center gap-1 rounded-lg bg-gray-900 text-white px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
                    onClick={async () => {
                      if (dirty) {
                        try {
                          await saveDraft();
                        } catch {
                          return;
                        }
                      }
                      onSend?.(active.id);
                    }}
                    title={
                      !active.targetEmail
                        ? "No target email on this pitch"
                        : "Sends via Autopilot SMTP"
                    }
                  >
                    <FiMail className="w-3.5 h-3.5" /> Send email
                  </button>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-sm text-amber-950 leading-relaxed">
              {isFoundation ? (
                <>
                  <span className="font-semibold">Listing: </span>
                  Open the submission page, paste the draft into their form, then mark completed.
                  Email send is hidden for directory listings.
                </>
              ) : (
                <>
                  <span className="font-semibold">Editorial: </span>
                  Send email needs Autopilot SMTP and a real inbox. Target details below are facts from
                  Autopilot — only subject and body are editable.
                </>
              )}
            </div>

            <div className="rounded-xl border border-sky-100 bg-sky-50/50 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-sky-800">
                Why this pitch
              </p>
              <p className="mt-1 text-sm text-gray-800 leading-relaxed">{why}</p>
            </div>

            <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3">
              <div className="flex items-start gap-2">
                <Target className="w-4 h-4 text-gray-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">{meta.label}</p>
                  <p className="mt-0.5 text-sm text-gray-600 leading-relaxed">{meta.blurb}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-gray-100 px-3 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Target</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{active.targetName || "—"}</p>
                {submitUrl ? (
                  <a
                    href={submitUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:underline break-all"
                  >
                    {active.targetUrl}
                    <FiExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                ) : (
                  <p className="mt-1 text-xs text-gray-500">No URL on file</p>
                )}
                {!isFoundation ? (
                  <p className="mt-1 text-xs text-gray-600">{active.targetEmail || "No email"}</p>
                ) : null}
              </div>
              <div className="rounded-xl border border-gray-100 px-3 py-3 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Link signals
                </p>
                <div className="flex flex-wrap gap-2 text-xs font-semibold text-gray-700">
                  {active.domainAuthority != null ? (
                    <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1">
                      DA {active.domainAuthority}
                    </span>
                  ) : null}
                  <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 inline-flex items-center gap-1">
                    <Link2 className="w-3 h-3" />
                    {active.doFollow === false ? "nofollow" : "dofollow (expected)"}
                  </span>
                  <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 capitalize">
                    {active.source || "outreach"}
                  </span>
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>
                  {isFoundation ? "Subject / listing label (editable)" : "Subject (editable)"}
                </label>
                <input
                  className={inputClass}
                  value={draft.subject}
                  onChange={(e) => patchDraft("subject", e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>
                  {isFoundation ? "Submission draft (editable)" : "Email body (editable)"}
                </label>
                <textarea
                  className={`${inputClass} min-h-[180px] font-sans`}
                  value={draft.bodyText}
                  onChange={(e) => patchDraft("bodyText", e.target.value)}
                />
              </div>
            </div>

            {active.errorMessage ? (
              <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {active.errorMessage}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
