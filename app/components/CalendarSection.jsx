"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  FiX,
  FiClock,
  FiTrash2,
  FiImage,
  FiCalendar,
} from "react-icons/fi";
import CalendarView from "./CalendarView";
import ApprovalMediaPreview from "./ApprovalMediaPreview";

function toDatetimeLocalValue(date) {
  if (!date) return "";
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDayLabel(date) {
  if (!date) return "";
  return new Date(date).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function CalendarSection({ selectedSite = "" }) {
  const { data: session } = useSession();
  const canManage =
    session?.user?.role === "super_admin" || session?.user?.role === "smm";

  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [dayModalOpen, setDayModalOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [dayPosts, setDayPosts] = useState([]);

  const [postModalOpen, setPostModalOpen] = useState(false);
  const [activePost, setActivePost] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    caption: "",
    scheduledFor: "",
    imageFile: null,
    approveOnAssignment: true,
  });

  const load = useCallback(async () => {
    const query = selectedSite ? `?site=${encodeURIComponent(selectedSite)}` : "";
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/calendar${query}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load calendar");
      setApprovals(data.approvals || []);
    } catch (err) {
      console.error("Failed to load calendar", err);
      setError(err.message || "Failed to load calendar");
      setApprovals([]);
    } finally {
      setLoading(false);
    }
  }, [selectedSite]);

  useEffect(() => {
    load();
  }, [load]);

  const refreshDayPosts = useCallback((dayDate, list) => {
    if (!dayDate) return;
    const posts = (list || []).filter((post) => {
      if (!post.scheduledFor) return false;
      const postDate = new Date(post.scheduledFor);
      return (
        postDate.getDate() === dayDate.getDate() &&
        postDate.getMonth() === dayDate.getMonth() &&
        postDate.getFullYear() === dayDate.getFullYear()
      );
    });
    setDayPosts(posts);
  }, []);

  useEffect(() => {
    if (dayModalOpen && selectedDay) {
      refreshDayPosts(selectedDay, approvals);
    }
  }, [approvals, dayModalOpen, selectedDay, refreshDayPosts]);

  const openDay = (date, posts) => {
    setSelectedDay(date);
    setDayPosts(posts || []);
    setDayModalOpen(true);
    setSuccess("");
    setError("");
    if (canManage) {
      setForm((f) => ({
        ...f,
        scheduledFor: toDatetimeLocalValue(date),
      }));
    }
  };

  const openCreateForDay = () => {
    if (!canManage) return;
    if (!selectedSite) {
      setError("Select a client account first.");
      return;
    }
    setForm({
      title: "",
      caption: "",
      scheduledFor: toDatetimeLocalValue(selectedDay || new Date()),
      imageFile: null,
      approveOnAssignment: true,
    });
    setCreateOpen(true);
  };

  const openPost = (post) => {
    setActivePost(post);
    setPostModalOpen(true);
    setSuccess("");
    setError("");
  };

  const unschedulePost = async (post) => {
    if (!canManage || !post?.id) return;
    if (post.publishStatus === "published") {
      setError("Published posts cannot be unscheduled from the calendar.");
      return;
    }
    setActionBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/approvals/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledFor: null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to unschedule");
      setSuccess("Post removed from the calendar schedule.");
      setPostModalOpen(false);
      setActivePost(null);
      await load();
    } catch (e) {
      setError(e.message || "Failed to unschedule");
    } finally {
      setActionBusy(false);
    }
  };

  const deletePost = async (post) => {
    if (!canManage || !post?.id) return;
    if (!window.confirm("Delete this post permanently? This cannot be undone.")) return;
    setActionBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/approvals/${post.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      setSuccess("Post deleted.");
      setPostModalOpen(false);
      setActivePost(null);
      await load();
    } catch (e) {
      setError(e.message || "Failed to delete");
    } finally {
      setActionBusy(false);
    }
  };

  const submitCreate = async (e) => {
    e.preventDefault();
    if (!canManage) return;
    if (!selectedSite) {
      setError("Select a client account first.");
      return;
    }
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!form.imageFile) {
      setError("Image or video is required.");
      return;
    }
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const fd = new FormData();
      fd.append("title", form.title.trim());
      fd.append("caption", form.caption || "");
      fd.append("selectedSite", selectedSite);
      fd.append("image", form.imageFile);
      if (form.scheduledFor) fd.append("scheduledFor", new Date(form.scheduledFor).toISOString());
      if (form.approveOnAssignment) fd.append("approveOnAssignment", "1");

      const res = await fetch("/api/admin/approvals", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create post");

      setSuccess("Post scheduled on the calendar.");
      setCreateOpen(false);
      setForm({
        title: "",
        caption: "",
        scheduledFor: toDatetimeLocalValue(selectedDay || new Date()),
        imageFile: null,
        approveOnAssignment: true,
      });
      await load();
    } catch (err) {
      setError(err.message || "Failed to create post");
    } finally {
      setSubmitting(false);
    }
  };

  const dayLabel = useMemo(() => formatDayLabel(selectedDay), [selectedDay]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Content Calendar</h1>
        <p className="mt-1 text-sm text-gray-500">
          {canManage
            ? "Plan, schedule, and manage posts for the selected client account."
            : "View upcoming scheduled posts and content pipeline."}
        </p>
      </div>

      {(error || success) && (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {error || success}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <CalendarView
          approvals={approvals}
          canManage={canManage}
          onDayClick={openDay}
          onPostClick={openPost}
        />
      </div>

      {/* Day detail modal */}
      {dayModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-lg my-auto max-h-[min(92vh,880px)] rounded-2xl bg-white shadow-xl border border-gray-200 flex flex-col overflow-hidden">
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Selected day
                </p>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2 mt-0.5">
                  <FiCalendar className="text-[#1d9c35] shrink-0" />
                  <span className="truncate">{dayLabel}</span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDayModalOpen(false)}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 shrink-0"
                aria-label="Close"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1 min-h-0">
              {dayPosts.length === 0 ? (
                <p className="text-sm text-gray-500 py-6 text-center">
                  No posts scheduled for this day.
                </p>
              ) : (
                dayPosts.map((post) => (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => openPost(post)}
                    className="w-full text-left rounded-xl border border-gray-200 px-3 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <FiClock className="w-3.5 h-3.5" />
                      {new Date(post.scheduledFor).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      <span className="ml-auto capitalize">{post.status}</span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-gray-900 truncate">
                      {post.userEditedTitle || post.title}
                    </p>
                  </button>
                ))
              )}
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex flex-wrap gap-2 justify-end bg-gray-50 shrink-0">
              <button
                type="button"
                onClick={() => setDayModalOpen(false)}
                className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              {canManage && (
                <button
                  type="button"
                  onClick={openCreateForDay}
                  className="px-4 py-2 text-sm font-semibold rounded-xl bg-black text-white hover:bg-gray-900"
                >
                  Schedule post
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Post actions modal */}
      {postModalOpen && activePost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-md my-auto max-h-[min(92vh,880px)] rounded-2xl bg-white shadow-xl border border-gray-200 flex flex-col overflow-hidden">
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Scheduled post
                </p>
                <h3 className="text-lg font-bold text-gray-900 truncate">
                  {activePost.userEditedTitle || activePost.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPostModalOpen(false);
                  setActivePost(null);
                }}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 shrink-0"
                aria-label="Close"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1 min-h-0">
              {activePost.imagePath && (
                <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                  <ApprovalMediaPreview src={activePost.imagePath} className="w-full max-h-48 object-cover" />
                </div>
              )}
              <p className="text-sm text-gray-600 whitespace-pre-wrap break-words">
                {activePost.userEditedCaption || activePost.caption || "No caption"}
              </p>
              <div className="text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  When:{" "}
                  {activePost.scheduledFor
                    ? new Date(activePost.scheduledFor).toLocaleString()
                    : "—"}
                </span>
                <span className="capitalize">Status: {activePost.status}</span>
                {activePost.publishStatus && (
                  <span className="capitalize">Publish: {activePost.publishStatus}</span>
                )}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex flex-wrap gap-2 justify-end bg-gray-50 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setPostModalOpen(false);
                  setActivePost(null);
                }}
                className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 bg-white text-gray-700"
              >
                Close
              </button>
              {canManage && activePost.publishStatus !== "published" && (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => unschedulePost(activePost)}
                  className="px-4 py-2 text-sm font-semibold rounded-xl border border-amber-200 bg-amber-50 text-amber-900 disabled:opacity-60"
                >
                  Take off calendar
                </button>
              )}
              {canManage && (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => deletePost(activePost)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl border border-red-200 bg-red-50 text-red-700 disabled:opacity-60"
                >
                  <FiTrash2 className="w-4 h-4" />
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create / schedule modal */}
      {createOpen && canManage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-lg my-auto max-h-[min(92vh,880px)] rounded-2xl bg-white shadow-xl border border-gray-200 flex flex-col overflow-hidden">
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  New scheduled post
                </p>
                <h3 className="text-lg font-bold text-gray-900 truncate">Schedule for {dayLabel}</h3>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 shrink-0"
                aria-label="Close"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={submitCreate} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
                {!selectedSite && (
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    Select a client account in the sidebar before scheduling.
                  </p>
                )}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Title</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0EFF2A]/30"
                    required
                    maxLength={255}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Caption</label>
                  <textarea
                    value={form.caption}
                    onChange={(e) => setForm((f) => ({ ...f, caption: e.target.value }))}
                    rows={3}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0EFF2A]/30 resize-y max-h-48"
                    maxLength={2000}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Schedule time
                  </label>
                  <input
                    type="datetime-local"
                    value={form.scheduledFor}
                    onChange={(e) => setForm((f) => ({ ...f, scheduledFor: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0EFF2A]/30"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Media</label>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                    onChange={(e) =>
                      setForm((f) => ({ ...f, imageFile: e.target.files?.[0] || null }))
                    }
                    className="w-full text-sm"
                    required
                  />
                </div>
                <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={form.approveOnAssignment}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, approveOnAssignment: e.target.checked }))
                    }
                    className="mt-0.5 h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">
                    <span className="font-semibold text-gray-900">Skip client approval</span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      Mark approved immediately so it can publish when scheduled.
                    </span>
                  </span>
                </label>
              </div>

              <div className="px-5 py-4 border-t border-gray-100 flex flex-wrap gap-2 justify-end bg-gray-50 shrink-0">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 bg-white text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !selectedSite}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-black text-white disabled:opacity-60"
                >
                  <FiImage className="w-4 h-4" />
                  {submitting ? "Scheduling…" : "Schedule post"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
