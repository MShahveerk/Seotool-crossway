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
      .header { padding: 32px 20px !important; }
      .content { padding: 32px 20px !important; }
      .preview-container { flex-direction: column !important; }
      .preview-card { width: 100% !important; margin-bottom: 20px !important; margin-right: 0 !important; max-width: 100% !important; }
      .btn-table { width: 100% !important; }
      .btn-cell { display: block !important; width: 100% !important; padding: 5px 0 !important; }
      .details-table td { padding: 10px 12px !important; font-size: 12px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:40px 10px;">
    <tr>
      <td align="center">
        <!-- Main Wrapper Card -->
        <table class="container" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.06);border:1px solid #e2e8f0;">
          
          <!-- Premium Header (Black & White Theme) -->
          <tr>
            <td class="header" style="background-color: #000000; padding: 36px 40px; text-align: center; border-bottom: 4px solid #334155;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom: 16px;">
                    <!-- Crossway Logo -->
                    <img src="${baseUrl}/crossway-logo.png" alt="Crossway Logo" width="67" height="55" style="display: inline-block; border-radius: 8px; background-color: #ffffff; padding: 4px; object-fit: contain;" />
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <div style="background-color: #ffffff; color: #000000; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; padding: 4px 12px; border-radius: 4px; display: inline-block; margin-bottom: 16px;">
                      ACTION REQUIRED
                    </div>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; line-height: 1.2;">
                    Review Drafted Post
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size: 13px; color: #94a3b8; margin-top: 6px; font-weight: 500; letter-spacing: 0.5px;">
                    CROSSWAY CONSULTING
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td class="content" style="padding: 40px; background-color: #ffffff;">
              <p style="margin: 0 0 20px; color: #0f172a; font-size: 16px; font-weight: 700; line-height: 1.5;">
                Hello ${assignee.name || "Approver"},
              </p>
              <p style="margin: 0 0 28px; color: #475569; font-size: 14px; line-height: 1.6;">
                A new social media post has been created for <strong style="color: #000000; text-decoration: underline;">${displayUrl}</strong> and is awaiting your approval. Review the mockup previews below.
              </p>

              <!-- Meta Data Grid (Clean Black & White) -->
              <table class="details-table" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; margin-bottom: 28px;">
                <tr style="background-color: #f8fafc;">
                  <td style="padding: 12px 18px; font-size: 11px; font-weight: 800; color: #64748b; border-bottom: 1px solid #e2e8f0; width: 130px; text-transform: uppercase; letter-spacing: 0.5px;">Property</td>
                  <td style="padding: 12px 18px; font-size: 13px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${displayUrl}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; font-size: 11px; font-weight: 800; color: #64748b; border-bottom: 1px solid #e2e8f0; text-transform: uppercase; letter-spacing: 0.5px;">Title</td>
                  <td style="padding: 12px 18px; font-size: 13px; color: #0f172a; font-weight: 600; border-bottom: 1px solid #e2e8f0;">${approval.title}</td>
                </tr>
                <tr style="background-color: #f8fafc;">
                  <td style="padding: 12px 18px; font-size: 11px; font-weight: 800; color: #64748b; border-bottom: 1px solid #e2e8f0; text-transform: uppercase; letter-spacing: 0.5px;">Creator</td>
                  <td style="padding: 12px 18px; font-size: 13px; color: #334155; border-bottom: 1px solid #e2e8f0;">${creatorName} ${creatorEmail ? `&lt;${creatorEmail}&gt;` : ""}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; font-size: 11px; font-weight: 800; color: #64748b; border-bottom: 1px solid #e2e8f0; text-transform: uppercase; letter-spacing: 0.5px;">Scheduled</td>
                  <td style="padding: 12px 18px; font-size: 13px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #e2e8f0;">
                    📅 ${scheduledLabel}
                  </td>
                </tr>
                <tr style="background-color: #f8fafc;">
                  <td style="padding: 12px 18px; font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Platforms</td>
                  <td style="padding: 12px 18px; font-size: 13px; color: #0f172a; font-weight: 700;">
                    <span style="background-color: #000000; color: #ffffff; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                      ${platformsBadge}
                    </span>
                  </td>
                </tr>
              </table>

              <!-- Caption Bubble -->
              ${approval.caption ? `
              <div style="margin-bottom: 28px;">
                <p style="margin: 0 0 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px;">Post Caption</p>
                <div style="background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; padding: 16px; color: #334155; font-size: 14px; line-height: 1.6; white-space: pre-wrap; font-family: inherit;">${approval.caption}</div>
              </div>` : ''}

              <!-- Previews Section Title -->
              <p style="margin: 0 0 16px; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; text-align: center;">Mockup Previews</p>

              <!-- Dual Platform Mockups -->
              <div class="preview-container" style="display: flex; gap: 16px; margin-bottom: 32px; justify-content: center; width: 100%;">
                
                <!-- 🟦 Facebook Mockup (1.91:1 Aspect Ratio) -->
                ${approval.facebookPageId ? `
                <div class="preview-card" style="flex: 1; min-width: 260px; max-width: 280px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; font-family: Helvetica, Arial, sans-serif; overflow: hidden; text-align: left;">
                  <!-- Header -->
                  <div style="padding: 12px; display: flex; align-items: center;">
                    <div style="width: 36px; height: 36px; border-radius: 50%; background-color: #000000; color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; margin-right: 8px; font-family: inherit;">
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
                <div class="preview-card" style="flex: 1; min-width: 260px; max-width: 280px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, sans-serif; overflow: hidden; text-align: left;">
                  <!-- Header -->
                  <div style="padding: 10px 12px; display: flex; align-items: center; border-bottom: 1px solid #efefef;">
                    <div style="width: 30px; height: 30px; border-radius: 50%; background: #000000; display: flex; align-items: center; justify-content: center; margin-right: 8px;">
                      <div style="width: 26px; height: 26px; border-radius: 50%; background-color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; color: #000000;">
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

              <!-- Action Call to Buttons (High-Contrast Black & White) -->
              <table class="btn-table" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                <tr>
                  <td class="btn-cell" align="center" width="50%" style="padding-right: 8px;">
                    <a href="${approvalUrl}"
                       style="display: block; padding: 14px 24px; background-color: #000000; color: #ffffff; font-size: 15px; font-weight: bold; text-decoration: none; border-radius: 8px; text-align: center; border: 2px solid #000000; box-shadow: 0 4px 12px rgba(0,0,0,0.1); transition: background-color 0.2s;">
                      ✓ Approve Draft
                    </a>
                  </td>
                  <td class="btn-cell" align="center" width="50%" style="padding-left: 8px;">
                    <a href="${rejectUrl}"
                       style="display: block; padding: 14px 24px; background-color: #ffffff; color: #000000; font-size: 15px; font-weight: bold; text-decoration: none; border-radius: 8px; text-align: center; border: 2px solid #000000; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                      ✗ Reject Draft
                    </a>
                  </td>
                </tr>
              </table>

              <div style="text-align: center; margin-top: 24px;">
                <p style="margin: 0; color: #64748b; font-size: 13px;">
                  Need to make adjustments? <a href="${dashboardUrl}" style="color: #000000; font-weight: 700; text-decoration: underline;">Open Crossway Dashboard</a>
                </p>
              </div>

              <hr style="margin: 32px 0; border: none; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #94a3b8; font-size: 11px; line-height: 1.5; text-align: center;">
                This approval notification is fully automated and was triggered by Crossway SEO & Marketing Scheduler. If you received this in error, please contact support.
              </p>
            </td>
          </tr>

          <!-- Footer (Black & White Theme) -->
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
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
