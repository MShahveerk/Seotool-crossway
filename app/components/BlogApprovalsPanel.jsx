"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import {
  FiCheck,
  FiClock,
  FiEye,
  FiImage,
  FiRefreshCw,
  FiSave,
  FiSearch,
  FiTrash2,
  FiUpload,
  FiX,
} from "react-icons/fi";
import {
  datetimeLocalToUtcIso,
  formatScheduleShort,
  timezoneShortLabel,
  toDatetimeLocalInTimezone,
} from "../../lib/timezone";
import BlogRichTextEditor from "./BlogRichTextEditor";
import HumanizeTextButton from "./HumanizeTextButton";
import EmptyState from "./ui-shared/EmptyState";
import { LoadingSpinner } from "./ui-shared/LoadingBlock";
import { publicMediaUrl } from "../../lib/publicMediaUrl";

/** Chrome sometimes caches a bad first paint — retry once with a bust, then hide. */
function onMediaImgError(e) {
  const el = e.currentTarget;
  if (!el || el.dataset.retried === "1") {
    if (el) el.style.visibility = "hidden";
    return;
  }
  el.dataset.retried = "1";
  const base = String(el.currentSrc || el.src || "").split("?")[0];
  if (!base || base.startsWith("blob:") || base.startsWith("data:")) {
    el.style.visibility = "hidden";
    return;
  }
  el.src = `${base}?v=${Date.now()}`;
}

const TABS = [
  { id: "content", label: "Content" },
  { id: "media", label: "Media" },
  { id: "seo", label: "SEO" },
  { id: "schedule", label: "Schedule" },
];

function statusMeta(status) {
  const map = {
    pending: { label: "Pending", className: "bg-amber-50 text-amber-900 ring-amber-200" },
    approved: { label: "Approved", className: "bg-emerald-50 text-emerald-900 ring-emerald-200" },
    declined: { label: "Declined", className: "bg-red-50 text-red-900 ring-red-200" },
    edited: { label: "Edited", className: "bg-sky-50 text-sky-900 ring-sky-200" },
  };
  return map[status] || { label: status || "Unknown", className: "bg-slate-50 text-slate-700 ring-slate-200" };
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function emptyDraft() {
  return {
    editedTitle: "",
    editedExcerpt: "",
    editedContent: "",
    editedSlug: "",
    scheduledFor: "",
    seoTitle: "",
    metaDescription: "",
    focusKeyword: "",
    featuredImageAlt: "",
  };
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
  const [draft, setDraft] = useState(emptyDraft);
  const [featuredFile, setFeaturedFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [tab, setTab] = useState("content");
  const [showPreview, setShowPreview] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [portalReady, setPortalReady] = useState(false);
  const [activeSnapshot, setActiveSnapshot] = useState(null);
  const fileInputRef = useRef(null);
  const closeReviewRef = useRef(() => {});

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (selectedSite) params.set("site", selectedSite);
      // open = pending/edited/declined; all includes approved; specific status chips pass through
      params.set("status", statusFilter || "open");
      const res = await fetch(`/api/blogs?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load blogs");
      setBlogs(data.blogs || []);
    } catch (err) {
      setError(err.message);
      setBlogs([]);
    } finally {
      setLoading(false);
    }
  }, [selectedSite, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const activeBlog = useMemo(() => {
    if (!activeId) return null;
    return blogs.find((b) => b.id === activeId) || activeSnapshot || null;
  }, [activeId, blogs, activeSnapshot]);

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

  useEffect(() => {
    if (!activeId) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      // Always allow Escape — approve/WP sync can take a while and must not trap the UI
      if (e.key === "Escape") closeReviewRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [activeId]);

  const featuredPreviewUrl =
    localPreviewUrl ||
    (activeBlog?.featuredImagePath
      ? publicMediaUrl(activeBlog.featuredImagePath, { bust: activeBlog.updatedAt || activeBlog.id })
      : null);
  const originalAlt = activeBlog?.featuredImageAlt || "";
  const altChanged = draft.featuredImageAlt !== originalAlt;
  const canSaveImage = Boolean(featuredFile) || altChanged;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Status filtering is done by the API; only search locally.
    if (!q) return blogs;
    return blogs.filter((blog) => {
      const hay = [
        blog.title,
        blog.userEditedTitle,
        blog.siteLink,
        blog.excerpt,
        blog.slug,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [blogs, query]);

  const openBlog = (blog) => {
    const meta = blog.payload?.meta || {};
    setActiveId(blog.id);
    setActiveSnapshot(blog);
    setTab("content");
    setShowPreview(true);
    setDeclineOpen(false);
    setDeclineReason("");
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
    setActiveSnapshot(null);
    setFeaturedFile(null);
    setImageMessage("");
    setDeclineOpen(false);
    setDeclineReason("");
    setBusy(false);
    setImageBusy(false);
    setDraft(emptyDraft());
  };
  closeReviewRef.current = closeReview;

  const remove = async (id) => {
    if (!window.confirm("Delete this blog from the approval queue? A WordPress pull can re-import it later.")) {
      return;
    }
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

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Action failed");

      // Close immediately so WP sync latency cannot trap the dialog
      const warning = data.warning || "";
      closeReview();
      if (action === "approve") {
        // Show the approved item in the Approved filter (triggers its own reload)
        setStatusFilter("approved");
      } else {
        void load();
      }
      if (warning) setError(warning);
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

  const submitDecline = async () => {
    const reason = declineReason.trim();
    if (!reason) {
      setError("Please enter a decline reason.");
      return;
    }
    await act(activeId, "decline", { declineReason: reason });
  };

  if (loading) {
    return <LoadingSpinner label="Loading blog approvals…" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, site, excerpt…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none ring-[#1d9c35]/30 focus:ring-2"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: "open", label: "Open" },
            { id: "pending", label: "Pending" },
            { id: "edited", label: "Edited" },
            { id: "declined", label: "Declined" },
            { id: "approved", label: "Approved" },
            { id: "all", label: "All" },
          ].map((s) => {
            const active = statusFilter === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setStatusFilter(s.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition ${
                  active
                    ? "bg-[#1d9c35] text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {s.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <FiRefreshCw /> Refresh
          </button>
        </div>
      </div>

      {error && !activeId ? (
        <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          icon={FiImage}
          title={blogs.length === 0 ? "No blog posts awaiting review" : "No matches"}
          description={
            blogs.length === 0
              ? "Pulled or assigned blogs will appear here for review."
              : "Try a different search or status filter."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <ul className="divide-y divide-slate-100">
            {filtered.map((blog) => {
              const meta = statusMeta(blog.status);
              const title = blog.userEditedTitle || blog.title || "Untitled";
              const excerpt = stripHtml(blog.userEditedExcerpt ?? blog.excerpt ?? "").slice(0, 140);
              return (
                <li key={blog.id}>
                  <button
                    type="button"
                    onClick={() => openBlog(blog)}
                    className="group flex w-full items-stretch gap-4 px-4 py-3.5 text-left transition hover:bg-slate-50/80 focus:bg-slate-50 focus:outline-none"
                  >
                    <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
                      {blog.featuredImagePath ? (
                        <img
                          src={publicMediaUrl(blog.featuredImagePath, {
                            bust: blog.updatedAt || blog.id,
                          })}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          onError={onMediaImgError}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                          <FiImage className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold text-slate-900 group-hover:text-[#167a2a]">
                            {title}
                          </h3>
                          <p className="mt-0.5 truncate text-xs text-slate-500">{blog.siteLink}</p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${meta.className}`}
                        >
                          {meta.label}
                        </span>
                      </div>
                      {excerpt ? (
                        <p className="mt-1.5 line-clamp-2 text-sm text-slate-600">{excerpt}</p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        {blog.scheduledFor ? (
                          <span className="inline-flex items-center gap-1">
                            <FiClock /> {formatScheduleShort(blog.scheduledFor)}
                          </span>
                        ) : (
                          <span>No schedule set</span>
                        )}
                        {blog.status === "declined" && blog.publishError ? (
                          <span className="text-red-600">Declined: {blog.publishError}</span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {portalReady && activeId && activeBlog
        ? createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="blog-review-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeReview();
          }}
        >
          <div className="flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden bg-white shadow-2xl sm:h-[min(92vh,920px)] sm:rounded-2xl sm:ring-1 sm:ring-black/10">
            {/* Header */}
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Blog review
                </p>
                <h2
                  id="blog-review-title"
                  className="mt-0.5 truncate text-lg font-semibold text-slate-900"
                >
                  {draft.editedTitle || activeBlog.title || "Untitled"}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{activeBlog.siteLink}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 font-semibold ring-1 ${statusMeta(activeBlog.status).className}`}
                  >
                    {statusMeta(activeBlog.status).label}
                  </span>
                  {activeBlog.scheduledFor ? (
                    <span className="inline-flex items-center gap-1">
                      <FiClock /> {formatScheduleShort(activeBlog.scheduledFor)}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPreview((v) => !v)}
                  className={`hidden items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold sm:inline-flex ${
                    showPreview
                      ? "border-[#1d9c35]/40 bg-emerald-50 text-emerald-900"
                      : "border-slate-200 text-slate-600"
                  }`}
                >
                  <FiEye /> Preview
                </button>
                <button
                  type="button"
                  onClick={closeReview}
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                  aria-label="Close"
                >
                  <FiX className="h-4 w-4" />
                </button>
              </div>
            </header>

            {/* Tabs */}
            <div className="shrink-0 border-b border-slate-200 px-4 sm:px-5">
              <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Review sections">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold transition ${
                      tab === t.id
                        ? "border-[#1d9c35] text-[#167a2a]"
                        : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>
            </div>

            {error ? (
              <p className="shrink-0 border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700 sm:px-5">
                {error}
              </p>
            ) : null}
            {activeBlog.status === "declined" && activeBlog.publishError ? (
              <p className="shrink-0 border-b border-amber-100 bg-amber-50 px-4 py-2 text-sm text-amber-900 sm:px-5">
                Previous decline reason: {activeBlog.publishError}
              </p>
            ) : null}

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-hidden">
              <div
                className={`grid h-full min-h-0 ${
                  showPreview ? "lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]" : "grid-cols-1"
                }`}
              >
                <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-5">
                  {tab === "content" ? (
                    <div className="space-y-4">
                      <label className="block text-sm font-medium text-slate-700">
                        Title
                        <input
                          className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#1d9c35] focus:ring-2 focus:ring-[#1d9c35]/20"
                          value={draft.editedTitle}
                          onChange={(e) => setDraft((d) => ({ ...d, editedTitle: e.target.value }))}
                        />
                      </label>
                      <label className="block text-sm font-medium text-slate-700">
                        Slug
                        <input
                          className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-sm outline-none focus:border-[#1d9c35] focus:ring-2 focus:ring-[#1d9c35]/20"
                          value={draft.editedSlug}
                          onChange={(e) => setDraft((d) => ({ ...d, editedSlug: e.target.value }))}
                        />
                      </label>
                      <label className="block text-sm font-medium text-slate-700">
                        Excerpt
                        <textarea
                          className="mt-1.5 min-h-[72px] w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#1d9c35] focus:ring-2 focus:ring-[#1d9c35]/20"
                          value={draft.editedExcerpt}
                          onChange={(e) => setDraft((d) => ({ ...d, editedExcerpt: e.target.value }))}
                        />
                      </label>
                      <div>
                        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-medium text-slate-700">Content</span>
                          <HumanizeTextButton
                            type="blog"
                            text={draft.editedContent}
                            onHumanized={(html) => setDraft((d) => ({ ...d, editedContent: html }))}
                            disabled={busy}
                          />
                        </div>
                        <BlogRichTextEditor
                          value={draft.editedContent}
                          onChange={(html) => setDraft((d) => ({ ...d, editedContent: html }))}
                          minHeight={280}
                        />
                      </div>
                    </div>
                  ) : null}

                  {tab === "media" ? (
                    <div className="space-y-4">
                      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                        {featuredPreviewUrl ? (
                          <img
                            src={featuredPreviewUrl}
                            alt={draft.featuredImageAlt || activeBlog.title || "Featured"}
                            className="max-h-80 w-full object-cover"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            onError={onMediaImgError}
                          />
                        ) : (
                          <div className="flex h-52 items-center justify-center gap-2 text-sm text-slate-400">
                            <FiImage className="h-5 w-5" /> No featured image yet
                          </div>
                        )}
                      </div>

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
                          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white"
                        >
                          <FiUpload /> {featuredPreviewUrl ? "Replace image" : "Choose image"}
                        </button>
                        <button
                          type="button"
                          disabled={imageBusy || !canSaveImage}
                          onClick={saveFeaturedImage}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40"
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
                            className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-700"
                          >
                            Clear selection
                          </button>
                        ) : null}
                      </div>

                      {featuredFile ? (
                        <p className="text-xs font-medium text-amber-800">
                          Unsaved selection: {featuredFile.name}
                        </p>
                      ) : null}

                      <label className="block text-sm font-medium text-slate-700">
                        Alt text
                        <input
                          className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#1d9c35] focus:ring-2 focus:ring-[#1d9c35]/20"
                          value={draft.featuredImageAlt}
                          onChange={(e) => {
                            setDraft((d) => ({ ...d, featuredImageAlt: e.target.value }));
                            setImageMessage("");
                          }}
                          placeholder="Describe the image for accessibility / SEO"
                        />
                      </label>

                      {imageMessage ? (
                        <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                          {imageMessage}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500">
                          JPEG, PNG, WebP, or GIF — max 8&nbsp;MB. Click Save image after choosing a file.
                        </p>
                      )}
                    </div>
                  ) : null}

                  {tab === "seo" ? (
                    <div className="space-y-4">
                      <label className="block text-sm font-medium text-slate-700">
                        SEO title
                        <input
                          className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#1d9c35] focus:ring-2 focus:ring-[#1d9c35]/20"
                          value={draft.seoTitle}
                          onChange={(e) => setDraft((d) => ({ ...d, seoTitle: e.target.value }))}
                        />
                      </label>
                      <label className="block text-sm font-medium text-slate-700">
                        Meta description
                        <textarea
                          className="mt-1.5 min-h-[96px] w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#1d9c35] focus:ring-2 focus:ring-[#1d9c35]/20"
                          value={draft.metaDescription}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, metaDescription: e.target.value }))
                          }
                        />
                      </label>
                      <label className="block text-sm font-medium text-slate-700">
                        Focus keyword
                        <input
                          className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#1d9c35] focus:ring-2 focus:ring-[#1d9c35]/20"
                          value={draft.focusKeyword}
                          onChange={(e) => setDraft((d) => ({ ...d, focusKeyword: e.target.value }))}
                        />
                      </label>
                    </div>
                  ) : null}

                  {tab === "schedule" ? (
                    <div className="space-y-4">
                      <label className="block text-sm font-medium text-slate-700">
                        Publish schedule ({timezoneShortLabel()})
                        <input
                          type="datetime-local"
                          className="mt-1.5 w-full max-w-sm rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#1d9c35] focus:ring-2 focus:ring-[#1d9c35]/20"
                          value={draft.scheduledFor}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, scheduledFor: e.target.value }))
                          }
                        />
                      </label>
                      <p className="max-w-lg text-sm leading-relaxed text-slate-500">
                        Approving with a future time syncs that schedule to WordPress. If the time is
                        already due, admins publish live immediately.
                      </p>
                    </div>
                  ) : null}
                </div>

                {showPreview ? (
                  <aside className="hidden min-h-0 overflow-y-auto border-l border-slate-200 bg-[linear-gradient(180deg,#f8faf8_0%,#f1f5f2_100%)] lg:block">
                    <div className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/80 px-4 py-2.5 backdrop-blur">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Live preview
                      </p>
                    </div>
                    <article className="space-y-4 px-5 py-5">
                      {featuredPreviewUrl ? (
                        <img
                          src={featuredPreviewUrl}
                          alt=""
                          className="aspect-[16/9] w-full rounded-xl object-cover ring-1 ring-slate-200"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          onError={onMediaImgError}
                        />
                      ) : null}
                      <h3 className="text-2xl font-semibold tracking-tight text-slate-900">
                        {draft.editedTitle || "Untitled"}
                      </h3>
                      {draft.editedExcerpt ? (
                        <p className="text-sm leading-relaxed text-slate-600">{draft.editedExcerpt}</p>
                      ) : null}
                      <div
                        className="prose prose-sm max-w-none text-slate-800 prose-a:text-[#1d9c35] prose-headings:text-slate-900"
                        dangerouslySetInnerHTML={{
                          __html: draft.editedContent || "<p><em>No content yet.</em></p>",
                        }}
                      />
                    </article>
                  </aside>
                ) : null}
              </div>
            </div>

            {/* Decline inline */}
            {declineOpen ? (
              <div className="shrink-0 border-t border-red-100 bg-red-50 px-4 py-3 sm:px-5">
                <label className="block text-sm font-medium text-red-900">
                  Decline reason
                  <textarea
                    className="mt-1.5 min-h-[72px] w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-200"
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    placeholder="Tell the team what needs to change…"
                    autoFocus
                  />
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={submitDecline}
                    className="rounded-xl bg-red-700 px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Confirm decline
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeclineOpen(false);
                      setDeclineReason("");
                    }}
                    className="rounded-xl border border-red-200 bg-white px-3.5 py-2 text-sm font-semibold text-red-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {/* Actions */}
            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(activeId)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  <FiTrash2 /> Delete
                </button>
                {canResend && activeBlog.status === "declined" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => resendForApproval(activeId)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 disabled:opacity-50"
                  >
                    <FiRefreshCw /> Resend for approval
                  </button>
                ) : null}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={closeReview}
                  className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act(activeId, "edit")}
                  className="rounded-xl bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Save edits
                </button>
                {["pending", "edited"].includes(activeBlog.status) ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setDeclineOpen(true)}
                      className="rounded-xl border border-red-200 px-3.5 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => act(activeId, "approve")}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#1d9c35] px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      <FiCheck /> {busy ? "Approving…" : "Approve"}
                    </button>
                  </>
                ) : null}
              </div>
            </footer>
          </div>
        </div>,
        document.body
        )
        : null}
    </div>
  );
}
