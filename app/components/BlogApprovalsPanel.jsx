"use client";

import { useCallback, useEffect, useState } from "react";
import { FiCheck, FiClock, FiX } from "react-icons/fi";
import BlogRichTextEditor from "./BlogRichTextEditor";
import HumanizeTextButton from "./HumanizeTextButton";

function toDatetimeLocalValue(date) {
  if (!date) return "";
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
  });
  const [busy, setBusy] = useState(false);

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

  const openBlog = (blog) => {
    const meta = blog.payload?.meta || {};
    setActiveId(blog.id);
    setDraft({
      editedTitle: blog.userEditedTitle || blog.title || "",
      editedExcerpt: blog.userEditedExcerpt ?? blog.excerpt ?? "",
      editedContent: blog.userEditedContent || blog.content || "",
      editedSlug: blog.userEditedSlug || blog.slug || "",
      scheduledFor: toDatetimeLocalValue(blog.scheduledFor),
      seoTitle: meta.seo_title || meta.yoast_title || "",
      metaDescription: meta.meta_description || meta.yoast_metadesc || "",
      focusKeyword: meta.focus_keyword || meta.yoast_focuskw || "",
    });
  };

  const act = async (id, action, extra = {}) => {
    setBusy(true);
    setError("");
    try {
      const body = { action, ...extra };
      if (draft.scheduledFor) body.scheduledFor = new Date(draft.scheduledFor).toISOString();
      if (action === "approve" || action === "edit") {
        body.editedTitle = draft.editedTitle;
        body.editedExcerpt = draft.editedExcerpt;
        body.editedContent = draft.editedContent;
        body.editedSlug = draft.editedSlug;
        body.seoTitle = draft.seoTitle;
        body.metaDescription = draft.metaDescription;
        body.focusKeyword = draft.focusKeyword;
      }
      const res = await fetch(`/api/blogs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");
      setActiveId(null);
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
      {error ? <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p> : null}
      {blogs.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center border border-dashed border-gray-200 rounded-xl">No blog posts awaiting review.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {blogs.map((blog) => (
            <div key={blog.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
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
                  <FiClock /> {new Date(blog.scheduledFor).toLocaleString()}
                </p>
              ) : null}
              {blog.excerpt ? <p className="text-sm text-gray-600 mt-2 line-clamp-2">{blog.excerpt}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => openBlog(blog)} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
                  Review
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-3">
            <h3 className="text-lg font-semibold text-gray-900">Review blog</h3>
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
              Publish schedule
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
              <button type="button" onClick={() => setActiveId(null)} className="px-3 py-2 rounded-lg border border-gray-200 text-sm">
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
