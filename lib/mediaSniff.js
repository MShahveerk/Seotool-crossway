/**
 * Magic-byte MIME detection for upload write + serve (Chrome ORB / nosniff).
 */

export function sniffImageOrVideoMime(buf) {
  if (!buf || buf.length < 12) return null;
  const b = buf;

  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  ) {
    return "image/webp";
  }
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";

  // ISO BMFF (mp4/mov) — ftyp at offset 4
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]).toLowerCase();
    if (brand.startsWith("qt")) return "video/quicktime";
    return "video/mp4";
  }
  // WebM / Matroska EBML
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video/webm";

  return null;
}

export function mimeFromFilename(filename) {
  const lower = String(filename || "").toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  return null;
}

const EXT_BY_MIME = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
};

/** Prefer magic bytes over claimed MIME so extension always matches body. */
export function resolveMediaMimeAndExt(buf, claimedMime) {
  const sniffed = sniffImageOrVideoMime(buf);
  const claimed = String(claimedMime || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const mime = sniffed || (EXT_BY_MIME[claimed] ? claimed : null) || "image/jpeg";
  const ext = EXT_BY_MIME[mime] || ".jpg";
  return { mime, ext, sniffed: Boolean(sniffed) };
}

/** Content-Type safe for Chrome <img> with nosniff — never octet-stream for media. */
export function contentTypeForUpload(buf, filename) {
  const sniffed = sniffImageOrVideoMime(buf);
  if (sniffed) return sniffed;
  const fromName = mimeFromFilename(filename);
  if (fromName) return fromName;
  // Last resort: if bytes look non-empty, prefer jpeg over octet-stream (ORB blocks octet-stream).
  if (buf && buf.length > 0) return "image/jpeg";
  return "application/octet-stream";
}
