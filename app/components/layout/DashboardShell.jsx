"use client";

import AppSidebar from "./AppSidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
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

  return (
    <SidebarProvider defaultOpen>
      <AppSidebar
        activeSection={activeSection}
        onSectionChange={onSectionChange}
        selectedSite={selectedSite}
        onSelectedSiteChange={onSelectedSiteChange}
      />
      <SidebarInset className="mesh-bg flex min-h-svh flex-col">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border/60 surface-glass px-4">
          <SidebarTrigger className="-ml-1 transition-smooth hover:bg-emerald-50" />
          <Separator orientation="vertical" className="hidden h-5 sm:block" />
          <div className="min-w-0 flex-1" key={activeSection}>
            <FadeIn delay={0}>
              <p className="truncate text-sm font-semibold text-foreground">{sectionLabel}</p>
            </FadeIn>
            {selectedSite ? (
              <FadeIn delay={40}>
                <p className="truncate text-xs text-muted-foreground">
                  {String(selectedSite).startsWith("http")
                    ? selectedSite.replace(/^https?:\/\//, "").split("/")[0]
                    : "Client account selected"}
                </p>
              </FadeIn>
            ) : null}
          </div>
          <Badge
            variant="outline"
            className="hidden capitalize transition-smooth sm:inline-flex hover:border-emerald-300 hover:bg-emerald-50/80"
          >
            {activeSection.replace(/-/g, " ")}
          </Badge>
        </header>

        <main
          id="main-content"
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            isBoard ? "p-2 sm:p-2.5 lg:p-3" : "p-3 pt-4 sm:p-4 lg:p-5",
            isDashboard ? "bg-muted/20" : "bg-transparent"
          )}
        >
          {isDashboard ? (
            <div className="mx-auto max-w-6xl rounded-2xl border border-border/70 bg-card/95 p-4 shadow-sm backdrop-blur-sm transition-smooth sm:p-6 hover:shadow-md">
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
