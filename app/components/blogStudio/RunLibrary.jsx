"use client";

/** Blog Studio's run library: the shared master/detail workspace, wired to the
 *  blog pipeline, the blog cockpit and featured-image thumbnails. */

import { PenLine } from "lucide-react";
import RunLibrary from "../studioShared/RunLibrary";
import RunConsole, { blogPipelineForRun, resolveImageSrc } from "./RunConsole";

const COPY = {
  emptyTitle: "No runs yet",
  emptyHint:
    "Generate your first draft and it lands here — every agent, its cost and the finished article, kept for as long as you need it.",
  detailHint:
    "Every agent in the chain, its full output, what it cost and the finished draft — all in this pane, without leaving the list.",
};

export default function BlogRunLibrary({ cancelling, onCancel, config, ...rest }) {
  return (
    <RunLibrary
      pipeline={blogPipelineForRun(rest.selectedRun, config)}
      emptyIcon={PenLine}
      copy={COPY}
      getThumbSrc={(run) => resolveImageSrc(run?.draftPreviewJson?.featuredImagePath)}
      renderConsole={(run) => (
        <RunConsole
          run={run}
          config={config}
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
