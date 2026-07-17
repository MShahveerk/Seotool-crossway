"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import DashboardLayout from "./components/DashboardLayout";
import DashboardSection from "./components/DashboardSection";
import SearchConsoleSection from "./components/SearchConsoleSection";
import AdminSection from "./components/AdminSection";
import AdminApprovalsSection from "./components/AdminApprovalsSection";
import SmmStatisticsSection from "./components/SmmStatisticsSection";
import CalendarSection from "./components/CalendarSection";
import MyApprovalsSection from "./components/MyApprovalsSection";
import DeviceAppearanceSection from "./components/seo/DeviceAppearanceSection";
import UrlInspectionSection from "./components/seo/UrlInspectionSection";
import QueryPageMatrixSection from "./components/seo/QueryPageMatrixSection";
import SitemapHealthSection from "./components/seo/SitemapHealthSection";
import { isMetaPageId } from "../lib/siteAccess";

const WEBSITE_SEO_SECTIONS = new Set([
  "website-statistics",
  "device-appearance",
  "url-inspection",
  "query-page-matrix",
  "sitemap-health",
]);

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeSection, setActiveSection] = useState("dashboard");
  const [selectedSite, setSelectedSite] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    } else if (status === "authenticated" && session?.user?.role === "approver" && activeSection === "dashboard") {
      setActiveSection("calendar");
    }
  }, [status, router, session, activeSection]);

  // Leave website SEO tools when a Meta-only page is selected
  useEffect(() => {
    if (!selectedSite || !WEBSITE_SEO_SECTIONS.has(activeSection)) return;
    const isWebsite =
      String(selectedSite).startsWith("http") ||
      String(selectedSite).startsWith("sc-domain:") ||
      (!isMetaPageId(selectedSite) && String(selectedSite).includes("."));
    if (!isWebsite && isMetaPageId(selectedSite)) {
      setActiveSection("dashboard");
    }
  }, [selectedSite, activeSection]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-50 flex items-center justify-center transition-colors">
        <div className="text-center">
          <div
            className="inline-block h-8 w-8 border-2 border-gray-400 dark:border-gray-600 border-t-transparent rounded-full animate-spin"
            aria-label="Loading"
            role="status"
          />
          <p className="sr-only">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-600">Redirecting to sign in…</p>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-50 flex items-center justify-center transition-colors">
        <div className="text-center">
          <div
            className="inline-block h-8 w-8 border-2 border-gray-400 dark:border-gray-600 border-t-transparent rounded-full animate-spin"
            aria-label="Loading"
            role="status"
          />
        </div>
      </div>
    );
  }

  const seoSite =
    selectedSite ||
    session?.user?.siteLink ||
    (Array.isArray(session?.user?.accessibleSites) && session.user.accessibleSites[0]) ||
    "";

  const renderSection = () => {
    switch (activeSection) {
      case "dashboard":
        return <DashboardSection selectedSite={selectedSite} onNavigate={setActiveSection} />;
      case "website-statistics":
        return <SearchConsoleSection selectedSite={seoSite} />;
      case "device-appearance":
        return <DeviceAppearanceSection selectedSite={seoSite} />;
      case "url-inspection":
        return <UrlInspectionSection selectedSite={seoSite} />;
      case "query-page-matrix":
        return <QueryPageMatrixSection selectedSite={seoSite} />;
      case "sitemap-health":
        return <SitemapHealthSection selectedSite={seoSite} />;
      case "smm-statistics":
        return <SmmStatisticsSection selectedSite={selectedSite} />;
      case "calendar":
        return <CalendarSection selectedSite={selectedSite} />;
      case "my-approvals":
        return <MyApprovalsSection selectedSite={selectedSite} />;
      case "user-management":
        return session?.user?.role === "super_admin" ? (
          <AdminSection />
        ) : (
          <DashboardSection selectedSite={selectedSite} onNavigate={setActiveSection} />
        );
      case "admin-approvals":
        return session?.user?.role === "super_admin" || session?.user?.role === "smm" ? (
          <AdminApprovalsSection selectedSite={selectedSite} />
        ) : (
          <DashboardSection selectedSite={selectedSite} onNavigate={setActiveSection} />
        );
      default:
        return session?.user?.role === "approver" ? (
          <CalendarSection />
        ) : (
          <DashboardSection selectedSite={selectedSite} onNavigate={setActiveSection} />
        );
    }
  };

  return (
    <DashboardLayout
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      selectedSite={selectedSite}
      onSelectedSiteChange={setSelectedSite}
    >
      {renderSection()}
    </DashboardLayout>
  );
}
