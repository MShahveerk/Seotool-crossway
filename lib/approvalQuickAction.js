import crypto from "crypto";

function hmacForId(id) {
  const secret = process.env.NEXTAUTH_SECRET || "default-secret";
  return crypto.createHmac("sha256", secret).update(String(id)).digest("hex");
}

export function createApprovalQuickActionToken(approvalId) {
  return hmacForId(approvalId);
}

export function verifyApprovalQuickActionToken(approvalId, token) {
  if (!approvalId || !token) return false;
  const expected = hmacForId(approvalId);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(token)));
  } catch {
    return false;
  }
}

export function approvalMediaViewUrl(baseUrl, approvalId, token) {
  if (!approvalId || !token) return null;
  const base = String(baseUrl || "").replace(/\/+$/, "");
  return `${base}/api/approvals/media?id=${encodeURIComponent(approvalId)}&token=${encodeURIComponent(token)}`;
}

export function blogMediaViewUrl(baseUrl, blogId, token) {
  if (!blogId || !token) return null;
  const base = String(baseUrl || "").replace(/\/+$/, "");
  return `${base}/api/blogs/media?id=${encodeURIComponent(blogId)}&token=${encodeURIComponent(token)}`;
}
