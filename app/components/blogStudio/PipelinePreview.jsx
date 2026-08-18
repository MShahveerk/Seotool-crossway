"use client";

/** Blog Studio's agent chain, fed to the shared pipeline strip. */

import PipelinePreview from "../studioShared/PipelinePreview";

const STEPS = [
  { id: "agent1", title: "Strategist", subtitle: "Keyword intelligence", readyKey: "agent1", modelKey: "agent1Model" },
  { id: "agent2", title: "Architect", subtitle: "Article blueprint", readyKey: "agent2", modelKey: "agent2Model" },
  { id: "agent3", title: "Writer", subtitle: "Publication draft", readyKey: "agent3", modelKey: "agent3Model" },
  { id: "image", title: "Image", subtitle: "Featured visual", readyKey: "image", modelKey: "imageModel" },
];

export default function BlogPipelinePreview(props) {
  return <PipelinePreview steps={STEPS} estimate="~1–2 min" {...props} />;
}
