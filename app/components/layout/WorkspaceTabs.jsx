"use client";

/**
 * WorkspaceTabs — the tools inside the current workspace, as a tab rail.
 *
 * This is the other half of the workspace navigation: the sidebar picks the
 * workspace, this picks the tool. It renders nothing for single-tool
 * workspaces (Dashboard, Reports, Admin) so those pages stay clean.
 */

import { useSession } from "next-auth/react";
import { sessionCanAccessSection, sessionHasGlobalSiteAccess } from "@/lib/clientPermissions";
import { isMetaPageId } from "@/lib/siteAccess";
import { visibleSections, workspaceForSection } from "@/lib/workspaces";
import TabRail from "../ui-shared/TabRail";

export default function WorkspaceTabs({ activeSection, onSectionChange, selectedSite }) {
  const { data: session } = useSession();

  const hasGlobalSiteAccess = sessionHasGlobalSiteAccess(session);
  const userSiteLink = session?.user?.siteLink || "";
  const effectiveSite = hasGlobalSiteAccess ? selectedSite : userSiteLink || selectedSite;

  const isWebsiteSelected = Boolean(
    effectiveSite &&
      (String(effectiveSite).startsWith("http") ||
        String(effectiveSite).startsWith("sc-domain:") ||
        (!isMetaPageId(effectiveSite) && String(effectiveSite).includes(".")))
  );

  const workspace = workspaceForSection(activeSection);
  const sections = visibleSections(workspace, {
    canAccess: (id) => sessionCanAccessSection(session, id),
    isWebsiteSelected,
    isProjectSelected: Boolean(effectiveSite),
  });

  if (!workspace || sections.length < 2) return null;

  // Legacy/alias ids (e.g. `pagespeed-insights`) resolve to the tab that owns
  // them, so a deep link still lights up the right pill.
  const value = sections.some((s) => s.id === activeSection)
    ? activeSection
    : sections[0]?.id;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <TabRail
        tabs={sections.map((s) => ({ id: s.id, label: s.label }))}
        value={value}
        onChange={onSectionChange}
        ariaLabel={`${workspace.label} tools`}
        className="min-w-0"
      />
      <span className="hidden text-[10px] font-bold tracking-[0.16em] text-[var(--cw-ink-faint)] uppercase lg:inline">
        {workspace.label}
      </span>
    </div>
  );
}
