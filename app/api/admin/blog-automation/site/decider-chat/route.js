import { requireAdminRoute } from "../../../../../../lib/adminAuth";

import { ENGINE_INTERNAL, getEngineMode } from "@/lib/blogStudio/engine.js";
import { fallbackGreeting, runDeciderChatTurn } from "@/lib/blogStudio/deciderChat.js";
import { isBrokenReply } from "@/lib/blogStudio/deciderChatVoice.js";
import {
  createDeciderThread,
  getDeciderThread,
  listDeciderThreads,
  llmHistoryFromThread,
  patchDeciderThread,
  selectDeciderThread,
} from "@/lib/blogStudio/deciderThreads.js";
import prisma from "@/lib/prisma.js";
import { enqueueBlogRevisionFromDecline } from "@/lib/studioRevision.js";
import { CHAT_PERSONA } from "@/lib/blogStudio/chatPersona.js";

export const runtime = "nodejs";
export const maxDuration = 60;

async function assertInternal() {
  const mode = await getEngineMode();
  if (mode !== ENGINE_INTERNAL) {
    const err = new Error("Switch Engine to Internal Studio before briefing.");
    err.status = 409;
    throw err;
  }
}

function siteFrom(req) {
  const url = new URL(req.url);
  const siteLink = String(url.searchParams.get("siteLink") || "").trim();
  if (!siteLink) {
    const err = new Error("siteLink is required.");
    err.status = 400;
    throw err;
  }
  return siteLink;
}

async function ensureOpening(siteLink, thread) {
  if (!thread) return thread;
  const hasUser = (thread.messages || []).some((m) => m.role === "user");
  if (hasUser) return thread;
  const first = (thread.messages || []).find((m) => m.role === "assistant");
  if (first && String(first.content || "").trim() && !isBrokenReply(first.content)) return thread;
  const greet = await runDeciderChatTurn({ siteLink, messages: [], greeting: true });
  const store = await patchDeciderThread(siteLink, thread.id, {
    messages: [
      {
        id: first?.id,
        role: "assistant",
        content: greet.reply,
        at: first?.at || new Date().toISOString(),
      },
    ],
  });
  return store.thread;
}

function payload(store, extra = {}) {
  return {
    persona: CHAT_PERSONA,
    activeId: store.activeId,
    threads: store.threads.map((t) => ({
      id: t.id,
      title: t.title,
      updatedAt: t.updatedAt,
      status: t.status,
      runId: t.runId,
      blogPostId: t.blogPostId,
    })),
    thread: extra.thread || store.threads.find((t) => t.id === store.activeId) || null,
    turn: extra.turn || null,
  };
}

export async function GET(req) {
  try {
    await requireAdminRoute(req, "blog-automation");
    await assertInternal();
    const siteLink = siteFrom(req);
    const store = await listDeciderThreads(siteLink);
    const active = store.threads.find((t) => t.id === store.activeId) || null;
    if (active) {
      const thread = await ensureOpening(siteLink, active);
      const fresh = await listDeciderThreads(siteLink);
      return Response.json(payload(fresh, { thread }));
    }
    return Response.json(payload(store));
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to load chats.", code: error.code || null },
      { status: error.status || 500 }
    );
  }
}

export async function POST(req) {
  try {
    const session = await requireAdminRoute(req, "blog-automation");
    await assertInternal();
    const siteLink = siteFrom(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "message").trim();

    if (action === "new") {
      const greet = await runDeciderChatTurn({ siteLink, messages: [], greeting: true });
      const created = await createDeciderThread(siteLink, {
        title: "New brief",
        greeting: greet.reply || fallbackGreeting({ brandName: greet.grounding?.brandName }),
      });
      return Response.json(payload(created, { thread: created.thread, turn: greet }));
    }

    if (action === "select") {
      const store = await selectDeciderThread(siteLink, body.threadId);
      const thread = await ensureOpening(siteLink, store.thread);
      const fresh = await listDeciderThreads(siteLink);
      return Response.json(payload(fresh, { thread }));
    }

    if (action === "attach-run") {
      const patch = { status: "running" };
      if (body.runId) patch.runId = body.runId;
      if (body.note) patch.appendMessage = { role: "assistant", content: body.note };
      const store = await patchDeciderThread(siteLink, body.threadId, patch);
      return Response.json(payload(store, { thread: store.thread }));
    }

    if (action === "finish") {
      const thread = await getDeciderThread(siteLink, body.threadId);
      if (!thread) {
        return Response.json({ error: "That chat was not found." }, { status: 404 });
      }
      const runId = String(body.runId || thread.runId || "").trim();
      let blogPostId = thread.blogPostId;
      let title = thread.title;
      if (runId) {
        const run = await prisma.blogAutomationRun.findUnique({
          where: { id: runId },
          select: { status: true, topic: true, blogPostId: true, draftPreviewJson: true, errorMessage: true },
        });
        blogPostId = run?.blogPostId || run?.draftPreviewJson?.blogPostId || blogPostId;
        title = run?.topic || run?.draftPreviewJson?.title || title;
        if (run && run.status !== "succeeded") {
          const failed = await patchDeciderThread(siteLink, thread.id, {
            status: "failed",
            appendMessage: {
              role: "card",
              content: run.errorMessage || "That draft didn’t finish.",
              card: { type: "run-failed", runId },
            },
          });
          return Response.json(payload(failed, { thread: failed.thread }));
        }
      }
      const already = (thread.messages || []).some((m) => m.card?.type === "run-done" && m.card?.blogPostId === blogPostId);
      if (already) {
        const store = await listDeciderThreads(siteLink);
        return Response.json(payload(store, { thread }));
      }
      const href = blogPostId ? `/?section=my-blog-approvals&blog=${encodeURIComponent(blogPostId)}` : "/?section=my-blog-approvals";
      const store = await patchDeciderThread(siteLink, thread.id, {
        status: "done",
        runId: runId || thread.runId,
        blogPostId: blogPostId || null,
        title: title || thread.title,
        appendMessage: {
          role: "card",
          content: title
            ? `“${title}” is in Blog Approvals. Open it there — or tell me what to change and I’ll send it back to the writer or image.`
            : "The draft is in Blog Approvals. Tell me if you want changes.",
          card: {
            type: "run-done",
            href,
            hrefLabel: "Open in Blog Approvals",
            blogPostId: blogPostId || null,
            runId,
            title,
          },
        },
      });
      return Response.json(payload(store, { thread: store.thread }));
    }

    if (action === "message") {
      const threadId = String(body.threadId || "").trim();
      const text = String(body.text || "").trim();
      if (!threadId || !text) {
        return Response.json({ error: "threadId and text are required." }, { status: 400 });
      }
      const existing = await getDeciderThread(siteLink, threadId);
      if (!existing) return Response.json({ error: "That chat was not found." }, { status: 404 });

      const withUser = await patchDeciderThread(siteLink, threadId, {
        appendMessage: { role: "user", content: text },
        proposal: null,
      });
      const history = llmHistoryFromThread(withUser.thread);
      const turn = await runDeciderChatTurn({
        siteLink,
        messages: history,
        greeting: false,
        threadStatus: withUser.thread.status,
        hasDraft: Boolean(withUser.thread.blogPostId),
      });

      const extras = [{ role: "assistant", content: turn.reply }];
      const patch = {
        appendMessages: extras,
        proposal: turn.ready ? turn : null,
        title:
          turn.ready && turn.topic
            ? turn.topic
            : withUser.thread.title === "New brief" && text.length > 3
              ? text.slice(0, 42)
              : withUser.thread.title,
      };

      if (turn.intent === "revise" && withUser.thread.blogPostId) {
        try {
          const run = await enqueueBlogRevisionFromDecline({
            blogPostId: withUser.thread.blogPostId,
            remarks: turn.remarks || text,
            target: turn.revisionTarget || "both",
            triggeredById: session.user?.id || null,
          });
          if (run?.id) {
            patch.runId = run.id;
            patch.status = "revising";
            extras.push({
              role: "card",
              content:
                turn.revisionTarget === "image"
                  ? "Sending that to the image agent."
                  : turn.revisionTarget === "text"
                    ? "Sending that back to the writer."
                    : "Sending that back through the writer and image.",
              card: { type: "revision-started", runId: run.id, target: turn.revisionTarget || "both" },
            });
            patch.appendMessages = extras;
            turn.revisionRunId = run.id;
          }
        } catch (err) {
          extras.push({
            role: "assistant",
            content: `I heard the change, but couldn’t start the revision: ${err.message}`,
          });
          patch.appendMessages = extras;
        }
      }

      const store = await patchDeciderThread(siteLink, threadId, patch);
      return Response.json(payload(store, { thread: store.thread, turn }));
    }

    return Response.json({ error: `Unknown action “${action}”.` }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error.message || `${CHAT_PERSONA} chat failed.`, code: error.code || null },
      { status: error.status || 500 }
    );
  }
}
