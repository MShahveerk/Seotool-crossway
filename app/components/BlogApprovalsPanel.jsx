"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { FiCheck, FiClock, FiImage, FiRefreshCw, FiSave, FiTrash2, FiUpload, FiX } from "react-icons/fi";
import {
  datetimeLocalToUtcIso,
  formatScheduleShort,
  timezoneShortLabel,
  toDatetimeLocalInTimezone,
} from "../../lib/timezone";
import BlogRichTextEditor from "./BlogRichTextEditor";
import HumanizeTextButton from "./HumanizeTextButton";

function statusBadge(status) {
  const map = {
    pending: "bg-amber-100 text-amber-900",
    approved: "bg-green-100 text-green-900",
    declined: "bg-red-100 text-red-900",
    edited: "bg-blue-100 text-blue-900",
  };
  return map[status] || "bg-gray-100 text-gray-700";
}

export default function BlogApprovalsPanel({ selectedSite = "" }) {
  const { data: session } = useSession();
  const canResend =
    session?.user?.role === "super_admin" || session?.user?.role === "smm";
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [imageMessage, setImageMessage] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [draft, setDraft] = useState({
    editedTitle: "",
    editedExcerpt: "",
    editedContent: "",
    editedSlug: "",
    scheduledFor: "",
    seoTitle: "",
    metaDescription: "",
    focusKeyword: "",
    featuredImageAlt: "",
  });
  const [featuredFile, setFeaturedFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = selectedSite ? `?site=${encodeURIComponent(selectedSite)}` : "";
      const res = await fetch(`/api/blogs${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load blogs");
      setBlogs(data.blogs || []);
    } catch (err) {
      setError(err.message);
      setBlogs([]);
    } finally {
      setLoading(false);
    }
  }, [selectedSite]);

  useEffect(() => {
    load();
  }, [load]);

  const activeBlog = useMemo(
    () => (activeId ? blogs.find((b) => b.id === activeId) || null : null),
    [activeId, blogs]
  );

  const [localPreviewUrl, setLocalPreviewUrl] = useState(null);

  useEffect(() => {
    if (!featuredFile) {
      setLocalPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(featuredFile);
    setLocalPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [featuredFile]);

  const featuredPreviewUrl = localPreviewUrl || activeBlog?.featuredImagePath || null;
  const originalAlt = activeBlog?.featuredImageAlt || "";
  const altChanged = draft.featuredImageAlt !== originalAlt;
  const canSaveImage = Boolean(featuredFile) || altChanged;

  const openBlog = (blog) => {
    const meta = blog.payload?.meta || {};
    setActiveId(blog.id);
    setFeaturedFile(null);
    setImageMessage("");
    setError("");
    setDraft({
      editedTitle: blog.userEditedTitle || blog.title || "",
      editedExcerpt: blog.userEditedExcerpt ?? blog.excerpt ?? "",
      editedContent: blog.userEditedContent || blog.content || "",
      editedSlug: blog.userEditedSlug || blog.slug || "",
      scheduledFor: toDatetimeLocalInTimezone(blog.scheduledFor),
      seoTitle: meta.seo_title || meta.yoast_title || "",
      metaDescription: meta.meta_description || meta.yoast_metadesc || "",
      focusKeyword: meta.focus_keyword || meta.yoast_focuskw || "",
      featuredImageAlt: blog.featuredImageAlt || "",
    });
  };

  const closeReview = () => {
    setActiveId(null);
    setFeaturedFile(null);
    setImageMessage("");
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this blog from the approval queue? A WordPress pull can re-import it later.")) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/blogs/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      if (activeId === id) closeReview();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const saveFeaturedImage = async () => {
    if (!activeId || !canSaveImage) return;
    setImageBusy(true);
    setError("");
    setImageMessage("");
    try {
      const fd = new FormData();
      fd.set("action", "save_image");
      fd.set("featuredImageAlt", draft.featuredImageAlt || "");
      if (featuredFile) fd.set("featuredImage", featuredFile);
      const res = await fetch(`/api/blogs/${activeId}`, { method: "PATCH", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save image");
      if (data.blog) {
        setBlogs((prev) => prev.map((b) => (b.id === data.blog.id ? data.blog : b)));
      }
      setFeaturedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setImageMessage("Featured image saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setImageBusy(false);
    }
  };

  const act = async (id, action, extra = {}) => {
    setBusy(true);
    setError("");
    try {
      const useForm =
        action === "approve" ||
        action === "edit" ||
        action === "resend_for_approval" ||
        Boolean(featuredFile);

      let res;
      if (useForm) {
        const fd = new FormData();
        fd.set("action", action);
        if (draft.scheduledFor) {
          const iso = datetimeLocalToUtcIso(draft.scheduledFor);
          if (iso) fd.set("scheduledFor", iso);
        }
        if (action === "approve" || action === "edit" || action === "resend_for_approval") {
          fd.set("editedTitle", draft.editedTitle);
          fd.set("editedExcerpt", draft.editedExcerpt);
          fd.set("editedContent", draft.editedContent);
          fd.set("editedSlug", draft.editedSlug);
          fd.set("seoTitle", draft.seoTitle);
          fd.set("metaDescription", draft.metaDescription);
          fd.set("focusKeyword", draft.focusKeyword);
          fd.set("featuredImageAlt", draft.featuredImageAlt);
          if (featuredFile) fd.set("featuredImage", featuredFile);
        }
        Object.entries(extra).forEach(([k, v]) => {
          if (v != null) fd.set(k, String(v));
        });
        res = await fetch(`/api/blogs/${id}`, { method: "PATCH", body: fd });
      } else {
        res = await fetch(`/api/blogs/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...extra }),
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");
      if (data.warning) setError(data.warning);
      closeReview();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const resendForApproval = async (id) => {
    if (
      !window.confirm(
        "Resend this blog for approval? Approvers will get a new email, and the status will return to pending."
      )
    ) {
      return;
    }
    if (activeId === id) {
      await act(id, "resend_for_approval");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/blogs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend_for_approval" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Resend failed");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="text-sm text-gray-500 py-8 text-center">Loading blog approvals…</p>;

  return (
    <div className="space-y-4">
      {error && !activeId ? (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      ) : null}
      {blogs.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center border border-dashed border-gray-200 rounded-xl">No blog posts awaiting review.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {blogs.map((blog) => (
            <div key={blog.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              {blog.featuredImagePath ? (
                <img
                  src={blog.featuredImagePath}
                  alt={blog.featuredImageAlt || blog.title}
                  className="w-full h-36 object-cover rounded-lg mb-3 border border-gray-100"
                  loading="lazy"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              ) : (
                <div className="w-full h-36 mb-3 rounded-lg border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center text-gray-400 text-xs gap-1.5">
                  <FiImage className="w-4 h-4" /> No featured image
                </div>
              )}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">Blog</p>
                  <h3 className="font-semibold text-gray-900">{blog.title}</h3>
                  <p className="text-xs text-gray-500 mt-1">{blog.siteLink}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-semibold ${statusBadge(blog.status)}`}>{blog.status}</span>
              </div>
              {blog.scheduledFor ? (
                <p className="text-xs text-gray-600 mt-2 flex items-center gap-1">
                  <FiClock /> {formatScheduleShort(blog.scheduledFor)}
                </p>
              ) : null}
              {blog.excerpt ? <p className="text-sm text-gray-600 mt-2 line-clamp-2">{blog.excerpt}</p> : null}
              {blog.status === "declined" && blog.publishError ? (
                <p className="text-xs text-red-700 mt-2 bg-red-50 border border-red-100 rounded-lg px-2 py-1.5">
                  Declined: {blog.publishError}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => openBlog(blog)} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
                  Review
                </button>
                {canResend && blog.status === "declined" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => resendForApproval(blog.id)}
                    className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                  >
                    <FiRefreshCw /> Resend for approval
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(blog.id)}
                  className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  <FiTrash2 /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-3">
            <h3 className="text-lg font-semibold text-gray-900">
              Review blog{activeBlog?.status === "declined" ? " (declined)" : ""}
            </h3>
            {activeBlog?.status === "declined" && activeBlog?.publishError ? (
              <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                Previous decline reason: {activeBlog.publishError}
              </p>
            ) : null}
            {error ? (
              <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
            ) : null}

            <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <FiImage className="w-4 h-4" /> Featured image
                </p>
                {featuredFile ? (
                  <span className="text-xs font-medium text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                    Unsaved: {featuredFile.name}
                  </span>
                ) : null}
              </div>

              {featuredPreviewUrl ? (
                <img
                  src={featuredPreviewUrl}
                  alt={draft.featuredImageAlt || activeBlog?.title || "Featured"}
                  className="w-full max-h-64 object-cover rounded-xl border border-gray-200 bg-white"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              ) : (
                <div className="w-full h-40 rounded-xl border border-gray-200 bg-white flex items-center justify-center text-gray-400 text-sm gap-2">
                  <FiImage className="w-5 h-5" /> No image yet — choose a file below
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  setFeaturedFile(e.target.files?.[0] || null);
                  setImageMessage("");
                }}
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold"
                >
                  <FiUpload /> {featuredPreviewUrl ? "Choose replacement image" : "Choose image"}
                </button>
                <button
                  type="button"
                  disabled={imageBusy || !canSaveImage}
                  onClick={saveFeaturedImage}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold disabled:opacity-40"
                >
                  <FiSave /> {imageBusy ? "Saving…" : "Save image"}
                </button>
                {featuredFile ? (
                  <button
                    type="button"
                    onClick={() => {
                      setFeaturedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700"
                  >
                    Clear selection
                  </button>
                ) : null}
              </div>

              <label className="block text-sm text-gray-700">
                Alt text
                <input
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
                  value={draft.featuredImageAlt}
                  onChange={(e) => {
                    setDraft((d) => ({ ...d, featuredImageAlt: e.target.value }));
                    setImageMessage("");
                  }}
                  placeholder="Describe the image for accessibility / SEO"
                />
              </label>

              {imageMessage ? (
                <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                  {imageMessage}
                </p>
              ) : (
                <p className="text-xs text-gray-500">
                  Choose an image, then click <span className="font-semibold">Save image</span> to store it on this blog (JPEG, PNG, WebP, or GIF, max 8&nbsp;MB).
                </p>
              )}
            </div>

            <label className="block text-sm">
              Title
              <input className="mt-1 w-full border rounded-lg px-3 py-2" value={draft.editedTitle} onChange={(e) => setDraft((d) => ({ ...d, editedTitle: e.target.value }))} />
            </label>
            <label className="block text-sm">
              Slug
              <input className="mt-1 w-full border rounded-lg px-3 py-2 font-mono" value={draft.editedSlug} onChange={(e) => setDraft((d) => ({ ...d, editedSlug: e.target.value }))} />
            </label>
            <label className="block text-sm">
              Excerpt
              <textarea className="mt-1 w-full border rounded-lg px-3 py-2 min-h-[64px]" value={draft.editedExcerpt} onChange={(e) => setDraft((d) => ({ ...d, editedExcerpt: e.target.value }))} />
            </label>
            <label className="block text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <span>Content</span>
                <HumanizeTextButton
                  type="blog"
                  text={draft.editedContent}
                  onHumanized={(html) => setDraft((d) => ({ ...d, editedContent: html }))}
                  disabled={busy}
                />
              </div>
              <div className="mt-1">
                <BlogRichTextEditor
                  value={draft.editedContent}
                  onChange={(html) => setDraft((d) => ({ ...d, editedContent: html }))}
                  minHeight={220}
                />
              </div>
            </label>
            <label className="block text-sm">
              Publish schedule ({timezoneShortLabel()})
              <input type="datetime-local" className="mt-1 border rounded-lg px-3 py-2" value={draft.scheduledFor} onChange={(e) => setDraft((d) => ({ ...d, scheduledFor: e.target.value }))} />
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <label className="block text-sm md:col-span-2">
                SEO title
                <input className="mt-1 w-full border rounded-lg px-3 py-2" value={draft.seoTitle} onChange={(e) => setDraft((d) => ({ ...d, seoTitle: e.target.value }))} />
              </label>
              <label className="block text-sm md:col-span-2">
                Meta description
                <textarea className="mt-1 w-full border rounded-lg px-3 py-2 min-h-[56px]" value={draft.metaDescription} onChange={(e) => setDraft((d) => ({ ...d, metaDescription: e.target.value }))} />
              </label>
              <label className="block text-sm">
                Focus keyword
                <input className="mt-1 w-full border rounded-lg px-3 py-2" value={draft.focusKeyword} onChange={(e) => setDraft((d) => ({ ...d, focusKeyword: e.target.value }))} />
              </label>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              {activeBlog?.status === "declined" ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act(activeId, "edit")}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-700 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    Save edits
                  </button>
                  {canResend ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => resendForApproval(activeId)}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold disabled:opacity-50"
                    >
                      <FiRefreshCw /> Resend for approval
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <button type="button" disabled={busy} onClick={() => act(activeId, "approve")} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-green-700 text-white text-sm font-semibold disabled:opacity-50">
                    <FiCheck /> Approve
                  </button>
                  <button type="button" disabled={busy} onClick={() => act(activeId, "edit")} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-700 text-white text-sm font-semibold disabled:opacity-50">
                    Save edits
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const reason = window.prompt("Reason for declining?");
                      if (reason) act(activeId, "decline", { declineReason: reason });
                    }}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-red-700 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    <FiX /> Decline
                  </button>
                </>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(activeId)}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-red-200 text-red-700 text-sm font-semibold hover:bg-red-50 disabled:opacity-50"
              >
                <FiTrash2 /> Delete
              </button>
              <button type="button" onClick={closeReview} className="px-3 py-2 rounded-lg border border-gray-200 text-sm">
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
