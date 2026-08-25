/**
 * Persisted Compass briefing threads per site (AppSetting JSON).
 * Page reloads must restore the conversation — never re-greet over it.
 */
import { createHash, randomUUID } from "crypto";
import prisma from "../prisma.js";

const MAX_THREADS = 24;
const MAX_MESSAGES = 80;

function settingKey(siteLink) {
  const raw = String(siteLink || "").trim();
  const base = `blog_studio_chats:${raw}`;
  if (base.length <= 191) return base;
  return `blog_studio_chats:${createHash("sha1").update(raw).digest("hex")}`;
}

function emptyStore() {
  return { activeId: null, threads: [] };
}

export function newThreadId() {
  return randomUUID();
}

function normalizeMessage(m) {
  if (!m || typeof m !== "object") return null;
  const role = m.role === "assistant" || m.role === "card" ? m.role : "user";
  const content = String(m.content || "").trim();
  if (!content && role !== "card") return null;
  return {
    id: String(m.id || randomUUID()),
    role,
    content,
    at: m.at || new Date().toISOString(),
    card: m.card && typeof m.card === "object" ? m.card : null,
  };
}

function normalizeThread(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  if (!id) return null;
  const messages = (Array.isArray(raw.messages) ? raw.messages : []).map(normalizeMessage).filter(Boolean).slice(-MAX_MESSAGES);
  return {
    id,
    title: String(raw.title || "").trim() || "New brief",
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
    status: String(raw.status || "briefing"),
    runId: raw.runId || null,
    blogPostId: raw.blogPostId || null,
    proposal: raw.proposal && typeof raw.proposal === "object" ? raw.proposal : null,
    messages,
  };
}

async function readStore(siteLink) {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: settingKey(siteLink) } });
    if (!row?.value) return emptyStore();
    const parsed = JSON.parse(row.value);
    const threads = (Array.isArray(parsed?.threads) ? parsed.threads : []).map(normalizeThread).filter(Boolean);
    const activeId = threads.some((t) => t.id === parsed.activeId) ? parsed.activeId : threads[0]?.id || null;
    return { activeId, threads };
  } catch {
    return emptyStore();
  }
}

async function writeStore(siteLink, store) {
  const threads = (store.threads || []).slice(0, MAX_THREADS);
  const activeId = threads.some((t) => t.id === store.activeId) ? store.activeId : threads[0]?.id || null;
  const value = JSON.stringify({ activeId, threads });
  await prisma.appSetting.upsert({
    where: { key: settingKey(siteLink) },
    create: { key: settingKey(siteLink), value },
    update: { value },
  });
  return { activeId, threads };
}

export async function listDeciderThreads(siteLink) {
  return readStore(siteLink);
}

export async function getDeciderThread(siteLink, threadId) {
  const store = await readStore(siteLink);
  return store.threads.find((t) => t.id === threadId) || null;
}

export async function createDeciderThread(siteLink, { title = "New brief", greeting = null } = {}) {
  const store = await readStore(siteLink);
  const now = new Date().toISOString();
  const thread = {
    id: newThreadId(),
    title: String(title || "New brief").trim() || "New brief",
    createdAt: now,
    updatedAt: now,
    status: "briefing",
    runId: null,
    blogPostId: null,
    proposal: null,
    messages: greeting
      ? [
          {
            id: newThreadId(),
            role: "assistant",
            content: String(greeting),
            at: now,
            card: null,
          },
        ]
      : [],
  };
  store.threads = [thread, ...store.threads].slice(0, MAX_THREADS);
  store.activeId = thread.id;
  await writeStore(siteLink, store);
  return { ...store, thread };
}

export async function selectDeciderThread(siteLink, threadId) {
  const store = await readStore(siteLink);
  const thread = store.threads.find((t) => t.id === threadId);
  if (!thread) {
    const err = new Error("That chat was not found.");
    err.status = 404;
    throw err;
  }
  store.activeId = thread.id;
  await writeStore(siteLink, store);
  return { ...store, thread };
}

export async function patchDeciderThread(siteLink, threadId, patch = {}) {
  const store = await readStore(siteLink);
  const idx = store.threads.findIndex((t) => t.id === threadId);
  if (idx < 0) {
    const err = new Error("That chat was not found.");
    err.status = 404;
    throw err;
  }
  const prev = store.threads[idx];
  const { appendMessage, appendMessages, messages: incomingMessages, ...rest } = patch;
  const next = {
    ...prev,
    ...rest,
    id: prev.id,
    createdAt: prev.createdAt,
    updatedAt: new Date().toISOString(),
    messages: Array.isArray(incomingMessages)
      ? incomingMessages.map(normalizeMessage).filter(Boolean)
      : prev.messages,
  };
  if (appendMessage) {
    const extra = normalizeMessage(appendMessage);
    if (extra) next.messages = [...next.messages, extra].slice(-MAX_MESSAGES);
  }
  if (Array.isArray(appendMessages)) {
    const extras = appendMessages.map(normalizeMessage).filter(Boolean);
    next.messages = [...next.messages, ...extras].slice(-MAX_MESSAGES);
  }
  store.threads[idx] = next;
  store.threads = [next, ...store.threads.filter((t) => t.id !== next.id)];
  store.activeId = next.id;
  await writeStore(siteLink, store);
  return { ...store, thread: next };
}

export function llmHistoryFromThread(thread) {
  return (thread?.messages || [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }))
    .slice(-20);
}
