/**
 * Kanban column definitions, auto-move indicators, and allowed manual transitions
 * for the playhtml Post Board and Blog Board.
 */

export const POST_BOARD_COLUMNS = [
  { id: "draft", label: "Draft", hint: "Email hold", tone: "slate" },
  { id: "pending", label: "Pending", hint: "Awaiting review", tone: "amber" },
  { id: "edited", label: "Edited", hint: "Revised", tone: "sky" },
  { id: "approved", label: "Approved", hint: "Scheduled", tone: "emerald" },
  { id: "failed", label: "Failed", hint: "Retry", tone: "rose" },
  { id: "published", label: "Published", hint: "Drop to go live now", tone: "violet", lockCards: true },
  { id: "declined", label: "Declined", hint: "Rework", tone: "stone" },
];

export const BLOG_BOARD_COLUMNS = [
  { id: "draft", label: "Draft", hint: "Internal hold", tone: "slate" },
  { id: "pending", label: "Pending", hint: "Awaiting review", tone: "amber" },
  { id: "edited", label: "Edited", hint: "Revised", tone: "sky" },
  { id: "approved", label: "Approved", hint: "Ready", tone: "emerald" },
  { id: "failed", label: "Failed", hint: "Retry", tone: "rose" },
  { id: "published", label: "Published", hint: "Drop to go live now", tone: "violet", lockCards: true },
  { id: "declined", label: "Declined", hint: "Rework", tone: "stone" },
];

/** Soft arrows between columns for automatic pipeline moves. */
export const POST_AUTO_MOVES = [
  {
    from: "draft",
    to: "pending",
    label: "Daily 09:00",
    detail: "Latest email draft is sent for approval",
  },
  {
    from: "approved",
    to: "published",
    label: "At schedule, or drop here",
    detail: "Cron publishes when due. Dropping onto Published publishes immediately and ignores the schedule.",
  },
];

export const BLOG_AUTO_MOVES = [
  {
    from: "approved",
    to: "published",
    label: "At schedule, or drop here",
    detail: "Cron publishes when due. Dropping onto Published publishes immediately and ignores the schedule.",
  },
];

const POST_MANUAL = {
  draft: new Set(["pending", "declined"]),
  pending: new Set(["edited", "approved", "declined", "draft", "published"]),
  edited: new Set(["pending", "approved", "declined", "published"]),
  approved: new Set(["pending", "declined", "published"]),
  failed: new Set(["approved", "pending", "published"]),
  declined: new Set(["pending", "draft"]),
  published: new Set(),
};

const BLOG_MANUAL = {
  draft: new Set(["pending", "declined"]),
  pending: new Set(["edited", "approved", "declined", "draft", "published"]),
  edited: new Set(["pending", "approved", "declined", "published"]),
  approved: new Set(["pending", "declined", "edited", "published"]),
  failed: new Set(["approved", "pending", "published"]),
  declined: new Set(["pending", "edited", "draft"]),
  published: new Set(),
};

export function getPostBoardColumn(item) {
  if (item.publishStatus === "published") return "published";
  if (item.publishStatus === "failed" && item.status === "approved") return "failed";
  return item.status || "pending";
}

export function getBlogBoardColumn(item) {
  if (item.publishStatus === "published") return "published";
  if (item.publishStatus === "failed" && ["approved", "edited"].includes(item.status)) return "failed";
  return item.status || "pending";
}

export function canManuallyMovePost(fromColumn, toColumn) {
  if (!fromColumn || !toColumn || fromColumn === toColumn) return false;
  if (fromColumn === "published") return false;
  return POST_MANUAL[fromColumn]?.has(toColumn) === true;
}

export function canManuallyMoveBlog(fromColumn, toColumn) {
  if (!fromColumn || !toColumn || fromColumn === toColumn) return false;
  if (fromColumn === "published") return false;
  return BLOG_MANUAL[fromColumn]?.has(toColumn) === true;
}

/** Map a board column id to prisma fields for posts. */
export function postColumnToUpdate(columnId) {
  switch (columnId) {
    case "draft":
      return { status: "draft", publishStatus: "unpublish", hiddenFromAssignee: true };
    case "pending":
      return { status: "pending", publishStatus: "unpublish", hiddenFromAssignee: false };
    case "edited":
      return { status: "edited", publishStatus: "unpublish", hiddenFromAssignee: false };
    case "approved":
      return { status: "approved", publishStatus: "unpublish", hiddenFromAssignee: false };
    case "failed":
      return { status: "approved", publishStatus: "failed" };
    case "declined":
      return { status: "declined", publishStatus: "unpublish", hiddenFromAssignee: false };
    default:
      return null;
  }
}

export function blogColumnToUpdate(columnId) {
  switch (columnId) {
    case "draft":
      return { status: "draft", publishStatus: "unpublish", hiddenFromAssignee: true };
    case "pending":
      return { status: "pending", publishStatus: "unpublish", hiddenFromAssignee: false };
    case "edited":
      return { status: "edited", publishStatus: "unpublish", hiddenFromAssignee: false };
    case "approved":
      return { status: "approved", publishStatus: "unpublish", hiddenFromAssignee: false };
    case "failed":
      return { status: "approved", publishStatus: "failed" };
    case "declined":
      return { status: "declined", publishStatus: "unpublish", hiddenFromAssignee: false };
    default:
      return null;
  }
}
