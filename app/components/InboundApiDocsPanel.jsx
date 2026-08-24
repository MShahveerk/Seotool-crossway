"use client";

import { useMemo, useState } from "react";
import { FiCopy, FiCheck } from "react-icons/fi";
import { isMetaPageId } from "@/lib/siteAccess";
import {
  buildInboundCurlExample,
  getInboundEndpoint,
  getInboundSecretHeader,
  getInboundSiteHeader,
} from "@/lib/inboundApiDocs";

function CopyButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
    >
      {copied ? <FiCheck className="size-3 text-emerald-600" /> : <FiCopy className="size-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}

/**
 * Shows inbound API endpoint, headers, and example request for blogs or posts.
 */
export default function InboundApiDocsPanel({
  contentType = "post",
  siteKey = "",
  inboundSecret = "",
  className = "",
}) {
  const isMeta = isMetaPageId(siteKey);
  const endpoint = useMemo(() => getInboundEndpoint(contentType), [contentType]);
  const secretHeader = getInboundSecretHeader(contentType);
  const siteHeader = getInboundSiteHeader(contentType);
  const displaySecret = inboundSecret && inboundSecret !== "••••••••" ? inboundSecret : "YOUR_SECRET";

  const curlExample = useMemo(
    () =>
      buildInboundCurlExample({
        contentType,
        siteKey,
        secret: displaySecret,
        isMetaPage: isMeta,
      }),
    [contentType, siteKey, displaySecret, isMeta]
  );

  const jsonExample =
    contentType === "blog"
      ? `{
  "title": "Post title",
  "content": "<p>HTML body</p>",
  "siteLink": "${siteKey || "https://example.com"}",
  "externalId": "wp-12345",
  "featuredImageUrl": "https://example.com/image.jpg"
}`
      : `{
  "title": "Summer promo",
  "caption": "Check out our latest offer!",
  ${isMeta ? `"facebookPageId": "${siteKey || "123456789"}"` : `"siteKey": "${siteKey || "https://example.com"}"`},
  "mediaUrl": "https://example.com/post-image.jpg",
  "externalId": "ext-98765",
  "targetPlatform": "both"
}`;

  if (!siteKey) {
    return (
      <div className={`rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500 ${className}`}>
        Select a client account above to see the inbound API details for that {contentType === "blog" ? "site" : "Meta page"}.
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-indigo-200 bg-indigo-50/60 p-4 space-y-3 text-sm ${className}`}>
      <div>
        <p className="font-semibold text-gray-900">Inbound API — send {contentType === "blog" ? "blogs" : "posts"} into RoboSEO.Ai</p>
        <p className="mt-0.5 text-xs text-gray-600">
          External tools can POST content into the approval queue for{" "}
          <span className="font-mono font-medium">{siteKey}</span>
          {isMeta ? " (Meta page)" : ""}.
        </p>
      </div>

      <div className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Endpoint</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="flex-1 min-w-0 rounded bg-white border border-gray-200 px-2 py-1.5 text-xs font-mono break-all">
            POST {endpoint}
          </code>
          <CopyButton text={endpoint} label="Copy URL" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Auth header</p>
          <code className="block rounded bg-white border border-gray-200 px-2 py-1.5 text-xs font-mono">
            {secretHeader}: {displaySecret}
          </code>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Site header (optional)</p>
          <code className="block rounded bg-white border border-gray-200 px-2 py-1.5 text-xs font-mono break-all">
            {siteHeader}: {siteKey}
          </code>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Example JSON body</p>
          <CopyButton text={jsonExample} label="Copy JSON" />
        </div>
        <pre className="overflow-x-auto rounded bg-white border border-gray-200 p-2 text-xs font-mono whitespace-pre-wrap">
          {jsonExample}
        </pre>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Example cURL</p>
          <CopyButton text={curlExample} label="Copy cURL" />
        </div>
        <pre className="overflow-x-auto rounded bg-white border border-gray-200 p-2 text-xs font-mono whitespace-pre-wrap max-h-48">
          {curlExample}
        </pre>
      </div>
    </div>
  );
}
