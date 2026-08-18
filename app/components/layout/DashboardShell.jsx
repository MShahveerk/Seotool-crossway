"use client";

import AppSidebar from "./AppSidebar";
import WorkspaceTabs from "./WorkspaceTabs";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { getSectionLabel } from "@/lib/sectionMeta";
import { cn } from "@/lib/utils";
import { FadeIn } from "../ui-shared/Motion";

export default function DashboardLayout({
  children,
  activeSection = "dashboard",
  onSectionChange,
  selectedSite = "",
  onSelectedSiteChange,
  onEnterClient,
  onGoToPortfolio,
  canSwitchClients = false,
}) {
  const sectionLabel = getSectionLabel(activeSection);
  const isDashboard = activeSection === "dashboard";
  const isPortfolio = activeSection === "portfolio";
  const isBoard = activeSection === "post-board" || activeSection === "blog-board";
  const showPortfolioCrumb = canSwitchClients && !isPortfolio && Boolean(selectedSite);

  const siteLabel = selectedSite
    ? String(selectedSite).startsWith("http")
      ? selectedSite.replace(/^https?:\/\//, "").split("/")[0]
      : "Client account"
    : null;

  return (
    <SidebarProvider defaultOpen>
      <AppSidebar
        activeSection={activeSection}
        onSectionChange={onSectionChange}
        selectedSite={selectedSite}
        onSelectedSiteChange={onSelectedSiteChange}
        onEnterClient={onEnterClient}
        onGoToPortfolio={onGoToPortfolio}
      />
      <SidebarInset className="mesh-bg cw-grid flex min-h-svh flex-col bg-[var(--cw-canvas)]">
        {/* Header: glass over the canvas, one hairline, nothing else. */}
        <header className="surface-glass sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-x-0 border-t-0 px-4">
          <SidebarTrigger className="-ml-1 text-[var(--cw-ink-muted)] transition-smooth hover:bg-[var(--cw-raised)] hover:text-[var(--cw-neon)]" />
          <Separator
            orientation="vertical"
            className="hidden h-5 bg-[var(--cw-hairline)] sm:block"
          />
          <div className="min-w-0 flex-1" key={activeSection}>
            <FadeIn delay={0}>
              <div className="flex min-w-0 items-center gap-1.5">
                {showPortfolioCrumb ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onGoToPortfolio?.()}
                      className="transition-smooth shrink-0 text-sm font-medium text-[var(--cw-ink-faint)] hover:text-[var(--cw-neon)]"
                    >
                      All clients
                    </button>
                    <span className="shrink-0 text-[var(--cw-ink-faint)]">/</span>
                  </>
                ) : null}
                <p className="font-heading truncate text-sm font-semibold text-[var(--cw-ink)]">
                  {sectionLabel}
                </p>
              </div>
            </FadeIn>
            {siteLabel ? (
              <FadeIn delay={40}>
                <p className="truncate font-mono text-[11px] text-[var(--cw-ink-faint)]">
                  {siteLabel}
                </p>
              </FadeIn>
            ) : null}
          </div>
        </header>

        {/* Boards need the full width; every other page gets real margins so
            content sits in a column rather than running edge to edge. */}
        <main
          id="main-content"
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            isBoard
              ? "p-2 sm:p-2.5 lg:p-3"
              : "px-4 py-5 sm:px-8 sm:py-7 lg:px-12 xl:px-16 2xl:px-20"
          )}
        >
          {isDashboard || isPortfolio ? (
            <div className="mx-auto w-full max-w-[1360px]">{children}</div>
          ) : isBoard ? (
            <div className="flex min-h-0 w-full flex-1 flex-col">
              <WorkspaceTabs
                activeSection={activeSection}
                onSectionChange={onSectionChange}
                selectedSite={selectedSite}
              />
              {children}
            </div>
          ) : (
            <div className="mx-auto w-full max-w-[1360px]">
              <WorkspaceTabs
                activeSection={activeSection}
                onSectionChange={onSectionChange}
                selectedSite={selectedSite}
              />
              {children}
            </div>
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
