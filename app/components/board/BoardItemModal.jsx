"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  datetimeLocalToUtcIso,
  formatScheduleShort,
  timezoneShortLabel,
  toDatetimeLocalInTimezone,
} from "@/lib/timezone";
import BlogRichTextEditor from "../BlogRichTextEditor";
import { isBoardVideoPath, resolveBoardMedia } from "./resolveBoardMedia";

function Field({ label, children }) {
  if (children == null || children === "") return null;
  return (
    <div className="cw-board-modal__field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function metaFromBlog(item) {
  const meta = item?.payload?.meta && typeof item.payload.meta === "object" ? item.payload.meta : {};
  return {
    seoTitle: meta.seo_title || meta.yoast_title || item.seoTitle || "",
    metaDescription: meta.meta_description || meta.yoast_metadesc || item.metaDescription || "",
    focusKeyword: meta.focus_keyword || meta.yoast_focuskw || item.focusKeyword || "",
  };
}

function buildDraft(item, isBlog) {
  if (isBlog) {
    const meta = metaFromBlog(item);
    return {
      title: item.userEditedTitle || item.title || "",
      slug: item.userEditedSlug || item.slug || "",
      excerpt: item.userEditedExcerpt ?? item.excerpt ?? "",
      content: item.userEditedContent || item.content || "",
      scheduledFor: toDatetimeLocalInTimezone(item.scheduledFor),
      featuredImageAlt: item.featuredImageAlt || "",
      seoTitle: meta.seoTitle,
      metaDescription: meta.metaDescription,
      focusKeyword: meta.focusKeyword,
    };
  }
  return {
    title: item.userEditedTitle || item.title || "",
    caption: item.userEditedCaption || item.caption || "",
    bodyText: item.userEditedText || item.bodyText || "",
    instructions: item.userEditedInstructions || "",
    scheduledFor: toDatetimeLocalInTimezone(item.scheduledFor),
  };
}

/**
 * Detail + edit modal for a post or blog card (opened via double-click).
 * Portaled to document.body so board transforms cannot clip it.
 */
export default function BoardItemModal({
  item,
  kind = "post",
  columnLabel = "",
  onClose,
  onSaved,
}) {
  const isBlog = kind === "blog";
  const [portalReady, setPortalReady] = useState(false);
  const [tab, setTab] = useState("preview");
  const [draft, setDraft] = useState(() => buildDraft(item, isBlog));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [localItem, setLocalItem] = useState(item);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    setLocalItem(item);
    setDraft(buildDraft(item, isBlog));
    setTab("preview");
    setError("");
    setMessage("");
  }, [item, isBlog]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) onClose?.();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, busy]);

  const media = resolveBoardMedia(localItem);
  const title =
    localItem.displayTitle ||
    localItem.userEditedTitle ||
    localItem.title ||
    "Untitled";
  const assignee = localItem.assignee?.name || localItem.assignee?.email || "—";
  const createdBy = localItem.createdBy?.name || localItem.createdBy?.email || "—";
  const locked = localItem.publishStatus === "published";

  const previewHtml = useMemo(() => {
    if (!isBlog) return "";
    return draft.content || "<p><em>No content yet.</em></p>";
  }, [isBlog, draft.content]);

  const save = async () => {
    if (locked) {
      setError("Published items are locked and cannot be edited.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (isBlog) {
        const res = await fetch(`/api/admin/blogs/${localItem.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: draft.title,
            slug: draft.slug,
            excerpt: draft.excerpt,
            content: draft.content,
            scheduledFor: draft.scheduledFor
              ? datetimeLocalToUtcIso(draft.scheduledFor)
              : null,
            featuredImageAlt: draft.featuredImageAlt,
            seoTitle: draft.seoTitle,
            metaDescription: draft.metaDescription,
            focusKeyword: draft.focusKeyword,
            syncEditedFields: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to save blog");
        const next = {
          ...data.blog,
          displayTitle: data.blog.title,
          imagePath:
            data.blog.featuredImagePath ||
            data.blog.featuredImageUrl ||
            data.blog.payload?.featuredImageUrl ||
            "",
        };
        setLocalItem(next);
        setDraft(buildDraft(next, true));
        onSaved?.(next);
        setMessage("Blog saved.");
        setTab("preview");
      } else {
        const res = await fetch(`/api/admin/approvals/${localItem.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: draft.title,
            caption: draft.caption,
            bodyText: draft.bodyText,
            userEditedInstructions: draft.instructions,
            scheduledFor: draft.scheduledFor
              ? datetimeLocalToUtcIso(draft.scheduledFor)
              : null,
            syncEditedFields: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to save post");
        const next = {
          ...localItem,
          ...data.approval,
          displayTitle: data.approval.userEditedTitle || data.approval.title,
          imagePath: data.approval.imagePath || data.approval.mediaPath || localItem.imagePath || "",
        };
        setLocalItem(next);
        setDraft(buildDraft(next, false));
        onSaved?.(next);
        setMessage("Post saved.");
        setTab("preview");
      }
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  if (!portalReady || !localItem) return null;

  const modal = (
    <div
      className="cw-board-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cw-board-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose?.();
      }}
    >
      <div className="cw-board-modal__panel cw-board-modal__panel--wide">
        <header className="cw-board-modal__head">
          <div className="min-w-0">
            <p className="cw-board-modal__eyebrow">
              {isBlog ? "Blog" : "Post"}
              {columnLabel ? ` · ${columnLabel}` : ""}
              {locked ? " · published (locked)" : ""}
            </p>
            <h2 id="cw-board-modal-title" className="cw-board-modal__title">
              {draft.title || title}
            </h2>
          </div>
          <button
            type="button"
            className="cw-board-modal__close"
            onClick={onClose}
            aria-label="Close"
            disabled={busy}
          >
            ✕
          </button>
        </header>

        <nav className="cw-board-modal__tabs" aria-label="Item sections">
          {[
            { id: "preview", label: "Preview" },
            { id: "edit", label: "Edit" },
            { id: "details", label: "Details" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              className={`cw-board-modal__tab${tab === t.id ? " is-active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {error ? <p className="cw-board-modal__banner cw-board-modal__banner--error">{error}</p> : null}
        {message ? (
          <p className="cw-board-modal__banner cw-board-modal__banner--ok">{message}</p>
        ) : null}

        <div className="cw-board-modal__body">
          {tab === "preview" ? (
            <div className="cw-board-modal__preview">
              {media ? (
                <div className="cw-board-modal__media cw-board-modal__media--lg">
                  {isBoardVideoPath(media) ? (
                    <video src={media} controls playsInline preload="metadata" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={media} alt={draft.featuredImageAlt || draft.title || ""} />
                  )}
                </div>
              ) : (
                <div className="cw-board-modal__media-empty">No media attached</div>
              )}

              {!isBlog ? (
                <>
                  {draft.caption ? (
                    <p className="cw-board-modal__prose cw-board-modal__prose--lead">{draft.caption}</p>
                  ) : (
                    <p className="cw-board-modal__prose cw-board-modal__prose--muted">No caption</p>
                  )}
                  {draft.bodyText ? (
                    <p className="cw-board-modal__prose">{draft.bodyText}</p>
                  ) : null}
                  {draft.instructions ? (
                    <div className="cw-board-modal__note">
                      <strong>Assignee notes</strong>
                      <p>{draft.instructions}</p>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  {draft.excerpt ? (
                    <p className="cw-board-modal__prose cw-board-modal__prose--lead">{draft.excerpt}</p>
                  ) : null}
                  <article
                    className="cw-board-modal__html"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                </>
              )}

              <dl className="cw-board-modal__grid">
                <Field label="Status">{localItem.status || "—"}</Field>
                <Field label="Publish">{localItem.publishStatus || "—"}</Field>
                <Field label="Scheduled">
                  {draft.scheduledFor
                    ? formatScheduleShort(datetimeLocalToUtcIso(draft.scheduledFor) || localItem.scheduledFor)
                    : localItem.scheduledFor
                      ? formatScheduleShort(localItem.scheduledFor)
                      : "Not scheduled"}
                </Field>
                <Field label="Assignee">{assignee}</Field>
              </dl>
            </div>
          ) : null}

          {tab === "edit" ? (
            <div className="cw-board-modal__form">
              {locked ? (
                <p className="cw-board-modal__prose cw-board-modal__prose--muted">
                  This item is published and locked. Move it out of Published is not allowed from the board.
                </p>
              ) : null}

              <label className="cw-board-modal__label">
                Title
                <input
                  className="cw-board-modal__input"
                  value={draft.title}
                  disabled={busy || locked}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                />
              </label>

              {isBlog ? (
                <>
                  <label className="cw-board-modal__label">
                    Slug
                    <input
                      className="cw-board-modal__input cw-board-modal__input--mono"
                      value={draft.slug}
                      disabled={busy || locked}
                      onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))}
                    />
                  </label>
                  <label className="cw-board-modal__label">
                    Excerpt
                    <textarea
                      className="cw-board-modal__textarea"
                      rows={3}
                      value={draft.excerpt}
                      disabled={busy || locked}
                      onChange={(e) => setDraft((d) => ({ ...d, excerpt: e.target.value }))}
                    />
                  </label>
                  <div className="cw-board-modal__label">
                    <span>Content</span>
                    {locked ? (
                      <div
                        className="cw-board-modal__html"
                        dangerouslySetInnerHTML={{ __html: draft.content || "<p></p>" }}
                      />
                    ) : (
                      <div className="cw-board-modal__editor">
                        <BlogRichTextEditor
                          value={draft.content}
                          onChange={(html) => setDraft((d) => ({ ...d, content: html }))}
                          minHeight={240}
                        />
                      </div>
                    )}
                  </div>
                  <label className="cw-board-modal__label">
                    Featured image alt
                    <input
                      className="cw-board-modal__input"
                      value={draft.featuredImageAlt}
                      disabled={busy || locked}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, featuredImageAlt: e.target.value }))
                      }
                    />
                  </label>
                  <label className="cw-board-modal__label">
                    SEO title
                    <input
                      className="cw-board-modal__input"
                      value={draft.seoTitle}
                      disabled={busy || locked}
                      onChange={(e) => setDraft((d) => ({ ...d, seoTitle: e.target.value }))}
                    />
                  </label>
                  <label className="cw-board-modal__label">
                    Meta description
                    <textarea
                      className="cw-board-modal__textarea"
                      rows={2}
                      value={draft.metaDescription}
                      disabled={busy || locked}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, metaDescription: e.target.value }))
                      }
                    />
                  </label>
                  <label className="cw-board-modal__label">
                    Focus keyword
                    <input
                      className="cw-board-modal__input"
                      value={draft.focusKeyword}
                      disabled={busy || locked}
                      onChange={(e) => setDraft((d) => ({ ...d, focusKeyword: e.target.value }))}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="cw-board-modal__label">
                    Caption
                    <textarea
                      className="cw-board-modal__textarea"
                      rows={4}
                      value={draft.caption}
                      disabled={busy || locked}
                      onChange={(e) => setDraft((d) => ({ ...d, caption: e.target.value }))}
                    />
                  </label>
                  <label className="cw-board-modal__label">
                    Accompanying text
                    <textarea
                      className="cw-board-modal__textarea"
                      rows={4}
                      value={draft.bodyText}
                      disabled={busy || locked}
                      onChange={(e) => setDraft((d) => ({ ...d, bodyText: e.target.value }))}
                    />
                  </label>
                  <label className="cw-board-modal__label">
                    Assignee notes / instructions
                    <textarea
                      className="cw-board-modal__textarea"
                      rows={3}
                      value={draft.instructions}
                      disabled={busy || locked}
                      onChange={(e) => setDraft((d) => ({ ...d, instructions: e.target.value }))}
                    />
                  </label>
                </>
              )}

              <label className="cw-board-modal__label">
                Publish schedule ({timezoneShortLabel()})
                <input
                  type="datetime-local"
                  className="cw-board-modal__input"
                  value={draft.scheduledFor}
                  disabled={busy || locked}
                  onChange={(e) => setDraft((d) => ({ ...d, scheduledFor: e.target.value }))}
                />
              </label>
            </div>
          ) : null}

          {tab === "details" ? (
            <dl className="cw-board-modal__grid">
              <Field label="Status">{localItem.status || "—"}</Field>
              <Field label="Publish">{localItem.publishStatus || "—"}</Field>
              <Field label="Scheduled">
                {localItem.scheduledFor
                  ? formatScheduleShort(localItem.scheduledFor)
                  : "Not scheduled"}
              </Field>
              <Field label="Assignee">{assignee}</Field>
              <Field label="Created by">{createdBy}</Field>
              <Field label="Source">{localItem.source || "manual"}</Field>
              <Field label="Site / page">{localItem.siteLink || "—"}</Field>
              {isBlog ? <Field label="WP status">{localItem.wpStatus || "—"}</Field> : null}
              {isBlog ? (
                <Field label="External ID">
                  {localItem.externalPostId || localItem.externalId || "—"}
                </Field>
              ) : null}
              {isBlog ? <Field label="Slug">{localItem.slug || "—"}</Field> : null}
              {!isBlog && localItem.facebookPageId ? (
                <Field label="Facebook">{localItem.facebookPageId}</Field>
              ) : null}
              {!isBlog && localItem.instagramUserId ? (
                <Field label="Instagram">{localItem.instagramUserId}</Field>
              ) : null}
              {localItem.createdAt ? (
                <Field label="Created">{formatScheduleShort(localItem.createdAt)}</Field>
              ) : null}
              {localItem.updatedAt ? (
                <Field label="Updated">{formatScheduleShort(localItem.updatedAt)}</Field>
              ) : null}
              {localItem.publishError ? (
                <div className="cw-board-modal__error" style={{ gridColumn: "1 / -1" }}>
                  <strong>Error / decline reason</strong>
                  <p>{localItem.publishError}</p>
                </div>
              ) : null}
            </dl>
          ) : null}
        </div>

        <footer className="cw-board-modal__foot">
          <p className="cw-board-modal__hint">
            Double-click any card · Esc closes · changes save to Crossway immediately
          </p>
          <div className="cw-board-modal__actions">
            <button
              type="button"
              className="cw-board-modal__btn cw-board-modal__btn--ghost"
              onClick={onClose}
              disabled={busy}
            >
              Close
            </button>
            {!locked && tab !== "edit" ? (
              <button
                type="button"
                className="cw-board-modal__btn"
                disabled={busy}
                onClick={() => setTab("edit")}
              >
                Edit
              </button>
            ) : null}
            {!locked && tab === "edit" ? (
              <button
                type="button"
                className="cw-board-modal__btn cw-board-modal__btn--primary"
                disabled={busy}
                onClick={save}
              >
                {busy ? "Saving…" : "Save changes"}
              </button>
            ) : null}
          </div>
        </footer>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
