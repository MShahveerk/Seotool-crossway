/** Resolve approval/blog media paths for board card previews. */
export function resolveBoardMedia(item) {
  if (!item) return "";
  const payload = item.payload && typeof item.payload === "object" ? item.payload : {};
  const raw =
    item.imagePath ||
    item.featuredImagePath ||
    item.featuredImageUrl ||
    payload.featuredImageUrl ||
    payload.featured_image ||
    payload.image ||
    "";
  const src = String(raw || "").trim();
  if (!src) return "";
  if (/^(https?:|data:|blob:)/i.test(src)) return src;
  if (src.startsWith("/")) return src;
  // Bare filename from disk → public uploads API
  return `/api/uploads/${src.replace(/^.*[\\/]/, "")}`;
}

export function isBoardVideoPath(path) {
  return /\.(mp4|webm|mov)(\?|$)/i.test(String(path || "")) || /video\//i.test(String(path || ""));
}
