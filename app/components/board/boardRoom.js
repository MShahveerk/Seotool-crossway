/** Mutable room id for playhtml SPA navigation (singleton client). */
let currentBoardRoom = "crossway-board";

export function setBoardRoom(room) {
  currentBoardRoom = String(room || "crossway-board");
}

export function getBoardRoom() {
  return currentBoardRoom;
}
