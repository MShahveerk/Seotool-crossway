export function generateApprovalNotificationEmail(approval, assignee, baseUrl, token) {
  const approvalUrl = `${baseUrl}/api/approvals/quick-action?id=${approval.id}&token=${token}&action=approve`;
  const rejectUrl = `${baseUrl}/api/approvals/quick-action?id=${approval.id}&token=${token}&action=decline`;
  const dashboardUrl = `${baseUrl}/login`;

  const imageUrl = approval.imagePath
    ? (approval.imagePath.startsWith('http') ? approval.imagePath : `${baseUrl}${approval.imagePath}`)
    : null;

  // Determine page / site label
  const pageLabel = (() => {
    if (approval.facebookPageId && approval.instagramUserId) return `Facebook Page ${approval.facebookPageId} & Instagram ${approval.instagramUserId}`;
    if (approval.facebookPageId) return `Facebook Page ID: ${approval.facebookPageId}`;
    if (approval.instagramUserId) return `Instagram User ID: ${approval.instagramUserId}`;
    if (approval.selectedSite) return approval.selectedSite;
    if (approval.siteLink) return approval.siteLink;
    return "—";
  })();

  // Determine platforms badge text
  const platformsBadge = (() => {
    const parts = [];
    if (approval.facebookPageId) parts.push("Facebook");
    if (approval.instagramUserId) parts.push("Instagram");
    if (approval.siteLink || approval.selectedSite) parts.push("Web");
    return parts.join(" & ") || "Pending Assignment";
  })();

  // Scheduled time
  const scheduledLabel = approval.scheduledFor
    ? new Date(approval.scheduledFor).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })
    : "Immediately upon approval";

  // Creator
  const creatorName = approval.createdByName || "Admin";
  const creatorEmail = approval.createdByEmail || "";

  // Row helper for the details table
  const row = (label, value, shade) =>
    `<tr style="background-color:${shade ? '#f9fafb' : '#ffffff'};">
      <td style="padding:10px 16px;font-weight:600;color:#374151;font-size:13px;border-bottom:1px solid #e5e7eb;white-space:nowrap;width:140px;">${label}</td>
      <td style="padding:10px 16px;color:#4b5563;font-size:13px;border-bottom:1px solid #e5e7eb;word-break:break-all;">${value}</td>
    </tr>`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Post Requires Approval</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0EFF2A 0%,#0BCC22 100%);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#000000;font-size:24px;font-weight:800;">Content Approval Required</h1>
              <p style="margin:8px 0 0;color:#000000;font-size:14px;opacity:0.75;">Crossway SEO Tool</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:600;">Hello${assignee.name ? ` ${assignee.name}` : ""},</h2>
              <p style="margin:0 0 28px;color:#4b5563;font-size:15px;line-height:1.6;">
                A new social media post has been drafted and is waiting for your review and approval.
              </p>

              <!-- Platform badge -->
              <div style="margin-bottom:20px;">
                <span style="display:inline-block;padding:6px 14px;background-color:#1e3a8a;color:#ffffff;font-size:12px;font-weight:700;text-transform:uppercase;border-radius:4px;letter-spacing:1px;">
                  PLATFORM: ${platformsBadge}
                </span>
              </div>

              <!-- Post Details table -->
              <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
                ${row("Post Title", `<strong style="color:#111827;font-size:15px;">${approval.title}</strong>`, true)}
                ${row("Page / Site", pageLabel, false)}
                ${row("Created By", creatorEmail ? `${creatorName} &lt;${creatorEmail}&gt;` : creatorName, true)}
                ${row("Scheduled For", scheduledLabel, false)}
                ${row("Status", '<span style="background:#fef3c7;color:#92400e;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">Pending Approval</span>', true)}
              </table>

              ${approval.caption ? `
              <!-- Caption -->
              <div style="margin-bottom:24px;">
                <p style="margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;">Post Caption</p>
                <div style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;">
                  <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;white-space:pre-wrap;">${approval.caption}</p>
                </div>
              </div>` : ''}

              ${imageUrl ? `
              <!-- Media Preview -->
              <div style="margin-bottom:28px;">
                <p style="margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;">Media Preview</p>
                <div style="text-align:center;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background:#000;">
                  <img src="${imageUrl}" alt="Post Media" style="max-width:100%;height:auto;max-height:360px;display:block;margin:0 auto;" />
                </div>
              </div>` : ''}

              <!-- Action Buttons -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center" style="padding-right:8px;">
                    <a href="${approvalUrl}"
                       style="display:block;padding:14px 24px;background-color:#0EFF2A;color:#000000;font-size:16px;font-weight:700;text-decoration:none;border-radius:8px;text-align:center;">
                      ✓ Approve Post
                    </a>
                  </td>
                  <td align="center" style="padding-left:8px;">
                    <a href="${rejectUrl}"
                       style="display:block;padding:14px 24px;background-color:#fee2e2;color:#991b1b;font-size:16px;font-weight:700;text-decoration:none;border-radius:8px;text-align:center;">
                      ✗ Reject Post
                    </a>
                  </td>
                </tr>
              </table>

              <div style="text-align:center;">
                <p style="margin:0;color:#6b7280;font-size:14px;">
                  Need to make edits? <a href="${dashboardUrl}" style="color:#2563eb;font-weight:600;text-decoration:none;">Log in to the dashboard</a>
                </p>
              </div>

              <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">
                This email was sent by Crossway SEO Tool. If you believe you received this in error, please contact your administrator.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                &copy; ${new Date().getFullYear()} Crossway Consulting. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
