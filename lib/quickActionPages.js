/**
 * Shared HTML result / decline-form pages for email quick-actions
 * (social posts and blogs).
 */
import { NextResponse } from "next/server";

export const QUICK_ACTION_REASON_MAX = 5000;

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function logoUrl() {
  const baseUrl = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
  return `${baseUrl}/crossway-logo.png`;
}

export function resultPage({ title, message, tone = "success", detail = "", kindLabel = "Approved" }) {
  const accent =
    tone === "success"
      ? { bg: "#ecfdf3", border: "#abefc6", icon: "#099250", label: kindLabel || "Approved" }
      : tone === "decline"
        ? { bg: "#fef3f2", border: "#fecdca", icon: "#d92d20", label: kindLabel || "Rejected" }
        : tone === "info"
          ? { bg: "#f8fafc", border: "#e2e8f0", icon: "#475569", label: kindLabel || "Notice" }
          : { bg: "#fffbeb", border: "#fde68a", icon: "#b45309", label: kindLabel || "Attention" };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · Crossway</title>
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root { --ink: #111827; --muted: #6b7280; --card: #ffffff; --page: #f3f4f6; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh;
      font-family: Nunito, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(1200px 500px at 10% -10%, rgba(14, 255, 42, 0.18), transparent 55%),
        radial-gradient(900px 420px at 100% 0%, rgba(16, 185, 129, 0.12), transparent 50%),
        var(--page);
      display: flex; align-items: center; justify-content: center; padding: 24px;
    }
    .card {
      width: 100%; max-width: 480px; background: var(--card);
      border-radius: 20px; border: 1px solid #e5e7eb;
      box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
      padding: 36px 32px 32px; text-align: center;
    }
    .logo {
      width: 72px; height: 72px; object-fit: contain; border-radius: 14px;
      margin: 0 auto 18px; display: block; background: #f9fafb; border: 1px solid #eef2f7;
    }
    .brand { font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #9ca3af; margin-bottom: 18px; }
    .badge {
      display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px;
      background: ${accent.bg}; border: 1px solid ${accent.border}; color: ${accent.icon};
      font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 16px;
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: ${accent.icon}; }
    h1 { margin: 0 0 10px; font-size: 1.65rem; line-height: 1.25; font-weight: 700; }
    p { margin: 0; color: var(--muted); font-size: 0.98rem; line-height: 1.6; }
    .detail {
      margin-top: 14px; padding: 12px 14px; border-radius: 12px;
      background: #f9fafb; border: 1px solid #eef2f7; color: #4b5563; font-size: 0.9rem;
      text-align: left; white-space: pre-wrap;
    }
    .footer { margin-top: 28px; padding-top: 18px; border-top: 1px solid #f1f5f9; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <main class="card">
    <img class="logo" src="${escapeHtml(logoUrl())}" alt="Crossway logo" />
    <div class="brand">Crossway</div>
    <div class="badge"><span class="dot"></span>${escapeHtml(accent.label)}</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    ${detail ? `<div class="detail">${escapeHtml(detail)}</div>` : ""}
    <div class="footer">You can safely close this window.</div>
  </main>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/**
 * @param {{ id: string, token: string, itemTitle?: string, postUrl: string, noun?: string }} opts
 * postUrl is the full POST action URL (e.g. /api/blogs/quick-action)
 */
export function declineFormPage({ id, token, itemTitle = "", postUrl, noun = "post" }) {
  const baseUrl = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
  const actionUrl = postUrl.startsWith("http") ? postUrl : `${baseUrl}${postUrl.startsWith("/") ? "" : "/"}${postUrl}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Decline ${escapeHtml(noun)} · Crossway</title>
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh;
      font-family: Nunito, "Segoe UI", "Helvetica Neue", Arial, sans-serif; color: #111827;
      background:
        radial-gradient(1200px 500px at 10% -10%, rgba(14, 255, 42, 0.12), transparent 55%),
        #f3f4f6;
      display: flex; align-items: center; justify-content: center; padding: 24px;
    }
    .card {
      width: 100%; max-width: 520px; background: #fff; border-radius: 20px;
      border: 1px solid #e5e7eb; box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
      padding: 36px 32px 28px;
    }
    .logo { width: 64px; height: 64px; object-fit: contain; border-radius: 12px; display: block; margin: 0 auto 14px; }
    .brand { text-align: center; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #9ca3af; margin-bottom: 20px; }
    h1 { margin: 0 0 8px; font-size: 1.45rem; text-align: center; }
    .subtitle { margin: 0 0 24px; color: #6b7280; font-size: 0.95rem; text-align: center; line-height: 1.5; }
    label { display: block; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; margin-bottom: 8px; }
    textarea {
      width: 100%; min-height: 120px; padding: 12px 14px; border-radius: 12px;
      border: 1px solid #d1d5db; font-family: inherit; font-size: 0.95rem; line-height: 1.5;
      resize: vertical;
    }
    textarea:focus { outline: none; border-color: #111827; box-shadow: 0 0 0 3px rgba(17, 24, 39, 0.08); }
    .hint { margin-top: 6px; font-size: 0.8rem; color: #9ca3af; }
    .targets { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 18px; }
    .target { position: relative; }
    .target input { position: absolute; opacity: 0; inset: 0; cursor: pointer; }
    .target span {
      display: block; text-align: center; padding: 10px 8px; border-radius: 10px;
      border: 1px solid #d1d5db; background: #fff; font-size: 0.82rem; font-weight: 700; color: #374151;
      cursor: pointer; transition: all .15s;
    }
    .target span small { display: block; font-weight: 500; font-size: 0.68rem; color: #9ca3af; margin-top: 2px; }
    .target input:checked + span { border-color: #111827; background: #111827; color: #fff; box-shadow: 0 4px 12px rgba(17,24,39,.18); }
    .target input:checked + span small { color: #d1d5db; }
    .actions { display: flex; gap: 10px; margin-top: 22px; flex-wrap: wrap; }
    button {
      flex: 1; min-width: 140px; padding: 13px 18px; border-radius: 10px;
      font-size: 0.9rem; font-weight: 700; cursor: pointer; border: none;
    }
    .submit { background: #111827; color: #fff; }
    .submit:hover { background: #000; }
    .cancel { background: #fff; color: #374151; border: 1px solid #d1d5db; }
  </style>
</head>
<body>
  <main class="card">
    <img class="logo" src="${escapeHtml(logoUrl())}" alt="Crossway logo" />
    <div class="brand">Crossway</div>
    <h1>Decline this ${escapeHtml(noun)}</h1>
    <p class="subtitle">${
      itemTitle
        ? `Please tell us why you are declining "${escapeHtml(itemTitle)}". This helps the team revise the content.`
        : `Please tell us why you are declining this ${escapeHtml(noun)}. This helps the team revise the content.`
    }</p>
    <form method="POST" action="${escapeHtml(actionUrl)}">
      <input type="hidden" name="id" value="${escapeHtml(id)}" />
      <input type="hidden" name="token" value="${escapeHtml(token)}" />
      <input type="hidden" name="action" value="decline" />
      <label for="reason">Reason for rejection <span style="color:#dc2626">*</span></label>
      <textarea id="reason" name="reason" required maxlength="${QUICK_ACTION_REASON_MAX}" placeholder="e.g. Tone doesn't match our brand, SEO title needs work, the image feels off-brand…"></textarea>
      <p class="hint">Required — your feedback goes straight to the AI ${escapeHtml(noun)} agents, which rewrite a fresh version automatically.</p>
      <label style="margin-top:18px">What needs to change?</label>
      <div class="targets">
        <label class="target"><input type="radio" name="revisionTarget" value="text" /><span>Wording<small>text only</small></span></label>
        <label class="target"><input type="radio" name="revisionTarget" value="image" /><span>Image<small>visual only</small></span></label>
        <label class="target"><input type="radio" name="revisionTarget" value="both" checked /><span>Both<small>full redo</small></span></label>
      </div>
      <div class="actions">
        <button type="button" class="cancel" onclick="window.close()">Cancel</button>
        <button type="submit" class="submit">Submit decline</button>
      </div>
    </form>
  </main>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
