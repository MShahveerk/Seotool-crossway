"use client";

import AppSidebar from "./AppSidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { getSectionLabel } from "@/lib/sectionMeta";
import { cn } from "@/lib/utils";

export default function DashboardLayout({
  children,
  activeSection = "dashboard",
  onSectionChange,
  selectedSite = "",
  onSelectedSiteChange,
}) {
  const sectionLabel = getSectionLabel(activeSection);
  const isDashboard = activeSection === "dashboard";

  return (
    <SidebarProvider defaultOpen>
      <AppSidebar
        activeSection={activeSection}
        onSectionChange={onSectionChange}
        selectedSite={selectedSite}
        onSelectedSiteChange={onSelectedSiteChange}
      />
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border/80 bg-background/90 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="hidden h-5 sm:block" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{sectionLabel}</p>
            {selectedSite ? (
              <p className="truncate text-xs text-muted-foreground">
                {String(selectedSite).startsWith("http")
                  ? selectedSite.replace(/^https?:\/\//, "").split("/")[0]
                  : "Client account selected"}
              </p>
            ) : null}
          </div>
          <Badge variant="outline" className="hidden sm:inline-flex capitalize">
            {activeSection.replace(/-/g, " ")}
          </Badge>
        </header>

        <main
          id="main-content"
          className={cn(
            "flex-1 p-3 pt-4 sm:p-4 lg:p-5",
            isDashboard ? "bg-muted/30" : "bg-muted/20"
          )}
        >
          {isDashboard ? (
            <div className="mx-auto max-w-6xl rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-6">
              {children}
            </div>
          ) : (
            <div className="mx-auto max-w-[1400px]">{children}</div>
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
