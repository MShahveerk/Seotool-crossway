import fs from "fs";
import path from "path";
import { isApprovalVideoPath } from "./approvalMedia.js";
import { resolveUploadDiskPath as resolveSharedUploadDiskPath } from "./uploadPaths.js";

export const APPROVAL_MEDIA_CID = "approval-media";
export const BLOG_MEDIA_CID = "blog-featured-media";

// Align with studio image size limit so approval emails prefer CID over remote /api/uploads.
const MAX_INLINE_BYTES = 8 * 1024 * 1024;

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Resolve a stored `/api/uploads/...` path to a file on disk. */
export function resolveUploadDiskPath(relativePath) {
  return resolveSharedUploadDiskPath(relativePath);
}

export function resolvePublicMediaUrl(pathOrUrl, baseUrl) {
  const value = String(pathOrUrl || "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const base = String(baseUrl || "").replace(/\/+$/, "");
  return `${base}${value.startsWith("/") ? value : `/${value}`}`;
}

/** Attach image bytes inline for email clients that block remote images. */
export function buildInlineMediaAttachment(relativePath, cid = APPROVAL_MEDIA_CID) {
  if (!relativePath || isApprovalVideoPath(relativePath)) return null;
  const disk = resolveUploadDiskPath(relativePath);
  if (!disk) return null;
  try {
    const stat = fs.statSync(disk);
    if (stat.size > MAX_INLINE_BYTES) return null;
  } catch {
    return null;
  }
  return { filename: path.basename(disk), path: disk, cid };
}

/** Mobile-friendly page for opening approval / blog media from email links. */
export function mediaViewerPage({
  title,
  subtitle = "",
  mediaUrl,
  isVideo = false,
  downloadLabel = "Open original file",
}) {
  const safeTitle = escapeHtml(title || "Media preview");
  const safeSubtitle = escapeHtml(subtitle);
  const safeMediaUrl = escapeHtml(mediaUrl);
  const safeDownloadLabel = escapeHtml(downloadLabel);

  const mediaBlock = isVideo
    ? `<video src="${safeMediaUrl}" controls playsinline webkit-playsinline preload="metadata" style="width:100%;max-height:78vh;border-radius:16px;background:#000;"></video>`
    : `<img src="${safeMediaUrl}" alt="${safeTitle}" style="width:100%;height:auto;max-height:78vh;object-fit:contain;border-radius:16px;background:#fff;" />`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <title>${safeTitle} · Crossway</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Nunito, "Segoe UI", Helvetica, Arial, sans-serif;
      background: #0b0b0a;
      color: #faf8f3;
      padding: max(16px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom));
    }
    .wrap { max-width: 720px; margin: 0 auto; }
    .top { margin-bottom: 16px; }
    .brand {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #8f8b82;
      margin-bottom: 8px;
    }
    h1 {
      margin: 0;
      font-size: 1.25rem;
      line-height: 1.35;
      font-weight: 700;
    }
    .sub {
      margin: 6px 0 0;
      font-size: 0.92rem;
      color: #c9c4b8;
      line-height: 1.5;
    }
    .frame {
      background: #141412;
      border: 1px solid #2a2823;
      border-radius: 20px;
      padding: 12px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.35);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 16px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 46px;
      padding: 0 18px;
      border-radius: 999px;
      font-size: 14px;
      font-weight: 700;
      text-decoration: none;
      border: 1px solid transparent;
    }
    .btn-primary {
      background: #faf8f3;
      color: #0b0b0a;
    }
    .btn-secondary {
      background: transparent;
      color: #faf8f3;
      border-color: #4b4842;
    }
    .hint {
      margin-top: 14px;
      font-size: 12px;
      line-height: 1.6;
      color: #8f8b82;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div class="brand">Crossway approval media</div>
      <h1>${safeTitle}</h1>
      ${safeSubtitle ? `<p class="sub">${safeSubtitle}</p>` : ""}
    </div>
    <div class="frame">
      ${mediaBlock}
    </div>
    <div class="actions">
      <a class="btn btn-primary" href="${safeMediaUrl}" target="_blank" rel="noopener noreferrer">${safeDownloadLabel}</a>
      <a class="btn btn-secondary" href="${safeMediaUrl}" download>${isVideo ? "Download video" : "Download image"}</a>
    </div>
    <p class="hint">If the preview does not appear, use the button above to open the file directly in your browser.</p>
  </div>
</body>
</html>`;
}
