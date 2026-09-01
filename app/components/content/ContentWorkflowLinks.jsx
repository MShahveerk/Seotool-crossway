"use client";

import { useSession } from "next-auth/react";
import { sessionCanAccessSection } from "@/lib/clientPermissions";
import {
  approvalsSectionForKind,
  boardSectionForKind,
  goToContentItem,
} from "@/lib/contentFocus";
import { getBlogBoardColumn, getPostBoardColumn } from "@/lib/boardMeta";

function columnLabel(kind, item) {
  const col = kind === "blog" ? getBlogBoardColumn(item) : getPostBoardColumn(item);
  if (col === "draft") return "Draft";
  if (col === "pending") return "Pending";
  if (col === "edited") return "Edited";
  if (col === "approved") return "Approved";
  if (col === "failed") return "Failed";
  if (col === "published") return "Published";
  if (col === "declined") return "Declined";
  return col;
}

/**
 * Jump between the kanban and the matching approval queue for one post/blog.
 */
export default function ContentWorkflowLinks({
  kind = "post",
  itemId,
  item,
  surface = "approvals",
  className = "",
}) {
  const { data: session } = useSession();
  if (!itemId) return null;

  const boardSection = boardSectionForKind(kind);
  const approvalSection = approvalsSectionForKind(kind, session);
  const canBoard = sessionCanAccessSection(session, boardSection);
  const canApprovals = Boolean(approvalSection);

  const showBoard = surface !== "board" && canBoard;
  const showApprovals = surface !== "approvals" && canApprovals;
  const lane = item ? columnLabel(kind, item) : "";

  if (!showBoard && !showApprovals && !lane) return null;

  return (
    <div className={`cw-workflow-links ${className}`.trim()}>
      {lane ? (
        <span className="cw-workflow-links__lane" title="Board column">
          Board · {lane}
        </span>
      ) : null}
      {showBoard ? (
        <button
          type="button"
          className="cw-workflow-links__btn"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            goToContentItem({ section: boardSection, itemId });
          }}
        >
          Show on board
        </button>
      ) : null}
      {showApprovals ? (
        <button
          type="button"
          className="cw-workflow-links__btn"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            goToContentItem({ section: approvalSection, itemId });
          }}
        >
          Open in approvals
        </button>
      ) : null}
    </div>
  );
}
