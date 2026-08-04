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
  const meta = p.metaJson && typeof p.metaJson === "object" ? p.metaJson : {};
  return {
    title: p.title || "",
    targetName: p.targetName || "",
    targetUrl: p.targetUrl || "",
    targetEmail: p.targetEmail || "",
    subject: p.subject || "",
    bodyText: p.bodyText || "",
    why: meta.why || pitchWhy(p),
    domainAuthority: p.domainAuthority != null ? String(p.domainAuthority) : "",
  };
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
  const isFoundation = String(active?.source || "").toLowerCase() === "foundation";
  const submitUrl = ensureHttp(draft?.targetUrl || active?.targetUrl || "");
  const dirty =
    active &&
    draft &&
    (draft.title !== (active.title || "") ||
      draft.targetName !== (active.targetName || "") ||
      draft.targetUrl !== (active.targetUrl || "") ||
      draft.targetEmail !== (active.targetEmail || "") ||
      draft.subject !== (active.subject || "") ||
      draft.bodyText !== (active.bodyText || "") ||
      draft.why !== ((active.metaJson && active.metaJson.why) || pitchWhy(active)) ||
      draft.domainAuthority !==
        (active.domainAuthority != null ? String(active.domainAuthority) : ""));

  const patchDraft = (key, value) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  const saveDraft = async () => {
    if (!active || !draft || !onSave) return;
    setSaving(true);
    setNotice("");
    try {
      await onSave(active.id, {
        title: draft.title,
        targetName: draft.targetName,
        targetUrl: draft.targetUrl,
        targetEmail: draft.targetEmail,
        subject: draft.subject,
        bodyText: draft.bodyText,
        why: draft.why,
        domainAuthority: draft.domainAuthority === "" ? null : Number(draft.domainAuthority),
      });
      setNotice("Pitch saved.");
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
              Grouped by Autopilot run time.{" "}
              <span className="font-semibold">Send email</span> only works with Autopilot SMTP (or{" "}
              <code className="text-xs">SMTP_*</code> env) and a real target inbox — it does{" "}
              <span className="font-semibold">not</span> fill directory web forms. For foundation
              listings, open the submission link and paste your draft.
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
                    {draft.title || draft.targetName || "Pitch"}
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
                  {saving ? "Saving…" : "Save edits"}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700"
                  onClick={async () => {
                    const ok = await copyText(
                      [`Subject: ${draft.subject}`, "", draft.bodyText].join("\n")
                    );
                    setNotice(ok ? "Pitch copied." : "Could not copy.");
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
                <button
                  type="button"
                  disabled={busyId === active.id || saving || !String(draft.targetEmail || "").trim()}
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
                    !draft.targetEmail
                      ? "Add a target email first"
                      : "Sends via Autopilot SMTP — does not submit web forms"
                  }
                >
                  <FiMail className="w-3.5 h-3.5" /> Send email
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-sm text-amber-950 leading-relaxed">
              {isFoundation ? (
                <>
                  <span className="font-semibold">Directory tip: </span>
                  “Send email” will not create a listing on {draft.targetName || "this site"}. Use{" "}
                  <span className="font-semibold">Open submission page</span>, paste the draft, then
                  mark completed. Email is only for real editorial inboxes.
                </>
              ) : (
                <>
                  <span className="font-semibold">Email tip: </span>
                  Send works only if SMTP is set under Autopilot → SMTP and the target email is real.
                  You can still open the page link and copy the draft into your own mail client.
                </>
              )}
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
              <div className="sm:col-span-2">
                <label className={labelClass}>Title</label>
                <input
                  className={inputClass}
                  value={draft.title}
                  onChange={(e) => patchDraft("title", e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Target name</label>
                <input
                  className={inputClass}
                  value={draft.targetName}
                  onChange={(e) => patchDraft("targetName", e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Est. DA</label>
                <input
                  className={inputClass}
                  inputMode="numeric"
                  value={draft.domainAuthority}
                  onChange={(e) => patchDraft("domainAuthority", e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>
                  {isFoundation ? "Submission / profile URL" : "Target page URL"}
                </label>
                <div className="flex gap-2">
                  <input
                    className={inputClass}
                    value={draft.targetUrl}
                    onChange={(e) => patchDraft("targetUrl", e.target.value)}
                    placeholder="https://example.com/submit"
                  />
                  {submitUrl ? (
                    <a
                      href={submitUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-900"
                    >
                      <Link2 className="w-3.5 h-3.5" /> Open
                    </a>
                  ) : null}
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Target email (optional for directories)</label>
                <input
                  className={inputClass}
                  value={draft.targetEmail}
                  onChange={(e) => patchDraft("targetEmail", e.target.value)}
                  placeholder="editor@example.com"
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Why this pitch</label>
                <textarea
                  className={`${inputClass} min-h-[72px]`}
                  value={draft.why}
                  onChange={(e) => patchDraft("why", e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Subject</label>
                <input
                  className={inputClass}
                  value={draft.subject}
                  onChange={(e) => patchDraft("subject", e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>
                  {isFoundation ? "Submission draft (paste into their form)" : "Email body"}
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
