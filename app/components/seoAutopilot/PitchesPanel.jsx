"use client";

import { useEffect, useMemo, useState } from "react";
import { FiCheck, FiCopy, FiExternalLink, FiMail, FiMapPin } from "react-icons/fi";
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
      "Claim-or-submit listing for a high-authority directory. Builds the first layer of real-world presence and often dofollow links.",
  },
  editorial: {
    label: "Editorial outreach",
    blurb:
      "Pitch a journalist or editor for a story, quote, or resource mention — the classic earned-link path.",
  },
  roundup: {
    label: "Roundup / listicle",
    blurb:
      "Ask to be included in a curated list or “best of” roundup where your niche already gets coverage.",
  },
  journalist: {
    label: "Journalist / expert request",
    blurb: "Respond to or pitch an expert-source opportunity (HARO-style or beat reporter).",
  },
};

function sourceMeta(source) {
  const key = String(source || "editorial").toLowerCase();
  return (
    SOURCE_META[key] || {
      label: source || "Outreach",
      blurb: "Outbound pitch drafted by Autopilot for a relevant placement opportunity.",
    }
  );
}

function pitchWhy(p) {
  const meta = p.metaJson && typeof p.metaJson === "object" ? p.metaJson : {};
  if (meta.why) return String(meta.why);
  if (p.source === "foundation") {
    return `Claiming ${p.targetName || "this directory"} strengthens foundation authority${
      p.domainAuthority != null ? ` (est. DA ${p.domainAuthority})` : ""
    } and gives the brand a verifiable presence AI and buyers can trust.`;
  }
  return `Outreach to ${p.targetName || "this outlet"} to earn a relevant mention or link using your proof point — drafted for human send, not auto-blast.`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(String(text || ""));
    return true;
  } catch {
    return false;
  }
}

export default function PitchesPanel({
  pitches = [],
  siteLink,
  onSend,
  onMarkCompleted,
  onReload,
  busyId = "",
}) {
  const [batchKey, setBatchKey] = useState("");
  const [pitchId, setPitchId] = useState("");
  const [notice, setNotice] = useState("");

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
  const meta = sourceMeta(active?.source);
  const why = active ? pitchWhy(active) : "";
  const metaJson = active?.metaJson && typeof active.metaJson === "object" ? active.metaJson : {};

  if (!pitches.length) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
        <Megaphone className="mx-auto h-8 w-8 text-emerald-700/70" />
        <p className="mt-3 text-sm font-semibold text-gray-900">No pitches yet</p>
        <p className="mt-1 text-sm text-gray-500 max-w-md mx-auto">
          Run <span className="font-semibold">Foundation</span> and/or{" "}
          <span className="font-semibold">Pitch</span>, configure SMTP, then send from a timestamped
          batch here.
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
            <p className="mt-1 text-sm text-gray-600 max-w-2xl leading-relaxed">
              Foundation submissions and editorial drafts, grouped by Autopilot run time. Open a
              batch, pick a target, read <span className="font-semibold">why</span> it matters, then
              send or mark done — nothing auto-sends.
            </p>
          </div>
        </div>
      </div>

      {notice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
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
                  {ready ? `${ready} ready to send` : "All handled"}
                  {b.runId ? ` · ${b.runId.slice(0, 8)}…` : ""}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-2 space-y-1 max-h-[32rem] overflow-y-auto">
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

        {active ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-base font-bold text-gray-900">
                    {active.title || active.targetName}
                  </h4>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide rounded-full border px-2 py-0.5 ${statusTone(active.status)}`}
                  >
                    {active.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Drafted {new Date(active.createdAt).toLocaleString()}
                  {active.sentAt ? ` · sent ${new Date(active.sentAt).toLocaleString()}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700"
                  onClick={async () => {
                    const block = [
                      `Subject: ${active.subject || ""}`,
                      "",
                      active.bodyText || "",
                    ].join("\n");
                    const ok = await copyText(block);
                    setNotice(ok ? "Pitch copied." : "Could not copy.");
                  }}
                >
                  <FiCopy className="w-3.5 h-3.5" /> Copy
                </button>
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
                  disabled={busyId === active.id || !active.targetEmail}
                  className="inline-flex items-center gap-1 rounded-lg bg-gray-900 text-white px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
                  onClick={() => onSend?.(active.id)}
                  title={!active.targetEmail ? "No target email on this pitch" : "Send via SMTP"}
                >
                  <FiMail className="w-3.5 h-3.5" /> Send email
                </button>
              </div>
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
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Target
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{active.targetName || "—"}</p>
                {active.targetUrl ? (
                  <a
                    href={active.targetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:underline"
                  >
                    <FiMapPin className="w-3 h-3" />
                    {active.targetUrl}
                    <FiExternalLink className="w-3 h-3" />
                  </a>
                ) : null}
                <p className="mt-1 text-xs text-gray-600">
                  {active.targetEmail || "No email on file — copy draft and send manually"}
                </p>
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
                {metaJson.submissionDraft && active.source === "foundation" ? (
                  <p className="text-[11px] text-gray-500 pt-1">
                    Includes a paste-ready directory submission draft below.
                  </p>
                ) : null}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Subject</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">{active.subject || "—"}</p>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                {active.source === "foundation" ? "Submission / message draft" : "Email body"}
              </p>
              <pre className="max-h-64 overflow-auto rounded-xl bg-gray-50 border border-gray-100 p-3 text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">
                {active.bodyText || "—"}
              </pre>
            </div>

            {active.errorMessage ? (
              <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {active.errorMessage}
              </p>
            ) : null}

            {!active.targetEmail ? (
              <p className="text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                No email address — use Copy and send from your inbox, or add the contact manually
                before using Send.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
