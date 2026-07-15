export function generateApprovalNotificationEmail(approval, assignee, baseUrl, token) {
  const approvalUrl = `${baseUrl}/api/approvals/quick-action?id=${approval.id}&token=${token}&action=approve`;
  const rejectUrl = `${baseUrl}/api/approvals/quick-action?id=${approval.id}&token=${token}&action=decline`;
  const dashboardUrl = `${baseUrl}/login`;

  const imageUrl = approval.imagePath
    ? (approval.imagePath.startsWith('http') ? approval.imagePath : `${baseUrl}${approval.imagePath}`)
    : null;

  // Resolve page / site label
  const pageLabel = (() => {
    if (approval.facebookPageId && approval.instagramUserId) return `FB: ${approval.facebookPageId} & IG: ${approval.instagramUserId}`;
    if (approval.facebookPageId) return `FB: ${approval.facebookPageId}`;
    if (approval.instagramUserId) return `IG: ${approval.instagramUserId}`;
    if (approval.selectedSite) return approval.selectedSite;
    if (approval.siteLink) return approval.siteLink;
    return "—";
  })();

  const siteName = approval.selectedSite || approval.siteLink || "Crossway client";
  const displayUrl = siteName.replace(/^https?:\/\//i, '').replace(/\/+$/, '');

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
  const creatorName = approval.createdByName || "Social Media Manager";
  const creatorEmail = approval.createdByEmail || "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Crossway Content Approval Required</title>
  <style>
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; max-width: 100% !important; padding: 10px !important; }
      .header { padding: 24px 20px !important; }
      .content { padding: 24px 20px !important; }
      .preview-container { flex-direction: column !important; }
      .preview-card { width: 100% !important; margin-bottom: 20px !important; margin-right: 0 !important; max-width: 100% !important; }
      .btn-table { width: 100% !important; }
      .btn-cell { display: block !important; width: 100% !important; padding: 5px 0 !important; }
      .details-table td { padding: 8px 10px !important; font-size: 12px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#0b0f19;font-family:'Nunito',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0b0f19;padding:40px 10px;">
    <tr>
      <td align="center">
        <!-- Main Wrapper Card -->
        <table class="container" width="100%" cellpadding="0" cellspacing="0" style="max-width:650px;background-color:#161f30;border-radius:16px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,0.4);border:1px solid #233149;">
          
          <!-- Premium Header with Logo Theme -->
          <tr>
            <td class="header" style="background: linear-gradient(135deg, #161f30 0%, #0d1527 100%); padding: 32px 40px; border-bottom: 2px solid #0EFF2A; text-align: center; position: relative;">
              <!-- Subtle accent glow -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <div style="background-color: #0EFF2A; color: #000000; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; padding: 4px 12px; border-radius: 20px; display: inline-block; margin-bottom: 16px; box-shadow: 0 0 15px rgba(14,255,42,0.4);">
                      ACTION REQUIRED
                    </div>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; line-height: 1.2;">
                    Review Drafted Post
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size: 14px; color: #94a3b8; margin-top: 6px; font-weight: 500;">
                    Crossway Marketing Platform
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td class="content" style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #f1f5f9; font-size: 16px; font-weight: 600; line-height: 1.5;">
                Hello ${assignee.name || "Approver"},
              </p>
              <p style="margin: 0 0 32px; color: #94a3b8; font-size: 14px; line-height: 1.6;">
                A new social media post has been created for <strong style="color: #0EFF2A;">${displayUrl}</strong> and is awaiting your approval before it goes live. Please review the platform mockups below.
              </p>

              <!-- Meta Data Grid -->
              <table class="details-table" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; background-color: #0f172a; border-radius: 12px; border: 1px solid #1e293b; overflow: hidden; margin-bottom: 32px;">
                <tr style="background-color: #1e293b;">
                  <td style="padding: 12px 20px; font-size: 12px; font-weight: bold; color: #94a3b8; border-bottom: 1px solid #0f172a; width: 130px;">PROPERTY</td>
                  <td style="padding: 12px 20px; font-size: 13px; font-weight: 700; color: #ffffff; border-bottom: 1px solid #0f172a;">${displayUrl}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 20px; font-size: 12px; font-weight: bold; color: #94a3b8; border-bottom: 1px solid #1e293b;">TITLE</td>
                  <td style="padding: 12px 20px; font-size: 13px; color: #f1f5f9; font-weight: 600; border-bottom: 1px solid #1e293b;">${approval.title}</td>
                </tr>
                <tr style="background-color: #131b2e;">
                  <td style="padding: 12px 20px; font-size: 12px; font-weight: bold; color: #94a3b8; border-bottom: 1px solid #1e293b;">CREATOR</td>
                  <td style="padding: 12px 20px; font-size: 13px; color: #f1f5f9; border-bottom: 1px solid #1e293b;">${creatorName} ${creatorEmail ? `&lt;${creatorEmail}&gt;` : ""}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 20px; font-size: 12px; font-weight: bold; color: #94a3b8; border-bottom: 1px solid #1e293b;">SCHEDULED</td>
                  <td style="padding: 12px 20px; font-size: 13px; font-weight: 700; color: #0EFF2A; border-bottom: 1px solid #1e293b;">
                    📅 ${scheduledLabel}
                  </td>
                </tr>
                <tr style="background-color: #131b2e;">
                  <td style="padding: 12px 20px; font-size: 12px; font-weight: bold; color: #94a3b8;">PLATFORMS</td>
                  <td style="padding: 12px 20px; font-size: 13px; color: #f1f5f9; font-weight: 600;">
                    <span style="background-color: #1e293b; color: #0EFF2A; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; border: 1px solid rgba(14,255,42,0.25); text-transform: uppercase;">
                      ${platformsBadge}
                    </span>
                  </td>
                </tr>
              </table>

              <!-- Caption Bubble -->
              ${approval.caption ? `
              <div style="margin-bottom: 32px;">
                <p style="margin: 0 0 10px; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #94a3b8; letter-spacing: 1px;">Post Caption</p>
                <div style="background-color: #0f172a; border-radius: 12px; border: 1px solid #1e293b; padding: 18px; color: #e2e8f0; font-size: 14px; line-height: 1.6; white-space: pre-wrap; font-family: inherit;">${approval.caption}</div>
              </div>` : ''}

              <!-- Previews Section Title -->
              <p style="margin: 0 0 16px; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #94a3b8; letter-spacing: 1px; text-align: center;">Mockup Previews</p>

              <!-- Dual Platform Mockups -->
              <div class="preview-container" style="display: flex; gap: 16px; margin-bottom: 36px; justify-content: center; width: 100%;">
                
                <!-- 🟦 Facebook Mockup (1.91:1 Aspect Ratio) -->
                ${approval.facebookPageId ? `
                <div class="preview-card" style="flex: 1; min-width: 260px; max-width: 290px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); border: 1px solid #e2e8f0; font-family: Helvetica, Arial, sans-serif; overflow: hidden; text-align: left;">
                  <!-- Header -->
                  <div style="padding: 12px; display: flex; align-items: center;">
                    <div style="width: 36px; height: 36px; border-radius: 50%; background-color: #1877F2; color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; margin-right: 8px; font-family: inherit;">
                      f
                    </div>
                    <div>
                      <p style="margin: 0; font-size: 13px; font-weight: bold; color: #1c1e21; font-family: inherit;">${displayUrl}</p>
                      <p style="margin: 0; font-size: 11px; color: #606770; font-family: inherit;">Sponsored · 🌐</p>
                    </div>
                  </div>
                  <!-- Post text snippet -->
                  <div style="padding: 0 12px 10px; font-size: 12px; line-height: 1.5; color: #1c1e21; font-family: inherit; height: 36px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
                    ${approval.caption || approval.title}
                  </div>
                  <!-- Image (1.91:1) -->
                  <div style="width: 100%; height: 146px; background-color: #000000; overflow: hidden; position: relative;">
                    ${imageUrl ? `<img src="${imageUrl}" alt="FB Preview" style="width: 100%; height: 100%; object-fit: cover;" />` : ''}
                  </div>
                  <!-- Footer -->
                  <div style="background-color: #f0f2f5; padding: 10px 12px; border-bottom: 1px solid #e4e6eb;">
                    <p style="margin: 0; font-size: 11px; color: #606770; text-transform: uppercase; font-family: inherit;">${displayUrl}</p>
                    <p style="margin: 2px 0 0; font-size: 13px; font-weight: bold; color: #1c1e21; font-family: inherit; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${approval.title}</p>
                  </div>
                  <!-- Like/Comment/Share Bar -->
                  <div style="padding: 8px 12px; display: flex; justify-content: space-between; font-size: 12px; color: #606770; font-weight: bold; font-family: inherit;">
                    <span>👍 Like</span>
                    <span>💬 Comment</span>
                    <span>↩ Share</span>
                  </div>
                </div>` : ''}

                <!-- 🟣 Instagram Mockup (1:1 Aspect Ratio) -->
                ${approval.instagramUserId ? `
                <div class="preview-card" style="flex: 1; min-width: 260px; max-width: 290px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); border: 1px solid #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, sans-serif; overflow: hidden; text-align: left;">
                  <!-- Header -->
                  <div style="padding: 10px 12px; display: flex; align-items: center; border-bottom: 1px solid #efefef;">
                    <div style="width: 30px; height: 30px; border-radius: 50%; background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%); display: flex; align-items: center; justify-content: center; margin-right: 8px;">
                      <div style="width: 26px; height: 26px; border-radius: 50%; background-color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; color: #bc1888;">
                        IG
                      </div>
                    </div>
                    <div>
                      <p style="margin: 0; font-size: 12px; font-weight: bold; color: #262626; font-family: inherit;">${displayUrl.split('.')[0] || 'brand'}</p>
                      <p style="margin: 0; font-size: 10px; color: #8e8e8e; font-family: inherit;">Original Post</p>
                    </div>
                  </div>
                  <!-- Image (1:1) -->
                  <div style="width: 100%; height: 240px; background-color: #fafafa; overflow: hidden; position: relative;">
                    ${imageUrl ? `<img src="${imageUrl}" alt="IG Preview" style="width: 100%; height: 100%; object-fit: cover;" />` : ''}
                  </div>
                  <!-- Icons Bar -->
                  <div style="padding: 10px 12px 6px; font-size: 16px; color: #262626; font-family: inherit;">
                    ❤️ 💬 ✈️
                  </div>
                  <!-- Caption block -->
                  <div style="padding: 0 12px 12px; font-size: 11px; line-height: 1.4; color: #262626; font-family: inherit; height: 32px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
                    <span style="font-weight: bold; margin-right: 4px;">${displayUrl.split('.')[0] || 'brand'}</span>
                    ${approval.caption || approval.title}
                  </div>
                </div>` : ''}

              </div>

              <!-- Action Call to Buttons -->
              <table class="btn-table" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td class="btn-cell" align="center" width="50%" style="padding-right: 8px;">
                    <a href="${approvalUrl}"
                       style="display: block; padding: 14px 24px; background-color: #0EFF2A; color: #000000; font-size: 15px; font-weight: bold; text-decoration: none; border-radius: 10px; text-align: center; box-shadow: 0 4px 14px rgba(14,255,42,0.3); transition: transform 0.2s;">
                      ✓ Approve Draft
                    </a>
                  </td>
                  <td class="btn-cell" align="center" width="50%" style="padding-left: 8px;">
                    <a href="${rejectUrl}"
                       style="display: block; padding: 14px 24px; background-color: #3b1c20; color: #fecaca; font-size: 15px; font-weight: bold; text-decoration: none; border-radius: 10px; text-align: center; border: 1px solid rgba(239,68,68,0.25);">
                      ✗ Reject Draft
                    </a>
                  </td>
                </tr>
              </table>

              <div style="text-align: center; margin-top: 24px;">
                <p style="margin: 0; color: #94a3b8; font-size: 13px;">
                  Need to make adjustments? <a href="${dashboardUrl}" style="color: #0EFF2A; font-weight: 700; text-decoration: none; border-bottom: 1px dashed #0EFF2A; padding-bottom: 1px;">Open Crossway Dashboard</a>
                </p>
              </div>

              <hr style="margin: 36px 0; border: none; border-top: 1px solid #233149;">
              <p style="margin: 0; color: #64748b; font-size: 11px; line-height: 1.5; text-align: center;">
                This approval notification is fully automated and was triggered by Crossway SEO & Marketing Scheduler. If you received this in error, please contact support.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #0d1527; padding: 24px 40px; text-align: center; border-top: 1px solid #233149;">
              <p style="margin: 0; color: #64748b; font-size: 11px;">
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
