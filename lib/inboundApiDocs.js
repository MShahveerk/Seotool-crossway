/**
 * Build copy-paste inbound API documentation for blogs and posts.
 */

export function getAppBaseUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin.replace(/\/+$/, "");
  }
  return String(process.env.NEXTAUTH_URL || process.env.PUBLIC_URL || "https://your-app.example.com").replace(/\/+$/, "");
}

export function getInboundEndpoint(contentType) {
  const base = getAppBaseUrl();
  return contentType === "blog" ? `${base}/api/blogs/inbound` : `${base}/api/posts/inbound`;
}

export function getInboundSecretHeader(contentType) {
  return contentType === "blog" ? "x-blog-secret" : "x-post-secret";
}

export function getInboundSiteHeader(contentType) {
  return contentType === "blog" ? "x-site-link" : "x-site-key";
}

export function buildInboundCurlExample({ contentType, siteKey, secret, isMetaPage }) {
  const endpoint = getInboundEndpoint(contentType);
  const secretHeader = getInboundSecretHeader(contentType);
  const siteHeader = getInboundSiteHeader(contentType);

  if (contentType === "blog") {
    return `curl -X POST "${endpoint}" \\
  -H "Content-Type: application/json" \\
  -H "${secretHeader}: ${secret || "YOUR_SECRET"}" \\
  -H "${siteHeader}: ${siteKey || "https://example.com"}" \\
  -d '{
    "title": "Post title",
    "content": "<p>HTML body</p>",
    "excerpt": "Short summary",
    "externalId": "wp-12345",
    "featuredImageUrl": "https://example.com/image.jpg",
    "scheduledFor": "2026-08-01T14:00:00Z"
  }'`;
  }

  const siteField = isMetaPage ? `"facebookPageId": "${siteKey || "123456789"}"` : `"siteKey": "${siteKey || "https://example.com"}"`;

  return `curl -X POST "${endpoint}" \\
  -H "Content-Type: application/json" \\
  -H "${secretHeader}: ${secret || "YOUR_SECRET"}" \\
  -H "${siteHeader}: ${siteKey || "123456789"}" \\
  -d '{
    "title": "Summer promo",
    "caption": "Check out our latest offer!",
    ${siteField},
    "mediaUrl": "https://example.com/post-image.jpg",
    "externalId": "ext-98765",
    "targetPlatform": "both",
    "scheduledFor": "2026-08-01T14:00:00Z"
  }'`;
}
