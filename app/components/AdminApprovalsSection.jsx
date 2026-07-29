"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiCheck,
  FiImage,
  FiRefreshCw,
  FiUser,
  FiAlertCircle,
  FiChevronDown,
  FiChevronUp,
  FiMoreVertical,
  FiTrash2,
  FiEye,
  FiEyeOff,
} from "react-icons/fi";
import {
  datetimeLocalToUtcIso,
  formatScheduleShort,
  timezoneShortLabel,
} from "../../lib/timezone";
import ApprovalMediaPreview from "./ApprovalMediaPreview";
import MediaCropModal from "./MediaCropModal";
import HumanizeTextButton from "./HumanizeTextButton";
import PostPublishConfigPanel from "./PostPublishConfigPanel";

const POST_SOURCE_LABELS = {
  manual: "Manual",
  inbound: "Inbound API",
  meta_pull: "Meta pull",
  email_inbound: "Email",
};

const POST_STATUS_LABELS = {
  draft: "Draft",
  pending: "Pending",
  edited: "Edited",
  approved: "Approved",
  declined: "Declined",
};

function formatDateTime(iso) {
  if (!iso) return "—";
  return formatScheduleShort(iso) || String(iso);
}

/** Read-only multiline mirror (admin review): shows full text; scrolls when long. */
function AdminReadonlyMultiline({ id, label, value, rows = 3, variant = "default" }) {
  const str = value != null ? String(value) : "";
  const box =
    variant === "user"
      ? "border-amber-200 bg-amber-50/70"
      : variant === "suggestions"
        ? "border-gray-200 bg-white"
        : "border-gray-200 bg-gray-50";
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
        className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 min-h-[2.75rem] max-h-[min(24rem,50vh)] resize-y overflow-y-auto cursor-default focus:outline-none focus-visible:ring-1 focus-visible:ring-gray-300 whitespace-pre-wrap break-words ${box}`}
      />
    </div>
  );
}

function userResponseSummary(a) {
  if (!a.respondedAt && a.status === "pending") {
    return { label: "Awaiting user", detail: "No response yet." };
  }
  const when = formatDateTime(a.respondedAt);
  const action = String(a.lastAction || "").toLowerCase();
  if (action === "approve" || a.status === "approved") {
    if (a.skippedAssigneeReview) {
      return {
        label: "Approved (on assignment)",
        detail: `No assignee review was required. Recorded ${when}.`,
      };
    }
    return {
      label: "Approved",
      detail: `User approved${
        a.userEditedText ||
        a.userEditedCaption != null ||
        a.userEditedInstructions != null ||
        a.userEditedTitle != null
          ? " (after submitting edits)"
          : ""
      } on ${when}.`,
    };
  }
  if (action === "decline" || a.status === "declined") {
    return {
      label: "Declined",
      detail: a.userEditedInstructions
        ? `User declined on ${when}. Reason: ${String(a.userEditedInstructions).trim()}`
        : `User declined on ${when}.`,
    };
  }
  if (action === "edit" || a.status === "edited") {
    return {
      label: "Edited",
      detail: `User submitted edits on ${when}. Compare below.`,
    };
  }
  return {
    label: a.status || "Updated",
    detail: a.respondedAt ? `Last activity ${when}.` : "—",
  };
}

export default function AdminApprovalsSection({ selectedSite = "" }) {
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [approvalsListWarning, setApprovalsListWarning] = useState("");
  const [form, setForm] = useState({
    title: "",
    caption: "",
    imageFile: null,
    /** If true, record as approved on create (assignee does not need to act). */
    approveOnAssignment: false,
    scheduledFor: "",
  });
  const [expandedApprovalId, setExpandedApprovalId] = useState(null);
  const [actionsMenuId, setActionsMenuId] = useState(null);
  const actionsMenuWrapRef = useRef(null);
  const approvalImageInputRef = useRef(null);

  // Crop modal state
  const [cropPendingFile, setCropPendingFile] = useState(null);  // raw file awaiting crop
  const [cropPreviews, setCropPreviews] = useState({});           // { facebook?: string, instagram?: string } object URLs
  const [croppedFilesState, setCroppedFilesState] = useState(null); // stores { facebook?: File, instagram?: File }
  const [publishFacebook, setPublishFacebook] = useState(true);
  const [publishInstagram, setPublishInstagram] = useState(true);

  // Determine which Meta platforms the selected site belongs to
  const isMeta = selectedSite && !selectedSite.startsWith("http");
  
  // Crop platforms determined dynamically based on checkboxes
  const cropPlatforms = [];
  if (isMeta) {
    if (publishFacebook) cropPlatforms.push("facebook");
    if (publishInstagram) cropPlatforms.push("instagram");
  }

  // Revoke object URLs on unmount or when they change
  useEffect(() => {
    return () => {
      Object.values(cropPreviews).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [cropPreviews]);

  const handleFileSelect = (rawFile) => {
    if (!rawFile) return;
    const isVideo = rawFile.type.startsWith("video/");
    // Skip crop modal for videos or non-Meta sites
    if (isVideo || cropPlatforms.length === 0) {
      setForm((f) => ({ ...f, imageFile: rawFile }));
      setCropPreviews({});
      setCroppedFilesState(null);
      return;
    }
    // Open crop modal
    setCropPendingFile(rawFile);
  };

  const handleCropConfirm = (croppedFiles) => {
    setCroppedFilesState(croppedFiles);
    // Use the facebook crop as the upload file (primary), fall back to instagram or original
    const uploadFile = croppedFiles.facebook || croppedFiles.instagram || cropPendingFile;
    setForm((f) => ({ ...f, imageFile: uploadFile }));
    // Build preview URLs
    const previews = {};
    if (croppedFiles.facebook) previews.facebook = URL.createObjectURL(croppedFiles.facebook);
    if (croppedFiles.instagram) previews.instagram = URL.createObjectURL(croppedFiles.instagram);
    setCropPreviews(previews);
    setCropPendingFile(null);
  };

  const handleCropUseOriginal = () => {
    setForm((f) => ({ ...f, imageFile: cropPendingFile }));
    setCropPreviews({});
    setCroppedFilesState(null);
    setCropPendingFile(null);
  };

  const handleCropCancel = () => {
    setCropPendingFile(null);
    setCroppedFilesState(null);
    // Reset file input so user can re-select
    if (approvalImageInputRef.current) approvalImageInputRef.current.value = "";
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setApprovalsListWarning("");
    try {
      try {
        const query = selectedSite ? `?site=${encodeURIComponent(selectedSite)}` : "";
        const aRes = await fetch(`/api/admin/approvals${query}`);
        const aData = await aRes.json();
        if (aRes.ok) {
          setApprovals(aData.approvals || []);
        } else {
          setApprovals([]);
          setApprovalsListWarning(
            `${aData.error || "Could not load the approvals table."} Run a Prisma migration if you have not yet (for example: npx prisma migrate dev or npx prisma db push). Assigning new approvals may still work once the schema is applied.`
          );
        }
      } catch (aErr) {
        setApprovals([]);
        setApprovalsListWarning(
          `Could not load approvals (${aErr.message || "network error"}). ` +
            "Apply the approvals migration if needed."
        );
      }
    } catch (e) {
      setError(e.message);
      setApprovals([]);
    } finally {
      setLoading(false);
    }
  }, [selectedSite]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!actionsMenuId) return undefined;
    const onDocMouseDown = (e) => {
      const el = actionsMenuWrapRef.current;
      if (el && !el.contains(e.target)) setActionsMenuId(null);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [actionsMenuId]);

  const setHiddenFromAssignee = async (id, hidden) => {
    setError("");
    setActionsMenuId(null);
    try {
      const res = await fetch(`/api/admin/approvals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiddenFromAssignee: hidden }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update");
      await load();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("approvals:admin-refresh"));
      }
    } catch (e) {
      setError(e.message);
    }
  };

  const deleteApproval = async (id) => {
    if (!window.confirm("Delete this approval permanently? This cannot be undone.")) return;
    setError("");
    setActionsMenuId(null);
    try {
      const res = await fetch(`/api/admin/approvals/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      if (expandedApprovalId === id) setExpandedApprovalId(null);
      await load();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("approvals:admin-refresh"));
        window.dispatchEvent(new CustomEvent("approvals:user-updated"));
      }
    } catch (e) {
      setError(e.message);
    }
  };

  const acknowledge = async (id) => {
    try {
      const res = await fetch(`/api/admin/approvals/${id}/acknowledge`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to acknowledge");
      await load();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("approvals:admin-refresh"));
      }
    } catch (e) {
      setError(e.message);
    }
  };

  const publishNow = async (id) => {
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/admin/approvals/${id}/publish-now`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.errors?.join(" ") || "Publish failed");
      setSuccess(data.success ? `Published via ${data.method || "delivery chain"}.` : "Publish attempted.");
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!form.imageFile) {
      setError("Please choose an image or video file.");
      return;
    }
    if (!selectedSite.trim()) {
      setError("Please select a site from Site Dashboard before creating an approval.");
      return;
    }
    if (isMeta && !publishFacebook && !publishInstagram) {
      setError("Please select at least one platform (Facebook or Instagram) to publish to.");
      return;
    }
    setSubmitting(true);
    try {
      const wasApproveOnAssignment = form.approveOnAssignment;
      
      const submitSingle = async (fileObj, platformName) => {
        const fd = new FormData();
        fd.append("image", fileObj);
        fd.append("title", form.title.trim());
        fd.append("caption", form.caption.trim());
        fd.append("selectedSite", selectedSite);
        fd.append("approveOnAssignment", wasApproveOnAssignment ? "1" : "0");
        if (platformName) {
          fd.append("targetPlatform", platformName);
        }
        if (form.scheduledFor) {
          const iso = datetimeLocalToUtcIso(form.scheduledFor);
          if (iso) fd.append("scheduledFor", iso);
        }
        const res = await fetch("/api/admin/approvals", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Failed to create ${platformName || 'approval'} post`);
        return data;
      };

      if (isMeta) {
        // Submit as a single combined record if both are selected, or separately if only one is
        if (publishFacebook && publishInstagram) {
          const fileToUse = croppedFilesState?.facebook || croppedFilesState?.instagram || form.imageFile;
          await submitSingle(fileToUse, "both");
        } else if (publishFacebook) {
          const fileToUse = croppedFilesState?.facebook || form.imageFile;
          await submitSingle(fileToUse, "facebook");
        } else if (publishInstagram) {
          const fileToUse = croppedFilesState?.instagram || form.imageFile;
          await submitSingle(fileToUse, "instagram");
        }
      } else {
        // Regular site post
        await submitSingle(form.imageFile, null);
      }

      setSuccess(
        wasApproveOnAssignment
          ? "Approval created and recorded as approved (assignee does not need to review)."
          : "Approval(s) created and assigned."
      );
      setForm({ title: "", caption: "", imageFile: null, approveOnAssignment: false, scheduledFor: "" });
      setCroppedFilesState(null);
      if (approvalImageInputRef.current) approvalImageInputRef.current.value = "";
      await load();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("approvals:admin-refresh"));
        if (wasApproveOnAssignment) {
          window.dispatchEvent(new CustomEvent("approvals:user-updated"));
        }
      }
      setTimeout(() => setSuccess(""), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 flex justify-center">
        <div className="inline-block h-8 w-8 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
    <PostPublishConfigPanel selectedSite={selectedSite} />
    <div className="rounded-xl border border-gray-200 bg-[#ffffff] overflow-hidden mt-6">
      <div className="px-4 sm:px-6 py-5 border-b border-gray-200">
        <h2 className="text-2xl font-bold text-gray-900">Approvals</h2>
      </div>

      <div className="p-4 sm:p-6 space-y-6">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}
        {approvalsListWarning && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {approvalsListWarning}
          </div>
        )}
        {success && (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 p-4 space-y-4 bg-gray-50/50">
          <p className="text-sm font-semibold text-gray-900">New approval</p>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Heading</label>
            <input
              type="text"
              required
              maxLength={255}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl bg-white text-gray-900"
              placeholder="Short title"
            />
          </div>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <label className="text-sm font-semibold text-gray-700">Caption</label>
              <HumanizeTextButton
                type="caption"
                text={form.caption}
                onHumanized={(caption) => setForm((f) => ({ ...f, caption }))}
                disabled={submitting}
              />
            </div>
            <textarea
              rows={3}
              maxLength={2000}
              value={form.caption}
              onChange={(e) => setForm((f) => ({ ...f, caption: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl bg-white text-gray-900 text-sm"
              placeholder="Optional caption shown to the assignee (they can edit it)"
            />
            <p className="text-xs text-gray-500 mt-1">Max 2000 characters. {form.caption.length}/2000</p>
          </div>
          {isMeta && (
            <div>
              <span className="block text-sm font-semibold text-gray-700 mb-2">Publish To</span>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={publishFacebook}
                    onChange={(e) => setPublishFacebook(e.target.checked)}
                    className="rounded border-gray-300 text-gray-900 focus:ring-gray-400"
                  />
                  🟦 Facebook Page
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={publishInstagram}
                    onChange={(e) => setPublishInstagram(e.target.checked)}
                    className="rounded border-gray-300 text-gray-900 focus:ring-gray-400"
                  />
                  🟣 Instagram Account
                </label>
              </div>
            </div>
          )}
          <div>
            <span className="block text-sm font-semibold text-gray-700 mb-2">Image or video</span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={approvalImageInputRef}
                id="approval-new-image"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  if (f) handleFileSelect(f);
                }}
                className="sr-only"
              />
              <label
                htmlFor="approval-new-image"
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-xl bg-white text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 cursor-pointer focus-within:outline-none focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-2"
              >
                <FiImage className="w-4 h-4 shrink-0" aria-hidden />
                Choose media file
              </label>
              {form.imageFile ? (
                <>
                  <span
                    className="text-sm text-gray-700 truncate max-w-48 sm:max-w-xs"
                    title={form.imageFile.name}
                  >
                    {form.imageFile.name}
                  </span>
                  <button
                    type="button"
                    className="text-sm font-medium text-gray-600 hover:text-gray-900 underline underline-offset-2"
                    onClick={() => {
                      setForm((f) => ({ ...f, imageFile: null }));
                      setCropPreviews({});
                      if (approvalImageInputRef.current) approvalImageInputRef.current.value = "";
                    }}
                  >
                    Remove
                  </button>
                </>
              ) : (
                <span className="text-sm text-gray-500">Click to select image or video.</span>
              )}
            </div>

            {/* Platform crop previews */}
            {(cropPreviews.facebook || cropPreviews.instagram) && (
              <div className="flex flex-wrap gap-4 mt-3">
                {cropPreviews.facebook && (
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-blue-600">🟦 Facebook</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cropPreviews.facebook} alt="Facebook crop preview" className="rounded-lg border border-gray-200 shadow-sm" style={{ width: 160, height: 84, objectFit: 'cover' }} />
                    <span className="text-[10px] text-gray-400">1200 × 628</span>
                  </div>
                )}
                {cropPreviews.instagram && (
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-pink-600">🟣 Instagram</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cropPreviews.instagram} alt="Instagram crop preview" className="rounded-lg border border-gray-200 shadow-sm" style={{ width: 84, height: 84, objectFit: 'cover' }} />
                    <span className="text-[10px] text-gray-400">1080 × 1080</span>
                  </div>
                )}
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Images: JPEG, PNG, WebP, or GIF — max 5 MB. Videos: MP4, WebM, or MOV — max 100 MB.
            </p>
          </div>
          <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-3">
            <input
              type="checkbox"
              checked={form.approveOnAssignment}
              onChange={(e) => setForm((f) => ({ ...f, approveOnAssignment: e.target.checked }))}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-400"
            />
            <span>
              <span className="block text-sm font-semibold text-gray-900">Not Require Client Approval</span>
              <span className="block text-xs text-gray-600 mt-0.5">
              </span>
            </span>
          </label>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Schedule Post (Optional, {timezoneShortLabel()})
            </label>
            <input
              type="datetime-local"
              value={form.scheduledFor}
              onChange={(e) => setForm((f) => ({ ...f, scheduledFor: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
          </div>
          <div className="hidden">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Assignment source</label>
            <div className="w-full px-4 py-2 border border-gray-200 rounded-xl bg-white text-sm text-gray-900">
              {selectedSite ? (
                <>Auto-assigned from Site Dashboard selection: {selectedSite}</>
              ) : (
                "No site selected. Choose a site from Site Dashboard first."
              )}
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting || !selectedSite.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-xl font-semibold disabled:opacity-60"
          >
            <FiImage className="w-4 h-4" />
            {submitting ? "Creating…" : "Create & assign approval"}
          </button>
        </form>

        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-900">Assigned approvals</p>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1 text-sm text-gray-600 border border-gray-200 rounded-lg px-2 py-1 bg-white"
            >
              <FiRefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="hidden sm:grid grid-cols-[1fr_100px_80px_1fr] gap-2 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600 uppercase">
              <span>User / Title</span>
              <span>Status</span>
              <span>Alert</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-gray-100">
              {approvals.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-gray-500">
                  {selectedSite
                    ? "No approvals found for this client account yet."
                    : "No approvals yet. Select a client account to view history."}
                </div>
              )}
              {approvals.map((a) => {
                const expanded = expandedApprovalId === a.id;
                const summary = userResponseSummary(a);
                const capTrim = (s) => String(s ?? "").trim();
                const hasUserCaptionEdit =
                  a.userEditedCaption != null && capTrim(a.userEditedCaption) !== capTrim(a.caption);
                const hasUserTitleEdit =
                  a.userEditedTitle != null && capTrim(a.userEditedTitle) !== capTrim(a.title);
                const hasUserEdit =
                  Boolean(a.userEditedText && String(a.userEditedText).trim()) ||
                  hasUserCaptionEdit ||
                  hasUserTitleEdit ||
                  a.userEditedInstructions != null ||
                  a.status === "edited" ||
                  a.lastAction === "edit";
                const showTextCompare =
                  Boolean(String(a.bodyText || "").trim()) ||
                  Boolean(a.userEditedText && String(a.userEditedText).trim()) ||
                  hasUserEdit;
                return (
                  <div
                    key={a.id}
                    className="border-b border-gray-100 last:border-b-0"
                    ref={actionsMenuId === a.id ? actionsMenuWrapRef : undefined}
                  >
                    <div className="px-4 py-3 grid sm:grid-cols-[1fr_100px_80px_1fr] gap-2 items-center text-sm">
                      <div>
                        <div className="flex items-center gap-2 text-gray-900 font-medium">
                          <FiUser className="w-4 h-4 text-gray-400 shrink-0" />
                          <span className="truncate">{a.assignee?.name || a.assignee?.email}</span>
                        </div>
                        <div className="text-gray-600 truncate mt-0.5 flex items-center gap-2 flex-wrap">
                          <span className="truncate">
                            {hasUserTitleEdit ? capTrim(a.userEditedTitle) || a.title : a.title}
                          </span>
                          {a.hiddenFromAssignee ? (
                            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border border-gray-300 bg-gray-100 text-gray-600">
                              Hidden
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-gray-400 sm:hidden mt-1">
                          {a.status}
                          {a.awaitingAdminReview ? " · needs review" : ""}
                          {a.source && a.source !== "manual" ? ` · ${POST_SOURCE_LABELS[a.source] || a.source}` : ""}
                        </div>
                      </div>
                      <div className="hidden sm:block capitalize text-gray-700">
                        {POST_STATUS_LABELS[a.status] || a.status}
                        {a.source && a.source !== "manual" ? (
                          <span className="block text-[10px] normal-case text-gray-400">
                            {POST_SOURCE_LABELS[a.source] || a.source}
                          </span>
                        ) : null}
                      </div>
                      <div className="hidden sm:flex items-center gap-1">
                        {a.awaitingAdminReview ? (
                          <span className="inline-flex items-center gap-1 text-amber-700 text-xs font-semibold">
                            <FiAlertCircle className="w-4 h-4" />
                            New
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setExpandedApprovalId(expanded ? null : a.id)}
                          className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-800 hover:bg-gray-50"
                          aria-expanded={expanded}
                        >
                          {expanded ? (
                            <>
                              <FiChevronUp className="w-3.5 h-3.5" />
                              Hide review
                            </>
                          ) : (
                            <>
                              <FiChevronDown className="w-3.5 h-3.5" />
                              Review
                            </>
                          )}
                        </button>
                        {a.awaitingAdminReview ? (
                          <button
                            type="button"
                            onClick={() => acknowledge(a.id)}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#dff7de] text-gray-900 border border-[#c4edc2]"
                          >
                            <FiCheck className="w-3.5 h-3.5" />
                            Mark seen
                          </button>
                        ) : null}
                        {a.status === "approved" && a.publishStatus !== "published" ? (
                          <button
                            type="button"
                            onClick={() => publishNow(a.id)}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#1d9c35] text-[#1d9c35] bg-white hover:bg-green-50"
                          >
                            Publish now
                          </button>
                        ) : null}
                        <div className="relative">
                          <button
                            type="button"
                            aria-haspopup="menu"
                            aria-expanded={actionsMenuId === a.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionsMenuId((cur) => (cur === a.id ? null : a.id));
                            }}
                            className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                            title="More actions"
                          >
                            <FiMoreVertical className="w-4 h-4" />
                          </button>
                          {actionsMenuId === a.id ? (
                            <div
                              className="absolute right-0 top-full mt-1 z-30 min-w-[180px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                              role="menu"
                            >
                              <button
                                type="button"
                                role="menuitem"
                                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
                                onClick={() => setHiddenFromAssignee(a.id, !a.hiddenFromAssignee)}
                              >
                                {a.hiddenFromAssignee ? (
                                  <>
                                    <FiEye className="w-4 h-4 shrink-0" />
                                    Show to user
                                  </>
                                ) : (
                                  <>
                                    <FiEyeOff className="w-4 h-4 shrink-0" />
                                    Hide from user
                                  </>
                                )}
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                                onClick={() => deleteApproval(a.id)}
                              >
                                <FiTrash2 className="w-4 h-4 shrink-0" />
                                Delete
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {expanded && (
                      <div className="px-4 pb-4 pt-0 border-t border-gray-100 bg-gray-50/90 space-y-4">
                        <div className="pt-3 rounded-lg border border-gray-200 bg-white p-3 space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            User response
                          </p>
                          <p className="text-sm font-semibold text-gray-900">{summary.label}</p>
                          <p className="text-sm text-gray-700">{summary.detail}</p>
                          <p className="text-xs text-gray-500">
                            Created {formatDateTime(a.createdAt)}
                            {a.updatedAt && a.updatedAt !== a.createdAt ? (
                              <> · Last updated {formatDateTime(a.updatedAt)}</>
                            ) : null}
                          </p>
                        </div>
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_1fr]">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
                              Media preview
                            </p>
                            <div className="rounded-lg border border-gray-200 overflow-hidden bg-white">
                              <ApprovalMediaPreview
                                src={a.imagePath}
                                className="w-full max-h-[220px] object-contain bg-black"
                                videoControls
                              />
                            </div>
                          </div>
                            <div className="space-y-4 min-w-0">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <AdminReadonlyMultiline
                                id={`approval-heading-admin-${a.id}`}
                                label="Heading"
                                value={a.title}
                                rows={2}
                              />
                              <AdminReadonlyMultiline
                                id={`approval-heading-user-${a.id}`}
                                label="User's edited heading"
                                value={a.userEditedTitle != null ? String(a.userEditedTitle) : ""}
                                rows={2}
                                variant="user"
                              />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <AdminReadonlyMultiline
                                id={`approval-caption-admin-${a.id}`}
                                label="Caption"
                                value={String(a.caption ?? "")}
                                rows={4}
                              />
                              <AdminReadonlyMultiline
                                id={`approval-caption-user-${a.id}`}
                                label="User's edited caption"
                                value={a.userEditedCaption != null ? String(a.userEditedCaption) : ""}
                                rows={4}
                                variant="user"
                              />
                            </div>
                            <AdminReadonlyMultiline
                              id={`approval-suggestions-${a.id}`}
                              label="Suggestions"
                              value={a.userEditedInstructions != null ? String(a.userEditedInstructions) : ""}
                              rows={8}
                              variant="suggestions"
                            />
                            {showTextCompare ? (
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-lg border border-gray-200 bg-white p-3 min-w-0">
                                  <p className="text-[11px] font-semibold uppercase text-gray-500 mb-2">
                                    Original text (you sent)
                                  </p>
                                  <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">
                                    {String(a.bodyText || "").trim() || "—"}
                                  </p>
                                </div>
                                <div
                                  className={`rounded-lg border p-3 min-w-0 ${
                                    hasUserEdit
                                      ? "border-amber-200 bg-amber-50/80"
                                      : "border-gray-200 bg-white"
                                  }`}
                                >
                                  <p className="text-[11px] font-semibold uppercase text-gray-600 mb-2">
                                    User&apos;s text {hasUserEdit ? "(edited)" : "(no edit yet)"}
                                  </p>
                                  <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                                    {hasUserEdit && a.userEditedText
                                      ? a.userEditedText
                                      : "—"}
                                  </p>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Crop modal — only mounted when a file is pending crop */}
    {cropPendingFile && (
      <MediaCropModal
        file={cropPendingFile}
        platforms={cropPlatforms}
        onConfirm={handleCropConfirm}
        onUseOriginal={handleCropUseOriginal}
        onCancel={handleCropCancel}
      />
    )}
    </>
  );
}
