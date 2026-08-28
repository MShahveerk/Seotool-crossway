"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FiCheck, FiEdit2, FiX, FiRefreshCw, FiChevronDown, FiChevronUp, FiClock, FiUpload } from "react-icons/fi";
import { formatScheduleShort } from "../../lib/timezone";
import ApprovalMediaPreview from "./ApprovalMediaPreview";
import BackupImageSwitcher from "./BackupImageSwitcher";
import HumanizeTextButton from "./HumanizeTextButton";
import { toastSuccess, toastError } from "@/lib/toast";
import { publicMediaUrl } from "../../lib/publicMediaUrl";

const TABS = [
  { id: "actionable", label: "Needs action" },
  { id: "pending", label: "Pending" },
  { id: "edited", label: "Edited" },
  { id: "all", label: "All" },
  { id: "closed", label: "Closed" },
];

function displayBody(a) {
  if (a.userEditedText && String(a.userEditedText).trim()) return a.userEditedText;
  return a.bodyText || "";
}

/** Assignee-visible caption: user edit wins when set (including empty string). */
function displayCaption(a) {
  if (a.userEditedCaption != null) return String(a.userEditedCaption).trim();
  return String(a.caption || "").trim();
}

/** Assignee-only posting instructions / suggestions (not set by admin). */
function displayInstructions(a) {
  if (a.userEditedInstructions != null) return String(a.userEditedInstructions).trim();
  return "";
}

/** Assignee-visible heading: user edit wins when set (including empty string). */
function displayTitle(a) {
  if (a.userEditedTitle != null) return String(a.userEditedTitle).trim();
  return String(a.title || "").trim();
}

/** Original heading from administrator (never the assignee override). */
function adminTitle(a) {
  return String(a.title ?? "");
}

/** Original caption from administrator. */
function adminCaption(a) {
  return String(a.caption ?? "");
}

/** Original accompanying / body text from administrator. */
function adminBodyText(a) {
  return String(a.bodyText ?? "");
}

/** Read-only review box (administrator copy) — matches admin panel “from admin” styling. */
function ReviewReadonlyAdmin({ id, label, value, rows = 3 }) {
  const str = value != null ? String(value) : "";
  return (
    <div className="min-w-0 flex flex-col gap-1">
      <label htmlFor={id} className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </label>
      <textarea
        id={id}
        readOnly
        spellCheck={false}
        rows={rows}
        value={str}
        placeholder="—"
        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 min-h-[2.75rem] max-h-[min(24rem,50vh)] resize-y overflow-y-auto cursor-default focus:outline-none whitespace-pre-wrap break-words"
      />
    </div>
  );
}

/** Read-only box for “your submitted” side when item is closed (matches admin amber column). */
function ReviewReadonlySubmitted({ id, label, value, rows = 3 }) {
  const str = value != null ? String(value) : "";
  return (
    <div className="min-w-0 flex flex-col gap-1">
      <label htmlFor={id} className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
        {label}
      </label>
      <textarea
        id={id}
        readOnly
        spellCheck={false}
        rows={rows}
        value={str}
        placeholder="—"
        className="w-full rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm text-gray-900 min-h-[2.75rem] max-h-[min(24rem,50vh)] resize-y overflow-y-auto cursor-default focus:outline-none whitespace-pre-wrap break-words"
      />
    </div>
  );
}

export default function ApprovalsUserPanel({ selectedSite = "" }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("actionable");
  const [openId, setOpenId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [captionDraft, setCaptionDraft] = useState("");
  const [instructionsDraft, setInstructionsDraft] = useState("");
  const [acting, setActing] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [declineFor, setDeclineFor] = useState(null);
  const [declineReason, setDeclineReason] = useState("");
  const [declineTarget, setDeclineTarget] = useState("both");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("smmDisplay", "1");
      if (selectedSite) params.set("site", selectedSite);
      const res = await fetch(`/api/approvals?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load approvals");
      setItems(Array.isArray(data.approvals) ? data.approvals : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedSite]);

  const visibleItems = useMemo(() => {
    const list = items.filter((a) => String(a.status || "").toLowerCase() !== "draft");
    switch (tab) {
      case "pending":
        return list.filter((a) => a.status === "pending");
      case "edited":
        return list.filter((a) => a.status === "edited");
      case "closed":
        return list.filter((a) => a.status === "approved" || a.status === "declined");
      case "actionable":
        return list.filter((a) => a.status === "pending" || a.status === "edited");
      default:
        return list;
    }
  }, [items, tab]);

  const counts = useMemo(() => {
    const list = items.filter((a) => String(a.status || "").toLowerCase() !== "draft");
    return {
      actionable: list.filter((a) => a.status === "pending" || a.status === "edited").length,
      pending: list.filter((a) => a.status === "pending").length,
      edited: list.filter((a) => a.status === "edited").length,
      closed: list.filter((a) => a.status === "approved" || a.status === "declined").length,
      all: list.length,
    };
  }, [items]);

  const closeDecline = () => {
    setDeclineFor(null);
    setDeclineReason("");
    setDeclineTarget("both");
  };

  const submitDecline = async () => {
    const reason = declineReason.trim();
    if (!reason) {
      setError("A reason for declining is required.");
      return;
    }
    const id = declineFor;
    closeDecline();
    await patch(id, { action: "decline", declineReason: reason, revisionTarget: declineTarget });
  };

  const promoteBackup = async (approvalId, backupIndex) => {
    setPromoting(true);
    setError("");
    try {
      const res = await fetch(`/api/approvals/${approvalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "promote_backup", backupIndex }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to switch image");
      toastSuccess("Primary image updated");
      await load();
    } catch (e) {
      setError(e.message);
      toastError("Could not switch image", e.message);
    } finally {
      setPromoting(false);
    }
  };

  const saveOperatorImage = async (approvalId) => {
    if (!imageFile) {
      toastError("Choose an image first");
      return;
    }
    setImageBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("action", "save_image");
      fd.append("image", imageFile);
      const res = await fetch(`/api/approvals/${approvalId}`, { method: "PATCH", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save image");
      toastSuccess("Image replaced");
      setImageFile(null);
      await load();
    } catch (e) {
      setError(e.message);
      toastError("Could not replace image", e.message);
    } finally {
      setImageBusy(false);
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  const toggleOpen = (a) => {
    if (openId === a.id) {
      setOpenId(null);
      setEditDraft("");
      setTitleDraft("");
      setCaptionDraft("");
      setInstructionsDraft("");
      setImageFile(null);
      return;
    }
    setOpenId(a.id);
    setEditDraft(displayBody(a));
    setTitleDraft(displayTitle(a));
    setCaptionDraft(displayCaption(a));
    setInstructionsDraft(displayInstructions(a));
  };

  const patch = async (id, payload) => {
    setActing(true);
    setError("");
    try {
      const res = await fetch(`/api/approvals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      await load();
      setOpenId(null);
      setEditDraft("");
      setTitleDraft("");
      setCaptionDraft("");
      setInstructionsDraft("");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("approvals:user-updated"));
      }
      if (payload.action === "approve") toastSuccess("Approval submitted");
      else if (payload.action === "decline") toastSuccess("Post declined");
      else if (payload.action === "edit") toastSuccess("Changes saved");
    } catch (e) {
      setError(e.message);
      toastError("Action failed", e.message);
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="inline-block h-8 w-8 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-guide="approve-queue">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-gray-600 max-w-3xl">
          Pending posts from Create Post, inbound, and Post Automation Studio appear here
          {selectedSite ? " for the selected site" : ""}. Review media (switch backups if available), edit copy, then
          approve or decline.
        </p>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1 text-sm text-gray-600 border border-gray-200 rounded-lg px-2 py-1 bg-white shrink-0"
        >
          <FiRefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-gray-200 pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg border-b-2 transition ${
              tab === t.id
                ? "border-[#1d9c35] text-[#1d9c35]"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
            <span className="ml-1 text-[10px] opacity-70">({counts[t.id] ?? 0})</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {!selectedSite ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Tip: select a client site in the header to focus this list. Without a site filter, SMM/admin see all
          non-draft posts.
        </div>
      ) : null}

      {visibleItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-6 py-10 text-center text-sm text-gray-500">
          {items.length === 0
            ? "No posts to review yet for this view."
            : "No posts in this tab. Try “Needs action” or “All”."}
        </div>
      ) : (
        <ul className="space-y-3">
          {visibleItems.map((a, index) => {
            const open = openId === a.id;
            const closed = a.status === "approved" || a.status === "declined";
            const canAct = a.status === "pending" || a.status === "edited";
            const capShown = displayCaption(a);
            const insShown = displayInstructions(a);
            const bodyShown = displayBody(a);
            const titleShown = displayTitle(a);
            const subline = capShown || insShown || null;
            const dirtyTitle = String(titleDraft).trim() !== titleShown;
            const dirtyCaption = String(captionDraft).trim() !== capShown;
            const dirtyInstructions = String(instructionsDraft).trim() !== insShown;
            const dirtyBody = String(editDraft).trim() !== bodyShown;
            const headingOrCaptionDirty = dirtyTitle || dirtyCaption;
            const nothingToSave = !dirtyTitle && !dirtyCaption && !dirtyInstructions && !dirtyBody;
            const approvePrimaryLabel = headingOrCaptionDirty ? "Save Edits + Approve" : "Approve";
            return (
              <li key={a.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                <button
                  type="button"
                  onClick={() => toggleOpen(a)}
                  data-guide={index === 0 ? "approve-actions" : undefined}
                  className="w-full flex items-stretch gap-3 px-4 py-3 text-left hover:bg-gray-50/80"
                >
                  <div
                    className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200"
                    data-guide={index === 0 ? "approve-preview" : undefined}
                  >
                    {a.imagePath ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={publicMediaUrl(a.imagePath, { bust: a.updatedAt || a.id })}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900 truncate">{titleShown || "Approval"}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          a.status === "pending"
                            ? "bg-amber-50 text-amber-900 ring-1 ring-amber-200"
                            : a.status === "edited"
                              ? "bg-sky-50 text-sky-900 ring-1 ring-sky-200"
                              : a.status === "approved"
                                ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200"
                                : "bg-gray-100 text-gray-600 ring-1 ring-gray-200"
                        }`}
                      >
                        {a.status}
                      </span>
                      {Array.isArray(a.backupImagePaths) && a.backupImagePaths.length > 0 ? (
                        <span className="text-[10px] font-semibold text-[#1d9c35]">
                          +{a.backupImagePaths.length} backup
                          {a.backupImagePaths.length === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </div>
                    {subline ? (
                      <p className="text-xs text-gray-600 truncate mt-0.5">{subline}</p>
                    ) : null}
                    <p className="text-xs text-gray-500 mt-0.5">
                      {a.source ? `${a.source} · ` : ""}
                      {closed && a.respondedAt
                        ? new Date(a.respondedAt).toLocaleString()
                        : new Date(a.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {open ? (
                    <FiChevronUp className="w-5 h-5 text-gray-400 shrink-0 self-center" />
                  ) : (
                    <FiChevronDown className="w-5 h-5 text-gray-400 shrink-0 self-center" />
                  )}
                </button>
                {open && (
                  <div className="px-4 pb-4 border-t border-gray-100 pt-4 space-y-4">
                    {canAct ? (
                      <BackupImageSwitcher
                        primaryPath={a.imagePath}
                        backupPaths={a.backupImagePaths}
                        alt={titleShown}
                        disabled={!canAct}
                        promoting={promoting}
                        onPromote={(idx) => promoteBackup(a.id, idx)}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50">
                          <FiUpload className="h-3.5 w-3.5" />
                          {a.imagePath ? "Replace with my image" : "Upload my image"}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            className="hidden"
                            onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                          />
                        </label>
                        <button
                          type="button"
                          disabled={imageBusy || !imageFile}
                          onClick={() => saveOperatorImage(a.id)}
                          className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                        >
                          {imageBusy ? "Saving…" : "Save image"}
                        </button>
                        {imageFile ? (
                          <span className="text-xs text-amber-800">Unsaved: {imageFile.name}</span>
                        ) : (
                          <span className="text-xs text-gray-500">
                            Overrides the generated creative. The old file is kept as a backup.
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-gray-100 overflow-hidden bg-gray-50">
                        <ApprovalMediaPreview
                          src={a.imagePath}
                          bust={a.updatedAt || a.id}
                          className="w-full max-h-[320px] object-contain bg-black"
                          videoControls
                        />
                      </div>
                    )}
                    {!canAct ? (
                      <>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <ReviewReadonlyAdmin
                            id={`closed-adm-heading-${a.id}`}
                            label="Heading (from administrator)"
                            value={adminTitle(a)}
                            rows={2}
                          />
                          <ReviewReadonlySubmitted
                            id={`closed-your-heading-${a.id}`}
                            label="Your heading"
                            value={titleShown}
                            rows={2}
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <ReviewReadonlyAdmin
                            id={`closed-adm-caption-${a.id}`}
                            label="Caption (from administrator)"
                            value={adminCaption(a)}
                            rows={4}
                          />
                          <ReviewReadonlySubmitted
                            id={`closed-your-caption-${a.id}`}
                            label="Your caption"
                            value={capShown}
                            rows={4}
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <ReviewReadonlyAdmin
                            id={`closed-adm-sug-${a.id}`}
                            label="Suggestions (from administrator)"
                            value=""
                            rows={3}
                          />
                          <ReviewReadonlySubmitted
                            id={`closed-your-sug-${a.id}`}
                            label="Your suggestions"
                            value={insShown}
                            rows={4}
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <ReviewReadonlyAdmin
                            id={`closed-adm-body-${a.id}`}
                            label="Accompanying text (from administrator)"
                            value={adminBodyText(a)}
                            rows={4}
                          />
                          <ReviewReadonlySubmitted
                            id={`closed-your-body-${a.id}`}
                            label="Your accompanying text"
                            value={bodyShown}
                            rows={4}
                          />
                        </div>
                      </>
                    ) : null}
                    {a.scheduledFor && (
                      <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                        <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 block mb-1">
                          Scheduled For
                        </label>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                          <FiClock className="text-primary-500" />
                          {formatScheduleShort(a.scheduledFor)}
                        </div>
                      </div>
                    )}
                    {canAct && (
                      <>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <ReviewReadonlyAdmin
                            id={`act-adm-heading-${a.id}`}
                            label="Heading (from administrator)"
                            value={adminTitle(a)}
                            rows={2}
                          />
                          <div className="min-w-0 flex flex-col gap-1">
                            <label
                              htmlFor={`act-your-heading-${a.id}`}
                              className="text-[11px] font-semibold uppercase tracking-wide text-gray-600"
                            >
                              Your heading (max 255 characters)
                            </label>
                            <input
                              id={`act-your-heading-${a.id}`}
                              type="text"
                              maxLength={255}
                              value={titleDraft}
                              onChange={(e) => setTitleDraft(e.target.value)}
                              className="w-full rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm text-gray-900 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-400"
                            />
                            <p className="text-[11px] text-gray-400">{titleDraft.length}/255</p>
                          </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <ReviewReadonlyAdmin
                            id={`act-adm-caption-${a.id}`}
                            label="Caption (from administrator)"
                            value={adminCaption(a)}
                            rows={4}
                          />
                          <div className="min-w-0 flex flex-col gap-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <label
                                htmlFor={`act-your-caption-${a.id}`}
                                className="text-[11px] font-semibold uppercase tracking-wide text-gray-600"
                              >
                                Your caption (max 2000 characters)
                              </label>
                              <HumanizeTextButton
                                type="caption"
                                text={captionDraft}
                                onHumanized={setCaptionDraft}
                                size="xs"
                              />
                            </div>
                            <textarea
                              id={`act-your-caption-${a.id}`}
                              rows={4}
                              maxLength={2000}
                              value={captionDraft}
                              onChange={(e) => setCaptionDraft(e.target.value)}
                              className="w-full rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm text-gray-900 min-h-[5rem] max-h-[min(24rem,50vh)] resize-y focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-400 whitespace-pre-wrap break-words"
                            />
                            <p className="text-[11px] text-gray-400">{captionDraft.length}/2000</p>
                          </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <ReviewReadonlyAdmin
                            id={`act-adm-sug-${a.id}`}
                            label="Suggestions (from administrator)"
                            value=""
                            rows={3}
                          />
                          <div className="min-w-0 flex flex-col gap-1">
                            <label
                              htmlFor={`act-your-sug-${a.id}`}
                              className="text-[11px] font-semibold uppercase tracking-wide text-gray-600"
                            >
                              Your suggestions (optional; max 5000 characters)
                            </label>
                            <textarea
                              id={`act-your-sug-${a.id}`}
                              rows={4}
                              maxLength={5000}
                              value={instructionsDraft}
                              onChange={(e) => setInstructionsDraft(e.target.value)}
                              className="w-full rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm text-gray-900 min-h-[5rem] max-h-[min(24rem,50vh)] resize-y focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-400 whitespace-pre-wrap break-words"
                            />
                            <p className="text-[11px] text-gray-400">{instructionsDraft.length}/5000</p>
                          </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <ReviewReadonlyAdmin
                            id={`act-adm-body-${a.id}`}
                            label="Accompanying text (from administrator)"
                            value={adminBodyText(a)}
                            rows={4}
                          />
                          <div className="min-w-0 flex flex-col gap-1">
                            <label
                              htmlFor={`act-your-body-${a.id}`}
                              className="text-[11px] font-semibold uppercase tracking-wide text-gray-600"
                            >
                              Your accompanying text (optional; media cannot be changed)
                            </label>
                            <textarea
                              id={`act-your-body-${a.id}`}
                              rows={4}
                              value={editDraft}
                              onChange={(e) => setEditDraft(e.target.value)}
                              className="w-full rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm text-gray-900 min-h-[5rem] max-h-[min(24rem,50vh)] resize-y focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-400 whitespace-pre-wrap break-words"
                            />
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={acting}
                            onClick={() =>
                              patch(a.id, {
                                action: "approve",
                                editedTitle: titleDraft,
                                editedText: editDraft,
                                editedCaption: captionDraft,
                                editedInstructions: instructionsDraft,
                              })
                            }
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#00A3FF] hover:bg-[#0077CC] text-white text-sm font-semibold disabled:opacity-50"
                          >
                            <FiCheck className="w-4 h-4" />
                            {approvePrimaryLabel}
                          </button>
                          <button
                            type="button"
                            disabled={acting || nothingToSave}
                            onClick={() =>
                              patch(a.id, {
                                action: "edit",
                                editedTitle: titleDraft,
                                editedText: editDraft,
                                editedCaption: captionDraft,
                                editedInstructions: instructionsDraft,
                              })
                            }
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-300 bg-white text-gray-800 text-sm font-semibold disabled:opacity-50"
                          >
                            <FiEdit2 className="w-4 h-4" />
                            Save edit
                          </button>
                          <button
                            type="button"
                            disabled={acting}
                            onClick={() => {
                              setError("");
                              setDeclineReason("");
                              setDeclineTarget("both");
                              setDeclineFor(a.id);
                            }}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50"
                          >
                            <FiX className="w-4 h-4" />
                            Decline
                          </button>
                        </div>
                      </>
                    )}
                    {closed && (
                      <p className="text-xs text-gray-500">
                        This item is closed. Contact your administrator if you need changes.
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {declineFor ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-gray-900/50 backdrop-blur-[2px]"
            onClick={closeDecline}
          />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="shrink-0 rounded-xl border border-red-100 bg-red-50 p-2.5">
                <FiX className="h-5 w-5 text-red-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-gray-900">Decline & auto-revise</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Your remarks go straight to the AI agents, which rewrite a fresh post automatically.
                </p>
              </div>
            </div>

            <label className="mt-4 block text-sm font-semibold text-gray-800">
              What&apos;s the reason?
              <textarea
                className="mt-1.5 min-h-[90px] w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="Tell the agent exactly what to change…"
                autoFocus
              />
            </label>

            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Route this feedback to
            </p>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {[
                { id: "text", label: "Wording", hint: "caption only" },
                { id: "image", label: "Image", hint: "visual only" },
                { id: "both", label: "Both", hint: "full redo" },
              ].map((opt) => {
                const active = declineTarget === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDeclineTarget(opt.id)}
                    className={`rounded-xl border px-3 py-2 text-center text-sm font-semibold transition ${
                      active
                        ? "border-gray-900 bg-gray-900 text-white shadow-sm"
                        : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    {opt.label}
                    <span
                      className={`block text-[0.68rem] font-medium ${
                        active ? "text-gray-300" : "text-gray-400"
                      }`}
                    >
                      {opt.hint}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeDecline}
                className="rounded-xl px-3 py-2 text-sm font-semibold text-gray-500 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={acting || !declineReason.trim()}
                onClick={submitDecline}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                <FiX className="h-4 w-4" />
                Decline & revise
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
