"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  CheckSquare,
  ChevronDown,
  ClipboardList,
  Compass,
  Crosshair,
  FileText,
  Globe,
  HelpCircle,
  LayoutDashboard,
  Columns3,
  LogOut,
  Megaphone,
  Search,
  Settings,
  Shield,
  Sparkles,
  Users,
  Activity,
  Link2,
} from "lucide-react";
import { isMetaPageId } from "@/lib/siteAccess";
import {
  entryMatchesSelectValue,
  getClientAccountSelectValue,
  mergeClientAccountEntries,
} from "@/lib/clientAccountList";
import ClientAccountLogo from "@/app/components/ui-shared/ClientAccountLogo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const dashboardItem = { id: "dashboard", label: "Dashboard", icon: LayoutDashboard };

const gscMenuItems = [
  { id: "website-statistics", label: "Website Statistics", icon: Globe },
  { id: "url-inspection", label: "URL Inspection", icon: Crosshair },
];

const seoMenuItems = [
  { id: "site-health", label: "Authority & Performance", icon: Activity },
  { id: "site-audit", label: "Site Audit", icon: Shield },
  { id: "keyword-research", label: "Keyword Research", icon: Search },
  { id: "site-explorer", label: "Site Explorer", icon: Compass },
  { id: "backlink-profile", label: "Backlink Profile", icon: Link2 },
];

const smmMenuItems = [
  { id: "smm-statistics", label: "SMM Statistics", icon: Megaphone },
  { id: "calendar", label: "Content Calendar", icon: Calendar },
  { id: "my-approvals", label: "SMM Post Approvals", icon: CheckSquare },
  { id: "admin-approvals", label: "Create Post", icon: ClipboardList, role: "super_admin" },
  { id: "post-board", label: "Post Board", icon: Columns3, role: "super_admin" },
];

const blogsMenuItems = [
  { id: "my-blog-approvals", label: "Blog Approvals", icon: FileText },
  { id: "admin-blogs", label: "Create Blog", icon: FileText, role: "super_admin" },
  { id: "blog-board", label: "Blog Board", icon: Columns3, role: "super_admin" },
  { id: "blog-automation", label: "Blog Automation", icon: Sparkles, role: "super_admin" },
];

function canAccessCreateItem(item, role) {
  if (!item.role) return true;
  if (role === item.role) return true;
  return (
    (item.id === "admin-approvals" ||
      item.id === "admin-blogs" ||
      item.id === "blog-automation" ||
      item.id === "post-board" ||
      item.id === "blog-board") &&
    role === "smm"
  );
}

function groupContainsSection(items, sectionId) {
  return items.some((item) => item.id === sectionId);
}

function filterMenuItem(item, { role, hasGlobalSiteAccess, isWebsiteSelected }) {
  if (role === "approver") {
    return item.id === "calendar" || item.id === "my-approvals";
  }
  if (item.id === "website-statistics" && hasGlobalSiteAccess && !isWebsiteSelected) {
    return false;
  }
  if (item.role && !canAccessCreateItem(item, role)) {
    return false;
  }
  return true;
}

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
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const [availableSites, setAvailableSites] = useState([]);
  const [superAdminPrimarySite, setSuperAdminPrimarySite] = useState("");
  const [metaAccounts, setMetaAccounts] = useState([]);
  const [approvalAdminUnread, setApprovalAdminUnread] = useState(0);
  const [approvalUserUnread, setApprovalUserUnread] = useState(0);
  const [gscOpen, setGscOpen] = useState(true);
  const [seoOpen, setSeoOpen] = useState(true);
  const [smmOpen, setSmmOpen] = useState(true);
  const [blogsOpen, setBlogsOpen] = useState(true);

  const userRole = session?.user?.role;

  const isSuperAdmin = session?.user?.role === "super_admin";
  const hasGlobalSiteAccess = session?.user?.role === "super_admin" || session?.user?.role === "smm";
  const userSiteLink = session?.user?.siteLink || "";

  useEffect(() => {
    if (!hasGlobalSiteAccess) return;
    fetch("/api/admin/meta-accounts")
      .then((res) => (res.ok ? res.json() : { accounts: [] }))
      .then((data) => setMetaAccounts(data.accounts || []))
      .catch(() => setMetaAccounts([]));
  }, [hasGlobalSiteAccess]);

  useEffect(() => {
    if (!hasGlobalSiteAccess) return;
    fetch("/api/admin/site-integrations")
      .then((res) => (res.ok ? res.json() : { sites: [] }))
      .then((data) => {
        setAvailableSites(mergeClientAccountEntries(data.sites || []));
        setSuperAdminPrimarySite(data.superAdminSite || "");
      })
      .catch(() => {
        setAvailableSites([]);
        setSuperAdminPrimarySite("");
      });
  }, [hasGlobalSiteAccess]);

  useEffect(() => {
    if (!hasGlobalSiteAccess || selectedSite) return;
    if (superAdminPrimarySite) {
      onSelectedSiteChange?.(superAdminPrimarySite);
      return;
    }
    if (availableSites.length > 0) {
      onSelectedSiteChange?.(getClientAccountSelectValue(availableSites[0]));
    }
  }, [availableSites, hasGlobalSiteAccess, onSelectedSiteChange, selectedSite, superAdminPrimarySite]);

  useEffect(() => {
    if (!isSuperAdmin) return undefined;
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
  }, [isSuperAdmin]);

  useEffect(() => {
    if (isSuperAdmin) return undefined;
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
  }, [isSuperAdmin]);

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

  useEffect(() => {
    if (groupContainsSection(gscMenuItems, activeSection)) setGscOpen(true);
    if (groupContainsSection(seoMenuItems, activeSection)) setSeoOpen(true);
    if (groupContainsSection(smmMenuItems, activeSection)) setSmmOpen(true);
    if (groupContainsSection(blogsMenuItems, activeSection)) setBlogsOpen(true);
  }, [activeSection]);

  const menuContext = { role: userRole, hasGlobalSiteAccess, isWebsiteSelected };

  const visibleGscItems = gscMenuItems.filter((item) => filterMenuItem(item, menuContext));
  const visibleSeoItems = seoMenuItems.filter((item) => filterMenuItem(item, menuContext));
  const visibleSmmItems = smmMenuItems.filter((item) => filterMenuItem(item, menuContext));
  const visibleBlogItems = blogsMenuItems.filter((item) => filterMenuItem(item, menuContext));

  const seoItemsForMenu = isWebsiteSelected
    ? visibleSeoItems
    : visibleSeoItems.filter((item) => item.id === "site-explorer");

  const showGscGroup = userRole !== "approver" && isWebsiteSelected && visibleGscItems.length > 0;
  const showSeoGroup = userRole !== "approver" && seoItemsForMenu.length > 0;
  const showSmmGroup = visibleSmmItems.length > 0;
  const showBlogsGroup = userRole !== "approver" && visibleBlogItems.length > 0;

  const getItemBadge = (item) => {
    if (item.id === "my-approvals" && approvalUserUnread > 0) {
      return approvalUserUnread > 9 ? "9+" : String(approvalUserUnread);
    }
    if (item.id === "admin-approvals" && approvalAdminUnread > 0) {
      return approvalAdminUnread > 9 ? "9+" : String(approvalAdminUnread);
    }
    return null;
  };

  const navigate = (id) => onSectionChange?.(id);

  const renderNavItem = (item, badge) => {
    const Icon = item.icon;
    const isActive = activeSection === item.id;
    return (
      <SidebarMenuItem key={item.id}>
        <SidebarMenuButton isActive={isActive} onClick={() => navigate(item.id)} tooltip={item.label}>
          <Icon className="size-4" />
          <span>{item.label}</span>
        </SidebarMenuButton>
        {badge ? <SidebarMenuBadge>{badge}</SidebarMenuBadge> : null}
      </SidebarMenuItem>
    );
  };

  const renderMenuGroup = (label, GroupIcon, items, open, setOpen, groupKey) => {
    if (!items.length) return null;
    return (
      <Collapsible key={groupKey} open={open} onOpenChange={setOpen} className="group/collapsible">
        <SidebarGroup>
          <SidebarGroupLabel asChild>
            <CollapsibleTrigger className="flex w-full items-center justify-between">
              <span className="flex items-center gap-2">
                {GroupIcon ? <GroupIcon className="size-3.5 shrink-0 opacity-80" aria-hidden /> : null}
                {label}
              </span>
              <ChevronDown className="size-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
            </CollapsibleTrigger>
          </SidebarGroupLabel>
          <CollapsibleContent>
            <SidebarGroupContent>
              <SidebarMenu>{items.map((item) => renderNavItem(item, getItemBadge(item)))}</SidebarMenu>
            </SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
      </Collapsible>
    );
  };

  const userInitials =
    session?.user?.name?.slice(0, 2)?.toUpperCase() ||
    session?.user?.email?.slice(0, 2)?.toUpperCase() ||
    "CW";

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="border-b border-sidebar-border/80">
        <div className="flex items-center gap-3 px-1 py-1">
          <img src="/crossway-logo.png" alt="Crossway" width={36} height={36} className="rounded-lg object-contain" />
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-bold text-sidebar-foreground">Crossway</p>
            <p className="truncate text-xs text-muted-foreground">SEO & Marketing Suite</p>
          </div>
        </div>

        {hasGlobalSiteAccess ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "mt-2 flex w-full items-center justify-between gap-2 rounded-lg border border-sidebar-border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent group-data-[collapsible=icon]:hidden"
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
            <DropdownMenuContent align="start" className="w-64 max-h-72 overflow-y-auto">
              {availableSites.map((siteEntry, index) => {
                const val = getClientAccountSelectValue(siteEntry);
                const isSelected = entryMatchesSelectValue(siteEntry, selectedSite);
                return (
                  <DropdownMenuItem
                    key={`${val}-${index}`}
                    onClick={() => onSelectedSiteChange?.(val)}
                    className={cn(isSelected && "bg-emerald-50 text-emerald-900")}
                  >
                    <ClientAccountLogo entry={siteEntry} size="sm" />
                    {getPageDisplayName(siteEntry)}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="mt-2 rounded-lg border border-sidebar-border bg-background px-3 py-2 group-data-[collapsible=icon]:hidden">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Current Site</p>
            <p className="mt-1 truncate text-sm font-medium">{getSiteHostName(userSiteLink)}</p>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        {userRole !== "approver" ? (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>{renderNavItem(dashboardItem, null)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        {showGscGroup
          ? renderMenuGroup("Search Console", Globe, visibleGscItems, gscOpen, setGscOpen, "gsc")
          : null}

        {showSeoGroup
          ? renderMenuGroup("SEO Tools", Search, seoItemsForMenu, seoOpen, setSeoOpen, "seo")
          : null}

        {showSmmGroup ? renderMenuGroup("Social Media", Megaphone, visibleSmmItems, smmOpen, setSmmOpen, "smm") : null}

        {showBlogsGroup ? renderMenuGroup("Blogs", FileText, visibleBlogItems, blogsOpen, setBlogsOpen, "blogs") : null}

        {isSuperAdmin ? (
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center gap-2">
              <Shield className="size-3.5 shrink-0 opacity-80" aria-hidden />
              Admin
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activeSection === "user-management"}
                    onClick={() => navigate("user-management")}
                    tooltip="User Management"
                  >
                    <Users className="size-4" />
                    <span>User Management</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => window.open("mailto:support@crossway.com", "_blank")}
                    tooltip="Help & support"
                  >
                    <HelpCircle className="size-4" />
                    <span>Help & Support</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center gap-2">
              <Shield className="size-3.5 shrink-0 opacity-80" aria-hidden />
              Admin
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => window.open("mailto:support@crossway.com", "_blank")}
                    tooltip="Help & support"
                  >
                    <HelpCircle className="size-4" />
                    <span>Help & Support</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/80">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center">
            <Avatar className="size-8">
              <AvatarFallback className="bg-emerald-100 text-emerald-800 text-xs font-semibold">
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
