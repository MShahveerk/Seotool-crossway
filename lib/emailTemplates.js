/**
 * Crossway transactional email templates.
 * Shared black / off-white shell with the Crossway logo, plus builders for
 * social post approvals, blog approvals, status updates, and the SEO digest.
 */
import { formatScheduleLabel } from "./timezone.js";
import { isApprovalVideoPath } from "./approvalMedia.js";

const T = {
  page: "#f1efe9",      // off-white page background
  card: "#fffdf8",      // warm off-white card
  border: "#e7e3d8",
  ink: "#141412",       // near-black text
  body: "#4b4842",
  muted: "#8b8577",
  faint: "#a8a294",
  altRow: "#faf8f1",
  black: "#0b0b0a",
  offWhite: "#faf8f3",
};

const FONT = "Nunito, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const SERIF = FONT;
const FONT_LINK = `<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&display=swap" rel="stylesheet">`;

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Strip scripts/styles/iframes and inline event handlers; constrain images. */
function sanitizeEmailHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?(?:<\/iframe>|\/>)/gi, "")
    .replace(/<link\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/<img\b/gi, '<img style="max-width:100%;height:auto;border-radius:4px;" ');
}

function resolveMediaUrl(pathOrUrl, baseUrl) {
  const value = String(pathOrUrl || "").trim();
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : `${baseUrl}${value}`;
}

function sectionLabel(text) {
  return `<p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:${T.muted};letter-spacing:1.5px;font-family:${FONT};">${escapeHtml(text)}</p>`;
}

/** rows: array of [label, valueHtml] — valueHtml must already be escaped by the caller. */
function renderMetaTable(rows) {
  const filtered = rows.filter(([, v]) => v != null && String(v).trim() !== "");
  if (!filtered.length) return "";
  const cells = filtered
    .map(([label, valueHtml], i) => {
      const last = i === filtered.length - 1;
      return `
        <tr${i % 2 === 0 ? ` style="background-color:${T.altRow};"` : ""}>
          <td style="padding:13px 18px;font-size:10px;font-weight:700;color:${T.muted};text-transform:uppercase;letter-spacing:1.2px;width:130px;vertical-align:top;${last ? "" : `border-bottom:1px solid ${T.border};`}">${escapeHtml(label)}</td>
          <td style="padding:13px 18px;font-size:14px;color:${T.ink};line-height:1.5;${last ? "" : `border-bottom:1px solid ${T.border};`}">${valueHtml}</td>
        </tr>`;
    })
    .join("");
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;border:1px solid ${T.border};border-radius:8px;overflow:hidden;margin:0 0 28px;">
      ${cells}
    </table>`;
}

function renderMediaBlock({ label, mediaUrl, viewUrl, alt, isVideo = false, inlineSrc = null }) {
  const previewSrc = inlineSrc || mediaUrl;
  if (!previewSrc && !viewUrl) return "";

  const openUrl = viewUrl || mediaUrl;
  const openLabel = isVideo ? "Open video" : "View full image";
  const buttonStyle = `display:inline-block;padding:14px 28px;background-color:${T.black};color:${T.offWhite};font-size:13px;font-weight:700;text-decoration:none;border-radius:999px;text-align:center;border:1px solid ${T.black};letter-spacing:1px;text-transform:uppercase;font-family:${FONT};`;

  if (isVideo) {
    return `
    <div style="margin:0 0 28px;">
      ${sectionLabel(label)}
      <div style="border:1px solid ${T.border};border-radius:8px;padding:24px 20px;background-color:${T.altRow};text-align:center;">
        <p style="margin:0 0 16px;font-size:14px;color:${T.body};line-height:1.6;">This post includes a video attachment. Email apps often cannot play videos inline — open it in your browser instead.</p>
        <a href="${openUrl}" target="_blank" rel="noopener noreferrer" style="${buttonStyle}">${escapeHtml(openLabel)}</a>
      </div>
      <p style="margin:10px 0 0;font-size:12px;color:${T.muted};text-align:center;line-height:1.5;">Tap the button above on your phone to watch the video.</p>
    </div>`;
  }

  return `
    <div style="margin:0 0 28px;">
      ${sectionLabel(label)}
      <div style="border:1px solid ${T.border};border-radius:8px;overflow:hidden;background-color:${T.altRow};text-align:center;">
        <a href="${openUrl}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none;">
          <img src="${previewSrc}" alt="${escapeHtml(alt || label)}" style="max-width:100%;width:100%;height:auto;display:block;margin:0 auto;border:0;" />
        </a>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;">
        <tr>
          <td align="center">
            <a href="${openUrl}" target="_blank" rel="noopener noreferrer" style="${buttonStyle}">${escapeHtml(openLabel)}</a>
          </td>
        </tr>
      </table>
      <p style="margin:10px 0 0;font-size:12px;color:${T.muted};text-align:center;line-height:1.5;">If the preview does not load on your phone, tap <strong style="color:${T.ink};font-weight:700;">${escapeHtml(openLabel)}</strong> to open it in your browser.</p>
    </div>`;
}

function renderImageBlock(label, imageUrl, alt, options = {}) {
  return renderMediaBlock({
    label,
    mediaUrl: imageUrl,
    viewUrl: options.viewUrl,
    alt,
    isVideo: options.isVideo || false,
    inlineSrc: options.inlineSrc,
  });
}

function renderActionButtons({ approveUrl, declineUrl, approveLabel, declineLabel, declineNote }) {
  return `
    <table class="btn-table" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;">
      <tr>
        <td class="btn-cell" align="center" width="50%" style="padding-right:8px;vertical-align:top;">
          <a href="${approveUrl}"
             style="display:block;padding:15px 24px;background-color:${T.black};color:${T.offWhite};font-size:13px;font-weight:700;text-decoration:none;border-radius:6px;text-align:center;border:1px solid ${T.black};letter-spacing:1.5px;text-transform:uppercase;font-family:${FONT};">
            ${escapeHtml(approveLabel)}
          </a>
        </td>
        <td class="btn-cell" align="center" width="50%" style="padding-left:8px;vertical-align:top;">
          <a href="${declineUrl}"
             style="display:block;padding:15px 24px;background-color:${T.card};color:${T.black};font-size:13px;font-weight:700;text-decoration:none;border-radius:6px;text-align:center;border:1px solid ${T.black};letter-spacing:1.5px;text-transform:uppercase;font-family:${FONT};">
            ${escapeHtml(declineLabel)}
          </a>
          ${declineNote ? `<p style="margin:8px 0 0;font-size:11px;color:${T.faint};text-align:center;">${escapeHtml(declineNote)}</p>` : ""}
        </td>
      </tr>
    </table>`;
}

/**
 * Shared shell: off-white masthead with the Crossway logo, black title band,
 * off-white body, quiet footer.
 */
function renderEmailShell({ title, preheader = "", badge, badgeBg = T.offWhite, badgeColor = T.black, heading, subheading = "", bodyHtml, baseUrl }) {
  // Inline CID attachment (added automatically by sendEmail) so the logo
  // renders even when email clients block remote images.
  const logoUrl = "cid:crossway-logo";
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  ${FONT_LINK}
  <style>
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; max-width: 100% !important; border-radius: 0 !important; border-left: none !important; border-right: none !important; }
      .content { padding: 28px 20px !important; }
      .band { padding: 28px 20px !important; }
      .btn-table { width: 100% !important; }
      .btn-cell { display: block !important; width: 100% !important; padding: 6px 0 !important; box-sizing: border-box; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${T.page};font-family:${FONT};-webkit-font-smoothing:antialiased;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>` : ""}
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${T.page};padding:40px 12px;">
    <tr>
      <td align="center">
        <table class="container" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background-color:${T.card};border-radius:10px;overflow:hidden;border:1px solid ${T.border};">

          <!-- Masthead: logo on white (logo asset has a white background) -->
          <tr>
            <td style="background-color:#ffffff;padding:28px 40px 22px;text-align:center;border-bottom:1px solid ${T.border};">
              <img src="${logoUrl}" width="150" alt="Crossway Consulting" style="display:inline-block;width:150px;max-width:55%;height:auto;" />
            </td>
          </tr>

          <!-- Black title band -->
          <tr>
            <td class="band" style="background-color:${T.black};padding:34px 40px;text-align:left;">
              ${badge ? `
              <div style="display:inline-block;background-color:${badgeBg};color:${badgeColor};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;padding:5px 14px;border-radius:3px;margin-bottom:16px;font-family:${FONT};">
                ${escapeHtml(badge)}
              </div>` : ""}
              <div style="font-size:24px;font-weight:700;color:${T.offWhite};letter-spacing:-0.3px;line-height:1.3;font-family:${FONT};">
                ${escapeHtml(heading)}
              </div>
              ${subheading ? `
              <div style="font-size:12px;color:#8f8b82;padding-top:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;font-family:${FONT};">
                ${escapeHtml(subheading)}
              </div>` : ""}
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td class="content" style="padding:40px;background-color:${T.card};">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:${T.altRow};padding:24px 40px;text-align:center;border-top:1px solid ${T.border};">
              <p style="margin:0 0 4px;color:${T.muted};font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:600;">Crossway Consulting</p>
              <p style="margin:0;color:${T.faint};font-size:11px;">&copy; ${new Date().getFullYear()} Crossway Consulting. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderDashboardLine(dashboardUrl, text) {
  return `
    <div style="text-align:center;margin:16px 0 0;">
      <p style="margin:0;color:${T.muted};font-size:13px;">
        ${escapeHtml(text)} <a href="${dashboardUrl}" style="color:${T.black};font-weight:700;text-decoration:underline;">Open Crossway Dashboard</a>
      </p>
    </div>`;
}

function renderAutomatedNote(text) {
  return `
    <hr style="margin:32px 0 20px;border:none;border-top:1px solid ${T.border};">
    <p style="margin:0;color:${T.faint};font-size:11px;line-height:1.5;text-align:center;">${escapeHtml(text)}</p>`;
}

// ---------------------------------------------------------------------------
// Social post approval request
// ---------------------------------------------------------------------------

export function generateApprovalNotificationEmail(approval, assignee, baseUrl, token, mediaOptions = {}) {
  const approveUrl = `${baseUrl}/api/approvals/quick-action?id=${approval.id}&token=${token}&action=approve`;
  const declineUrl = `${baseUrl}/api/approvals/quick-action?id=${approval.id}&token=${token}&action=decline`;
  const dashboardUrl = `${baseUrl}/login`;
  const mediaUrl = resolveMediaUrl(approval.imagePath, baseUrl);
  const viewUrl = mediaOptions.mediaViewUrl || mediaUrl;
  const isVideo = isApprovalVideoPath(approval.imagePath);
  const inlineSrc = mediaOptions.inlineMediaSrc || null;

  const siteName = approval.selectedSite || approval.siteLink || "Crossway client";
  const displayUrl = String(siteName).replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const scheduledLabel = formatScheduleLabel(approval.scheduledFor) || "Immediately upon approval";
  const creatorName = approval.createdByName || "Social Media Manager";
  const creatorEmail = approval.createdByEmail || "";

  const destinations = [];
  if (approval.facebookPageId) destinations.push(`Facebook Page — ID ${escapeHtml(approval.facebookPageId)}`);
  if (approval.instagramUserId) destinations.push(`Instagram Account — ID ${escapeHtml(approval.instagramUserId)}`);
  if (approval.siteLink) {
    destinations.push(`Website — <a href="${escapeHtml(approval.siteLink)}" style="color:${T.ink};text-decoration:underline;">${escapeHtml(displayUrl)}</a>`);
  }
  const destinationsHtml = destinations.length
    ? destinations.map((d) => `<div style="margin-bottom:6px;font-size:14px;color:${T.ink};">${d}</div>`).join("")
    : `<span style="color:${T.muted};font-style:italic;">No destinations configured</span>`;

  const bodyHtml = `
    <p style="margin:0 0 8px;color:${T.ink};font-size:16px;font-weight:700;line-height:1.5;">
      Hello ${escapeHtml(assignee?.name || "Approver")},
    </p>
    <p style="margin:0 0 28px;color:${T.body};font-size:14px;line-height:1.7;">
      A new social post is ready for your review. The details, caption, and media are below — you can approve or decline directly from this email.
    </p>

    ${renderMetaTable([
      ["Client space", escapeHtml(displayUrl)],
      ["Post title", `<strong>${escapeHtml(approval.title)}</strong>`],
      ["Author", escapeHtml(`${creatorName}${creatorEmail ? ` (${creatorEmail})` : ""}`)],
      ["Scheduled", escapeHtml(scheduledLabel)],
      ["Destinations", destinationsHtml],
    ])}

    ${approval.caption ? `
    <div style="margin:0 0 28px;">
      ${sectionLabel("Post caption")}
      <div style="background-color:${T.altRow};border-radius:8px;border:1px solid ${T.border};padding:18px 20px;color:${T.ink};font-size:14px;line-height:1.7;white-space:pre-wrap;">${escapeHtml(approval.caption)}</div>
    </div>` : ""}

    ${renderMediaBlock({
      label: "Attached media",
      mediaUrl,
      viewUrl,
      alt: "Post media",
      isVideo,
      inlineSrc,
    })}

    ${renderActionButtons({
      approveUrl,
      declineUrl,
      approveLabel: "Approve post",
      declineLabel: "Decline post",
      declineNote: "You will be asked for a brief reason",
    })}

    ${renderDashboardLine(dashboardUrl, "Want to edit the caption or suggest changes?")}
    ${renderAutomatedNote("This is an automated notification from the Crossway content scheduler. If you received it in error, please contact your administrator.")}`;

  return renderEmailShell({
    title: "Post approval required — Crossway",
    preheader: `"${approval.title}" is awaiting your approval for ${displayUrl}.`,
    badge: "Approval required",
    heading: "Review drafted post",
    subheading: displayUrl,
    bodyHtml,
    baseUrl,
  });
}

// ---------------------------------------------------------------------------
// Social post status update
// ---------------------------------------------------------------------------

const STATUS_TONES = {
  approved: { color: "#1f7a3d", label: "Approved" },
  declined: { color: "#b3261e", label: "Declined" },
  edited: { color: "#9a6b00", label: "Edited" },
  published: { color: "#1d4ed8", label: "Published" },
};

export function generateStatusChangeEmail(approval, actionUser, status, detail, baseUrl, mediaOptions = {}) {
  const mediaUrl = resolveMediaUrl(approval.imagePath, baseUrl);
  const viewUrl = mediaOptions.mediaViewUrl || mediaUrl;
  const isVideo = isApprovalVideoPath(approval.imagePath);
  const inlineSrc = mediaOptions.inlineMediaSrc || null;
  const siteName = approval.selectedSite || approval.siteLink || "Crossway client";
  const displayUrl = String(siteName).replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const tone = STATUS_TONES[status] || { color: T.muted, label: String(status || "Updated") };
  const actorName = actionUser?.name || "the assignee";

  let statusDescription = "";
  if (status === "approved") {
    statusDescription = `The post has been approved by <strong>${escapeHtml(actorName)}</strong>.`;
  } else if (status === "declined") {
    statusDescription = `The post has been declined by <strong>${escapeHtml(actorName)}</strong>.${detail && String(detail).trim() ? " The reason is included below." : ""}`;
  } else if (status === "edited") {
    statusDescription = `The post has been edited by <strong>${escapeHtml(actorName)}</strong>.`;
  } else if (status === "published") {
    statusDescription = "The post has been published to the configured destinations.";
  } else {
    statusDescription = `The post status was updated to <strong>${escapeHtml(String(status))}</strong>.`;
  }

  const destinations = [];
  if (approval.facebookPageId) destinations.push(`Facebook Page — ID ${escapeHtml(approval.facebookPageId)}`);
  if (approval.instagramUserId) destinations.push(`Instagram Account — ID ${escapeHtml(approval.instagramUserId)}`);
  if (approval.siteLink) {
    destinations.push(`Website — <a href="${escapeHtml(approval.siteLink)}" style="color:${T.ink};text-decoration:underline;">${escapeHtml(displayUrl)}</a>`);
  }
  const destinationsHtml = destinations.length
    ? destinations.map((d) => `<div style="margin-bottom:6px;font-size:14px;color:${T.ink};">${d}</div>`).join("")
    : `<span style="color:${T.muted};font-style:italic;">No destinations configured</span>`;

  const previewCaption = approval.userEditedCaption || approval.caption || "";

  const bodyHtml = `
    <p style="margin:0 0 28px;color:${T.body};font-size:14px;line-height:1.7;">
      ${statusDescription}
    </p>

    ${detail ? `
    <div style="margin:0 0 28px;border-left:3px solid ${tone.color};background-color:${T.altRow};padding:16px 20px;border-radius:0 8px 8px 0;">
      ${sectionLabel(status === "declined" ? "Reason" : "Details")}
      <div style="font-size:14px;color:${T.ink};line-height:1.7;white-space:pre-wrap;">${escapeHtml(String(detail).replace(/^Rejection reason:\s*/i, ""))}</div>
    </div>` : ""}

    ${renderMetaTable([
      ["Client space", escapeHtml(displayUrl)],
      ["Post title", `<strong>${escapeHtml(approval.title)}</strong>`],
      ["Status", `<strong style="color:${tone.color};text-transform:uppercase;letter-spacing:1px;font-size:12px;">${escapeHtml(tone.label)}</strong>`],
      ["Updated by", escapeHtml(`${actionUser?.name || "N/A"}${actionUser?.email ? ` (${actionUser.email})` : ""}`)],
      ["Destinations", destinationsHtml],
    ])}

    ${previewCaption ? `
    <div style="margin:0 0 28px;">
      ${sectionLabel("Post caption")}
      <div style="background-color:${T.altRow};border-radius:8px;border:1px solid ${T.border};padding:18px 20px;color:${T.ink};font-size:14px;line-height:1.7;white-space:pre-wrap;">${escapeHtml(previewCaption)}</div>
    </div>` : ""}

    ${renderMediaBlock({
      label: "Attached media",
      mediaUrl,
      viewUrl,
      alt: "Post media",
      isVideo,
      inlineSrc,
    })}

    ${renderAutomatedNote("This is an automated status update from the Crossway content scheduler.")}`;

  return renderEmailShell({
    title: `Post ${tone.label.toLowerCase()} — Crossway`,
    preheader: `"${approval.title}" is now ${tone.label.toLowerCase()} (${displayUrl}).`,
    badge: `Post ${tone.label}`,
    badgeBg: tone.color,
    badgeColor: "#ffffff",
    heading: approval.title,
    subheading: displayUrl,
    bodyHtml,
    baseUrl,
  });
}

// ---------------------------------------------------------------------------
// Blog approval request
// ---------------------------------------------------------------------------

const BLOG_SOURCE_LABELS = {
  manual: "Created in Crossway",
  wordpress_pull: "Imported from WordPress",
  inbound: "Received via inbound API",
  email_inbound: "Received via email",
};

export function generateBlogApprovalEmail(blog, recipient, baseUrl, token, creator = null, mediaOptions = {}) {
  const approveUrl = token
    ? `${baseUrl}/api/blogs/quick-action?id=${blog.id}&token=${token}&action=approve`
    : `${baseUrl}/login`;
  const declineUrl = token
    ? `${baseUrl}/api/blogs/quick-action?id=${blog.id}&token=${token}&action=decline`
    : `${baseUrl}/login`;
  const dashboardUrl = `${baseUrl}/login`;

  const title = blog.userEditedTitle || blog.title || "Untitled blog";
  const excerpt = blog.userEditedExcerpt || blog.excerpt || "";
  const content = blog.userEditedContent || blog.content || "";
  const displayUrl = String(blog.siteLink || "").replace(/^https?:\/\//i, "").replace(/\/+$/, "") || "Crossway client";
  const mediaUrl = resolveMediaUrl(blog.featuredImagePath, baseUrl);
  const viewUrl = mediaOptions.mediaViewUrl || mediaUrl;
  const inlineSrc = mediaOptions.inlineMediaSrc || null;
  const scheduledLabel = formatScheduleLabel(blog.scheduledFor);
  const sourceLabel = BLOG_SOURCE_LABELS[blog.source] || null;
  const creatorLine = creator?.name ? `${creator.name}${creator.email ? ` (${creator.email})` : ""}` : null;

  const bodyHtml = `
    <p style="margin:0 0 8px;color:${T.ink};font-size:16px;font-weight:700;line-height:1.5;">
      Hello ${escapeHtml(recipient?.name || "there")},
    </p>
    <p style="margin:0 0 28px;color:${T.body};font-size:14px;line-height:1.7;">
      A blog article is ready for your review. The full article is included below — you can approve or decline directly from this email.
    </p>

    ${renderMetaTable([
      ["Client space", escapeHtml(displayUrl)],
      ["Blog title", `<strong>${escapeHtml(title)}</strong>`],
      ["Slug", blog.slug ? `<span style="font-family:${FONT};font-size:13px;">${escapeHtml(blog.slug)}</span>` : null],
      ["Author", creatorLine ? escapeHtml(creatorLine) : null],
      ["Source", sourceLabel ? escapeHtml(sourceLabel) : null],
      ["Publishes", scheduledLabel ? escapeHtml(scheduledLabel) : "After approval, per site schedule"],
    ])}

    ${renderMediaBlock({
      label: "Featured image",
      mediaUrl,
      viewUrl,
      alt: blog.featuredImageAlt || title,
      isVideo: false,
      inlineSrc,
    })}

    ${excerpt ? `
    <div style="margin:0 0 28px;">
      ${sectionLabel("Excerpt")}
      <div style="background-color:${T.altRow};border-radius:8px;border:1px solid ${T.border};padding:18px 20px;color:${T.ink};font-size:14px;line-height:1.7;font-style:italic;">${escapeHtml(excerpt)}</div>
    </div>` : ""}

    ${renderActionButtons({
      approveUrl,
      declineUrl,
      approveLabel: "Approve blog",
      declineLabel: "Decline blog",
      declineNote: "You will be asked for a brief reason",
    })}

    ${renderDashboardLine(dashboardUrl, "Prefer to edit the article or leave feedback?")}

    ${content ? `
    <div style="margin:32px 0 0;">
      ${sectionLabel("Full article")}
      <div style="border:1px solid ${T.border};border-radius:8px;padding:28px 30px;background-color:#fffefb;color:#2a2823;font-size:15px;line-height:1.8;font-family:${SERIF};word-break:break-word;">
        ${sanitizeEmailHtml(content)}
      </div>
    </div>` : ""}

    ${renderAutomatedNote("This is an automated notification from the Crossway blog approval queue. If you received it in error, please contact your administrator.")}`;

  return renderEmailShell({
    title: "Blog approval required — Crossway",
    preheader: `"${title}" is awaiting your approval for ${displayUrl}.`,
    badge: "Approval required",
    heading: "Review blog article",
    subheading: displayUrl,
    bodyHtml,
    baseUrl,
  });
}

// ---------------------------------------------------------------------------
// Blog published notification
// ---------------------------------------------------------------------------

const BLOG_PUBLISH_METHOD_LABELS = {
  wordpress: "WordPress",
  webhook: "Webhook",
  email: "Email delivery",
};

export function generateBlogPublishedEmail(blog, method, externalId, baseUrl, opts = {}) {
  const title = blog.userEditedTitle || blog.title || "Untitled blog";
  const displayUrl = String(blog.siteLink || "").replace(/^https?:\/\//i, "").replace(/\/+$/, "") || "Crossway client";
  const mediaUrl = resolveMediaUrl(blog.featuredImagePath, baseUrl);
  const methodLabel = BLOG_PUBLISH_METHOD_LABELS[method] || method || "delivery chain";
  const liveLink = opts.link || null;

  const bodyHtml = `
    <p style="margin:0 0 28px;color:${T.body};font-size:14px;line-height:1.7;">
      The blog article below has been published successfully${method === "wordpress" ? " on WordPress" : ""}.
    </p>

    ${renderMetaTable([
      ["Client space", escapeHtml(displayUrl)],
      ["Blog title", `<strong>${escapeHtml(title)}</strong>`],
      ["Published via", escapeHtml(methodLabel)],
      ["Live URL", liveLink ? `<a href="${escapeHtml(liveLink)}" style="color:${T.link};">${escapeHtml(liveLink)}</a>` : null],
      ["External ID", externalId ? `<span style="font-family:${FONT};font-size:13px;">${escapeHtml(String(externalId))}</span>` : null],
    ])}

    ${renderMediaBlock({
      label: "Featured image",
      mediaUrl,
      viewUrl: mediaUrl,
      alt: blog.featuredImageAlt || title,
      isVideo: false,
    })}

    ${renderAutomatedNote("This is an automated publish confirmation from the Crossway blog approval queue.")}`;

  return renderEmailShell({
    title: "Blog published — Crossway",
    preheader: `"${title}" has been published (${displayUrl}).`,
    badge: "Published",
    badgeBg: "#1f7a3d",
    badgeColor: "#ffffff",
    heading: title,
    subheading: displayUrl,
    bodyHtml,
    baseUrl,
  });
}

// ---------------------------------------------------------------------------
// Weekly SEO digest
// ---------------------------------------------------------------------------

/**
 * Weekly SEO digest across client sites.
 * @param {Array<{siteUrl:string,taskCount?:number,striking?:number,cannibalization?:number,decayingQueries?:number,deviceGaps?:number,sitemapWarnings?:string[],topTasks?:string[],error?:string}>} siteSummaries
 * @param {string} [dashboardUrl]
 */
export function generateSeoDigestEmail(siteSummaries = [], dashboardUrl = "") {
  const totalTasks = siteSummaries.reduce((s, x) => s + (Number(x.taskCount) || 0), 0);
  const sitesHtml = (siteSummaries || [])
    .map((site) => {
      const host = String(site.siteUrl || "")
        .replace(/^https?:\/\//i, "")
        .replace(/\/+$/, "");
      const tasks = (site.topTasks || [])
        .map(
          (t) =>
            `<li style="margin:0 0 6px;color:#334155;font-size:13px;line-height:1.45;">${escapeHtml(t)}</li>`
        )
        .join("");
      const err = site.error
        ? `<p style="margin:8px 0 0;color:#b91c1c;font-size:12px;">Could not load: ${escapeHtml(site.error)}</p>`
        : "";
      return `
        <div style="margin:0 0 18px;border:1px solid #e2e8f0;border-radius:10px;padding:16px 18px;background:#fff;">
          <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#0f172a;">${escapeHtml(host || site.siteUrl)}</p>
          <p style="margin:0 0 10px;font-size:12px;color:#64748b;">
            Tasks ~${Number(site.taskCount) || 0}
            · Striking ${Number(site.striking) || 0}
            · Cannibalization ${Number(site.cannibalization) || 0}
            · Decay ${Number(site.decayingQueries) || 0}
            · Device gaps ${Number(site.deviceGaps) || 0}
          </p>
          ${tasks ? `<ul style="margin:0;padding-left:18px;">${tasks}</ul>` : `<p style="margin:0;color:#94a3b8;font-size:13px;">No priority items this week.</p>`}
          ${err}
        </div>`;
    })
    .join("");

  const cta = dashboardUrl
    ? `<p style="margin:24px 0 0;text-align:center;">
         <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#1d9c35;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:8px;">
           Open SEO Opportunities
         </a>
       </p>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width">${FONT_LINK}</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:${FONT};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:28px 12px;">
    <tr><td align="center">
      <table width="100%" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr>
          <td style="background:#0f172a;padding:22px 28px;">
            <p style="margin:0;color:#86efac;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">Crossway SEO Tool</p>
            <h1 style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:700;">Weekly SEO digest</h1>
            <p style="margin:8px 0 0;color:#cbd5e1;font-size:13px;">${siteSummaries.length} site(s) · ~${totalTasks} opportunity signals</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 28px;">
            <p style="margin:0 0 18px;color:#475569;font-size:14px;line-height:1.55;">
              Priority items from Search Console for the last 28 days (vs prior period). Use the in-app SEO Opportunities panel for full lists.
            </p>
            ${sitesHtml || `<p style="color:#64748b;font-size:14px;">No websites found to report on.</p>`}
            ${cta}
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:16px 28px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:11px;">&copy; ${new Date().getFullYear()} Crossway Consulting</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
