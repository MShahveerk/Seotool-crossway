"use client";

import { useMemo } from "react";
import { PenLine } from "lucide-react";
import AgentPipeline from "../studioShared/AgentPipeline";
import { buildPipelineSteps } from "../studioShared/runFormat";

/**
 * Blog Studio run console — a thin adapter that maps this studio's stage shape
 * onto the shared AgentPipeline cockpit.
 */

/** Pipeline order. The Interpreter only runs for document/Excel sources. */
export const BLOG_PIPELINE = [
  { id: "interpreter", title: "Interpreter", subtitle: "Document → SEO seeds", optional: true },
  { id: "agent1", title: "Strategist", subtitle: "Keyword intelligence" },
  { id: "agent2", title: "Architect", subtitle: "Article blueprint" },
  { id: "agent3", title: "Writer", subtitle: "Publication draft" },
  { id: "image", title: "Image", subtitle: "Featured visual" },
];

export function resolveImageSrc(path) {
  if (!path) return null;
  const value = String(path);
  if (value.startsWith("/") || /^(https?:|data:|blob:)/i.test(value)) return value;
  return `/api/uploads/${value.replace(/^.*[\\/]/, "")}`;
}

/** The image agent reports style-reference details worth surfacing verbatim. */
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
    return buildPipelineSteps(BLOG_PIPELINE, stages, (s) => s?.agent).map((step) => ({
      ...step,
      extra: imageStageExtra(step.raw),
    }));
  }, [run?.stagesJson]);

  const draft = useMemo(() => {
    const p = run?.draftPreviewJson || {};
    if (!p.title && !p.html && !p.featuredImagePath) return null;
    return {
      title: p.title,
      excerpt: p.excerpt,
      slug: p.slug,
      seoTitle: p.seoTitle,
      imageUrl: resolveImageSrc(p.featuredImagePath),
      html: p.html,
      href: p.blogPostId ? "/?section=my-blog-approvals" : null,
      hrefLabel: "Open in approvals",
    };
  }, [run?.draftPreviewJson]);

  return (
    <AgentPipeline
      run={run}
      steps={steps}
      eyebrow="Blog run"
      title={run?.topic || "Untitled topic"}
      draft={draft}
      onCancel={onCancel}
      cancelling={cancelling}
      emptyIcon={PenLine}
      emptyTitle="No run yet"
      emptyHint="Start a draft and every agent — Strategist, Architect, Writer, Image — appears here as it works, with its full output one click away."
    />
  );
}
