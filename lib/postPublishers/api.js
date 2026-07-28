export async function publishPostViaApi(payload, config) {
  const url = String(config.apiUrl || "").trim();
  if (!url) {
    const err = new Error("API URL is not configured.");
    err.skippable = true;
    throw err;
  }

  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "Crossway-Post-Publisher/1.0",
  };

  const apiKey = String(config.apiKey || "").trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  if (config.apiHeaders && typeof config.apiHeaders === "object") {
    for (const [k, v] of Object.entries(config.apiHeaders)) {
      if (k && v != null) headers[String(k)] = String(v);
    }
  }

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`API returned ${res.status}: ${text.slice(0, 500)}`);
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
