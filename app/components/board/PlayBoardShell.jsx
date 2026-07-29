"use client";

import { useEffect } from "react";
import { PlayProvider } from "@playhtml/react";
import "playhtml/dist/style.css";
import "./board.css";
import { getBoardRoom, setBoardRoom } from "./boardRoom";

/**
 * Isolates a playhtml room per board + site so teams can collaboratively drag cards.
 * Room is a function so SPA section switches update the singleton playhtml client.
 */
export default function PlayBoardShell({ room, children }) {
  const roomId = room || "crossway-board";

  useEffect(() => {
    setBoardRoom(roomId);
  }, [roomId]);

  setBoardRoom(roomId);

  return (
    <PlayProvider
      key={roomId}
      initOptions={{
        room: () => getBoardRoom(),
        cursors: { enabled: true, room: "page" },
        onError: () => {
          console.warn("[Crossway Board] playhtml connection failed — drag still works locally.");
        },
      }}
    >
      {children}
    </PlayProvider>
  );
}
