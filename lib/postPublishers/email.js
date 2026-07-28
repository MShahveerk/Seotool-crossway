import { sendEmail } from "../email.js";

export async function publishPostViaEmail(payload, config, approval) {
  const recipientsRaw = String(config.emailRecipients || process.env.POST_PUBLISH_EMAIL || "").trim();
  if (!recipientsRaw) {
    const err = new Error("No email recipients configured for post publishing.");
    err.skippable = true;
    throw err;
  }

  const recipients = recipientsRaw
    .split(/[,;]/)
    .map((e) => e.trim())
    .filter(Boolean);

  const subject = `Post ready to publish: ${payload.title}`;
  const json = JSON.stringify(payload, null, 2);
  const html = `
    <p>An SMM post was approved and is ready to publish.</p>
    <p><strong>Title:</strong> ${payload.title}</p>
    <p><strong>Caption:</strong> ${payload.caption || "—"}</p>
    <p><a href="${payload.mediaUrl}">Media link</a></p>
  `;

  await sendEmail({
    to: recipients.join(","),
    subject,
    html,
    text: `Post payload for ${payload.title}\n\n${json}`,
    attachments: [
      {
        filename: `post-${approval.id}.json`,
        content: Buffer.from(json, "utf8"),
        contentType: "application/json",
      },
    ],
  });

  return { externalId: null, responseBody: `Emailed ${recipients.length} recipient(s).` };
}
