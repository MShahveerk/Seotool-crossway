"use client";

/** Post Studio's agent chain, fed to the shared pipeline strip. */

import PipelinePreview from "../studioShared/PipelinePreview";

const STEPS = [
  { id: "agent1", title: "Strategist", subtitle: "Hook · angle · hashtags", readyKey: "agent1", modelKey: "agent1Model" },
  { id: "agent2", title: "Copywriter", subtitle: "Title + caption", readyKey: "agent2", modelKey: "agent2Model" },
  { id: "image", title: "Image", subtitle: "Feed creative", readyKey: "image", modelKey: "imageModel" },
];

export default function PostPipelinePreview(props) {
  return <PipelinePreview steps={STEPS} estimate="~40–90 sec" {...props} />;
}
