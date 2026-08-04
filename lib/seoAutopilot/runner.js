/**
 * SEO Autopilot orchestration — runs selected agents, persists artifacts + pitches.
 */
import prisma from "../prisma.js";
import { chatCompletion } from "../blogStudio/providers.js";
import { AGENT_DEFS, AGENT_DEFAULT_PROMPTS } from "./defaults.js";
import { getAutopilotConfig, parseEnabledAgents } from "./engine.js";
import { buildAutopilotContext } from "./context.js";

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function runOneAgent(agentDef, config, contextText) {
  const provider = config[agentDef.providerKey] || agentDef.defaultProvider;
  const model = config[agentDef.modelKey] || agentDef.defaultModel;
  const system =
    String(config[agentDef.promptKey] || "").trim() || AGENT_DEFAULT_PROMPTS[agentDef.id];

  const result = await chatCompletion({
    provider,
    model,
    siteConfig: config,
    system,
    user: `Run your ${agentDef.title} job for this site.\n\nCONTEXT:\n${contextText}`,
    temperature: 0.3,
    maxTokens: 6000,
    jsonMode: true,
  });

  const parsed =
    result?.json ||
    extractJsonObject(result?.text || result?.content || "");
  return {
    agentId: agentDef.id,
    provider,
    model,
    costUsd: Number(result?.costUsd || 0),
    rawText: result?.text || result?.content || "",
    data: parsed,
    ok: Boolean(parsed),
    error: parsed ? null : "Model did not return valid JSON.",
  };
}

async function persistAgentOutputs(siteLink, runId, stage) {
  if (!stage?.ok || !stage.data) return;

  if (stage.agentId === "fixer") {
    const d = stage.data;
    const rows = [
      d.robotsTxt
        ? {
            kind: "robots_txt",
            title: "robots.txt",
            contentText: String(d.robotsTxt),
          }
        : null,
      d.llmsTxt
        ? { kind: "llms_txt", title: "llms.txt", contentText: String(d.llmsTxt) }
        : null,
      d.faqSchemaJsonLd
        ? {
            kind: "faq_schema",
            title: "FAQ schema (JSON-LD)",
            contentText: String(d.faqSchemaJsonLd),
          }
        : null,
    ].filter(Boolean);

    for (const block of d.answerBlocks || []) {
      rows.push({
        kind: "answer_block",
        title: block.title || "Citable answer",
        pageUrl: block.pageUrl || null,
        contentText: [
          block.metaDescription ? `Meta: ${block.metaDescription}` : "",
          block.citableAnswer || "",
        ]
          .filter(Boolean)
          .join("\n\n"),
        contentJson: block,
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
    await prisma.seoAutopilotArtifact.create({
      data: {
        siteLink,
        runId,
        kind: "foundation_list",
        title: "Foundation link shortlist",
        contentJson: stage.data,
        contentText: stage.data.links
          .map((l) => `${l.name} — ${l.url || ""} (DA ${l.domainAuthority ?? "?"})`)
          .join("\n"),
      },
    });
    for (const link of stage.data.links) {
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
    for (const p of stage.data.pitches) {
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

export async function executeAutopilotRun(runId) {
  const run = await prisma.seoAutopilotRun.findUnique({ where: { id: runId } });
  if (!run) return null;

  await prisma.seoAutopilotRun.update({
    where: { id: runId },
    data: { status: "running", startedAt: new Date(), errorMessage: null },
  });

  const config = await getAutopilotConfig(run.siteLink);
  const agentIds = Array.isArray(run.agentsJson)
    ? run.agentsJson
    : parseEnabledAgents(config.enabledAgents);
  const defs = AGENT_DEFS.filter((a) => agentIds.includes(a.id));

  try {
    const context = await buildAutopilotContext(run.siteLink, config);
    const stages = [];
    let totalCost = 0;
    let scorecard = null;

    for (const def of defs) {
      const fresh = await prisma.seoAutopilotRun.findUnique({
        where: { id: runId },
        select: { cancelRequested: true },
      });
      if (fresh?.cancelRequested) {
        await prisma.seoAutopilotRun.update({
          where: { id: runId },
          data: {
            status: "cancelled",
            stagesJson: stages,
            finishedAt: new Date(),
            totalCostUsd: totalCost,
          },
        });
        return;
      }

      try {
        const stage = await runOneAgent(def, config, context.contextText);
        totalCost += stage.costUsd || 0;
        stages.push(stage);
        if (stage.agentId === "auditor" && stage.data) {
          scorecard = {
            googleHealthScore: stage.data.googleHealthScore,
            geoReadinessScore: stage.data.geoReadinessScore,
            summary: stage.data.summary,
            topProblems: stage.data.topProblems || [],
            geo: null,
            at: new Date().toISOString(),
          };
        }
        if (stage.agentId === "geoSpy" && stage.data && scorecard) {
          scorecard.geo = {
            overallVisibilityScore: stage.data.overallVisibilityScore,
            engines: stage.data.engines || [],
          };
        } else if (stage.agentId === "geoSpy" && stage.data) {
          scorecard = {
            googleHealthScore: null,
            geoReadinessScore: stage.data.overallVisibilityScore,
            summary: stage.data.biggestGap || "",
            topProblems: [],
            geo: stage.data,
            at: new Date().toISOString(),
          };
        }
        await persistAgentOutputs(run.siteLink, runId, stage);
      } catch (err) {
        stages.push({
          agentId: def.id,
          ok: false,
          error: err.message || "Agent failed",
          costUsd: 0,
        });
      }

      await prisma.seoAutopilotRun.update({
        where: { id: runId },
        data: { stagesJson: stages, scorecardJson: scorecard, totalCostUsd: totalCost },
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
