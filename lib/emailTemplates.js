export function generateApprovalNotificationEmail(approval, assignee, baseUrl, token) {
  const approvalUrl = `${baseUrl}/api/approvals/quick-action?id=${approval.id}&token=${token}&action=approve`;
  const rejectUrl = `${baseUrl}/api/approvals/quick-action?id=${approval.id}&token=${token}&action=decline`;
  const dashboardUrl = `${baseUrl}/login`;

  const imageUrl = approval.imagePath
    ? (approval.imagePath.startsWith('http') ? approval.imagePath : `${baseUrl}${approval.imagePath}`)
    : null;

  // Resolve page / site label
  const siteName = approval.selectedSite || approval.siteLink || "Crossway client";
  const displayUrl = siteName.replace(/^https?:\/\//i, '').replace(/\/+$/, '');

  // Scheduled time
  const scheduledLabel = approval.scheduledFor
    ? new Date(approval.scheduledFor).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })
    : "Immediately upon approval";

  // Creator
  const creatorName = approval.createdByName || "Social Media Manager";
  const creatorEmail = approval.createdByEmail || "";

  // Render destinations
  const destinationsHtml = (() => {
    const items = [];
    if (approval.facebookPageId) {
      items.push(`
        <li style="margin-bottom: 6px; font-size: 14px; color: #0f172a;">
          Facebook Page (ID: <strong>${approval.facebookPageId}</strong>)
        </li>
      `);
    }
    if (approval.instagramUserId) {
      items.push(`
        <li style="margin-bottom: 6px; font-size: 14px; color: #0f172a;">
          Instagram Account (ID: <strong>${approval.instagramUserId}</strong>)
        </li>
      `);
    }
    if (approval.siteLink) {
      items.push(`
        <li style="margin-bottom: 6px; font-size: 14px; color: #0f172a;">
          Website (URL: <a href="${approval.siteLink}" style="color: #2563eb; text-decoration: none;">${displayUrl}</a>)
        </li>
      `);
    }
    
    if (items.length === 0) {
      return `<p style="margin: 0; color: #64748b; font-size: 14px; font-style: italic;">No destinations configured</p>`;
    }
    
    return `<ul style="margin: 0; padding: 0; list-style-type: none;">${items.join("")}</ul>`;
  })();

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Crossway Content Approval Required</title>
  <style>
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; max-width: 100% !important; border-radius: 0 !important; border: none !important; }
      .content { padding: 24px 20px !important; }
      .btn-table { width: 100% !important; }
      .btn-cell { display: block !important; width: 100% !important; padding: 6px 0 !important; box-sizing: border-box; }
      .btn-cell a { padding: 14px 10px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:40px 0;">
    <tr>
      <td align="center">
        <!-- Main Container Card -->
        <table class="container" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.04);border:1px solid #e2e8f0;">
          
          <!-- Premium Minimal Header -->
          <tr>
            <td style="background-color:#000000;padding:40px 40px;text-align:left;border-bottom:4px solid #1e293b;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="background-color:#ffffff;color:#000000;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:2px;padding:4px 12px;border-radius:4px;display:inline-block;margin-bottom:16px;">
                      APPROVAL REQUIRED
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;line-height:1.2;font-family:inherit;">
                    Review Drafted Post
                  </td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#94a3b8;padding-top:6px;font-weight:600;letter-spacing:1px;">
                    CROSSWAY CONSULTING
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td class="content" style="padding: 40px; background-color: #ffffff;">
              <p style="margin: 0 0 16px; color: #0f172a; font-size: 16px; font-weight: 700; line-height: 1.5;">
                Hello ${assignee.name || "Approver"},
              </p>
              <p style="margin: 0 0 28px; color: #475569; font-size: 14px; line-height: 1.6;">
                A new post is ready for your review and approval. Please inspect the post details, caption, and full-width media below.
              </p>

              <!-- Property & Schedule Grid -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; margin-bottom: 28px;">
                <tr style="background-color: #f8fafc;">
                  <td style="padding: 14px 18px; font-size: 11px; font-weight: 800; color: #64748b; border-bottom: 1px solid #e2e8f0; width: 120px; text-transform: uppercase; letter-spacing: 0.5px;">Client Space</td>
                  <td style="padding: 14px 18px; font-size: 13px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${displayUrl}</td>
                </tr>
                <tr>
                  <td style="padding: 14px 18px; font-size: 11px; font-weight: 800; color: #64748b; border-bottom: 1px solid #e2e8f0; text-transform: uppercase; letter-spacing: 0.5px;">Post Title</td>
                  <td style="padding: 14px 18px; font-size: 13px; color: #0f172a; font-weight: 600; border-bottom: 1px solid #e2e8f0;">${approval.title}</td>
                </tr>
                <tr style="background-color: #f8fafc;">
                  <td style="padding: 14px 18px; font-size: 11px; font-weight: 800; color: #64748b; border-bottom: 1px solid #e2e8f0; text-transform: uppercase; letter-spacing: 0.5px;">Author</td>
                  <td style="padding: 14px 18px; font-size: 13px; color: #334155; border-bottom: 1px solid #e2e8f0;">${creatorName} ${creatorEmail ? `(${creatorEmail})` : ""}</td>
                </tr>
                <tr>
                  <td style="padding: 14px 18px; font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Scheduled</td>
                  <td style="padding: 14px 18px; font-size: 13px; font-weight: 700; color: #0f172a;">
                    📅 ${scheduledLabel}
                  </td>
                </tr>
              </table>

              <!-- Destinations Section -->
              <div style="margin-bottom: 28px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; background-color: #ffffff;">
                <p style="margin: 0 0 10px; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px;">Publishing Destinations</p>
                ${destinationsHtml}
              </div>

              <!-- Caption Bubble -->
              ${approval.caption ? `
              <div style="margin-bottom: 28px;">
                <p style="margin: 0 0 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px;">Post Caption</p>
                <div style="background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; padding: 18px; color: #1e293b; font-size: 14px; line-height: 1.6; white-space: pre-wrap; font-family: inherit;">${approval.caption}</div>
              </div>` : ''}

              <!-- Full-Width Media Section -->
              ${imageUrl ? `
              <div style="margin-bottom: 32px;">
                <p style="margin: 0 0 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px;">Attached Media</p>
                <div style="background-color: #fafafa; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; padding: 8px; text-align: center;">
                  <img src="${imageUrl}" alt="Attached Post Media" style="max-width: 100%; max-height: 480px; width: auto; height: auto; border-radius: 6px; display: block; margin: 0 auto; object-fit: contain;" />
                </div>
              </div>` : ''}

              <!-- Action Call to Buttons -->
              <table class="btn-table" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 28px;">
                <tr>
                  <td class="btn-cell" align="center" width="50%" style="padding-right: 8px;">
                    <a href="${approvalUrl}"
                       style="display: block; padding: 14px 24px; background-color: #000000; color: #ffffff; font-size: 14px; font-weight: bold; text-decoration: none; border-radius: 8px; text-align: center; border: 2px solid #000000; box-shadow: 0 4px 12px rgba(0,0,0,0.06); letter-spacing: 0.5px;">
                      ✓ APPROVE POST
                    </a>
                  </td>
                  <td class="btn-cell" align="center" width="50%" style="padding-left: 8px;">
                    <a href="${rejectUrl}"
                       style="display: block; padding: 14px 24px; background-color: #ffffff; color: #000000; font-size: 14px; font-weight: bold; text-decoration: none; border-radius: 8px; text-align: center; border: 2px solid #000000; box-shadow: 0 4px 12px rgba(0,0,0,0.03); letter-spacing: 0.5px;">
                      ✗ DECLINE POST
                    </a>
                  </td>
                </tr>
              </table>

              <div style="text-align: center;">
                <p style="margin: 0; color: #64748b; font-size: 13px;">
                  Want to edit text or suggest changes? <a href="${dashboardUrl}" style="color: #000000; font-weight: 700; text-decoration: underline;">Open Crossway Dashboard</a>
                </p>
              </div>

              <hr style="margin: 36px 0; border: none; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #94a3b8; font-size: 11px; line-height: 1.5; text-align: center;">
                This is an automated notification from Crossway SEO & Marketing Scheduler. If you received this in error, please contact your administrator.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 28px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #94a3b8; font-size: 11px;">
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
