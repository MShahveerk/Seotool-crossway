"use client";

/** Post Studio's run library: the shared master/detail workspace, wired to the
 *  post pipeline, the post cockpit and feed-creative thumbnails. */

import { Megaphone } from "lucide-react";
import RunLibrary from "../studioShared/RunLibrary";
import RunConsole, { POST_PIPELINE } from "./RunConsole";
import { publicMediaUrl } from "../../../lib/publicMediaUrl";

const COPY = {
  emptyTitle: "No runs yet",
  emptyHint:
    "Generate your first post and it lands here — every agent, its cost and the finished creative, kept for as long as you need it.",
  detailHint:
    "Every agent in the chain, its full output, what it cost and the finished caption and creative — all in this pane, without leaving the list.",
};

export default function PostRunLibrary({ cancelling, onCancel, ...rest }) {
  return (
    <RunLibrary
      pipeline={POST_PIPELINE}
      emptyIcon={Megaphone}
      copy={COPY}
      getThumbSrc={(run) => publicMediaUrl(run?.draftPreviewJson?.imagePath)}
      renderConsole={(run) => (
        <RunConsole
          run={run}
          onCancel={onCancel ? () => onCancel(run.id) : undefined}
          cancelling={cancelling}
        />
      )}
      cancelling={cancelling}
      onCancel={onCancel}
      {...rest}
    />
  );
}
