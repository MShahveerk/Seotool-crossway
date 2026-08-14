/**
 * Fetch a server-built PDF and hand it to the browser.
 *
 * Reports are generated server-side with pdf-lib (real text, embedded fonts,
 * page furniture) rather than rasterised in the browser, so the client's only
 * job is to POST the parameters and save the bytes.
 */
export async function downloadServerReport(url, payload, fallbackName = "report.pdf") {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || `Report failed (${res.status})`);
  }

  // Prefer the filename the server chose — it already slugified the keyword.
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = /filename="?([^"]+)"?/i.exec(disposition);
  const filename = match?.[1] || fallbackName;

  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}
