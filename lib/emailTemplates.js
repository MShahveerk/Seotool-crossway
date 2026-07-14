export function generateApprovalNotificationEmail(approval, assignee, baseUrl, token) {
  const approvalUrl = `${baseUrl}/api/approvals/quick-action?id=${approval.id}&token=${token}&action=approve`;
  const rejectUrl = `${baseUrl}/api/approvals/quick-action?id=${approval.id}&token=${token}&action=decline`;
  const dashboardUrl = `${baseUrl}/login`;

  const imageUrl = approval.imagePath
    ? (approval.imagePath.startsWith('http') ? approval.imagePath : `${baseUrl}${approval.imagePath}`)
    : null;

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
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0EFF2A 0%,#0BCC22 100%);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#000000;font-size:24px;font-weight:800;">Content Approval Required</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 16px;color:#111827;font-size:20px;font-weight:600;">Hello${assignee.name ? ` ${assignee.name}` : ""},</h2>
              <p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.6;">
                A new post has been drafted for your social media accounts and is waiting for your review.
              </p>

              <!-- Content Preview Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:28px;">
                <tr>
                  <td style="padding:24px;">
                    <div style="margin-bottom:16px;">
                      <span style="display:inline-block;padding:6px 12px;background-color:#1e3a8a;color:#ffffff;font-size:12px;font-weight:700;text-transform:uppercase;border-radius:4px;letter-spacing:1px;">
                        PLATFORMS: ${[
                          assignee.facebookPageId ? "Facebook" : null,
                          assignee.instagramUserId ? "Instagram" : null
                        ].filter(Boolean).join(" & ") || "Pending Assignment"}
                      </span>
                    </div>
                    <h3 style="margin:0 0 12px;color:#374151;font-size:14px;text-transform:uppercase;letter-spacing:1px;">Post Details</h3>
                    <p style="margin:0 0 16px;color:#111827;font-size:18px;font-weight:bold;">
                      ${approval.title}
                    </p>
                    ${approval.caption ? `
                    <div style="background-color:#ffffff;border:1px solid #e5e7eb;border-radius:6px;padding:16px;margin-bottom:20px;">
                      <p style="margin:0;color:#4b5563;font-size:14px;white-space:pre-wrap;">${approval.caption}</p>
                    </div>
                    ` : ''}
                    ${imageUrl ? `
                    <div style="text-align:center;margin-bottom:16px;">
                      <img src="${imageUrl}" alt="Post Media" style="max-width:100%;height:auto;border-radius:8px;border:1px solid #e5e7eb;" />
                    </div>
                    ` : ''}
                  </td>
                </tr>
              </table>

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
                This email was sent by Crossway SEO Tool. If you are not responsible for reviewing content, please notify your administrator.
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
