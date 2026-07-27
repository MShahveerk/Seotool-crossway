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
  Link2,
  LogOut,
  Map,
  Megaphone,
  Monitor,
  Search,
  Settings,
  Shield,
  Sparkles,
  Users,
  Wand2,
  Zap,
  Award,
  Activity,
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

const mainMenuItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "website-statistics", label: "Website Statistics", icon: Globe },
  { id: "pagespeed-insights", label: "PageSpeed Insights", icon: Activity },
  { id: "smm-statistics", label: "SMM Statistics", icon: Megaphone },
  { id: "calendar", label: "Content Calendar", icon: Calendar },
  { id: "my-approvals", label: "SMM Post Approvals", icon: CheckSquare },
  { id: "my-blog-approvals", label: "Blog Approvals", icon: FileText },
];

const websiteSeoMenuItems = [
  { id: "site-audit", label: "Site Audit", icon: Shield },
  { id: "domain-authority", label: "Domain Authority", icon: Award },
  { id: "keyword-research", label: "Keyword Research", icon: Search },
  { id: "ai-keyword-research", label: "AI Keyword Research", icon: Sparkles },
  { id: "seo-opportunities", label: "SEO Opportunities", icon: Zap },
  { id: "device-appearance", label: "Device & Appearance", icon: Monitor },
  { id: "url-inspection", label: "URL Inspection", icon: Crosshair },
  { id: "query-page-matrix", label: "Query × Page", icon: Map },
  { id: "site-explorer", label: "Site Explorer", icon: Compass },
  { id: "link-index", label: "Link Index", icon: Link2 },
  { id: "sitemap-health", label: "Sitemap Health", icon: FileText },
];

const createMenuItems = [
  { id: "admin-approvals", label: "Create Post", icon: ClipboardList, role: "super_admin" },
  { id: "admin-blogs", label: "Create Blog", icon: FileText, role: "super_admin" },
  { id: "blog-automation", label: "Blog Automation", icon: Sparkles, role: "super_admin" },
];

function canAccessCreateItem(item, role) {
  if (!item.role) return true;
  if (role === item.role) return true;
  return (
    (item.id === "admin-approvals" || item.id === "admin-blogs" || item.id === "blog-automation") &&
    role === "smm"
  );
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
  const [seoOpen, setSeoOpen] = useState(true);

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
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainMenuItems.map((item) => {
                if (session?.user?.role === "approver" && item.id !== "calendar" && item.id !== "my-approvals") {
                  return null;
                }
                if (item.id === "website-statistics" && hasGlobalSiteAccess && !isWebsiteSelected) {
                  return null;
                }
                const badge =
                  item.id === "my-approvals" && approvalUserUnread > 0
                    ? approvalUserUnread > 9
                      ? "9+"
                      : String(approvalUserUnread)
                    : null;
                return renderNavItem(item, badge);
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isWebsiteSelected && session?.user?.role !== "approver" ? (
          <Collapsible open={seoOpen} onOpenChange={setSeoOpen} className="group/collapsible">
            <SidebarGroup>
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex w-full items-center justify-between">
                  Website SEO
                  <ChevronDown className="size-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {websiteSeoMenuItems.map((item) => renderNavItem(item))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        ) : null}

        {(hasGlobalSiteAccess || createMenuItems.some((item) => !item.role)) &&
        createMenuItems.some((item) => canAccessCreateItem(item, session?.user?.role)) ? (
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center gap-2">
              <Wand2 className="size-3.5 shrink-0 opacity-80" aria-hidden />
              Create
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {createMenuItems
                  .filter((item) => canAccessCreateItem(item, session?.user?.role))
                  .map((item) => {
                    const badge =
                      item.id === "admin-approvals" && approvalAdminUnread > 0
                        ? approvalAdminUnread > 9
                          ? "9+"
                          : String(approvalAdminUnread)
                        : null;
                    return renderNavItem(item, badge);
                  })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

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
