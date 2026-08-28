"use client";

/**
 * StudioComposerShell — Gemini-style minimal studio chrome.
 *
 * Idle: aurora canvas + one central prompt.
 * Active: the same stage becomes a live build surface.
 * Everything else opens from a bottom tab dock as a sheet.
 */

import { useEffect, useMemo, useRef } from "react";
import {
  FiArrowUp,
  FiImage,
  FiX,
  FiZap,
  FiSave,
  FiPlay,
  FiPause,
  FiRefreshCw,
  FiXCircle,
} from "react-icons/fi";
import { cn } from "@/lib/utils";
import Btn from "../ui-shared/Btn";
import LiveRunDock from "./LiveRunDock";
import DeciderChatStage from "./DeciderChatStage";
import { isLiveStatus } from "./runFormat";
import { studioGreetingHeadline, studioGreetingName } from "@/lib/studioProjectLabel";

export function projectDisplayName(site, resolvedName = "") {
  return studioGreetingName(site, resolvedName) || "this project";
}

export default function StudioComposerShell({
  kind = "blog",
  projectName = "",
  topic = "",
  onTopicChange,
  onSubmit,
  submitting = false,
  submitDisabled = false,
  placeholder,
  liveRun = null,
  liveLabel = "Draft",
  livePanel = null,
  onCancelLive,
  onOpenLive,
  openLiveLabel = "Open in Library",
  cancelling = false,
  bottomTabs = [],
  activeBottomTab = null,
  onBottomTabChange,
  sheetContent = null,
  engineSwitch = null,
  autoEnabled = false,
  onToggleAuto,
  onSave,
  saving = false,
  onCancelAllLive,
  hasLiveAutomation = false,
  banners = null,
  externalMode = null,
  emptySiteHint = null,
  className = "",
  chatEnabled = false,
  chatMessages = [],
  chatInput = "",
  onChatInputChange,
  onChatSend,
  chatBusy = false,
  chatError = "",
  chatProposal = null,
  chatCountdown = null,
  onChatStartNow,
  onChatHold,
  chatThreads = [],
  chatThreadId = "",
  onChatSelectThread,
  onChatNewThread,
  projectLabel = "",
  operatorImageFile = null,
  onOperatorImageChange,
}) {
  const textareaRef = useRef(null);
  const imageInputRef = useRef(null);
  const displayName = useMemo(
    () => studioGreetingName(projectName, projectLabel),
    [projectName, projectLabel]
  );
  const live = liveRun && isLiveStatus(liveRun.status) ? liveRun : null;
  const keepComposer = kind === "blog";
  const showComposer = (!live || keepComposer) && !activeBottomTab;
  const promptLabel =
    placeholder || studioGreetingHeadline(kind, displayName);

  useEffect(() => {
    if (showComposer && textareaRef.current) {
      const id = requestAnimationFrame(() => textareaRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [showComposer, projectName]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!submitting && !submitDisabled && onSubmit) onSubmit();
    }
  };

  return (
    <div
      className={cn(
        "studio-composer relative flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-[1.75rem]",
        "border border-[color-mix(in_srgb,var(--cw-hairline)_80%,transparent)]",
        "bg-[var(--cw-canvas)] shadow-[var(--cw-shadow-lg)]",
        className
      )}
    >
      {/* Aurora field */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="studio-aurora studio-aurora-a" />
        <div className="studio-aurora studio-aurora-b" />
        <div className="studio-aurora studio-aurora-c" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,color-mix(in_srgb,var(--cw-canvas)_72%,transparent)_70%,var(--cw-canvas)_100%)]" />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />
      </div>

      {/* Top chrome — minimal */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-4 pb-2 pt-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--cw-neon)_14%,transparent)] text-[var(--cw-neon)]">
            <FiZap className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="font-heading text-[13px] font-semibold tracking-tight text-[var(--cw-ink)]">
              {kind === "post" ? "Post Studio" : "Blog Studio"}
            </p>
            <p className="truncate font-mono text-[10px] text-[var(--cw-ink-faint)]">
              {projectName || "No project selected"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {engineSwitch}
          {hasLiveAutomation && onCancelAllLive ? (
            <Btn
              variant="danger"
              size="sm"
              icon={cancelling ? FiRefreshCw : FiXCircle}
              onClick={onCancelAllLive}
              disabled={cancelling}
            >
              {cancelling ? "Cancelling…" : "Cancel"}
            </Btn>
          ) : null}
          {onToggleAuto ? (
            <Btn
              variant={autoEnabled ? "outline" : "secondary"}
              size="sm"
              icon={autoEnabled ? FiPlay : FiPause}
              onClick={onToggleAuto}
            >
              Auto {autoEnabled ? "on" : "off"}
            </Btn>
          ) : null}
          {onSave ? (
            <Btn variant="primary" size="sm" icon={FiSave} onClick={onSave} loading={saving}>
              Save
            </Btn>
          ) : null}
        </div>
      </div>

      {banners ? <div className="relative z-10 space-y-2 px-4 sm:px-6">{banners}</div> : null}
      {externalMode}

      {/* Stage */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-3 pb-[5.5rem] pt-2 sm:px-5">
        {emptySiteHint}

        {live && keepComposer && showComposer ? (
          <div className="mx-auto mb-2 w-full max-w-3xl shrink-0" data-guide="studio-rail">
            <LiveRunDock
              key={live.id}
              run={live}
              label={liveLabel}
              onCancel={onCancelLive}
              onOpen={onOpenLive}
              openLabel={openLiveLabel}
              cancelling={cancelling}
              defaultExpanded={false}
              className="!sticky !top-0 !mx-0 !mb-0"
            >
              {livePanel}
            </LiveRunDock>
          </div>
        ) : null}

        {live && !keepComposer ? (
          <div
            className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center animate-soft-rise"
            data-guide="studio-rail"
          >
            <p className="mb-3 text-center text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--cw-ink-faint)]">
              Building now
            </p>
            <LiveRunDock
              run={live}
              label={liveLabel}
              onCancel={onCancelLive}
              onOpen={onOpenLive}
              openLabel={openLiveLabel}
              cancelling={cancelling}
              defaultExpanded
              className="!sticky !top-0 !mx-0 !mb-0"
            >
              {livePanel}
            </LiveRunDock>
          </div>
        ) : null}

        {showComposer && chatEnabled ? (
          <DeciderChatStage
            projectName={projectName}
            projectLabel={projectLabel}
            messages={chatMessages}
            input={chatInput}
            onInputChange={onChatInputChange}
            onSend={onChatSend}
            busy={chatBusy || submitting}
            error={chatError}
            proposal={chatProposal}
            countdown={chatCountdown}
            onStartNow={onChatStartNow}
            onHold={onChatHold}
            liveRunning={Boolean(live)}
            disabled={submitDisabled}
            threads={chatThreads}
            activeThreadId={chatThreadId}
            onSelectThread={onChatSelectThread}
            onNewThread={onChatNewThread}
            operatorImageFile={operatorImageFile}
            onOperatorImageChange={onOperatorImageChange}
          />
        ) : null}

        {showComposer && !chatEnabled ? (
          <div className="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-1 flex-col items-center justify-center px-1 py-8 sm:py-12">
            <h2 className="font-heading mb-8 max-w-xl text-center text-[1.65rem] font-semibold leading-[1.2] tracking-[-0.03em] text-balance text-[var(--cw-ink)] sm:text-[2rem]">
              {displayName ? (
                <>
                  What should we {kind === "post" ? "post" : "write"} for{" "}
                  <span className="bg-gradient-to-r from-[var(--cw-neon-soft)] via-[var(--cw-info)] to-[var(--cw-neon)] bg-clip-text text-transparent">
                    {displayName}
                  </span>{" "}
                  today?
                </>
              ) : (
                <>What should we {kind === "post" ? "post" : "write"} today?</>
              )}
            </h2>

            <form
              className="studio-prompt-shell group w-full"
              onSubmit={(e) => {
                e.preventDefault();
                if (!submitting && !submitDisabled && onSubmit) onSubmit();
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
                  ref={textareaRef}
                  rows={3}
                  value={topic}
                  onChange={(e) => onTopicChange?.(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={promptLabel}
                  className={cn(
                    "w-full resize-none bg-transparent px-5 pb-14 pt-5",
                    "text-[15px] leading-relaxed text-[var(--cw-ink)]",
                    "placeholder:text-[var(--cw-ink-faint)]",
                    "outline-none focus:outline-none"
                  )}
                  aria-label={promptLabel}
                />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 px-3 pb-3">
                  <div className="flex min-w-0 items-center gap-2 px-1">
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => {
                        onOperatorImageChange?.(e.target.files?.[0] || null);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      title="Use your image instead of generating one"
                      className={cn(
                        "inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium",
                        operatorImageFile
                          ? "bg-[color-mix(in_srgb,var(--cw-neon)_16%,transparent)] text-[var(--cw-neon)]"
                          : "text-[var(--cw-ink-faint)] hover:bg-[var(--cw-overlay)] hover:text-[var(--cw-ink-dim)]"
                      )}
                    >
                      <FiImage className="h-3.5 w-3.5" />
                      {operatorImageFile ? "Replace image" : "Use my image"}
                    </button>
                    {operatorImageFile ? (
                      <button
                        type="button"
                        onClick={() => onOperatorImageChange?.(null)}
                        className="truncate text-[11px] text-[var(--cw-ink-muted)] hover:text-[var(--cw-ink)]"
                        title="Remove your image"
                      >
                        {operatorImageFile.name}
                        <FiX className="ml-1 inline h-3 w-3" />
                      </button>
                    ) : (
                      <p className="hidden truncate text-[11px] text-[var(--cw-ink-faint)] sm:block">
                        Optional — skip the image agent
                      </p>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={submitting || submitDisabled}
                    title={
                      submitDisabled
                        ? "Select a project in the sidebar first."
                        : kind === "post"
                          ? "Generate post"
                          : "Generate draft"
                    }
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full",
                      "bg-[var(--cw-ink)] text-[var(--cw-canvas)]",
                      "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
                      "hover:scale-[1.04] active:scale-[0.96]",
                      "disabled:cursor-not-allowed disabled:opacity-40"
                    )}
                    aria-label={kind === "post" ? "Generate post" : "Generate draft"}
                  >
                    {submitting ? (
                      <FiRefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <FiArrowUp className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </form>

            <p className="mt-5 max-w-md text-center text-[12px] leading-relaxed text-[var(--cw-ink-faint)]">
              Leave it blank to let the studio choose from your seeds and keyword library.
              Open the tabs below for inbox, queues, research, library, and setup.
            </p>
          </div>
        ) : null}

        {/* Bottom sheet for secondary work */}
        {activeBottomTab && sheetContent ? (
          <div
            className={cn(
              "studio-sheet absolute inset-x-0 bottom-[4.25rem] top-2 z-20 mx-2 flex min-h-0 flex-col overflow-hidden",
              "rounded-2xl border border-[var(--cw-hairline)]",
              "bg-[color-mix(in_srgb,var(--cw-surface)_94%,transparent)] shadow-[var(--cw-shadow-lg)] backdrop-blur-xl",
              "animate-soft-rise sm:mx-4"
            )}
            role="dialog"
            aria-label={
              bottomTabs.find((t) => t.id === activeBottomTab)?.label || "Studio panel"
            }
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--cw-hairline)] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--cw-ink)]">
                  {bottomTabs.find((t) => t.id === activeBottomTab)?.label || "Panel"}
                </p>
                <p className="truncate text-[11px] text-[var(--cw-ink-faint)]">
                  {kind === "post" ? "Post Studio" : "Blog Studio"} · {displayName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onBottomTabChange?.(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--cw-ink-muted)] transition-colors hover:bg-[var(--cw-hover)] hover:text-[var(--cw-ink)]"
                aria-label="Close panel"
              >
                <FiX className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              {sheetContent}
            </div>
          </div>
        ) : null}
      </div>

      {/* Bottom tab dock */}
      {!externalMode && (
        <nav
          className={cn(
            "absolute inset-x-3 bottom-3 z-30 sm:inset-x-5",
            "rounded-2xl border border-[color-mix(in_srgb,var(--cw-ink)_10%,transparent)]",
            "bg-[color-mix(in_srgb,var(--cw-surface)_88%,transparent)] p-1.5 shadow-[var(--cw-shadow)] backdrop-blur-xl"
          )}
          aria-label="Studio controls"
        >
          <div className="flex gap-0.5 overflow-x-auto scrollbar-none">
            {bottomTabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeBottomTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() =>
                    onBottomTabChange?.(active ? null : tab.id)
                  }
                  className={cn(
                    "relative flex min-w-[4.5rem] flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2",
                    "text-[10px] font-medium tracking-wide transition-colors duration-300",
                    "ease-[cubic-bezier(0.32,0.72,0,1)]",
                    active
                      ? "bg-[color-mix(in_srgb,var(--cw-neon)_16%,transparent)] text-[var(--cw-neon)]"
                      : "text-[var(--cw-ink-muted)] hover:bg-[var(--cw-hover)] hover:text-[var(--cw-ink)]"
                  )}
                  aria-pressed={active}
                >
                  <span className="relative">
                    {Icon ? <Icon className="h-4 w-4" /> : null}
                    {tab.live ? (
                      <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-[var(--cw-neon)] shadow-[0_0_8px_var(--cw-neon)]" />
                    ) : null}
                    {tab.badge ? (
                      <span className="absolute -right-2.5 -top-1.5 min-w-[14px] rounded-full bg-[var(--cw-overlay)] px-1 text-[9px] tabular-nums text-[var(--cw-ink-dim)]">
                        {tab.badge > 99 ? "99+" : tab.badge}
                      </span>
                    ) : null}
                  </span>
                  <span className="max-w-[4.8rem] truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
