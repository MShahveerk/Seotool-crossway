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
import MyBlogApprovalsSection from "./components/MyBlogApprovalsSection";
import AdminBlogSection from "./components/AdminBlogSection";
import BlogAutomationSection from "./components/BlogAutomationSection";
import UrlInspectionSection from "./components/seo/UrlInspectionSection";
import SiteHealthSection from "./components/seo/SiteHealthSection";
import SiteAuditSection from "./components/SiteAuditSection";
import KeywordResearchHubSection from "./components/seo/KeywordResearchHubSection";
import SiteExplorerSection from "./components/seo/SiteExplorerSection";
import SerankingBacklinksSection from "./components/seranking/SerankingBacklinksSection";
import SerankingDomainSection from "./components/seranking/SerankingDomainSection";
import SerankingKeywordsSection from "./components/seranking/SerankingKeywordsSection";
import SerankingAuditSection from "./components/seranking/SerankingAuditSection";
import SerankingExplorerSection from "./components/seranking/SerankingExplorerSection";
import { isMetaPageId } from "../lib/siteAccess";
import { readSectionFromUrl, readSiteFromUrl, writeDashboardUrl } from "../lib/sectionMeta";
import { LoadingSpinner } from "./components/ui-shared/LoadingBlock";
import { SectionTransition } from "./components/ui-shared/Motion";

const WEBSITE_SEO_SECTIONS = new Set([
  "website-statistics",
  "site-health",
  "pagespeed-insights",
  "site-audit",
  "domain-authority",
  "keyword-research",
  "ai-keyword-research",
  "seo-opportunities",
  "device-appearance",
  "url-inspection",
  "query-page-matrix",
  "sitemap-health",
  "site-explorer",
  "link-index",
  "seranking-domain",
  "seranking-backlinks",
  "seranking-keywords",
  "seranking-audit",
]);

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeSection, setActiveSection] = useState(() => readSectionFromUrl() || "dashboard");
  const [selectedSite, setSelectedSite] = useState(() => readSiteFromUrl() || "");

  useEffect(() => {
    writeDashboardUrl(activeSection, selectedSite);
  }, [activeSection, selectedSite]);

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

  if (status === "loading" || status === "unauthenticated" || !session?.user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        {status === "unauthenticated" ? (
          <p className="text-sm text-muted-foreground">Redirecting to sign in…</p>
        ) : (
          <LoadingSpinner label="Loading dashboard" />
        )}
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
      case "device-appearance":
      case "query-page-matrix":
      case "sitemap-health":
      case "seo-opportunities":
        return <SearchConsoleSection selectedSite={seoSite} />;
      case "site-health":
      case "pagespeed-insights":
      case "domain-authority":
      case "link-index":
        return <SiteHealthSection selectedSite={seoSite} />;
      case "site-audit":
        return <SiteAuditSection selectedSite={seoSite} onNavigateSection={setActiveSection} />;
      case "keyword-research":
      case "ai-keyword-research":
        return <KeywordResearchHubSection selectedSite={seoSite} />;
      case "url-inspection":
        return <UrlInspectionSection selectedSite={seoSite} />;
      case "site-explorer":
        return <SiteExplorerSection selectedSite={seoSite} />;
      case "seranking-domain":
        return <SerankingDomainSection selectedSite={seoSite} />;
      case "seranking-backlinks":
        return <SerankingBacklinksSection selectedSite={seoSite} />;
      case "seranking-keywords":
        return <SerankingKeywordsSection selectedSite={seoSite} />;
      case "seranking-audit":
        return <SerankingAuditSection selectedSite={seoSite} />;
      case "seranking-explorer":
        return <SerankingExplorerSection selectedSite={selectedSite} />;
      case "smm-statistics":
        return <SmmStatisticsSection selectedSite={selectedSite} />;
      case "calendar":
        return <CalendarSection selectedSite={selectedSite} />;
      case "my-approvals":
        return <MyApprovalsSection selectedSite={selectedSite} />;
      case "my-blog-approvals":
        return <MyBlogApprovalsSection selectedSite={selectedSite} />;
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
      case "admin-blogs":
        return session?.user?.role === "super_admin" || session?.user?.role === "smm" ? (
          <AdminBlogSection selectedSite={selectedSite} />
        ) : (
          <DashboardSection selectedSite={selectedSite} onNavigate={setActiveSection} />
        );
      case "blog-automation":
        return session?.user?.role === "super_admin" || session?.user?.role === "smm" ? (
          <BlogAutomationSection />
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
      <SectionTransition sectionKey={activeSection}>{renderSection()}</SectionTransition>
    </DashboardLayout>
  );
}
