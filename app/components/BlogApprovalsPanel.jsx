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
import BackupImageSwitcher from "./BackupImageSwitcher";

/** Chrome sometimes caches a bad first paint — retry once with a bust, then hide. */
function onMediaImgError(e) {
  const el = e.currentTarget;
  if (!el) return;
  // Retry once with cache-bust; keep element visible so Chrome can recover after ORB.
  if (el.dataset.retried === "1") {
    el.alt = "Image unavailable";
    return;
  }
  el.dataset.retried = "1";
  const base = String(el.currentSrc || el.src || "").split("?")[0];
  if (!base || base.startsWith("blob:") || base.startsWith("data:")) return;
  el.src = `${base}?_cb=${Date.now()}`;
}

const TABS = [
  { id: "content", label: "Content" },
  { id: "media", label: "Media" },
  { id: "seo", label: "SEO" },
  { id: "schedule", label: "Schedule" },
];

/* Status pills: the accent tinted into the card surface. Written out in full
   because Tailwind only emits classes it can read literally in the source. */
function statusMeta(status) {
  const map = {
    pending: {
      label: "Pending",
      className:
        "bg-[color-mix(in_srgb,var(--cw-caution)_14%,var(--cw-surface))] text-[var(--cw-caution)] ring-[color-mix(in_srgb,var(--cw-caution)_35%,var(--cw-hairline))]",
    },
    approved: {
      label: "Approved",
      className:
        "bg-[color-mix(in_srgb,var(--cw-neon)_14%,var(--cw-surface))] text-[var(--cw-neon)] ring-[color-mix(in_srgb,var(--cw-neon)_35%,var(--cw-hairline))]",
    },
    declined: {
      label: "Declined",
      className:
        "bg-[color-mix(in_srgb,var(--cw-danger)_14%,var(--cw-surface))] text-[var(--cw-danger)] ring-[color-mix(in_srgb,var(--cw-danger)_35%,var(--cw-hairline))]",
    },
    edited: {
      label: "Edited",
      className:
        "bg-[color-mix(in_srgb,var(--cw-info)_14%,var(--cw-surface))] text-[var(--cw-info)] ring-[color-mix(in_srgb,var(--cw-info)_35%,var(--cw-hairline))]",
    },
  };
  return (
    map[status] || {
      label: status || "Unknown",
      className: "bg-[var(--cw-raised)] text-[var(--cw-ink-muted)] ring-[var(--cw-hairline)]",
    }
  );
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
  const [declineTarget, setDeclineTarget] = useState("both");
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

  const blogHandoffDone = useRef(false);
  const handoffIdRef = useRef("");
  useEffect(() => {
    if (loading || blogHandoffDone.current) return undefined;
    let id = handoffIdRef.current;
    if (!id) {
      try {
        id = sessionStorage.getItem("cw:openBlogId") || "";
        if (id) sessionStorage.removeItem("cw:openBlogId");
      } catch {
        id = "";
      }
      if (!id && typeof window !== "undefined") {
        id = new URLSearchParams(window.location.search).get("blog") || "";
      }
      handoffIdRef.current = id;
    }
    if (!id) {
      blogHandoffDone.current = true;
      return undefined;
    }
    const hit = blogs.find((b) => b.id === id);
    if (hit) {
      blogHandoffDone.current = true;
      openBlog(hit);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/blogs/${encodeURIComponent(id)}`);
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.blog) {
          blogHandoffDone.current = true;
          openBlog(data.blog);
          return;
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) blogHandoffDone.current = true;
    })();
    return () => {
      cancelled = true;
    };
    // one-shot deep link from Compass / URL
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, blogs]);

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
    await act(activeId, "decline", { declineReason: reason, revisionTarget: declineTarget });
  };

  if (loading) {
    return <LoadingSpinner label="Loading blog approvals…" />;
  }

  return (
    <div className="space-y-4" data-guide="approve-queue">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cw-ink-faint)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, site, excerpt…"
            className="w-full rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] py-2.5 pl-9 pr-3 text-sm text-[var(--cw-ink)] outline-none ring-[color-mix(in_srgb,var(--cw-neon)_30%,transparent)] placeholder:text-[var(--cw-ink-faint)] focus:ring-2"
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
                    ? "bg-[var(--cw-neon)] text-[var(--cw-neon-ink)]"
                    : "bg-[var(--cw-raised)] text-[var(--cw-ink-muted)] hover:bg-[var(--cw-overlay)]"
                }`}
              >
                {s.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--cw-hairline)] bg-[var(--cw-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--cw-ink-dim)] hover:bg-[var(--cw-overlay)]"
          >
            <FiRefreshCw /> Refresh
          </button>
        </div>
      </div>

      {error && !activeId ? (
        <p className="rounded-xl border border-[color-mix(in_srgb,var(--cw-danger)_35%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-danger)_10%,var(--cw-surface))] px-3 py-2 text-sm text-[var(--cw-danger)]">
          {error}
        </p>
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
        <div className="overflow-hidden rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)]">
          <ul className="divide-y divide-[var(--cw-hairline)]">
            {filtered.map((blog, index) => {
              const meta = statusMeta(blog.status);
              const title = blog.userEditedTitle || blog.title || "Untitled";
              const excerpt = stripHtml(blog.userEditedExcerpt ?? blog.excerpt ?? "").slice(0, 140);
              return (
                <li key={blog.id}>
                  <button
                    type="button"
                    onClick={() => openBlog(blog)}
                    data-guide={index === 0 ? "approve-actions" : undefined}
                    className="group flex w-full items-stretch gap-4 px-4 py-3.5 text-left transition hover:bg-[var(--cw-raised)] focus:bg-[var(--cw-raised)] focus:outline-none"
                  >
                    <div
                      className="relative h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-[var(--cw-canvas)] ring-1 ring-[var(--cw-hairline)]"
                      data-guide={index === 0 ? "approve-preview" : undefined}
                    >
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
                        <div className="flex h-full w-full items-center justify-center text-[var(--cw-ink-faint)]">
                          <FiImage className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold text-[var(--cw-ink)] group-hover:text-[var(--cw-neon)]">
                            {title}
                          </h3>
                          <p className="mt-0.5 truncate text-xs text-[var(--cw-ink-faint)]">{blog.siteLink}</p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${meta.className}`}
                        >
                          {meta.label}
                        </span>
                      </div>
                      {excerpt ? (
                        <p className="mt-1.5 line-clamp-2 text-sm text-[var(--cw-ink-muted)]">{excerpt}</p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--cw-ink-faint)]">
                        {blog.scheduledFor ? (
                          <span className="inline-flex items-center gap-1">
                            <FiClock /> {formatScheduleShort(blog.scheduledFor)}
                          </span>
                        ) : (
                          <span>No schedule set</span>
                        )}
                        {blog.status === "declined" && blog.publishError ? (
                          <span className="text-[var(--cw-danger)]">Declined: {blog.publishError}</span>
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
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="blog-review-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeReview();
          }}
        >
          <div className="flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden bg-[var(--cw-surface)] shadow-[var(--cw-shadow-lg)] sm:h-[min(92vh,920px)] sm:rounded-2xl sm:ring-1 sm:ring-[var(--cw-hairline)]">
            {/* Header */}
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--cw-hairline)] px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--cw-ink-faint)]">
                  Blog review
                </p>
                <h2
                  id="blog-review-title"
                  className="mt-0.5 truncate text-lg font-semibold text-[var(--cw-ink)]"
                >
                  {draft.editedTitle || activeBlog.title || "Untitled"}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--cw-ink-faint)]">
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
                      ? "border-[color-mix(in_srgb,var(--cw-neon)_40%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-neon)_12%,var(--cw-surface))] text-[var(--cw-neon)]"
                      : "border-[var(--cw-hairline)] text-[var(--cw-ink-muted)] hover:bg-[var(--cw-overlay)]"
                  }`}
                >
                  <FiEye /> Preview
                </button>
                <button
                  type="button"
                  onClick={closeReview}
                  className="rounded-lg border border-[var(--cw-hairline)] p-2 text-[var(--cw-ink-muted)] hover:bg-[var(--cw-overlay)]"
                  aria-label="Close"
                >
                  <FiX className="h-4 w-4" />
                </button>
              </div>
            </header>

            {/* Tabs */}
            <div className="shrink-0 border-b border-[var(--cw-hairline)] px-4 sm:px-5">
              <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Review sections">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold transition ${
                      tab === t.id
                        ? "border-[var(--cw-neon)] text-[var(--cw-neon)]"
                        : "border-transparent text-[var(--cw-ink-muted)] hover:text-[var(--cw-ink)]"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>
            </div>

            {error ? (
              <p className="shrink-0 border-b border-[color-mix(in_srgb,var(--cw-danger)_35%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-danger)_10%,var(--cw-surface))] px-4 py-2 text-sm text-[var(--cw-danger)] sm:px-5">
                {error}
              </p>
            ) : null}
            {activeBlog.status === "declined" && activeBlog.publishError ? (
              <p className="shrink-0 border-b border-[color-mix(in_srgb,var(--cw-caution)_35%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-caution)_10%,var(--cw-surface))] px-4 py-2 text-sm text-[var(--cw-caution)] sm:px-5">
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
                      <label className="block text-sm font-medium text-[var(--cw-ink-dim)]">
                        Title
                        <input
                          className="mt-1.5 w-full rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-2.5 text-sm text-[var(--cw-ink)] outline-none placeholder:text-[var(--cw-ink-faint)] focus:border-[var(--cw-neon)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--cw-neon)_28%,transparent)]"
                          value={draft.editedTitle}
                          onChange={(e) => setDraft((d) => ({ ...d, editedTitle: e.target.value }))}
                        />
                      </label>
                      <label className="block text-sm font-medium text-[var(--cw-ink-dim)]">
                        Slug
                        <input
                          className="mt-1.5 w-full rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-2.5 font-mono text-sm text-[var(--cw-ink)] outline-none placeholder:text-[var(--cw-ink-faint)] focus:border-[var(--cw-neon)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--cw-neon)_28%,transparent)]"
                          value={draft.editedSlug}
                          onChange={(e) => setDraft((d) => ({ ...d, editedSlug: e.target.value }))}
                        />
                      </label>
                      <label className="block text-sm font-medium text-[var(--cw-ink-dim)]">
                        Excerpt
                        <textarea
                          className="mt-1.5 min-h-[72px] w-full rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-2.5 text-sm text-[var(--cw-ink)] outline-none placeholder:text-[var(--cw-ink-faint)] focus:border-[var(--cw-neon)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--cw-neon)_28%,transparent)]"
                          value={draft.editedExcerpt}
                          onChange={(e) => setDraft((d) => ({ ...d, editedExcerpt: e.target.value }))}
                        />
                      </label>
                      <div>
                        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-medium text-[var(--cw-ink-dim)]">Content</span>
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
                      {["pending", "edited"].includes(String(activeBlog?.status || "")) &&
                      (activeBlog?.featuredImagePath ||
                        (Array.isArray(activeBlog?.backupImagePaths) &&
                          activeBlog.backupImagePaths.length)) ? (
                        <BackupImageSwitcher
                          primaryPath={activeBlog.featuredImagePath}
                          backupPaths={activeBlog.backupImagePaths}
                          alt={draft.featuredImageAlt || activeBlog.title || "Featured"}
                          onPromote={async (idx) => {
                            try {
                              const res = await fetch(`/api/blogs/${activeBlog.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  action: "promote_backup",
                                  backupIndex: idx,
                                }),
                              });
                              const data = await res.json();
                              if (!res.ok) throw new Error(data.error || "Failed to switch image");
                              setActiveBlog(data.blog);
                              setBlogs((prev) =>
                                prev.map((b) => (b.id === data.blog.id ? { ...b, ...data.blog } : b))
                              );
                              setImageMessage("Primary featured image updated.");
                            } catch (err) {
                              setImageMessage(err.message || "Failed to switch image");
                            }
                          }}
                        />
                      ) : (
                        <div className="overflow-hidden rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-canvas)]">
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
                            <div className="flex h-52 items-center justify-center gap-2 text-sm text-[var(--cw-ink-faint)]">
                              <FiImage className="h-5 w-5" /> No featured image yet
                            </div>
                          )}
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
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3.5 py-2 text-sm font-semibold text-[var(--cw-ink)] hover:bg-[var(--cw-overlay)]"
                        >
                          <FiUpload /> {featuredPreviewUrl ? "Replace image" : "Choose image"}
                        </button>
                        <button
                          type="button"
                          disabled={imageBusy || !canSaveImage}
                          onClick={saveFeaturedImage}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--cw-neon)] px-3.5 py-2 text-sm font-semibold text-[var(--cw-neon-ink)] hover:bg-[var(--cw-neon-deep)] disabled:opacity-40"
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
                            className="rounded-xl border border-[var(--cw-hairline)] px-3.5 py-2 text-sm text-[var(--cw-ink-dim)] hover:bg-[var(--cw-overlay)]"
                          >
                            Clear selection
                          </button>
                        ) : null}
                      </div>

                      {featuredFile ? (
                        <p className="text-xs font-medium text-[var(--cw-caution)]">
                          Unsaved selection: {featuredFile.name}
                        </p>
                      ) : null}

                      <label className="block text-sm font-medium text-[var(--cw-ink-dim)]">
                        Alt text
                        <input
                          className="mt-1.5 w-full rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-2.5 text-sm text-[var(--cw-ink)] outline-none placeholder:text-[var(--cw-ink-faint)] focus:border-[var(--cw-neon)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--cw-neon)_28%,transparent)]"
                          value={draft.featuredImageAlt}
                          onChange={(e) => {
                            setDraft((d) => ({ ...d, featuredImageAlt: e.target.value }));
                            setImageMessage("");
                          }}
                          placeholder="Describe the image for accessibility / SEO"
                        />
                      </label>

                      {imageMessage ? (
                        <p className="rounded-xl border border-[color-mix(in_srgb,var(--cw-neon)_35%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-neon)_9%,var(--cw-surface))] px-3 py-2 text-sm text-[var(--cw-neon)]">
                          {imageMessage}
                        </p>
                      ) : (
                        <p className="text-xs text-[var(--cw-ink-faint)]">
                          JPEG, PNG, WebP, or GIF — max 8&nbsp;MB. Click Save image after choosing a file.
                        </p>
                      )}
                    </div>
                  ) : null}

                  {tab === "seo" ? (
                    <div className="space-y-4">
                      <label className="block text-sm font-medium text-[var(--cw-ink-dim)]">
                        SEO title
                        <input
                          className="mt-1.5 w-full rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-2.5 text-sm text-[var(--cw-ink)] outline-none placeholder:text-[var(--cw-ink-faint)] focus:border-[var(--cw-neon)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--cw-neon)_28%,transparent)]"
                          value={draft.seoTitle}
                          onChange={(e) => setDraft((d) => ({ ...d, seoTitle: e.target.value }))}
                        />
                      </label>
                      <label className="block text-sm font-medium text-[var(--cw-ink-dim)]">
                        Meta description
                        <textarea
                          className="mt-1.5 min-h-[96px] w-full rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-2.5 text-sm text-[var(--cw-ink)] outline-none placeholder:text-[var(--cw-ink-faint)] focus:border-[var(--cw-neon)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--cw-neon)_28%,transparent)]"
                          value={draft.metaDescription}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, metaDescription: e.target.value }))
                          }
                        />
                      </label>
                      <label className="block text-sm font-medium text-[var(--cw-ink-dim)]">
                        Focus keyword
                        <input
                          className="mt-1.5 w-full rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-2.5 text-sm text-[var(--cw-ink)] outline-none placeholder:text-[var(--cw-ink-faint)] focus:border-[var(--cw-neon)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--cw-neon)_28%,transparent)]"
                          value={draft.focusKeyword}
                          onChange={(e) => setDraft((d) => ({ ...d, focusKeyword: e.target.value }))}
                        />
                      </label>
                    </div>
                  ) : null}

                  {tab === "schedule" ? (
                    <div className="space-y-4">
                      <label className="block text-sm font-medium text-[var(--cw-ink-dim)]">
                        Publish schedule ({timezoneShortLabel()})
                        <input
                          type="datetime-local"
                          className="mt-1.5 w-full max-w-sm rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-2.5 text-sm text-[var(--cw-ink)] outline-none placeholder:text-[var(--cw-ink-faint)] focus:border-[var(--cw-neon)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--cw-neon)_28%,transparent)]"
                          value={draft.scheduledFor}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, scheduledFor: e.target.value }))
                          }
                        />
                      </label>
                      <p className="max-w-lg text-sm leading-relaxed text-[var(--cw-ink-muted)]">
                        Approving with a future time syncs that schedule to WordPress. If the time is
                        already due, admins publish live immediately.
                      </p>
                    </div>
                  ) : null}
                </div>

                {showPreview ? (
                  <aside className="hidden min-h-0 overflow-y-auto border-l border-[var(--cw-hairline)] bg-[var(--cw-canvas)] lg:block">
                    <div className="sticky top-0 z-10 border-b border-[var(--cw-hairline)] bg-[color-mix(in_srgb,var(--cw-surface)_88%,transparent)] px-4 py-2.5 backdrop-blur">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--cw-ink-faint)]">
                        Live preview
                      </p>
                    </div>
                    <article className="space-y-4 px-5 py-5">
                      {featuredPreviewUrl ? (
                        <img
                          src={featuredPreviewUrl}
                          alt=""
                          className="aspect-[16/9] w-full rounded-xl object-cover ring-1 ring-[var(--cw-hairline)]"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          onError={onMediaImgError}
                        />
                      ) : null}
                      <h3 className="font-heading text-2xl font-semibold tracking-tight text-[var(--cw-ink)]">
                        {draft.editedTitle || "Untitled"}
                      </h3>
                      {draft.editedExcerpt ? (
                        <p className="text-sm leading-relaxed text-[var(--cw-ink-muted)]">
                          {draft.editedExcerpt}
                        </p>
                      ) : null}
                      <div
                        className="prose prose-sm prose-invert max-w-none prose-headings:font-heading prose-headings:text-[var(--cw-ink)] prose-p:text-[var(--cw-ink-dim)] prose-li:text-[var(--cw-ink-dim)] prose-strong:text-[var(--cw-ink)] prose-a:text-[var(--cw-neon)] prose-a:no-underline hover:prose-a:underline prose-img:rounded-lg prose-hr:border-[var(--cw-hairline)] prose-blockquote:border-l-[var(--cw-neon)] prose-blockquote:text-[var(--cw-ink-muted)]"
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
              <div className="shrink-0 border-t border-[color-mix(in_srgb,var(--cw-danger)_35%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-danger)_10%,var(--cw-surface))] px-4 py-3 sm:px-5">
                <label className="block text-sm font-medium text-[var(--cw-danger)]">
                  Decline reason
                  <textarea
                    className="mt-1.5 min-h-[72px] w-full rounded-xl border border-[color-mix(in_srgb,var(--cw-danger)_35%,var(--cw-hairline))] bg-[var(--cw-raised)] px-3 py-2 text-sm text-[var(--cw-ink)] outline-none placeholder:text-[var(--cw-ink-faint)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--cw-danger)_30%,transparent)]"
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    placeholder="Tell the writer exactly what to change — it rewrites automatically…"
                    autoFocus
                  />
                </label>
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--cw-danger)]">
                    Route this feedback to
                  </p>
                  <div className="mt-1.5 grid grid-cols-3 gap-2">
                    {[
                      { id: "text", label: "Wording", hint: "text only" },
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
                              ? "border-[var(--cw-danger)] bg-[var(--cw-danger)] text-[#2b0808] shadow-sm"
                              : "border-[color-mix(in_srgb,var(--cw-danger)_35%,var(--cw-hairline))] bg-[var(--cw-raised)] text-[var(--cw-danger)] hover:border-[var(--cw-danger)]"
                          }`}
                        >
                          {opt.label}
                          <span
                            className={`block text-[0.68rem] font-medium ${
                              active ? "text-[#2b0808]/75" : "text-[var(--cw-ink-muted)]"
                            }`}
                          >
                            {opt.hint}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--cw-ink-muted)]">
                    The writer rewrites the copy, the image agent regenerates the visual, or both —
                    a fresh draft is queued automatically.
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={submitDecline}
                    className="rounded-xl bg-[var(--cw-danger)] px-3.5 py-2 text-sm font-semibold text-[#2b0808] disabled:opacity-50"
                  >
                    Confirm decline
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeclineOpen(false);
                      setDeclineReason("");
                      setDeclineTarget("both");
                    }}
                    className="rounded-xl border border-[color-mix(in_srgb,var(--cw-danger)_35%,var(--cw-hairline))] bg-[var(--cw-raised)] px-3.5 py-2 text-sm font-semibold text-[var(--cw-danger)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {/* Actions */}
            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--cw-hairline)] bg-[var(--cw-surface)] px-4 py-3 sm:px-5">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(activeId)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[color-mix(in_srgb,var(--cw-danger)_35%,var(--cw-hairline))] px-3 py-2 text-sm font-semibold text-[var(--cw-danger)] hover:bg-[color-mix(in_srgb,var(--cw-danger)_14%,var(--cw-surface))] disabled:opacity-50"
                >
                  <FiTrash2 /> Delete
                </button>
                {canResend && activeBlog.status === "declined" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => resendForApproval(activeId)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[color-mix(in_srgb,var(--cw-caution)_40%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-caution)_12%,var(--cw-surface))] px-3 py-2 text-sm font-semibold text-[var(--cw-caution)] disabled:opacity-50"
                  >
                    <FiRefreshCw /> Resend for approval
                  </button>
                ) : null}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={closeReview}
                  className="rounded-xl border border-[var(--cw-hairline)] px-3.5 py-2 text-sm font-semibold text-[var(--cw-ink-dim)] hover:bg-[var(--cw-overlay)]"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act(activeId, "edit")}
                  className="rounded-xl border border-[var(--cw-hairline-strong)] bg-[var(--cw-raised)] px-3.5 py-2 text-sm font-semibold text-[var(--cw-ink)] hover:bg-[var(--cw-overlay)] disabled:opacity-50"
                >
                  Save edits
                </button>
                {["pending", "edited"].includes(activeBlog.status) ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setDeclineOpen(true)}
                      className="rounded-xl border border-[color-mix(in_srgb,var(--cw-danger)_35%,var(--cw-hairline))] px-3.5 py-2 text-sm font-semibold text-[var(--cw-danger)] hover:bg-[color-mix(in_srgb,var(--cw-danger)_14%,var(--cw-surface))] disabled:opacity-50"
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => act(activeId, "approve")}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--cw-neon)] px-3.5 py-2 text-sm font-semibold text-[var(--cw-neon-ink)] hover:bg-[var(--cw-neon-deep)] disabled:opacity-50"
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
