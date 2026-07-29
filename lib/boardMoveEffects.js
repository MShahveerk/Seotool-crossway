/**
 * Side-effect descriptions for board column moves (posts + blogs).
 * Used by the confirm UI and to decide when to send approval emails.
 */

const LABELS = {
  draft: "Draft",
  pending: "Pending",
  edited: "Edited",
  approved: "Approved",
  failed: "Failed",
  published: "Published",
  declined: "Declined",
};

export function columnLabel(id) {
  return LABELS[id] || id;
}

/**
 * Whether moving into `toColumn` should send approval notification emails.
 * Dynamic for posts and blogs: entering Pending from a non-pending queue state.
 */
export function shouldNotifyApprovalOnMove(fromColumn, toColumn) {
  if (toColumn !== "pending") return false;
  // Re-entering pending from draft / declined / approved / failed / edited
  return fromColumn !== "pending";
}

/**
 * Build confirmation copy for a proposed board move.
 * @returns {{ requiresConfirm: boolean, title: string, summary: string, implications: string[], severity: 'info'|'warn'|'danger' }}
 */
export function describeBoardMove(kind, fromColumn, toColumn, item = {}) {
  const noun = kind === "blog" ? "blog" : "post";
  const titleText = item.displayTitle || item.userEditedTitle || item.title || "This item";
  const from = columnLabel(fromColumn);
  const to = columnLabel(toColumn);
  const implications = [];
  let severity = "info";

  if (toColumn === "pending" && fromColumn !== "pending") {
    severity = "warn";
    implications.push(`Approval notification emails will be sent for this ${noun}.`);
    implications.push("Assignees will see it on their approval list.");
    if (fromColumn === "draft") {
      implications.push("It leaves Draft (no longer hidden) and enters the live approval queue.");
    }
    if (fromColumn === "approved" || fromColumn === "failed") {
      implications.push("It leaves the approved/publish path and returns to awaiting approval.");
    }
  }

  if (toColumn === "approved") {
    severity = "warn";
    implications.push(`This ${noun} will be marked Approved from the board.`);
    implications.push("If no schedule is set, one will be assigned (next 11:59 slot).");
    implications.push("Cron can publish automatically when the schedule is due.");
    implications.push("Client review is skipped for this board approval action.");
  }

  if (toColumn === "draft") {
    severity = "warn";
    implications.push(`This ${noun} returns to Draft and is hidden from assignees.`);
    implications.push("No approval emails will be sent.");
  }

  if (toColumn === "declined") {
    severity = "danger";
    implications.push(`This ${noun} will be marked Declined.`);
    implications.push("Assignees may need to revise or you can move it back to Pending later.");
  }

  if (toColumn === "failed") {
    severity = "danger";
    implications.push("Marked as a publish failure.");
    implications.push("Move back to Approved (or Pending) when ready to retry.");
  }

  if (toColumn === "edited") {
    implications.push(`Status becomes Edited (treated as an assignee revision of this ${noun}).`);
  }

  if (fromColumn === "approved" && toColumn === "pending") {
    implications.push("Any upcoming auto-publish from the Approved lane will not apply until approved again.");
  }

  if (!implications.length) {
    implications.push(`Status changes from ${from} to ${to}. No emails will be sent for this move.`);
  }

  const requiresConfirm = true; // every board drop asks once — implications always listed
  return {
    requiresConfirm,
    title: `Move to ${to}?`,
    summary: `“${titleText}” will move from ${from} → ${to}.`,
    implications,
    severity,
    fromColumn,
    toColumn,
    fromLabel: from,
    toLabel: to,
    willNotify: shouldNotifyApprovalOnMove(fromColumn, toColumn),
    willSchedule: toColumn === "approved",
    willHide: toColumn === "draft",
  };
}
