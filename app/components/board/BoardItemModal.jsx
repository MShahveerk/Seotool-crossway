"use client";

import { useEffect } from "react";
import { formatScheduleShort } from "@/lib/timezone";
import { isBoardVideoPath, resolveBoardMedia } from "./resolveBoardMedia";

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function Field({ label, children }) {
  if (children == null || children === "") return null;
  return (
    <div className="cw-board-modal__field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * Detail modal for a post or blog card (opened via double-click).
 */
export default function BoardItemModal({ item, kind = "post", columnLabel = "", onClose }) {
  const media = resolveBoardMedia(item);
  const title = item.displayTitle || item.userEditedTitle || item.title || "Untitled";
  const isBlog = kind === "blog";

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const caption = item.userEditedCaption || item.caption || "";
  const excerpt = item.userEditedExcerpt || item.excerpt || "";
  const contentPreview = stripHtml(item.userEditedContent || item.content || "").slice(0, 1200);
  const assignee = item.assignee?.name || item.assignee?.email || "—";
  const createdBy = item.createdBy?.name || item.createdBy?.email || "—";

  return (
    <div
      className="cw-board-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cw-board-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="cw-board-modal__panel">
        <header className="cw-board-modal__head">
          <div className="min-w-0">
            <p className="cw-board-modal__eyebrow">
              {isBlog ? "Blog details" : "Post details"}
              {columnLabel ? ` · ${columnLabel}` : ""}
            </p>
            <h2 id="cw-board-modal-title" className="cw-board-modal__title">
              {title}
            </h2>
          </div>
          <button type="button" className="cw-board-modal__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="cw-board-modal__body">
          {media ? (
            <div className="cw-board-modal__media">
              {isBoardVideoPath(media) ? (
                <video src={media} controls playsInline preload="metadata" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={media} alt="" />
              )}
            </div>
          ) : null}

          {!isBlog && caption ? (
            <p className="cw-board-modal__prose">{caption}</p>
          ) : null}

          {isBlog && excerpt ? <p className="cw-board-modal__prose">{excerpt}</p> : null}

          {isBlog && contentPreview ? (
            <div className="cw-board-modal__prose cw-board-modal__prose--muted">
              {contentPreview}
              {(item.userEditedContent || item.content || "").length > 1200 ? "…" : ""}
            </div>
          ) : null}

          <dl className="cw-board-modal__grid">
            <Field label="Status">{item.status || "—"}</Field>
            <Field label="Publish">{item.publishStatus || "—"}</Field>
            <Field label="Scheduled">
              {item.scheduledFor ? formatScheduleShort(item.scheduledFor) : "Not scheduled"}
            </Field>
            <Field label="Assignee">{assignee}</Field>
            <Field label="Created by">{createdBy}</Field>
            <Field label="Source">{item.source || "manual"}</Field>
            {isBlog ? <Field label="WP status">{item.wpStatus || "—"}</Field> : null}
            {isBlog ? <Field label="Slug">{item.slug || "—"}</Field> : null}
            {!isBlog && item.facebookPageId ? <Field label="Facebook">{item.facebookPageId}</Field> : null}
            {!isBlog && item.instagramUserId ? <Field label="Instagram">{item.instagramUserId}</Field> : null}
            <Field label="Site / page">{item.siteLink || "—"}</Field>
            {item.seoTitle || item.payload?.seoTitle ? (
              <Field label="SEO title">{item.seoTitle || item.payload?.seoTitle}</Field>
            ) : null}
            {item.focusKeyword || item.payload?.focusKeyword ? (
              <Field label="Focus keyword">{item.focusKeyword || item.payload?.focusKeyword}</Field>
            ) : null}
            {item.createdAt ? (
              <Field label="Created">{formatScheduleShort(item.createdAt)}</Field>
            ) : null}
            {item.updatedAt ? (
              <Field label="Updated">{formatScheduleShort(item.updatedAt)}</Field>
            ) : null}
          </dl>

          {item.publishError ? (
            <div className="cw-board-modal__error">
              <strong>Publish error</strong>
              <p>{item.publishError}</p>
            </div>
          ) : null}

          {item.userEditedInstructions ? (
            <Field label="Assignee notes">
              <span className="cw-board-modal__prose">{item.userEditedInstructions}</span>
            </Field>
          ) : null}
        </div>

        <footer className="cw-board-modal__foot">
          <p className="cw-board-modal__hint">Double-click any card to open details · Esc to close</p>
          <button type="button" className="cw-board-modal__btn" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
