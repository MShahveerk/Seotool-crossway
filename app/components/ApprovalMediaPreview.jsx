"use client";

import { useCallback, useEffect, useState } from "react";
import { isApprovalVideoPath } from "../../lib/approvalMedia";
import { publicMediaUrl } from "../../lib/publicMediaUrl";

/**
 * Inline approval media: image or muted video thumbnail (no controls unless enabled).
 * Normalizes URLs and retries once with a cache-bust — Chrome often caches a prior ORB failure.
 */
export default function ApprovalMediaPreview({
  src,
  alt = "",
  className = "",
  videoControls = false,
  videoMuted,
  videoLoop = false,
  bust = null,
}) {
  const resolved = publicMediaUrl(src, { bust });
  const [displaySrc, setDisplaySrc] = useState(resolved);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setDisplaySrc(resolved);
    setFailed(false);
  }, [resolved]);

  const onImgError = useCallback(() => {
    setDisplaySrc((prev) => {
      const base = String(prev || "").split("?")[0];
      if (!base || base.startsWith("blob:") || base.startsWith("data:")) {
        setFailed(true);
        return prev;
      }
      if (String(prev).includes("_cb=")) {
        setFailed(true);
        return prev;
      }
      const sep = base.includes("?") ? "&" : "?";
      return `${base}${sep}_cb=${Date.now()}`;
    });
  }, []);

  if (!resolved) {
    return (
      <div className={`flex items-center justify-center bg-neutral-800 text-sm text-neutral-400 ${className}`}>
        No preview
      </div>
    );
  }

  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-neutral-800 text-sm text-neutral-400 ${className}`}>
        Media unavailable
      </div>
    );
  }

  if (isApprovalVideoPath(resolved)) {
    return (
      <video
        key={displaySrc}
        src={displaySrc}
        className={className}
        controls={videoControls}
        playsInline
        preload="metadata"
        muted={videoMuted !== undefined ? videoMuted : !videoControls}
        loop={videoLoop}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={displaySrc}
      src={displaySrc}
      alt={alt}
      className={className}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={onImgError}
    />
  );
}
