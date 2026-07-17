"use client";

import { useCallback, useEffect, useState } from "react";
import { FiCheck, FiEdit2, FiX, FiRefreshCw, FiChevronDown, FiChevronUp, FiClock } from "react-icons/fi";
import ApprovalMediaPreview from "./ApprovalMediaPreview";

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
  const [openId, setOpenId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [captionDraft, setCaptionDraft] = useState("");
  const [instructionsDraft, setInstructionsDraft] = useState("");
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = selectedSite ? `?site=${encodeURIComponent(selectedSite)}` : "";
      const res = await fetch(`/api/approvals${query}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load approvals");
      setItems(data.approvals || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedSite]);

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
    } catch (e) {
      setError(e.message);
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          Review the <strong>heading</strong>, <strong>caption</strong>, and media from your administrator. You can
          edit the heading and caption, add optional <strong>posting instructions or suggestions</strong> for your own
          reference, edit accompanying text (media stays fixed), then approve, save your edit, or decline. Items your
          administrator marked as approved on assignment do not appear here — no action needed from you.
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
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-6 py-10 text-center text-sm text-gray-500">
          No approvals assigned to you yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((a) => {
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
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50/80"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{titleShown || "Approval"}</p>
                    {subline ? (
                      <p className="text-xs text-gray-600 truncate mt-0.5">{subline}</p>
                    ) : null}
                    <p className="text-xs text-gray-500 capitalize mt-0.5">
                      {a.status}
                      {closed && a.respondedAt ? ` · ${new Date(a.respondedAt).toLocaleString()}` : ""}
                    </p>
                  </div>
                  {open ? (
                    <FiChevronUp className="w-5 h-5 text-gray-400 shrink-0" />
                  ) : (
                    <FiChevronDown className="w-5 h-5 text-gray-400 shrink-0" />
                  )}
                </button>
                {open && (
                  <div className="px-4 pb-4 border-t border-gray-100 pt-4 space-y-4">
                    <div className="rounded-lg border border-gray-100 overflow-hidden bg-gray-50">
                      <ApprovalMediaPreview
                        src={a.imagePath}
                        className="w-full max-h-[320px] object-contain bg-black"
                        videoControls
                      />
                    </div>
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
                          {new Date(a.scheduledFor).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
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
                            <label
                              htmlFor={`act-your-caption-${a.id}`}
                              className="text-[11px] font-semibold uppercase tracking-wide text-gray-600"
                            >
                              Your caption (max 2000 characters)
                            </label>
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
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0EFF2A] hover:bg-[#0BCC22] text-white text-sm font-semibold disabled:opacity-50"
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
                              const reason = window.prompt(
                                "Please provide a reason for declining this post (required):"
                              );
                              if (reason === null) return;
                              if (!String(reason).trim()) {
                                setError("A reason for declining is required.");
                                return;
                              }
                              patch(a.id, { action: "decline", declineReason: reason.trim() });
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
    </div>
  );
}
