"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  FiSearch,
  FiGlobe,
  FiBarChart2,
  FiTrendingUp,
  FiMenu,
  FiX,
  FiChevronDown,
  FiLogOut,
  FiSettings,
  FiHelpCircle,
  FiClipboard,
  FiUsers,
  FiCalendar,
  FiCheckSquare,
  FiMonitor,
  FiCrosshair,
  FiMap,
  FiFileText,
  FiZap,
  FiActivity,
  FiShield,
  FiAward,
} from "react-icons/fi";
import { SiFacebook } from "react-icons/si";
import { isMetaPageId } from "../../lib/siteAccess";

const mainMenuItems = [
  { id: "dashboard", label: "Dashboard", icon: FiBarChart2 },
  { id: "website-statistics", label: "Website Statistics", icon: FiSearch },
  { id: "pagespeed-insights", label: "PageSpeed Insights", icon: FiActivity },
  { id: "smm-statistics", label: "SMM Statistics", icon: FiTrendingUp },
  { id: "calendar", label: "Content Calendar", icon: FiCalendar },
  { id: "my-approvals", label: "Approvals", icon: FiCheckSquare },
  { id: "my-blog-approvals", label: "Blog Approvals", icon: FiFileText },
];

/** SEO tools shown only when a website (not Meta-only page) is selected */
const websiteSeoMenuItems = [
  { id: "site-audit", label: "Site Audit", icon: FiShield },
  { id: "domain-authority", label: "Domain Authority", icon: FiAward },
  { id: "seo-opportunities", label: "SEO Opportunities", icon: FiZap },
  { id: "device-appearance", label: "Device & Appearance", icon: FiMonitor },
  { id: "url-inspection", label: "URL Inspection", icon: FiCrosshair },
  { id: "query-page-matrix", label: "Query × Page", icon: FiMap },
  { id: "sitemap-health", label: "Sitemap Health", icon: FiFileText },
];

const userManagementMenuItem = {
  id: "user-management",
  label: "User Management",
  icon: FiUsers,
  role: "super_admin",
};

const adminMenuItems = [
  { id: "admin-approvals", label: "Create Post", icon: FiClipboard, role: "super_admin" },
  { id: "admin-blogs", label: "Create Blog", icon: FiFileText, role: "super_admin" },
];

export default function DashboardLayout({
  children,
  activeSection = "dashboard",
  onSectionChange,
  selectedSite = "",
  onSelectedSiteChange,
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsDropdownOpen, setSettingsDropdownOpen] = useState(false);
  const [superAdminSiteDropdownOpen, setSuperAdminSiteDropdownOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [logoVisible, setLogoVisible] = useState(true);
  const [siteLogoVisible, setSiteLogoVisible] = useState(true);
  const [availableSites, setAvailableSites] = useState([]);
  const [superAdminPrimarySite, setSuperAdminPrimarySite] = useState("");
  const [failedSiteLogos, setFailedSiteLogos] = useState({});
  const [approvalAdminUnread, setApprovalAdminUnread] = useState(0);
  const [approvalUserUnread, setApprovalUserUnread] = useState(0);
  const [metaAccounts, setMetaAccounts] = useState([]);
  const isSuperAdmin = session?.user?.role === "super_admin";
  const hasGlobalSiteAccess = session?.user?.role === "super_admin" || session?.user?.role === "smm";
  const userSiteLink = session?.user?.siteLink || "";

  useEffect(() => {
    if (!hasGlobalSiteAccess) return;
    const fetchMetaAccounts = async () => {
      try {
        const res = await fetch("/api/admin/meta-accounts");
        if (!res.ok) return;
        const data = await res.json();
        setMetaAccounts(data.accounts || []);
      } catch (err) {
        console.error("Failed to load Meta accounts", err);
      }
    };
    fetchMetaAccounts();
  }, [hasGlobalSiteAccess]);

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
    if (typeof window !== "undefined") {
      window.addEventListener("approvals:admin-refresh", onRefresh);
    }
    return () => {
      clearInterval(interval);
      if (typeof window !== "undefined") {
        window.removeEventListener("approvals:admin-refresh", onRefresh);
      }
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
    if (typeof window !== "undefined") {
      window.addEventListener("approvals:user-updated", onRefresh);
    }
    return () => {
      clearInterval(interval);
      if (typeof window !== "undefined") {
        window.removeEventListener("approvals:user-updated", onRefresh);
      }
    };
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdmin || activeSection !== "admin-approvals") return;
    (async () => {
      try {
        const res = await fetch("/api/admin/approvals?countOnly=1");
        const data = await res.json();
        if (res.ok) setApprovalAdminUnread(Number(data.count) || 0);
      } catch {
        setApprovalAdminUnread(0);
      }
    })();
  }, [isSuperAdmin, activeSection]);

  useEffect(() => {
    if (isSuperAdmin || activeSection !== "my-approvals") return;
    (async () => {
      try {
        const res = await fetch("/api/approvals?countOnly=1");
        const data = await res.json();
        if (res.ok) setApprovalUserUnread(Number(data.count) || 0);
      } catch {
        setApprovalUserUnread(0);
      }
    })();
  }, [isSuperAdmin, activeSection]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
      if (window.innerWidth >= 1024) {
        setSidebarOpen(false);
      }
    };
    
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    const fetchAvailableSites = async () => {
      if (!hasGlobalSiteAccess) {
        setAvailableSites([]);
        return;
      }

      try {
        const res = await fetch("/api/admin/site-integrations");
        if (!res.ok) return;
        const data = await res.json();
        const sites = data.sites || [];
        const ownSite = data.superAdminSite || "";
        setSuperAdminPrimarySite(ownSite);
        setAvailableSites(sites);

      } catch {
        setAvailableSites([]);
        setSuperAdminPrimarySite("");
      }
    };

    fetchAvailableSites();
  }, [hasGlobalSiteAccess]);

  useEffect(() => {
    if (!hasGlobalSiteAccess || selectedSite) return;
    if (superAdminPrimarySite) {
      onSelectedSiteChange?.(superAdminPrimarySite);
      return;
    }
    if (availableSites.length > 0) {
      const first = availableSites[0];
      // Websites: prefer URL so SEO tools unlock; Meta pages: use page ID
      const firstVal =
        first.type === "website"
          ? first.siteLink || first.facebookPageId
          : first.facebookPageId || first.siteLink;
      onSelectedSiteChange?.(firstVal);
    }
  }, [availableSites, hasGlobalSiteAccess, onSelectedSiteChange, selectedSite, superAdminPrimarySite]);

  useEffect(() => {
    if (!hasGlobalSiteAccess || !availableSites.length || !selectedSite) return;
    const isValIncluded = availableSites.some(s => s.facebookPageId === selectedSite || s.siteLink === selectedSite);
    if (!isValIncluded) {
      const first = availableSites[0];
      const firstVal =
        first.type === "website"
          ? first.siteLink || first.facebookPageId
          : first.facebookPageId || first.siteLink;
      onSelectedSiteChange?.(superAdminPrimarySite || firstVal);
    }
  }, [availableSites, hasGlobalSiteAccess, onSelectedSiteChange, selectedSite, superAdminPrimarySite]);

  const selectedSiteEntry = availableSites.find(
    (s) => s.siteLink === selectedSite || s.facebookPageId === selectedSite
  );
  const effectiveSiteForSeo = hasGlobalSiteAccess
    ? selectedSite
    : userSiteLink || selectedSite;
  const isWebsiteSelected = Boolean(
    effectiveSiteForSeo &&
      (String(effectiveSiteForSeo).startsWith("http") ||
        String(effectiveSiteForSeo).startsWith("sc-domain:") ||
        selectedSiteEntry?.type === "website" ||
        (!isMetaPageId(effectiveSiteForSeo) &&
          (selectedSiteEntry?.siteLink?.startsWith("http") || String(effectiveSiteForSeo).includes("."))))
  );

  useEffect(() => {
    setSiteLogoVisible(true);
  }, [userSiteLink]);

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push("/login");
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };
  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed((prev) => !prev);
  };

  const getSiteHostName = (siteUrl) => {
    if (!siteUrl) return "No Site Linked";
    try {
      return new URL(siteUrl).hostname.replace(/^www\./, "");
    } catch {
      return siteUrl.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || "No Site Linked";
    }
  };

  const getPageDisplayName = (siteEntryOrVal) => {
    if (!siteEntryOrVal) return "No Account Selected";
    const isString = typeof siteEntryOrVal === "string";
    const entry = isString
      ? availableSites.find(
          (s) => s.siteLink === siteEntryOrVal || s.facebookPageId === siteEntryOrVal
        )
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
      // Never show raw numeric Meta page IDs in the client picker
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

  const getFaviconUrl = (siteUrl) => {
    if (!siteUrl) return "";
    try {
      const hostname = new URL(siteUrl).hostname;
      return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
    } catch {
      return "";
    }
  };

  const markSiteLogoFailed = (siteUrl) => {
    setFailedSiteLogos((prev) => ({ ...prev, [siteUrl]: true }));
  };

  const isCompactSidebar = !isMobile && isSidebarCollapsed;
  const UserMgmtIcon = userManagementMenuItem.icon;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-50 transition-colors">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-72 ${isSidebarCollapsed ? "lg:w-20" : "lg:w-72"} bg-[#F0F0F0] pl-2 pr-1 pt-2 pb-2 transition-all duration-300 ease-in-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
        aria-label="Main navigation"
      >
        <div className="flex flex-col h-full bg-white rounded-xl">
          {/* Logo/Brand (expanded only) */}
          {!isCompactSidebar && (
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center w-full justify-between">
                <div className="flex items-center">
                  {logoVisible ? (
                    <img
                      src="/crossway-logo.png"
                      alt="Crossway logo"
                      width={60}
                      height={60}
                      className="rounded-md object-contain"
                      onError={() => setLogoVisible(false)}
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-md bg-gray-100 flex items-center justify-center text-[10px] font-semibold text-gray-600">
                      CW
                    </div>
                  )}
                </div>

                {!isMobile && (
                  <button
                    onClick={toggleSidebarCollapse}
                    className="ml-3 p-1.5 rounded-md hover:bg-gray-100 transition-colors"
                    aria-label="Collapse sidebar"
                    title="Collapse sidebar"
                  >
                    <img
                      src="/collapse.png"
                      alt="Collapse sidebar"
                      width={18}
                      height={18}
                      className="object-contain"
                    />
                  </button>
                )}
              </div>
              <div className="flex items-center">
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="lg:hidden text-gray-600 dark:text-gray-700 hover:text-gray-900 dark:hover:text-black p-2 rounded-lg hover:bg-gray-100/80 dark:hover:bg-gray-200/80 transition-all duration-200"
                  aria-label="Close sidebar"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* Compact Header (collapsed only) */}
          {isCompactSidebar && (
            <div className="hidden lg:flex items-center justify-center py-3 border-b border-gray-200">
              <button
                onClick={toggleSidebarCollapse}
                className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
                aria-label="Expand sidebar"
                title="Expand sidebar"
              >
                <img
                  src="/collapse.png"
                  alt="Expand sidebar"
                  width={18}
                  height={18}
                  className="object-contain rotate-180"
                />
              </button>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto" aria-label="Dashboard navigation">
            {hasGlobalSiteAccess && !isCompactSidebar && (
              <div className="px-3 pb-4 relative">
                <p className="block text-[10px] font-semibold tracking-wider text-gray-500 uppercase mb-2">
                  Client Account
                </p>
                <button
                  type="button"
                  onClick={() => setSuperAdminSiteDropdownOpen((prev) => !prev)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#0EFF2A]/30 focus:border-[#0EFF2A] flex items-center justify-between gap-2"
                  aria-haspopup="listbox"
                  aria-expanded={superAdminSiteDropdownOpen}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <div className="h-[18px] w-[18px] rounded-sm bg-gray-100 flex items-center justify-center shrink-0">
                      {(() => {
                        const entry = availableSites.find(s => s.siteLink === selectedSite || s.facebookPageId === selectedSite);
                        if (entry?.type === "meta_page") {
                          return <SiFacebook className="w-3 h-3 text-[#1877F2]" />;
                        }
                        return <FiGlobe className="w-3 h-3 text-gray-500" />;
                      })()}
                    </div>
                    <span className="truncate">
                      {selectedSite ? getPageDisplayName(selectedSite) : "No Account Selected"}
                    </span>
                  </span>
                  <FiChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${superAdminSiteDropdownOpen ? "rotate-180" : ""}`} />
                </button>
 
                {superAdminSiteDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setSuperAdminSiteDropdownOpen(false)}
                    />
                    <div
                      className="absolute left-3 right-3 top-[72px] z-20 rounded-lg border border-gray-200 bg-white shadow-xl max-h-64 overflow-y-auto"
                      role="listbox"
                      aria-label="Select client account"
                    >
                      {availableSites.map((siteEntry) => {
                        const val =
                          siteEntry.type === "website"
                            ? siteEntry.siteLink || siteEntry.facebookPageId
                            : siteEntry.facebookPageId || siteEntry.siteLink;
                        const label = getPageDisplayName(siteEntry);
                        const isMetaPage = siteEntry.type === "meta_page";
                        return (
                          <button
                            key={val}
                            type="button"
                            onClick={() => {
                              onSelectedSiteChange?.(val);
                              setSuperAdminSiteDropdownOpen(false);
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 ${
                              selectedSite === val ? "bg-[#dff7de]" : ""
                            }`}
                          >
                            <div className="h-[18px] w-[18px] rounded-sm bg-gray-100 flex items-center justify-center shrink-0">
                              {isMetaPage ? (
                                <SiFacebook className="w-3 h-3 text-[#1877F2]" />
                              ) : (
                                <FiGlobe className="w-3 h-3 text-gray-500" />
                              )}
                            </div>
                            <span className="text-sm text-gray-800 truncate">{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
            {!hasGlobalSiteAccess && !isCompactSidebar && (
              <div className="px-3 pb-4">
                <p className="block text-[10px] font-semibold tracking-wider text-gray-500 uppercase mb-2">
                  Current Site
                </p>
                <div className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 flex items-center gap-3">
                  {siteLogoVisible && getFaviconUrl(userSiteLink) ? (
                    <img
                      src={getFaviconUrl(userSiteLink)}
                      alt="Site logo"
                      width={20}
                      height={20}
                      className="h-5 w-5 rounded-sm object-contain shrink-0"
                      onError={() => setSiteLogoVisible(false)}
                    />
                  ) : (
                    <div className="h-5 w-5 rounded-sm bg-gray-100 flex items-center justify-center shrink-0">
                      <FiGlobe className="w-3.5 h-3.5 text-gray-500" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{getSiteHostName(userSiteLink)}</p>
                    {userSiteLink && (
                      <p className="text-[11px] text-gray-500 truncate">{userSiteLink}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
            {!isCompactSidebar && (
              <p className="px-3 pb-2 text-[10px] font-semibold tracking-wider text-gray-500 uppercase">Main Menu</p>
            )}
            {mainMenuItems.map((item) => {
              if (session?.user?.role === "approver" && item.id !== "calendar" && item.id !== "my-approvals") {
                return null;
              }
              if (item.id === "website-statistics" && hasGlobalSiteAccess && !isWebsiteSelected) {
                return null;
              }
              const IconComponent = item.icon;
              const isActive = activeSection === item.id;
              const showUserApprovalDot = item.id === "my-approvals" && approvalUserUnread > 0;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (onSectionChange) {
                      onSectionChange(item.id);
                    }
                    if (isMobile) {
                      setSidebarOpen(false);
                    }
                  }}
                  className={`w-full flex items-center ${isCompactSidebar ? "justify-center px-2" : "space-x-3.5 px-4"} py-3 rounded-xl transition-all duration-300 group relative ${
                    isActive
                      ? "bg-[#dff7de] text-gray-900 border border-[#c4edc2]"
                      : "text-gray-700 hover:bg-white hover:text-gray-900 border border-transparent"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span className="relative inline-flex">
                    <IconComponent className={`w-4 h-4 ${isActive ? "text-[#1d9c35]" : ""}`} />
                    {showUserApprovalDot && (
                      <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-[#1d9c35] ring-2 ring-white" />
                    )}
                  </span>
                  {!isCompactSidebar && (
                    <span className={`font-medium text-sm flex items-center gap-2 ${isActive ? "text-gray-900" : ""} transition-colors duration-200`}>
                      {item.label}
                      {showUserApprovalDot && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#dff7de] text-[#1d9c35]">
                          {approvalUserUnread > 9 ? "9+" : approvalUserUnread}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Website-only SEO tools */}
            {isWebsiteSelected && session?.user?.role !== "approver" && (
              <div className={isCompactSidebar ? "" : "pt-3"}>
                {!isCompactSidebar && (
                  <p className="px-3 pb-2 text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
                    Website SEO
                  </p>
                )}
                {websiteSeoMenuItems.map((item) => {
                  const IconComponent = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onSectionChange?.(item.id);
                        if (isMobile) setSidebarOpen(false);
                      }}
                      className={`w-full flex items-center ${isCompactSidebar ? "justify-center px-2" : "space-x-3.5 px-4"} py-3 rounded-xl transition-all duration-300 group relative ${
                        isActive
                          ? "bg-[#dff7de] text-gray-900 border border-[#c4edc2]"
                          : "text-gray-700 hover:bg-white hover:text-gray-900 border border-transparent"
                      }`}
                      aria-current={isActive ? "page" : undefined}
                      title={item.label}
                    >
                      <IconComponent className={`w-4 h-4 ${isActive ? "text-[#1d9c35]" : ""}`} />
                      {!isCompactSidebar && (
                        <span className={`font-medium text-sm ${isActive ? "text-gray-900" : ""}`}>
                          {item.label}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            
            {/* Admin items (excludes User Management — see footer) */}
            {(hasGlobalSiteAccess || adminMenuItems.some((item) => !item.role)) && (
              <div className={isCompactSidebar ? "" : "pt-4"}>
                {adminMenuItems
                  .filter((item) => !item.role || session?.user?.role === item.role || ((item.id === "admin-approvals" || item.id === "admin-blogs") && session?.user?.role === "smm"))
                  .map((item) => {
                  const IconComponent = item.icon;
                  const isActive = activeSection === item.id;
                  const showApprovalDot =
                    item.id === "admin-approvals" && approvalAdminUnread > 0;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        if (onSectionChange) {
                          onSectionChange(item.id);
                        }
                        if (isMobile) {
                          setSidebarOpen(false);
                        }
                      }}
                      className={`w-full flex items-center ${isCompactSidebar ? "justify-center px-2" : "space-x-3.5 px-4"} py-3 rounded-xl transition-all duration-300 group relative ${
                        isActive
                          ? "bg-[#dff7de] text-gray-900 border border-[#c4edc2]"
                          : "text-gray-700 hover:bg-white hover:text-gray-900 border border-transparent"
                      }`}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <span className="relative inline-flex">
                        <IconComponent className={`w-4 h-4 ${isActive ? "text-[#1d9c35]" : ""}`} />
                        {showApprovalDot && (
                          <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white" />
                        )}
                      </span>
                      {!isCompactSidebar && (
                        <span className={`font-medium text-sm flex items-center gap-2 ${isActive ? "text-gray-900" : ""} transition-colors duration-200`}>
                          {item.label}
                          {showApprovalDot && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900">
                              {approvalAdminUnread > 9 ? "9+" : approvalAdminUnread}
                            </span>
                          )}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </nav>

          {/* Sidebar Footer */}
          <div className="px-4 py-4 border-t border-gray-200">
            <div className="space-y-2 text-sm text-gray-600 relative">
              <div className="relative">
                <button
                  onClick={() => setSettingsDropdownOpen((prev) => !prev)}
                  className={`w-full flex items-center ${isCompactSidebar ? "justify-center px-2" : "gap-2 px-3"} rounded-lg py-2 hover:bg-white transition-colors`}
                  aria-label="Settings menu"
                  aria-expanded={settingsDropdownOpen}
                  aria-haspopup="true"
                >
                  <FiSettings className="w-4 h-4" />
                  {!isCompactSidebar && <span>Settings</span>}
                </button>

                {settingsDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setSettingsDropdownOpen(false)}
                    />
                    <div className="absolute left-0 bottom-11 w-44 bg-white rounded-xl shadow-lg border border-gray-200 z-20 overflow-hidden">
                      <div className="p-1.5">
                        <button
                          onClick={async () => {
                            setSettingsDropdownOpen(false);
                            await handleLogout();
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
                        >
                          <FiLogOut className="w-4 h-4" />
                          <span className="text-sm font-medium">Logout</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    onSectionChange?.(userManagementMenuItem.id);
                    if (isMobile) setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center ${isCompactSidebar ? "justify-center px-2" : "gap-2 px-3"} rounded-lg py-2 hover:bg-white transition-colors ${
                    activeSection === userManagementMenuItem.id
                      ? "bg-white text-gray-900 font-medium"
                      : "text-gray-600"
                  }`}
                  aria-current={activeSection === userManagementMenuItem.id ? "page" : undefined}
                >
                  <UserMgmtIcon
                    className={`w-4 h-4 ${activeSection === userManagementMenuItem.id ? "text-[#1d9c35]" : ""}`}
                  />
                  {!isCompactSidebar && <span>{userManagementMenuItem.label}</span>}
                </button>
              )}
              <button className={`w-full flex items-center ${isCompactSidebar ? "justify-center px-2" : "gap-2 px-3"} rounded-lg py-2 hover:bg-white transition-colors`}>
                <FiHelpCircle className="w-4 h-4" />
                {!isCompactSidebar && <span>Help Center</span>}
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className={`${isSidebarCollapsed ? "lg:pl-20" : "lg:pl-72"}`}>
        <button
          onClick={toggleSidebar}
          className="fixed top-4 left-4 z-30 lg:hidden text-gray-700 p-2 rounded-xl bg-white border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors"
          aria-label="Toggle sidebar"
          aria-expanded={sidebarOpen}
        >
          <FiMenu className="w-5 h-5" />
        </button>
 
        {/* Main Content Area */}
        <main
          className={`pl-2 pr-2 pt-2 pb-2 lg:pl-1 lg:pr-2 lg:pt-2 lg:pb-2 min-h-screen transition-colors ${
            activeSection === "dashboard" ? "bg-[#F0F0F0]" : "bg-[#F0F0F0]"
          }`}
        >
          {activeSection === "dashboard" ? (
            <div className="rounded-xl border border-gray-200 bg-[#ffffff] p-5">{children}</div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
