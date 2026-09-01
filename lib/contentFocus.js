/**
 * Shared deep-link between boards and approval queues.
 * URL: ?section=post-board&item=<id>
 */

import { sessionCanAccessSection } from "./clientPermissions.js";

export const POST_WORKFLOW_SECTIONS = ["post-board", "my-approvals", "admin-approvals"];
export const BLOG_WORKFLOW_SECTIONS = ["blog-board", "my-blog-approvals", "admin-blogs"];

export function readItemFromUrl() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("item") || null;
}

export function sameContentFamily(sectionA, sectionB) {
  const a = String(sectionA || "");
  const b = String(sectionB || "");
  if (POST_WORKFLOW_SECTIONS.includes(a) && POST_WORKFLOW_SECTIONS.includes(b)) return true;
  if (BLOG_WORKFLOW_SECTIONS.includes(a) && BLOG_WORKFLOW_SECTIONS.includes(b)) return true;
  return false;
}

export function boardSectionForKind(kind) {
  return kind === "blog" ? "blog-board" : "post-board";
}

export function approvalsSectionForKind(kind, session) {
  if (kind === "blog") {
    if (sessionCanAccessSection(session, "my-blog-approvals")) return "my-blog-approvals";
    if (sessionCanAccessSection(session, "admin-blogs")) return "admin-blogs";
    return null;
  }
  if (sessionCanAccessSection(session, "admin-approvals")) return "admin-approvals";
  if (sessionCanAccessSection(session, "my-approvals")) return "my-approvals";
  return null;
}

/** Jump to a board or approval surface and focus this item. */
export function goToContentItem({ section, itemId }) {
  if (typeof window === "undefined" || !section) return;
  window.dispatchEvent(
    new CustomEvent("navigate-section", {
      detail: { section, item: itemId || "" },
    })
  );
}

export function postApprovalTabForStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s === "pending" || s === "edited") return "actionable";
  if (s === "approved" || s === "declined") return "closed";
  return "all";
}

/** Blog queue chips: keep "open" when the item is still in review. */
export function blogQueueFilterForStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s === "pending" || s === "edited" || s === "declined") return "open";
  if (s === "approved") return "approved";
  return "all";
}
