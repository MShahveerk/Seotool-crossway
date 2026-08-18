"use client";

import { useEffect, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Compass,
  FileText,
  Globe,
  HelpCircle,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Megaphone,
  PenTool,
  Presentation,
  Search,
  Send,
  Settings,
  Shield,
  Workflow,
} from "lucide-react";
import { isMetaPageId } from "@/lib/siteAccess";
import { sessionCanAccessSection, sessionHasGlobalSiteAccess } from "@/lib/clientPermissions";
import { visibleWorkspaces, workspaceForSection } from "@/lib/workspaces";
import {
  entryMatchesSelectValue,
  getClientAccountSelectValue,
  mergeClientAccountEntries,
} from "@/lib/clientAccountList";
import ClientAccountLogo from "@/app/components/ui-shared/ClientAccountLogo";
import CrosswayLogo from "@/app/components/ui-shared/CrosswayLogo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Workspace icons live here so `lib/workspaces.js` stays free of UI imports. */
const WORKSPACE_ICONS = {
  dashboard: LayoutDashboard,
  globe: Globe,
  search: Search,
  fileText: FileText,
  megaphone: Megaphone,
  presentation: Presentation,
  shield: Shield,
  workflow: Workflow,
  /* The two studios get their own glyphs — a writing machine and a broadcast
     machine — so they're never mistaken for the domains they feed. */
  blogStudio: PenTool,
  postStudio: Send,
};

/** Unread badges are per-section; a workspace shows the sum of its sections'. */
const BADGE_SECTIONS = {
  "my-approvals": "user",
  "admin-approvals": "admin",
};

function getSiteHostName(siteUrl) {
  if (!siteUrl) return "No Site Linked";
  try {
    return new URL(siteUrl).hostname.replace(/^www\./, "");
  } catch {
    return siteUrl.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || "No Site Linked";
  }
}

export default function AppSidebar({
  activeSection,
  onSectionChange,
  selectedSite,
  onSelectedSiteChange,
  onEnterClient,
  onGoToPortfolio,
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const [availableSites, setAvailableSites] = useState([]);
  const [clientQuery, setClientQuery] = useState("");
  const [metaAccounts, setMetaAccounts] = useState([]);
  const [approvalAdminUnread, setApprovalAdminUnread] = useState(0);
  const [approvalUserUnread, setApprovalUserUnread] = useState(0);

  const canSeeAdminApprovals = sessionCanAccessSection(session, "admin-approvals");
  const hasGlobalSiteAccess = sessionHasGlobalSiteAccess(session);
  const userSiteLink = session?.user?.siteLink || "";

  useEffect(() => {
    if (!hasGlobalSiteAccess) return;
    fetch("/api/admin/meta-accounts")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.warn("Meta accounts request failed:", data.error || res.status);
        } else if (data.error || data.warning) {
          console.warn("Meta accounts:", data.error || data.warning);
        }
        setMetaAccounts(Array.isArray(data.accounts) ? data.accounts : []);
      })
      .catch((err) => {
        console.warn("Meta accounts fetch error:", err?.message || err);
        setMetaAccounts([]);
      });
  }, [hasGlobalSiteAccess]);

  useEffect(() => {
    if (!hasGlobalSiteAccess) return;
    fetch("/api/admin/site-integrations")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.warn("Site integrations request failed:", data.error || res.status);
          setAvailableSites([]);
          return;
        }
        setAvailableSites(mergeClientAccountEntries(data.sites || []));
      })
      .catch((err) => {
        console.warn("Site integrations fetch error:", err?.message || err);
        setAvailableSites([]);
      });
  }, [hasGlobalSiteAccess]);

  useEffect(() => {
    if (!canSeeAdminApprovals) return undefined;
    const loadUnread = async () => {
      try {
        const res = await fetch("/api/admin/approvals?countOnly=1");
        const data = await res.json();
        if (res.ok) setApprovalAdminUnread(Number(data.count) || 0);
      } catch {
        setApprovalAdminUnread(0);
      }
    };
    loadUnread();
    const interval = setInterval(loadUnread, 45000);
    const onRefresh = () => loadUnread();
    window.addEventListener("approvals:admin-refresh", onRefresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener("approvals:admin-refresh", onRefresh);
    };
  }, [canSeeAdminApprovals]);

  useEffect(() => {
    if (canSeeAdminApprovals) return undefined;
    const loadUserUnread = async () => {
      try {
        const res = await fetch("/api/approvals?countOnly=1");
        const data = await res.json();
        if (res.ok) setApprovalUserUnread(Number(data.count) || 0);
      } catch {
        setApprovalUserUnread(0);
      }
    };
    loadUserUnread();
    const interval = setInterval(loadUserUnread, 45000);
    const onRefresh = () => loadUserUnread();
    window.addEventListener("approvals:user-updated", onRefresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener("approvals:user-updated", onRefresh);
    };
  }, [canSeeAdminApprovals]);

  const selectedSiteEntry = availableSites.find((s) => entryMatchesSelectValue(s, selectedSite));
  const effectiveSiteForSeo = hasGlobalSiteAccess ? selectedSite : userSiteLink || selectedSite;
  const isWebsiteSelected = Boolean(
    effectiveSiteForSeo &&
      (String(effectiveSiteForSeo).startsWith("http") ||
        String(effectiveSiteForSeo).startsWith("sc-domain:") ||
        selectedSiteEntry?.type === "website" ||
        (!isMetaPageId(effectiveSiteForSeo) &&
          (selectedSiteEntry?.siteLink?.startsWith("http") || String(effectiveSiteForSeo).includes("."))))
  );

  const getPageDisplayName = (siteEntryOrVal) => {
    if (!siteEntryOrVal) return "No Account Selected";
    const isString = typeof siteEntryOrVal === "string";
    const entry = isString
      ? availableSites.find((s) => entryMatchesSelectValue(s, siteEntryOrVal))
      : siteEntryOrVal;

    if (entry) {
      const metaMatch = metaAccounts.find(
        (a) =>
          a.facebookPageId &&
          entry.facebookPageId &&
          String(a.facebookPageId).trim() === String(entry.facebookPageId).trim()
      );
      if (metaMatch?.name) return metaMatch.name;
      const name = entry.displayName || entry.userName || entry.siteLink || "";
      if (name && String(name).startsWith("http")) return getSiteHostName(name);
      if (name && !/^\d+$/.test(String(name).trim())) return name;
      if (entry.siteLink) return getSiteHostName(entry.siteLink);
      return metaMatch?.name || "Facebook Page";
    }
    if (isString && /^\d+$/.test(siteEntryOrVal.trim())) {
      const metaMatch = metaAccounts.find(
        (a) => String(a.facebookPageId || "").trim() === siteEntryOrVal.trim()
      );
      return metaMatch?.name || "Facebook Page";
    }
    return isString ? getSiteHostName(siteEntryOrVal) : "No Account Selected";
  };

  const navigate = (id) => onSectionChange?.(id);

  const canAccess = (sectionId) => sessionCanAccessSection(session, sectionId);

  // The whole nav is derived: workspaces the user can reach, each carrying the
  // tabs that will appear on the page. One source of truth, shared with
  // WorkspaceTabs so the sidebar and the tab rail can never disagree.
  const workspaceEntries = visibleWorkspaces({ canAccess, isWebsiteSelected }).filter(
    (entry) => !(entry.workspace.id === "dashboard" && session?.user?.role === "approver")
  );

  const activeWorkspace = workspaceForSection(activeSection);

  // Coming back to a workspace should resume the tab you were last on, not
  // dump you at the first one. A ref, so remembering doesn't cause a render.
  const lastSectionRef = useRef({});
  useEffect(() => {
    const owner = workspaceForSection(activeSection);
    if (owner) lastSectionRef.current[owner.id] = activeSection;
  }, [activeSection]);

  /** Read in the click handler, never during render. */
  const openWorkspace = (workspace, sections) => {
    const remembered = lastSectionRef.current[workspace.id];
    const target = sections.find((s) => s.id === remembered)?.id || sections[0]?.id;
    if (target) navigate(target);
  };

  const workspaceBadge = (workspace) =>
    workspace.sections.reduce((total, section) => {
      const kind = BADGE_SECTIONS[section.id];
      if (kind === "user") return total + approvalUserUnread;
      if (kind === "admin" && canSeeAdminApprovals) return total + approvalAdminUnread;
      return total;
    }, 0);

  const userInitials =
    session?.user?.name?.slice(0, 2)?.toUpperCase() ||
    session?.user?.email?.slice(0, 2)?.toUpperCase() ||
    "CW";

  const clientQ = clientQuery.trim().toLowerCase();
  const filteredSites = clientQ
    ? availableSites.filter((s) => {
        const name = getPageDisplayName(s).toLowerCase();
        const link = String(s.siteLink || "").toLowerCase();
        return name.includes(clientQ) || link.includes(clientQ);
      })
    : availableSites;

  const chooseClient = (val) => (onEnterClient || onSelectedSiteChange)?.(val);

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="border-b border-sidebar-border/80">
        <div className="flex items-center gap-3 px-1 py-1">
          <CrosswayLogo variant="dark" size={36} />
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="font-heading truncate text-sm font-bold text-[var(--cw-ink)]">Crossway</p>
            <p className="truncate text-[11px] tracking-wide text-[var(--cw-ink-faint)]">
              SEO &amp; Marketing Suite
            </p>
          </div>
        </div>

        {hasGlobalSiteAccess ? (
          <div className="mt-2 space-y-1.5 group-data-[collapsible=icon]:hidden">
            <button
              type="button"
              onClick={() => onGoToPortfolio?.()}
              className={cn(
                "flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-smooth",
                activeSection === "portfolio"
                  ? "border-[color-mix(in_srgb,var(--cw-neon)_45%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-neon)_12%,transparent)] font-semibold text-[var(--cw-neon)]"
                  : "border-[var(--cw-hairline)] bg-[var(--cw-raised)] text-[var(--cw-ink-dim)] hover:border-[var(--cw-hairline-strong)] hover:text-[var(--cw-ink)]"
              )}
            >
              <LayoutGrid className="size-4 shrink-0" />
              <span className="truncate">All clients</span>
            </button>

            <DropdownMenu onOpenChange={(open) => !open && setClientQuery("")}>
              <DropdownMenuTrigger
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-2 text-left text-sm transition-smooth",
                  "hover:border-[color-mix(in_srgb,var(--cw-neon)_35%,var(--cw-hairline))] hover:bg-[var(--cw-overlay)]"
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ClientAccountLogo entry={selectedSiteEntry} size="sm" />
                  <span className="truncate font-medium">
                    {selectedSite ? getPageDisplayName(selectedSite) : "Select client"}
                  </span>
                </span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64 p-0">
                <div className="border-b border-[var(--cw-hairline)] p-2">
                  <div className="flex items-center gap-2 rounded-md border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-2 py-1.5">
                    <Search className="size-3.5 shrink-0 text-[var(--cw-ink-faint)]" />
                    <input
                      autoFocus
                      value={clientQuery}
                      onChange={(e) => setClientQuery(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                      placeholder="Search clients…"
                      className="w-full bg-transparent text-xs text-[var(--cw-ink)] placeholder:text-[var(--cw-ink-faint)] focus:outline-none"
                    />
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                  {filteredSites.length === 0 ? (
                    <p className="px-3 py-4 text-center text-xs text-[var(--cw-ink-faint)]">
                      No matching clients
                    </p>
                  ) : (
                    filteredSites.map((siteEntry, index) => {
                      const val = getClientAccountSelectValue(siteEntry);
                      const isSelected = entryMatchesSelectValue(siteEntry, selectedSite);
                      return (
                        <DropdownMenuItem
                          key={`${val}-${index}`}
                          onClick={() => chooseClient(val)}
                          className={cn(
                            isSelected &&
                              "bg-[color-mix(in_srgb,var(--cw-neon)_12%,transparent)] font-semibold text-[var(--cw-neon)]"
                          )}
                        >
                          <ClientAccountLogo entry={siteEntry} size="sm" />
                          {getPageDisplayName(siteEntry)}
                        </DropdownMenuItem>
                      );
                    })
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <div className="mt-2 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-2 group-data-[collapsible=icon]:hidden">
            <p className="text-[10px] font-bold tracking-[0.14em] text-[var(--cw-ink-faint)] uppercase">
              Current Site
            </p>
            <p className="mt-1 truncate font-mono text-[13px] text-[var(--cw-ink)]">
              {getSiteHostName(userSiteLink)}
            </p>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        {/* Workspaces, not a tool inventory. Clicking one lands on its first
            tab; the rest of its tools appear as a rail on the page itself. */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaceEntries.map(({ workspace, sections }) => {
                const Icon = WORKSPACE_ICONS[workspace.icon] || Compass;
                const isActive = activeWorkspace?.id === workspace.id;
                const badge = workspaceBadge(workspace);
                return (
                  <SidebarMenuItem key={workspace.id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      data-accent={workspace.accent || undefined}
                      onClick={() => openWorkspace(workspace, sections)}
                      tooltip={workspace.label}
                    >
                      <Icon className="size-4" />
                      <span>{workspace.label}</span>
                    </SidebarMenuButton>
                    {badge > 0 ? (
                      <SidebarMenuBadge>{badge > 9 ? "9+" : String(badge)}</SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => window.open("mailto:support@crossway.com", "_blank")}
                  tooltip="Help & support"
                >
                  <HelpCircle className="size-4" />
                  <span>Help &amp; Support</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/80">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-smooth hover:bg-[var(--cw-raised)] group-data-[collapsible=icon]:justify-center">
            <Avatar className="size-8">
              <AvatarFallback className="bg-[color-mix(in_srgb,var(--cw-neon)_14%,var(--cw-raised))] text-xs font-bold text-[var(--cw-neon)]">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-medium">{session?.user?.name || session?.user?.email}</p>
              <Badge variant="secondary" className="mt-0.5 text-[10px] capitalize">
                {session?.user?.role?.replace("_", " ") || "user"}
              </Badge>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem disabled>
              <Settings className="size-4" />
              Account settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={async () => {
                await signOut({ redirect: false });
                router.push("/login");
              }}
            >
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
