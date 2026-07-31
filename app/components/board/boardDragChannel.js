/** Shared playhtml presence channel for live card-drag ghosts. */
export function boardDragChannel(boardId) {
  return `cw-card-drag:${String(boardId || "board")}`;
}
