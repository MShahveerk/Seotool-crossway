export async function uploadStudioOperatorImage(kind, file) {
  if (!file) return "";
  const fd = new FormData();
  fd.append("image", file);
  const res = await fetch(`/api/admin/studio/operator-image?kind=${encodeURIComponent(kind)}`, {
    method: "POST",
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not upload your image.");
  return String(data.path || "");
}
