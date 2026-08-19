"use client";

import { useMemo } from "react";
import { PenLine, Search } from "lucide-react";
import AgentPipeline from "../studioShared/AgentPipeline";
import { buildPipelineSteps } from "../studioShared/runFormat";
import KeywordResearchBoard from "./KeywordResearchBoard";

/**
 * Blog Studio run console — a thin adapter that maps this studio's stage shape
 * onto the shared AgentPipeline cockpit.
 */

/** Pipeline order. The Interpreter only runs for document/Excel sources. */
export const BLOG_PIPELINE = [
  { id: "interpreter", title: "Interpreter", subtitle: "Document → SEO seeds", optional: true },
  { id: "decider", title: "Decider", subtitle: "Trends or keyword library", optional: true },
  { id: "binder", title: "Binder", subtitle: "Low-KD keyword bag" },
  { id: "checker", title: "Checker", subtitle: "Unique title" },
  { id: "headings", title: "Headings", subtitle: "KD-aware outline" },
  { id: "headings_approval", title: "Review", subtitle: "Email User roles", optional: true },
  { id: "agent2", title: "Architect", subtitle: "Article blueprint" },
  { id: "agent3", title: "Writer", subtitle: "Publication draft" },
  { id: "humanizer", title: "Humanizer", subtitle: "Skill-guided rewrite", optional: true },
  { id: "image", title: "Image", subtitle: "Featured visual" },
];

/** Optional agents stay off the rail unless this run (or the live config) enabled them. */
export function blogPipelineForRun(run, config = {}) {
  const stages = Array.isArray(run?.stagesJson) ? run.stagesJson : [];
  const ctx = stages.find((s) => s?.agent === "_context") || {};
  const hasAgent = (id) => stages.some((s) => s?.agent === id);
  const humanizerOn =
    Boolean(ctx.humanizerEnabled ?? config.humanizerEnabled) || hasAgent("humanizer");
  const reviewOn =
    Boolean(ctx.headingsApprovalEnabled ?? config.headingsApprovalEnabled) ||
    hasAgent("headings_approval");
  return BLOG_PIPELINE.map((step) => {
    if (step.id === "humanizer") return { ...step, optional: !humanizerOn };
    if (step.id === "headings_approval") return { ...step, optional: !reviewOn };
    return step;
  });
}

export const RESEARCH_PIPELINE = [
  { id: "researcher", title: "Researcher", subtitle: "Site brief + seeds" },
  { id: "scout", title: "Scout", subtitle: "SE Ranking harvest" },
];

export function isBlogResearchRun(run) {
  return run?.trigger === "research" || run?.draftPreviewJson?.kind === "keyword_research";
}

export function researchResultFromRun(run) {
  const stages = Array.isArray(run?.stagesJson) ? run.stagesJson : [];
  const hit = stages.find((s) => s?.agent === "_result");
  return hit?.result || null;
}

export function resolveImageSrc(path) {
  if (!path) return null;
  const value = String(path);
  if (value.startsWith("/") || /^(https?:|data:|blob:)/i.test(value)) return value;
  return `/api/uploads/${value.replace(/^.*[\\/]/, "")}`;
}

function draftStageExtra(stage) {
  if (!stage) return null;
  if (stage.agent === "image") return imageStageExtra(stage);
  const d = stage.data;
  if (!d || typeof d !== "object") return null;

  if (stage.agent === "decider") {
    const cands = Array.isArray(d.candidates) ? d.candidates : [];
    const sourceLabel =
      d.source === "harvest"
        ? "Keyword library"
        : d.source === "gsc"
          ? "Search Console × harvest"
          : d.source === "trends"
            ? "Google Trends × harvest"
            : null;
    return (
      <div className="space-y-1.5 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-2.5">
        <p className="text-[12px] font-semibold text-[var(--cw-ink)]">{d.topic}</p>
        {d.seedQuery && d.seedQuery !== d.topic ? (
          <p className="text-[10px] text-[var(--cw-ink-faint)]">Seed · {d.seedQuery}</p>
        ) : null}
        {sourceLabel ? <p className="text-[10px] text-[var(--cw-ink-faint)]">{sourceLabel}</p> : null}
        {d.why ? <p className="text-[11px] text-[var(--cw-ink-muted)]">{d.why}</p> : null}
        {cands.length ? (
          <p className="text-[10px] text-[var(--cw-ink-faint)]">
            Candidates: {cands.slice(0, 6).map((c) => c.query).join(" · ")}
          </p>
        ) : null}
      </div>
    );
  }
  if (stage.agent === "binder") {
    return (
      <div className="space-y-1.5 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-2.5 text-[11px] text-[var(--cw-ink-muted)]">
        {d.cluster ? <p>Cluster · {d.cluster}</p> : null}
        <p>
          Primary · <span className="font-semibold text-[var(--cw-ink)]">{d.primary}</span>
        </p>
        {d.headingKeywords?.length ? <p>Headings · {d.headingKeywords.join(" · ")}</p> : null}
        {d.bodyKeywords?.length ? <p>Body · {d.bodyKeywords.join(" · ")}</p> : null}
      </div>
    );
  }
  if (stage.agent === "checker") {
    return (
      <div className="rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-2.5 text-[11px] text-[var(--cw-ink-muted)]">
        <p>
          {d.verdict === "rephrased" ? "Rephrased after a collision" : "Unique"}
          {d.topic ? ` · ${d.topic}` : ""}
        </p>
        {d.hit?.title ? <p className="mt-1 text-[var(--cw-ink-faint)]">Collided with {d.hit.title}</p> : null}
      </div>
    );
  }
  if (stage.agent === "headings_approval") {
    return (
      <div className="rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-2.5 text-[11px] text-[var(--cw-ink-muted)]">
        <p className="font-semibold text-[var(--cw-ink)]">{d.h1 || d.topic || "Outline"}</p>
        <p className="mt-0.5">
          Round {d.round || 1}
          {d.recipientCount ? ` · emailed ${d.recipientCount} User-role reviewer${d.recipientCount === 1 ? "" : "s"}` : ""}
        </p>
        {d.reason ? <p className="mt-1 text-[var(--cw-ink-faint)]">Last decline · {d.reason}</p> : null}
      </div>
    );
  }
  if (stage.agent === "headings" && Array.isArray(d.sections)) {
    return (
      <ul className="space-y-1 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-2.5 text-[11px] text-[var(--cw-ink-muted)]">
        {d.h1 ? <li className="font-semibold text-[var(--cw-ink)]">{d.h1}</li> : null}
        {d.sections.slice(0, 8).map((s) => (
          <li key={s.section_id || s.heading_h2}>{s.heading_h2}</li>
        ))}
      </ul>
    );
  }
  return null;
}
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

export default function RunConsole({ run, onCancel, cancelling, config }) {
  const research = isBlogResearchRun(run);
  const pipeline = research ? RESEARCH_PIPELINE : blogPipelineForRun(run, config);

  const steps = useMemo(() => {
    const stages = (Array.isArray(run?.stagesJson) ? run.stagesJson : []).filter(
      (s) => s?.agent && !String(s.agent).startsWith("_")
    );
    return buildPipelineSteps(pipeline, stages, (s) => s?.agent).map((step) => ({
      ...step,
      extra: research ? null : draftStageExtra(step.raw),
    }));
  }, [run?.stagesJson, pipeline, research]);

  const result = research ? researchResultFromRun(run) : null;

  const draft = useMemo(() => {
    if (research) return null;
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
  }, [run?.draftPreviewJson, research]);

  return (
    <AgentPipeline
      run={run}
      steps={steps}
      eyebrow={research ? "Keyword research" : "Blog run"}
      title={run?.topic || (research ? "Keyword research" : "Untitled topic")}
      draft={draft}
      onCancel={onCancel}
      cancelling={cancelling}
      emptyIcon={research ? Search : PenLine}
      emptyTitle="No run yet"
      emptyHint={
        research
          ? "Start research and the Site Researcher then Keyword Scout appear here as they work."
          : "Start a draft and every agent — Decider, Binder, Checker, Headings, Architect, Writer, Humanizer, Image — appears here as it works."
      }
      showDraftSlot={!research}
      footer={result ? <KeywordResearchBoard result={result} /> : null}
    />
  );
}
