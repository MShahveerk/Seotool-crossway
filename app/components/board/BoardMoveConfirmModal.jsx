"use client";

import { useEffect } from "react";

/**
 * Confirm a board column move, listing implications (emails, schedule, live publish).
 */
export default function BoardMoveConfirmModal({
  effect,
  itemTitle = "",
  busy = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    const onKey = (e) => {
      if (busy) return;
      if (e.key === "Escape") onCancel?.();
      // Live publish requires an explicit click so Enter cannot fire by accident.
      if (e.key === "Enter" && effect?.severity !== "danger") onConfirm?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, effect?.severity, onCancel, onConfirm]);

  if (!effect) return null;

  const tone = effect.severity || "info";
  const confirmLabel = effect.confirmLabel || `Confirm → ${effect.toLabel}`;

  return (
    <div
      className="cw-board-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cw-board-confirm-title"
      onMouseDown={(e) => {
        if (!busy && e.target === e.currentTarget) onCancel?.();
      }}
    >
      <div className="cw-board-modal__panel cw-board-confirm">
        <header className="cw-board-modal__head">
          <div className="min-w-0">
            <p className="cw-board-modal__eyebrow">
              {effect.willPublishNow
                ? "Live publish"
                : effect.willUnpublishNow
                  ? "Take down"
                  : "Confirm move"}
            </p>
            <h2 id="cw-board-confirm-title" className="cw-board-modal__title">
              {effect.title}
            </h2>
          </div>
          <button
            type="button"
            className="cw-board-modal__close"
            onClick={onCancel}
            disabled={busy}
            aria-label="Cancel"
          >
            ✕
          </button>
        </header>

        <div className="cw-board-modal__body">
          <p className="cw-board-modal__prose">{effect.summary}</p>
          {itemTitle ? (
            <p className="cw-board-confirm__item">{itemTitle}</p>
          ) : null}

          <div className={`cw-board-confirm__box cw-board-confirm__box--${tone}`}>
            <p className="cw-board-confirm__box-title">What this will do</p>
            <ul>
              {(effect.implications || []).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>

          {effect.willPublishNow ? (
            <p className="cw-board-confirm__badge cw-board-confirm__badge--danger">
              Goes live now. Schedule is ignored.
            </p>
          ) : null}
          {effect.willUnpublishNow ? (
            <p className="cw-board-confirm__badge cw-board-confirm__badge--danger">
              Deletes the live Meta post.
            </p>
          ) : null}
          {effect.willNotify ? (
            <p className="cw-board-confirm__badge cw-board-confirm__badge--warn">
              Approval emails will be sent
            </p>
          ) : null}
          {effect.willSchedule ? (
            <p className="cw-board-confirm__badge cw-board-confirm__badge--warn">
              Publish schedule may be set
            </p>
          ) : null}
          {effect.willHide ? (
            <p className="cw-board-confirm__badge">Hidden from assignees</p>
          ) : null}
        </div>

        <footer className="cw-board-modal__foot">
          <p className="cw-board-modal__hint">
            {tone === "danger"
              ? effect.willUnpublishNow
                ? "Esc cancel · click the button to take it down"
                : "Esc cancel · click the button to publish"
              : "Esc cancel · Enter confirm"}
          </p>
          <div className="cw-board-confirm__actions">
            <button
              type="button"
              className="cw-board-confirm__btn cw-board-confirm__btn--ghost"
              onClick={onCancel}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`cw-board-confirm__btn cw-board-confirm__btn--${tone === "danger" ? "danger" : "primary"}`}
              onClick={onConfirm}
              disabled={busy}
            >
              {busy
                ? effect.willPublishNow
                  ? "Publishing…"
                  : effect.willUnpublishNow
                    ? "Removing…"
                    : "Moving…"
                : confirmLabel}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
