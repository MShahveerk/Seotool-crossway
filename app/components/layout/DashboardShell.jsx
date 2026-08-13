"use client";

import AppSidebar from "./AppSidebar";
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
}) {
  const sectionLabel = getSectionLabel(activeSection);
  const isDashboard = activeSection === "dashboard";
  const isBoard = activeSection === "post-board" || activeSection === "blog-board";

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
              <p className="font-heading truncate text-sm font-semibold text-[var(--cw-ink)]">
                {sectionLabel}
              </p>
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

        <main
          id="main-content"
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            isBoard ? "p-2 sm:p-2.5 lg:p-3" : "p-3 pt-4 sm:p-4 lg:p-6"
          )}
        >
          {isDashboard ? (
            <div className="cw-lit mx-auto w-full max-w-6xl rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-4 sm:p-6">
              {children}
            </div>
          ) : isBoard ? (
            <div className="flex min-h-0 w-full flex-1 flex-col">{children}</div>
          ) : (
            <div className="mx-auto w-full max-w-[1400px]">{children}</div>
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
