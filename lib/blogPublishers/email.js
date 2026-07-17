import { sendEmail } from "../email.js";

export async function publishViaEmail(payload, config, blog) {
  const recipientsRaw = String(config.emailRecipients || process.env.BLOG_PUBLISH_EMAIL || "").trim();
  if (!recipientsRaw) {
    const err = new Error("No email recipients configured for blog publishing.");
    err.skippable = true;
    throw err;
  }

  const recipients = recipientsRaw
    .split(/[,;]/)
    .map((e) => e.trim())
    .filter(Boolean);

  const subject = `Blog ready to publish: ${payload.title}`;
  const json = JSON.stringify(payload, null, 2);
  const html = `
    <p>A blog was approved and is ready to publish for <strong>${blog.siteLink}</strong>.</p>
    <p><strong>Title:</strong> ${payload.title}</p>
    <p>The full WordPress-shaped JSON payload is attached.</p>
  `;

  await sendEmail({
    to: recipients.join(","),
    subject,
    html,
    text: `Blog payload for ${payload.title}\n\n${json}`,
    attachments: [
      {
        filename: `blog-${blog.id}.json`,
        content: Buffer.from(json, "utf8"),
        contentType: "application/json",
      },
    ],
  });

  return { externalId: null, responseBody: `Emailed ${recipients.length} recipient(s).` };
}
