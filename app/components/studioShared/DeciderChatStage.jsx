"use client";

import { useEffect, useMemo, useRef } from "react";
import { FiArrowUp, FiPlus, FiRefreshCw } from "react-icons/fi";
import { cn } from "@/lib/utils";
import { CHAT_PERSONA } from "@/lib/blogStudio/chatPersona";

const COUNTDOWN_SECONDS = 8;

function projectDisplayName(site) {
  const raw = String(site || "").trim();
  if (!raw) return "your project";
  try {
    if (raw.startsWith("sc-domain:")) return raw.slice("sc-domain:".length);
    if (/^https?:\/\//i.test(raw)) {
      return new URL(raw).hostname.replace(/^www\./i, "");
    }
    if (raw.includes(".") && !raw.includes(" ")) return raw.replace(/^www\./i, "");
  } catch {
    /* fall through */
  }
  return raw.length > 42 ? `${raw.slice(0, 40)}…` : raw;
}

function TypingDots() {
  return (
    <span className="studio-typing" aria-label={`${CHAT_PERSONA} is thinking`}>
      <span />
      <span />
      <span />
    </span>
  );
}

function CountdownRing({ seconds, total = COUNTDOWN_SECONDS }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, seconds / total));
  return (
    <svg className="h-10 w-10 -rotate-90" viewBox="0 0 40 40" aria-hidden>
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke="color-mix(in srgb, var(--cw-ink) 12%, transparent)"
        strokeWidth="3"
      />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke="var(--cw-neon)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        className="transition-[stroke-dashoffset] duration-1000 linear"
      />
    </svg>
  );
}

function openApprovals(href) {
  if (!href) return;
  try {
    const url = new URL(href, window.location.origin);
    const blogId = url.searchParams.get("blog");
    if (blogId) sessionStorage.setItem("cw:openBlogId", blogId);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(
    new CustomEvent("navigate-section", { detail: { section: "my-blog-approvals" } })
  );
}

export default function DeciderChatStage({
  projectName = "",
  messages = [],
  input = "",
  onInputChange,
  onSend,
  busy = false,
  error = "",
  proposal = null,
  countdown = null,
  onStartNow,
  onHold,
  liveRunning = false,
  disabled = false,
  threads = [],
  activeThreadId = "",
  onSelectThread,
  onNewThread,
}) {
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const displayName = useMemo(() => projectDisplayName(projectName), [projectName]);
  const showHero = messages.filter((m) => m.role === "user").length === 0 && !proposal && !liveRunning;

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, busy, proposal, countdown]);

  useEffect(() => {
    if (!liveRunning && inputRef.current) {
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [projectName, liveRunning, busy, activeThreadId]);

  const send = () => {
    const text = String(input || "").trim();
    if (!text || busy || disabled || liveRunning) return;
    onSend?.(text);
  };

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-1 flex-col px-1">
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto pb-2 pt-1 scrollbar-none">
        <button type="button" className="studio-thread-new" onClick={onNewThread} disabled={busy}>
          <FiPlus className="h-3.5 w-3.5" />
          New chat
        </button>
        {threads.map((t) => {
          const active = t.id === activeThreadId;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectThread?.(t.id)}
              className={cn("studio-thread-pill", active && "is-active")}
              title={t.title}
            >
              {t.title || "New brief"}
            </button>
          );
        })}
      </div>

      {showHero ? (
        <div className="shrink-0 px-2 pb-3 pt-3 text-center sm:pt-6">
          <h2 className="font-heading mx-auto max-w-xl text-[1.55rem] font-semibold leading-[1.15] tracking-[-0.03em] text-[var(--cw-ink)] sm:text-[1.9rem]">
            What should we write for{" "}
            <span className="bg-gradient-to-r from-[var(--cw-neon-soft)] via-[var(--cw-info)] to-[var(--cw-neon)] bg-clip-text text-transparent">
              {displayName}
            </span>
          </h2>
        </div>
      ) : null}

      <div
        ref={listRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-1 py-2"
      >
        {messages.map((m) => (
          <div
            key={m.id || `${m.role}-${m.at}`}
            className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
          >
            {m.role === "card" ? (
              <div className="studio-chat-card w-full max-w-[min(100%,36rem)] px-4 py-3">
                <p className="mb-1.5 text-[12px] font-medium text-[var(--cw-neon)]">{CHAT_PERSONA}</p>
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--cw-ink)]">{m.content}</p>
                {m.card?.href ? (
                  <button
                    type="button"
                    className="studio-proposal-go mt-3"
                    onClick={() => openApprovals(m.card.href)}
                  >
                    {m.card.hrefLabel || "Open in Blog Approvals"}
                  </button>
                ) : null}
              </div>
            ) : (
              <div
                className={cn(
                  "max-w-[min(100%,36rem)] px-4 py-3 text-[14px] leading-relaxed",
                  m.role === "user" ? "studio-chat-user" : "studio-chat-assistant"
                )}
              >
                {m.role === "assistant" ? (
                  <p className="mb-1 text-[12px] font-medium text-[var(--cw-neon)]">{CHAT_PERSONA}</p>
                ) : null}
                <p className="whitespace-pre-wrap text-[var(--cw-ink)]">{m.content}</p>
              </div>
            )}
          </div>
        ))}

        {busy && !showHero ? (
          <div className="flex justify-start">
            <div className="studio-chat-assistant flex items-center gap-3 px-4 py-3">
              <TypingDots />
              <span className="text-[12px] text-[var(--cw-ink-muted)]">{CHAT_PERSONA} is thinking…</span>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-2xl border border-[color-mix(in_srgb,var(--cw-danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--cw-danger)_10%,transparent)] px-4 py-3 text-[13px] text-[var(--cw-danger)]">
            {error}
          </p>
        ) : null}

        {proposal?.topic && countdown != null ? (
          <div className="studio-proposal animate-soft-rise">
            <div className="flex items-start gap-4">
              <div className="relative shrink-0">
                <CountdownRing seconds={countdown} />
                <span className="absolute inset-0 flex items-center justify-center font-mono text-[11px] tabular-nums text-[var(--cw-ink)]">
                  {countdown}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-[var(--cw-neon)]">Ready when you are</p>
                <p className="font-heading mt-1 text-[1.05rem] font-semibold leading-snug tracking-tight text-[var(--cw-ink)]">
                  {proposal.topic}
                </p>
                {proposal.angle ? (
                  <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--cw-ink-muted)]">{proposal.angle}</p>
                ) : null}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="studio-proposal-go" onClick={onStartNow}>
                Start writing
              </button>
              <button type="button" className="studio-proposal-hold" onClick={onHold}>
                Keep talking
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <form
        className="studio-prompt-shell group w-full shrink-0 pb-1 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        data-guide="studio-generate"
      >
        <div
          className={cn(
            "relative overflow-hidden rounded-[1.75rem]",
            "border border-[color-mix(in_srgb,var(--cw-ink)_10%,transparent)]",
            "bg-[color-mix(in_srgb,var(--cw-surface)_78%,transparent)]",
            "shadow-[0_0_0_1px_color-mix(in_srgb,var(--cw-neon)_12%,transparent),0_24px_80px_-28px_rgb(0_0_0_/_0.65)]",
            "backdrop-blur-xl transition-[border-color,box-shadow] duration-500",
            "ease-[cubic-bezier(0.32,0.72,0,1)]",
            "focus-within:border-[color-mix(in_srgb,var(--cw-neon)_45%,transparent)]",
            "focus-within:shadow-[0_0_0_1px_color-mix(in_srgb,var(--cw-neon)_35%,transparent),0_28px_90px_-24px_rgb(0_163_255_/_0.35)]"
          )}
        >
          <textarea
            ref={inputRef}
            rows={2}
            value={input}
            onChange={(e) => onInputChange?.(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={
              liveRunning
                ? `${CHAT_PERSONA} is writing — you’ll get the Approvals link here.`
                : `Talk to ${CHAT_PERSONA} about ${displayName}…`
            }
            disabled={disabled || liveRunning}
            className={cn(
              "w-full resize-none bg-transparent px-5 pb-14 pt-4",
              "text-[15px] leading-relaxed text-[var(--cw-ink)]",
              "placeholder:text-[var(--cw-ink-faint)]",
              "outline-none focus:outline-none disabled:opacity-60"
            )}
            aria-label={`Message ${CHAT_PERSONA}`}
          />
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 px-3 pb-3">
            <p className="px-2 text-[11px] text-[var(--cw-ink-faint)]">
              Enter to send · Shift+Enter for a new line
            </p>
            <button
              type="submit"
              disabled={busy || disabled || liveRunning || !String(input || "").trim()}
              title={`Send to ${CHAT_PERSONA}`}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full",
                "bg-[var(--cw-ink)] text-[var(--cw-canvas)]",
                "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
                "hover:scale-[1.04] active:scale-[0.96]",
                "disabled:cursor-not-allowed disabled:opacity-40"
              )}
              aria-label="Send"
            >
              {busy ? <FiRefreshCw className="h-4 w-4 animate-spin" /> : <FiArrowUp className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export { COUNTDOWN_SECONDS };
