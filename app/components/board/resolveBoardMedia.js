import { publicMediaUrl } from "@/lib/publicMediaUrl";

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
  return publicMediaUrl(raw, {
    bust: item.updatedAt || item.id || null,
  });
}

export function isBoardVideoPath(path) {
  return /\.(mp4|webm|mov)(\?|$)/i.test(String(path || "")) || /video\//i.test(String(path || ""));
}
