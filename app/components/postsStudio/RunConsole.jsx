"use client";

import { useMemo } from "react";
import { Megaphone } from "lucide-react";
import ApprovalMediaPreview from "../ApprovalMediaPreview";
import AgentPipeline from "../studioShared/AgentPipeline";
import { buildPipelineSteps } from "../studioShared/runFormat";

/**
 * Post Studio run console — adapter onto the shared AgentPipeline cockpit.
 */

export const POST_PIPELINE = [
  { id: "interpreter", title: "Interpreter", subtitle: "Document → post seeds", optional: true },
  { id: "agent1", title: "Strategist", subtitle: "Hook · angle · hashtags" },
  { id: "agent2", title: "Copywriter", subtitle: "Title + caption" },
  { id: "image", title: "Image", subtitle: "Feed creative" },
];

function imageStageExtra(stage) {
  if (!stage || stage.agent !== "image") return null;
  const bits = [];
  if (stage.usedReference) bits.push(`Style refs applied: ${stage.referenceCount || 1}`);
  else if (stage.status === "succeeded") bits.push("No style reference — text-only generation");
  if (stage.note) bits.push(String(stage.note));
  if (!bits.length && !stage.promptPreview) return null;

  return (
    <div className="space-y-1.5 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-2.5">
      {bits.map((b, i) => (
        <p key={i} className="text-[11px] text-[var(--cw-ink-muted)]">
          {b}
        </p>
      ))}
      {stage.promptPreview ? (
        <p className="line-clamp-4 text-[11px] leading-relaxed whitespace-pre-wrap text-[var(--cw-ink-faint)]">
          {String(stage.promptPreview).slice(0, 320)}
        </p>
      ) : null}
    </div>
  );
}

export default function RunConsole({ run, onCancel, cancelling }) {
  const steps = useMemo(() => {
    const stages = Array.isArray(run?.stagesJson) ? run.stagesJson : [];
    return buildPipelineSteps(POST_PIPELINE, stages, (s) => s?.agent).map((step) => ({
      ...step,
      extra: imageStageExtra(step.raw),
    }));
  }, [run?.stagesJson]);

  const draft = useMemo(() => {
    const p = run?.draftPreviewJson || {};
    if (!p.title && !p.caption && !p.imagePath) return null;
    return {
      title: p.title || "Untitled post",
      body: p.caption,
      // Feed creatives are square — keep the preview in a post-shaped frame.
      mediaAspect: "aspect-square max-w-sm",
      mediaNode: p.imagePath ? (
        <ApprovalMediaPreview src={p.imagePath} className="size-full object-cover" />
      ) : null,
      meta: p.platform ? (
        <span className="rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-2 py-1 text-[11px] text-[var(--cw-ink-muted)] capitalize">
          {p.platform}
        </span>
      ) : null,
      href: p.approvalId ? "/?section=my-approvals" : null,
      hrefLabel: "Open in approvals",
    };
  }, [run?.draftPreviewJson]);

  return (
    <AgentPipeline
      run={run}
      steps={steps}
      eyebrow="Post run"
      title={run?.topic || "Untitled topic"}
      draft={draft}
      onCancel={onCancel}
      cancelling={cancelling}
      emptyIcon={Megaphone}
      emptyTitle="No run yet"
      emptyHint="Start a post and the Strategist, Copywriter and Image agents appear here as they work — click any one to read its output."
    />
  );
}
