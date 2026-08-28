"use client";

/** Blog Studio's agent chain, fed to the shared pipeline strip. */

import PipelinePreview from "../studioShared/PipelinePreview";

const STEPS = [
  { id: "decider", title: "Decider", subtitle: "World trends, then overlap, then library", readyKey: "decider", modelKey: "deciderModel" },
  { id: "binder", title: "Binder", subtitle: "Low-KD keyword bag", readyKey: "binder", modelKey: "binderModel" },
  { id: "checker", title: "Checker", subtitle: "Unique title", readyKey: "checker", modelKey: "checkerModel" },
  { id: "headings", title: "Headings", subtitle: "KD-aware outline", readyKey: "headings", modelKey: "headingsModel" },
  { id: "agent2", title: "Architect", subtitle: "Article blueprint", readyKey: "agent2", modelKey: "agent2Model" },
  { id: "agent3", title: "Writer", subtitle: "Publication draft", readyKey: "agent3", modelKey: "agent3Model" },
  { id: "humanizer", title: "Humanizer", subtitle: "Pasteable skill", readyKey: "humanizer", modelKey: "humanizerModel" },
  { id: "image", title: "Image", subtitle: "Featured visual", readyKey: "image", modelKey: "imageModel" },
];

export default function BlogPipelinePreview(props) {
  const cfg = props.config || {};
  const steps = STEPS.filter((s) => (s.id === "humanizer" ? Boolean(cfg.humanizerEnabled) : true)).map(
    (s) =>
      s.id === "image" && String(cfg.imageProvider || "").toLowerCase() === "anthropic"
        ? { ...s, subtitle: "Claude illustration, not a photo" }
        : s
  );
  return <PipelinePreview steps={steps} estimate="~4–8 min" {...props} />;
}
