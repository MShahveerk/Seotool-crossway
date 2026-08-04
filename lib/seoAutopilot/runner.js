/**
 * SEO Autopilot orchestration — runs selected agents, persists artifacts + pitches.
 */
import prisma from "../prisma.js";
import { chatCompletion } from "../blogStudio/providers.js";
import { resolveModelJson } from "../parseAiJson.js";
import { AGENT_DEFS, AGENT_DEFAULT_PROMPTS } from "./defaults.js";
import { getAutopilotConfig, parseEnabledAgents } from "./engine.js";
import { buildAutopilotContext } from "./context.js";
import { enrichScorecard } from "./scorecardEnrich.js";
import { mergeDeployGuides } from "./fallbackGuides.js";
import { filterNewOutreachTargets, normalizeHost } from "./existingLinkHosts.js";

async function runOneAgent(agentDef, config, contextText, priorStages = []) {
  const provider = config[agentDef.providerKey] || agentDef.defaultProvider;
  const model = config[agentDef.modelKey] || agentDef.defaultModel;
  const system =
    String(config[agentDef.promptKey] || "").trim() || AGENT_DEFAULT_PROMPTS[agentDef.id];

  let priorBlock = "";
  if (agentDef.id === "writer") {
    const diagnoser = [...priorStages].reverse().find((s) => s.agentId === "diagnoser" && s.data);
    if (diagnoser?.data) {
      try {
        priorBlock = `\n\nDIAGNOSER OUTPUT (use this for sends):\n${JSON.stringify(diagnoser.data).slice(0, 10000)}`;
      } catch {
        priorBlock = "";
      }
    }
  }

  const resolved = await resolveModelJson({
    chatCompletion,
    provider,
    model,
    siteConfig: config,
    agentId: agentDef.id,
    system,
    user: `Run your ${agentDef.title} job for this site.\n\nCONTEXT:\n${contextText}${priorBlock}`,
    temperature: 0.3,
    maxTokens: 6000,
  });

  const parsed = resolved.data;
  const note = resolved.salvaged
    ? "Recovered plain-text output (JSON was invalid after repair retry)."
    : resolved.repaired
      ? "JSON repaired on retry."
      : null;

  return {
    agentId: agentDef.id,
    title: agentDef.title,
    subtitle: agentDef.subtitle,
    provider,
    model,
    costUsd: Number(resolved.costUsd || 0),
    rawText: resolved.rawText || "",
    data: parsed,
    ok: true,
    status: "succeeded",
    repaired: Boolean(resolved.repaired),
    salvaged: Boolean(resolved.salvaged),
    error: null,
    warning: note,
    preview: [
      note ? `[${note}] ` : "",
      stagePreview(agentDef.id, parsed),
    ]
      .filter(Boolean)
      .join(""),
    finishedAt: new Date().toISOString(),
  };
}

function stagePreview(agentId, data) {
  if (!data || typeof data !== "object") return "";
  try {
    if (agentId === "auditor") {
      return String(data.summary || "").slice(0, 400);
    }
    if (agentId === "geoSpy") {
      return String(data.biggestGap || `GEO score ${data.overallVisibilityScore ?? "—"}`).slice(0, 400);
    }
    if (agentId === "diagnoser") {
      const n = (data.priorityWrites || []).length;
      const q = (data.aiQuestions || []).length;
      return `${(data.strikingDistance || []).length} striking-distance · ${q} AI questions · ${n} priority writes`;
    }
    if (agentId === "writer") {
      const n = (data.sends || []).length;
      const titles = (data.sends || []).map((s) => s.title || s.topic).filter(Boolean).slice(0, 3);
      return `${n} blog seed(s)${titles.length ? `: ${titles.join(" · ")}` : ""}`;
    }
    if (agentId === "fixer") {
      const guides = (data.deployGuides || []).length;
      return `robots/llms/schema ready · ${guides} deploy guide(s)`;
    }
    if (agentId === "foundation") {
      return `${(data.links || []).length} foundation targets`;
    }
    if (agentId === "pitcher") {
      return `${(data.pitches || []).length} outreach draft(s)`;
    }
    if (agentId === "tracker") {
      return String(data.summary || data.visibilityTrend || "").slice(0, 400);
    }
    return JSON.stringify(data).slice(0, 280);
  } catch {
    return "";
  }
}

async function persistAgentOutputs(siteLink, runId, stage, existingLinkHosts = []) {
  if (!stage?.ok || !stage.data) return;
  const blocklist = Array.isArray(existingLinkHosts) ? existingLinkHosts : [];

  if (stage.agentId === "fixer") {
    const d = stage.data;
    const guides = mergeDeployGuides(d.deployGuides, siteLink);
    const guideFor = (id) => guides.find((g) => String(g.id || "") === id) || null;

    const rows = [
      d.robotsTxt
        ? {
            kind: "robots_txt",
            title: "robots.txt — allow AI crawlers",
            contentText: String(d.robotsTxt),
            contentJson: {
              file: String(d.robotsTxt),
              guide: guideFor("robots_txt"),
              purpose:
                "Tells AI search crawlers they may read your site. Without this, some engines skip you.",
            },
          }
        : null,
      d.llmsTxt
        ? {
            kind: "llms_txt",
            title: "llms.txt — AI site menu",
            contentText: String(d.llmsTxt),
            contentJson: {
              file: String(d.llmsTxt),
              guide: guideFor("llms_txt"),
              purpose:
                "A plain-text map so ChatGPT / Perplexity / others describe and cite your brand correctly.",
            },
          }
        : null,
      d.faqSchemaJsonLd
        ? {
            kind: "faq_schema",
            title: "FAQ schema (JSON-LD)",
            contentText: String(d.faqSchemaJsonLd),
            contentJson: {
              file: String(d.faqSchemaJsonLd),
              guide: guideFor("faq_schema"),
              purpose: "Labels Q&A content so Google and AI systems can surface rich results / citations.",
            },
          }
        : null,
    ].filter(Boolean);

    (d.answerBlocks || []).forEach((block, idx) => {
      rows.push({
        kind: "answer_block",
        title: block.title || `Citable answer ${idx + 1}`,
        pageUrl: block.pageUrl || null,
        contentText: [
          block.metaDescription ? `Meta: ${block.metaDescription}` : "",
          block.citableAnswer || "",
        ]
          .filter(Boolean)
          .join("\n\n"),
        contentJson: {
          ...block,
          guide: guideFor(`answer_block_${idx + 1}`) || guideFor("answer_block"),
          purpose: "A short, quotable answer block AI engines can cite for a target question.",
        },
      });
    });

    if (guides.length) {
      rows.push({
        kind: "deploy_guide",
        title: "Implementation playbook",
        contentJson: { deployGuides: guides, deployNotes: d.deployNotes || [] },
        contentText: guides.map((g) => `${g.title}: ${(g.steps || []).join(" → ")}`).join("\n"),
      });
    }

    for (const row of rows) {
      await prisma.seoAutopilotArtifact.create({
        data: {
          siteLink,
          runId,
          kind: row.kind,
          title: row.title,
          pageUrl: row.pageUrl || null,
          contentText: row.contentText || null,
          contentJson: row.contentJson || null,
        },
      });
    }
  }

  if (stage.agentId === "foundation" && Array.isArray(stage.data.links)) {
    const { kept, skipped } = filterNewOutreachTargets(stage.data.links, blocklist, "url");
    stage.data = {
      ...stage.data,
      links: kept,
      skippedExistingLinkers: skipped.map((l) => l.url || l.name).filter(Boolean),
    };
    stage.preview = `${kept.length} foundation target(s)${
      skipped.length ? ` · skipped ${skipped.length} already-linking/pitched` : ""
    }`;

    await prisma.seoAutopilotArtifact.create({
      data: {
        siteLink,
        runId,
        kind: "foundation_list",
        title: "Foundation link shortlist",
        contentJson: stage.data,
        contentText: kept
          .map((l) => `${l.name} — ${l.url || ""} (DA ${l.domainAuthority ?? "?"})`)
          .join("\n"),
      },
    });
    for (const link of kept) {
      if (!link?.submissionDraft && !link?.targetEmail) continue;
      await prisma.seoAutopilotPitch.create({
        data: {
          siteLink,
          runId,
          source: "foundation",
          title: link.name || "Directory submission",
          targetName: link.name || null,
          targetUrl: link.url || null,
          targetEmail: link.targetEmail || null,
          subject: `Listing submission — ${link.name || "directory"}`,
          bodyText: link.submissionDraft || "",
          doFollow: link.doFollow ?? null,
          domainAuthority:
            link.domainAuthority != null ? Number(link.domainAuthority) || null : null,
          status: "ready",
          metaJson: link,
        },
      });
    }
  }

  if (stage.agentId === "pitcher" && Array.isArray(stage.data.pitches)) {
    const { kept, skipped } = filterNewOutreachTargets(stage.data.pitches, blocklist, "targetUrl");
    stage.data = {
      ...stage.data,
      pitches: kept,
      skippedExistingLinkers: skipped.map((p) => p.targetUrl || p.targetName).filter(Boolean),
    };
    stage.preview = `${kept.length} outreach draft(s)${
      skipped.length ? ` · skipped ${skipped.length} already-linking/pitched` : ""
    }`;

    for (const p of kept) {
      await prisma.seoAutopilotPitch.create({
        data: {
          siteLink,
          runId,
          source: p.source || "editorial",
          title: p.title || "Outreach pitch",
          targetName: p.targetName || null,
          targetUrl: p.targetUrl || null,
          targetEmail: p.targetEmail || null,
          subject: p.subject || p.title || "Quick idea for your piece",
          bodyText: p.bodyText || "",
          bodyHtml: p.bodyText
            ? `<p>${String(p.bodyText).replace(/\n/g, "<br/>")}</p>`
            : null,
          doFollow: p.doFollow ?? null,
          domainAuthority:
            p.domainAuthority != null ? Number(p.domainAuthority) || null : null,
          status: "ready",
          metaJson: p,
        },
      });
    }
  }

  if (stage.agentId === "tracker") {
    await prisma.seoAutopilotArtifact.create({
      data: {
        siteLink,
        runId,
        kind: "tracker",
        title: "Backlink tracker summary",
        contentJson: stage.data,
        contentText: stage.data.summary || "",
      },
    });
  }

  if (stage.agentId === "diagnoser") {
    await prisma.seoAutopilotArtifact.create({
      data: {
        siteLink,
        runId,
        kind: "diagnoser",
        title: "Keyword + AI question gaps",
        contentJson: stage.data,
      },
    });
  }

  if (stage.agentId === "geoSpy") {
    await prisma.seoAutopilotArtifact.create({
      data: {
        siteLink,
        runId,
        kind: "geo_spy",
        title: "AI-search visibility",
        contentJson: stage.data,
      },
    });
  }

  if (stage.agentId === "writer") {
    const { persistWriterSends } = await import("./writerSends.js");
    const sends = Array.isArray(stage.data?.sends) ? stage.data.sends : [];
    const created = await persistWriterSends({ siteLink, runId, sends });
    await prisma.seoAutopilotArtifact.create({
      data: {
        siteLink,
        runId,
        kind: "writer_sends",
        title: `Blog seeds (${created.length})`,
        contentJson: { count: created.length, sendIds: created.map((r) => r.id) },
        contentText: created.map((r) => `${r.title} — ${r.topic || ""}`).join("\n"),
      },
    });
  }
}

export async function enqueueAutopilotRun({
  siteLink,
  trigger = "manual",
  triggeredById = null,
  agentIds = null,
} = {}) {
  const config = await getAutopilotConfig(siteLink);
  const agents = agentIds?.length ? agentIds : parseEnabledAgents(config.enabledAgents);

  const run = await prisma.seoAutopilotRun.create({
    data: {
      siteLink: String(siteLink).trim(),
      trigger,
      status: "queued",
      agentsJson: agents,
      triggeredById: triggeredById || null,
    },
  });

  // Fire-and-forget execution (same pattern as studios).
  setImmediate(() => {
    executeAutopilotRun(run.id).catch((err) => {
      console.error("[seo-autopilot] run failed", run.id, err.message);
    });
  });

  return run;
}

async function isAutopilotCancelled(runId) {
  const row = await prisma.seoAutopilotRun.findUnique({
    where: { id: runId },
    select: { cancelRequested: true, status: true },
  });
  return Boolean(row?.cancelRequested) || row?.status === "cancelled";
}

/**
 * Cancel a queued/running Autopilot run.
 * Soft-stop: sets cancelRequested so the worker exits between agents.
 * Hard-stop: also marks cancelled immediately so UI unblocks (in-flight agent may still finish its HTTP call).
 */
export async function cancelAutopilotRun(runId, { hard = true } = {}) {
  const run = await prisma.seoAutopilotRun.findUnique({ where: { id: runId } });
  if (!run) {
    const err = new Error("Run not found.");
    err.status = 404;
    throw err;
  }
  if (["completed", "failed", "cancelled"].includes(run.status)) {
    return run;
  }

  const stages = Array.isArray(run.stagesJson) ? [...run.stagesJson] : [];
  for (let i = 0; i < stages.length; i += 1) {
    if (stages[i]?.status === "running" || stages[i]?.status === "pending") {
      stages[i] = {
        ...stages[i],
        status: "cancelled",
        finishedAt: new Date().toISOString(),
        error: stages[i]?.status === "running" ? "Cancelled by user." : stages[i]?.error || null,
        ok: false,
      };
    }
  }

  return prisma.seoAutopilotRun.update({
    where: { id: runId },
    data: hard
      ? {
          cancelRequested: true,
          status: "cancelled",
          finishedAt: new Date(),
          errorMessage: "Cancelled by user.",
          stagesJson: stages,
        }
      : {
          cancelRequested: true,
          stagesJson: stages.length ? stages : undefined,
        },
  });
}

/** Cancel every queued/running Autopilot run for a site. */
export async function cancelActiveAutopilotRunsForSite(siteLink) {
  const link = String(siteLink || "").trim();
  if (!link) {
    const err = new Error("siteLink is required.");
    err.status = 400;
    throw err;
  }
  const active = await prisma.seoAutopilotRun.findMany({
    where: { siteLink: link, status: { in: ["queued", "running"] } },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  const cancelled = [];
  for (const row of active) {
    cancelled.push(await cancelAutopilotRun(row.id, { hard: true }));
  }
  return { count: cancelled.length, runs: cancelled };
}

export async function executeAutopilotRun(runId) {
  const run = await prisma.seoAutopilotRun.findUnique({ where: { id: runId } });
  if (!run) return null;
  if (run.cancelRequested || run.status === "cancelled") {
    await prisma.seoAutopilotRun.update({
      where: { id: runId },
      data: {
        status: "cancelled",
        finishedAt: run.finishedAt || new Date(),
        errorMessage: run.errorMessage || "Cancelled by user.",
      },
    });
    return null;
  }

  // Claim the run only if it was not hard-cancelled in the meantime.
  const claimed = await prisma.seoAutopilotRun.updateMany({
    where: {
      id: runId,
      cancelRequested: false,
      status: { in: ["queued", "running"] },
    },
    data: { status: "running", startedAt: new Date(), errorMessage: null },
  });
  if (!claimed.count) return null;

  const config = await getAutopilotConfig(run.siteLink);
  const agentIds = Array.isArray(run.agentsJson)
    ? run.agentsJson
    : parseEnabledAgents(config.enabledAgents);
  const defs = AGENT_DEFS.filter((a) => agentIds.includes(a.id));

  try {
    const context = await buildAutopilotContext(run.siteLink, config);
    if (await isAutopilotCancelled(runId)) {
      await prisma.seoAutopilotRun.update({
        where: { id: runId },
        data: {
          status: "cancelled",
          cancelRequested: true,
          finishedAt: new Date(),
          errorMessage: "Cancelled by user.",
        },
      });
      return;
    }
    const stages = defs.map((def) => ({
      agentId: def.id,
      title: def.title,
      subtitle: def.subtitle,
      provider: config[def.providerKey] || def.defaultProvider,
      model: config[def.modelKey] || def.defaultModel,
      status: "pending",
      ok: null,
      costUsd: 0,
      error: null,
      preview: "",
    }));
    let totalCost = 0;
    let scorecard = null;

    const stageWrite = await prisma.seoAutopilotRun.updateMany({
      where: {
        id: runId,
        cancelRequested: false,
        status: { in: ["queued", "running"] },
      },
      data: { stagesJson: stages, totalCostUsd: 0 },
    });
    if (!stageWrite.count) return;

    for (let i = 0; i < defs.length; i++) {
      const def = defs[i];
      if (await isAutopilotCancelled(runId)) {
        for (let j = i; j < stages.length; j++) {
          if (stages[j].status === "pending" || stages[j].status === "running") {
            stages[j] = {
              ...stages[j],
              status: "cancelled",
              finishedAt: new Date().toISOString(),
              error: stages[j].status === "running" ? "Cancelled by user." : null,
              ok: false,
            };
          }
        }
        await prisma.seoAutopilotRun.update({
          where: { id: runId },
          data: {
            status: "cancelled",
            cancelRequested: true,
            stagesJson: stages,
            finishedAt: new Date(),
            totalCostUsd: totalCost,
            errorMessage: "Cancelled by user.",
          },
        });
        return;
      }

      stages[i] = {
        ...stages[i],
        status: "running",
        startedAt: new Date().toISOString(),
      };
      await prisma.seoAutopilotRun.update({
        where: { id: runId },
        data: { stagesJson: stages, totalCostUsd: totalCost },
      });

      try {
        const stage = await runOneAgent(def, config, context.contextText, stages);
        totalCost += stage.costUsd || 0;
        stages[i] = { ...stages[i], ...stage, status: stage.status || (stage.ok ? "succeeded" : "failed") };
        if (stage.agentId === "auditor" && stage.data) {
          scorecard = enrichScorecard({
            auditorData: stage.data,
            context,
            config,
            geoData: null,
          });
        }
        if (stage.agentId === "geoSpy" && stage.data) {
          const geoData = stage.data;
          if (scorecard) {
            scorecard = enrichScorecard({
              auditorData: {
                googleHealthScore: scorecard.googleHealthScore,
                geoReadinessScore: geoData.overallVisibilityScore,
                summary: scorecard.summary,
                topProblems: scorecard.topProblems,
                nextSteps: scorecard.nextSteps,
                metrics: scorecard.metrics,
              },
              context,
              config,
              geoData,
            });
          } else {
            scorecard = enrichScorecard({
              auditorData: {
                geoReadinessScore: geoData.overallVisibilityScore,
                summary: geoData.biggestGap || "",
                topProblems: [],
              },
              context,
              config,
              geoData,
            });
          }
        }
        if (stage.agentId === "tracker" && stage.data && scorecard) {
          scorecard = {
            ...scorecard,
            tracker: stage.data,
            at: new Date().toISOString(),
          };
        }
        // Skip side-effects if the user cancelled while this agent was in flight.
        if (!(await isAutopilotCancelled(runId))) {
          await persistAgentOutputs(
            run.siteLink,
            runId,
            stage,
            context.existingLinkHosts || []
          );
          // Grow blocklist mid-run so later Pitch/Foundation stages don't repeat earlier saves.
          if (!Array.isArray(context.existingLinkHosts)) context.existingLinkHosts = [];
          if (stage.agentId === "pitcher" && Array.isArray(stage.data?.pitches)) {
            for (const p of stage.data.pitches) {
              const h = normalizeHost(p.targetUrl);
              if (h) context.existingLinkHosts.push(h);
            }
          }
          if (stage.agentId === "foundation" && Array.isArray(stage.data?.links)) {
            for (const l of stage.data.links) {
              const h = normalizeHost(l.url);
              if (h) context.existingLinkHosts.push(h);
            }
          }
        }
      } catch (err) {
        stages[i] = {
          ...stages[i],
          agentId: def.id,
          title: def.title,
          ok: false,
          status: "failed",
          error: err.message || "Agent failed",
          costUsd: 0,
          finishedAt: new Date().toISOString(),
        };
      }

      // If user hard-cancelled during the LLM call, drop remaining work and stay cancelled.
      if (await isAutopilotCancelled(runId)) {
        if (stages[i].status === "running") {
          stages[i] = {
            ...stages[i],
            status: "cancelled",
            finishedAt: new Date().toISOString(),
            error: "Cancelled by user.",
            ok: false,
          };
        }
        for (let j = i + 1; j < stages.length; j++) {
          if (stages[j].status === "pending" || stages[j].status === "running") {
            stages[j] = {
              ...stages[j],
              status: "cancelled",
              finishedAt: new Date().toISOString(),
              ok: false,
            };
          }
        }
        await prisma.seoAutopilotRun.update({
          where: { id: runId },
          data: {
            status: "cancelled",
            cancelRequested: true,
            stagesJson: stages,
            scorecardJson: scorecard,
            totalCostUsd: totalCost,
            finishedAt: new Date(),
            errorMessage: "Cancelled by user.",
          },
        });
        return;
      }

      await prisma.seoAutopilotRun.update({
        where: { id: runId },
        data: { stagesJson: stages, scorecardJson: scorecard, totalCostUsd: totalCost },
      });
    }

    if (await isAutopilotCancelled(runId)) {
      await prisma.seoAutopilotRun.update({
        where: { id: runId },
        data: {
          status: "cancelled",
          cancelRequested: true,
          stagesJson: stages,
          scorecardJson: scorecard,
          totalCostUsd: totalCost,
          finishedAt: new Date(),
          errorMessage: "Cancelled by user.",
        },
      });
      return;
    }

    if (!scorecard) {
      scorecard = enrichScorecard({
        auditorData: {},
        context,
        config,
        geoData: null,
      });
    }

    if (scorecard) {
      await prisma.seoAutopilotSiteConfig.updateMany({
        where: { siteLink: run.siteLink },
        data: { latestScorecardJson: scorecard },
      });
      await prisma.seoAutopilotArtifact.create({
        data: {
          siteLink: run.siteLink,
          runId,
          kind: "scorecard",
          title: "Baseline scorecard",
          contentJson: scorecard,
        },
      });
    }

    await prisma.seoAutopilotRun.update({
      where: { id: runId },
      data: {
        status: "completed",
        stagesJson: stages,
        scorecardJson: scorecard,
        artifactsJson: { agentCount: stages.length },
        totalCostUsd: totalCost,
        finishedAt: new Date(),
      },
    });

    if (run.trigger === "auto") {
      await prisma.seoAutopilotSiteConfig.updateMany({
        where: { siteLink: run.siteLink },
        data: { lastAutoAt: new Date() },
      });
    }
  } catch (err) {
    if (await isAutopilotCancelled(runId)) {
      await prisma.seoAutopilotRun.update({
        where: { id: runId },
        data: {
          status: "cancelled",
          cancelRequested: true,
          errorMessage: "Cancelled by user.",
          finishedAt: new Date(),
        },
      });
      return;
    }
    await prisma.seoAutopilotRun.update({
      where: { id: runId },
      data: {
        status: "failed",
        errorMessage: err.message || "Run failed",
        finishedAt: new Date(),
      },
    });
  }
}

export async function runScheduledSeoAutopilot(logger = console) {
  const { listDueAutopilotSites } = await import("./engine.js");
  const due = await listDueAutopilotSites();
  for (const site of due) {
    try {
      await prisma.seoAutopilotSiteConfig.update({
        where: { id: site.id },
        data: { lastAutoAt: new Date() },
      });
      await enqueueAutopilotRun({
        siteLink: site.siteLink,
        trigger: "auto",
      });
      logger.info?.(`[seo-autopilot] queued auto run for ${site.siteLink}`);
    } catch (err) {
      logger.warn?.(`[seo-autopilot] schedule failed for ${site.siteLink}: ${err.message}`);
    }
  }
}
