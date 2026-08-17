import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../api/auth/[...nextauth]/route";
import { canAccessSection } from "@/lib/modulePermissions";
import { getSerpAnalysis } from "@/lib/serpAnalysis";
import { generateCompetitorSeeds } from "@/lib/competitorSeeds";
import { persistWriterSends } from "@/lib/seoAutopilot/writerSends.js";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canAccessSection(session.user, "serp-analysis")) {
      return NextResponse.json({ error: "Forbidden: SERP Analysis access is not granted." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      keyword = "",
      siteUrl = "",
      geo = "us",
      device = "desktop",
      location = "",
      // When false, generate ideas and return them WITHOUT saving — so the user
      // can review and edit them in the drawer first. Default true keeps the old
      // one-shot behaviour for any caller that has not adopted the review flow.
      persist = true,
      // When present, skip generation and just save these (already reviewed /
      // edited) ideas. This is the "Send to Studio" commit step.
      sends: providedSends = null,
    } = body;
    if (!String(siteUrl).trim()) {
      return NextResponse.json(
        { error: "Select a client site — the ideas are saved to that site's Blog Automation Studio." },
        { status: 400 }
      );
    }

    // Commit step: persist the reviewed/edited ideas the drawer sends back.
    if (Array.isArray(providedSends)) {
      if (!providedSends.length) {
        return NextResponse.json({ error: "No ideas to save." }, { status: 400 });
      }
      const runId = `competitor:${Date.now()}`;
      const created = await persistWriterSends({ siteLink: siteUrl, runId, sends: providedSends });
      return NextResponse.json({
        success: true,
        count: created.length,
        runId,
        source: "competitor",
        seeds: created.map((s) => ({ id: s.id, title: s.title, topic: s.topic, payload: s.payloadJson })),
      });
    }

    if (!String(keyword).trim()) {
      return NextResponse.json({ error: "Enter a keyword first." }, { status: 400 });
    }

    // Reuse the cached analysis (no repeat API spend if it was just run).
    const analysis = await getSerpAnalysis(siteUrl, keyword, { location, device, geo });
    const { seeds, provider, model } = await generateCompetitorSeeds({ keyword, analysis });

    // Preview: hand the raw ideas back for review — nothing saved yet.
    if (persist === false) {
      return NextResponse.json({
        success: true,
        preview: true,
        count: seeds.length,
        provider,
        model,
        seeds: seeds.map((payload) => ({ payload })),
      });
    }

    const runId = `competitor:${Date.now()}`;
    const created = await persistWriterSends({ siteLink: siteUrl, runId, sends: seeds });

    return NextResponse.json({
      success: true,
      count: created.length,
      runId,
      source: "competitor",
      provider,
      model,
      seeds: created.map((s) => ({ id: s.id, title: s.title, topic: s.topic, payload: s.payloadJson })),
    });
  } catch (err) {
    console.error("[Competitor Seeds API Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to generate blog ideas" },
      { status: err.status && Number.isInteger(err.status) ? err.status : 500 }
    );
  }
}
