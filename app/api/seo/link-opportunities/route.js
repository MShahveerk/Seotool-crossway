import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { canAccessSection } from "@/lib/modulePermissions";
import { getLinkOpportunities, peekLinkOpportunities } from "@/lib/linkOpportunities";
import { isOrganicSearchReady } from "@/lib/dataSources";
import { isSerankingConfigured } from "@/lib/seranking/config";

export const runtime = "nodejs";
/** Streaming hunt: rival backlinks plus live page checks. */
export const maxDuration = 300;

const ALLOWED_GEO = new Set(["us", "uk", "ca", "au", "pk"]);

function parseOpts(body) {
  const {
    keyword = "",
    siteUrl = "",
    location = "",
    device = "desktop",
    geo = "us",
    rankers = 10,
    refdomains = 200,
    refresh = false,
  } = body || {};
  return {
    keyword: String(keyword || "").trim(),
    siteUrl,
    refresh: Boolean(refresh),
    opts: {
      location,
      device: device === "mobile" ? "mobile" : "desktop",
      geo: ALLOWED_GEO.has(String(geo).toLowerCase()) ? String(geo).toLowerCase() : "us",
      rankers: Math.min(30, Math.max(3, Number(rankers) || 10)),
      refdomains: Math.min(200, Math.max(25, Number(refdomains) || 200)),
    },
  };
}

async function requireAccess() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessSection(session.user, "link-opportunities")) {
    return NextResponse.json(
      { error: "Forbidden: Access to Link Opportunities is not granted." },
      { status: 403 }
    );
  }
  if (!(await isOrganicSearchReady())) {
    return NextResponse.json(
      { error: "Live search is not available. Add SerpAPI or Google Programmable Search in Admin → Data sources." },
      { status: 503 }
    );
  }
  if (!isSerankingConfigured()) {
    return NextResponse.json(
      { error: "Backlink data is not configured for this environment." },
      { status: 503 }
    );
  }
  return null;
}

export async function GET(req) {
  try {
    const blocked = await requireAccess();
    if (blocked) return blocked;
    const url = new URL(req.url);
    const { keyword, siteUrl, opts } = parseOpts(Object.fromEntries(url.searchParams.entries()));
    if (!keyword) {
      return NextResponse.json({ error: "Please enter a target keyword or phrase." }, { status: 400 });
    }
    const data = await peekLinkOpportunities(siteUrl, keyword, opts);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[Link Opportunities GET Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to read link opportunities" },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    const blocked = await requireAccess();
    if (blocked) return blocked;

    const body = await req.json().catch(() => ({}));
    const { keyword, siteUrl, opts, refresh } = parseOpts(body);

    if (!keyword) {
      return NextResponse.json({ error: "Please enter a target keyword or phrase." }, { status: 400 });
    }

    const wantsStream = String(req.headers.get("accept") || "").includes("text/event-stream");
    if (!wantsStream) {
      const data = await getLinkOpportunities(siteUrl, keyword, opts, { force: refresh });
      return NextResponse.json({ success: true, data });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };
        try {
          const data = await getLinkOpportunities(siteUrl, keyword, opts, {
            force: refresh,
            onProgress: async (payload) => send(payload),
          });
          send({ ...data, status: data.status || "done" });
        } catch (err) {
          send({
            status: "error",
            error: err.message || "Failed to build link opportunities",
          });
        } finally {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    console.error("[Link Opportunities API Error]:", err);
    const status = err.status && Number.isInteger(err.status) ? err.status : 500;
    return NextResponse.json(
      { success: false, error: err.message || "Failed to build link opportunities" },
      { status }
    );
  }
}
