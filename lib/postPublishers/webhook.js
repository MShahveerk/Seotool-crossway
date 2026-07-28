import crypto from "crypto";

export async function publishPostViaWebhook(payload, config) {
  const url = String(config.webhookUrl || "").trim();
  if (!url) {
    const err = new Error("Webhook URL is not configured.");
    err.skippable = true;
    throw err;
  }

  const body = JSON.stringify(payload);
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "Crossway-Post-Publisher/1.0",
  };

  const secret = String(config.webhookSecret || "").trim();
  if (secret) {
    headers["X-Crossway-Signature"] = crypto.createHmac("sha256", secret).update(body).digest("hex");
  }

  const res = await fetch(url, { method: "POST", headers, body });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Webhook returned ${res.status}: ${text.slice(0, 500)}`);
  }

  let externalId = null;
  try {
    const json = JSON.parse(text);
    externalId = json.id || json.post_id || json.externalId || null;
  } catch {
    /* ok */
  }

  return { externalId: externalId ? String(externalId) : null, responseBody: text.slice(0, 4000) };
}
