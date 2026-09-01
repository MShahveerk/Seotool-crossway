"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import DashboardLayout from "./components/DashboardLayout";
import DashboardSection from "./components/DashboardSection";
import PortfolioDashboard from "./components/PortfolioDashboard";
import SearchConsoleSection from "./components/SearchConsoleSection";
import AdminSection from "./components/AdminSection";
import AdminApprovalsSection from "./components/AdminApprovalsSection";
import SmmStatisticsSection from "./components/SmmStatisticsSection";
import CalendarSection from "./components/CalendarSection";
import MyApprovalsSection from "./components/MyApprovalsSection";
import MyBlogApprovalsSection from "./components/MyBlogApprovalsSection";
import AdminBlogSection from "./components/AdminBlogSection";
import BlogAutomationSection from "./components/BlogAutomationSection";
import PostAutomationSection from "./components/PostAutomationSection";
import PostAutoscheduleSection from "./components/PostAutoscheduleSection";
import BlogAutoscheduleSection from "./components/BlogAutoscheduleSection";
import UrlInspectionSection from "./components/seo/UrlInspectionSection";
import SiteIntelligenceSection from "./components/seo/SiteIntelligenceSection";
import KeywordWorkbenchSection from "./components/seo/KeywordWorkbenchSection";
import ReportsStudioSection from "./components/ReportsStudioSection";
import SeoAutopilotSection from "./components/SeoAutopilotSection";
import HelpCenterSection from "./components/seo/HelpCenterSection";
import SerpAnalysisSection from "./components/seo/SerpAnalysisSection";
import LinkOpportunitiesSection from "./components/seo/LinkOpportunitiesSection";
import { isGlobalSection } from "../lib/workspaces";
import { isMetaPageId } from "../lib/siteAccess";
import { readSectionFromUrl, readSiteFromUrl, writeDashboardUrl } from "../lib/sectionMeta";
import { readItemFromUrl, sameContentFamily } from "../lib/contentFocus";
import { sessionCanAccessSection, sessionHasGlobalSiteAccess } from "../lib/clientPermissions";
import { LoadingSpinner } from "./components/ui-shared/LoadingBlock";
import { SectionTransition } from "./components/ui-shared/Motion";

/** playhtml touches `document` at import time — never SSR/prerender these boards. */
const PostBoardSection = dynamic(() => import("./components/PostBoardSection"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[40vh] items-center justify-center">
      <LoadingSpinner label="Loading post board" />
    </div>
  ),
});
const BlogBoardSection = dynamic(() => import("./components/BlogBoardSection"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[40vh] items-center justify-center">
      <LoadingSpinner label="Loading blog board" />
    </div>
  ),
});

const SECTION_ALIASES = {
  "seranking-audit": "site-audit",
  "seranking-keywords": "keyword-research",
  "seranking-explorer": "site-explorer",
  "seranking-domain": "site-health",
  "seranking-backlinks": "backlink-profile",
  "ai-keyword-research": "keyword-research",
  "pagespeed-insights": "site-health",
  "domain-authority": "site-health",
};

function resolveSection(section) {
  if (!section) return "dashboard";
  return SECTION_ALIASES[section] || section;
}

/**
 * Project tools that read a real website. Selecting a Meta-only project bounces
 * you out of these. Toolkit sections are deliberately absent — they start from
 * a keyword or a typed domain, so what's selected is irrelevant to them.
 */
const WEBSITE_SEO_SECTIONS = new Set([
  "website-statistics",
  "site-health",
  "pagespeed-insights",
  "site-audit",
  "domain-authority",
  "seo-opportunities",
  "device-appearance",
  "url-inspection",
  "query-page-matrix",
  "sitemap-health",
  "site-explorer",
  "backlink-profile",
  "seranking-domain",
  "seranking-backlinks",
  "seranking-audit",
  "seranking-explorer",
]);

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeSection, setActiveSection] = useState(() => resolveSection(readSectionFromUrl() || "dashboard"));
  const [selectedSite, setSelectedSite] = useState(() => readSiteFromUrl() || "");
  const [previousSection, setPreviousSection] = useState("dashboard");
  const [selectedHelpArticle, setSelectedHelpArticle] = useState("general-seo");
  const [landingApplied, setLandingApplied] = useState(false);
  const [focusedItemId, setFocusedItemId] = useState(() => readItemFromUrl() || "");

  const canSwitchClients = sessionHasGlobalSiteAccess(session);

  // Enter a client's workspace. From the portfolio lobby this lands on the
  // per-client dashboard; from anywhere else it just re-scopes the current tool.
  const enterClient = (value) => {
    setSelectedSite(value || "");
    setActiveSection((prev) => (prev === "portfolio" ? "dashboard" : prev));
  };

  // Rise back above a single client to the portfolio.
  const goToPortfolio = () => {
    setSelectedSite("");
    setActiveSection("portfolio");
    setFocusedItemId("");
  };

  const handleSectionChange = (section) => {
    setActiveSection(section);
    setFocusedItemId((current) => (sameContentFamily(activeSection, section) ? current : ""));
  };

  // Agencies land in the portfolio, not force-dropped inside one client. Decided
  // once during the first authenticated render (guarded by landingApplied) so we
  // never setState from an effect. Only opens the lobby when nothing was
  // deep-linked (no ?site / ?section).
  if (!landingApplied && status === "authenticated") {
    setLandingApplied(true);
    if (
      sessionHasGlobalSiteAccess(session) &&
      !readSiteFromUrl() &&
      !readSectionFromUrl() &&
      !selectedSite
    ) {
      setActiveSection("portfolio");
    }
  }

  useEffect(() => {
    const handleNavigate = (e) => {
      const { section, article, item } = e.detail || {};
      if (section) {
        setActiveSection((prev) => {
          if (section === "help" && prev !== "help") {
            setPreviousSection(prev);
          }
          return section;
        });
      }
      if (article) {
        setSelectedHelpArticle(article);
      }
      if (Object.prototype.hasOwnProperty.call(e.detail || {}, "item")) {
        setFocusedItemId(item || "");
      }
    };
    window.addEventListener("navigate-section", handleNavigate);
    return () => window.removeEventListener("navigate-section", handleNavigate);
  }, []);

  useEffect(() => {
    writeDashboardUrl(activeSection, selectedSite, focusedItemId);
  }, [activeSection, selectedSite, focusedItemId]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    } else if (
      status === "authenticated" &&
      !sessionCanAccessSection(session, "dashboard") &&
      activeSection === "dashboard"
    ) {
      setActiveSection(sessionCanAccessSection(session, "calendar") ? "calendar" : "my-approvals");
    }
  }, [status, router, session, activeSection]);

  // Leave website SEO tools when a Meta-only project is selected (site-explorer
  // works without a linked site). Toolkit tools never get pulled out from under
  // the user — they don't read the selection in the first place.
  useEffect(() => {
    if (!selectedSite || isGlobalSection(activeSection)) return;
    if (!WEBSITE_SEO_SECTIONS.has(activeSection)) return;
    if (activeSection === "site-explorer") return;
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
    const fallback = () => (
      <DashboardSection selectedSite={selectedSite} onNavigate={setActiveSection} />
    );

    const resolvedSection = resolveSection(activeSection);
    if (
      resolvedSection !== "dashboard" &&
      !sessionCanAccessSection(session, resolvedSection)
    ) {
      return fallback();
    }

    switch (activeSection) {
      case "portfolio":
        return canSwitchClients ? (
          <PortfolioDashboard selectedSite={selectedSite} onEnterClient={enterClient} />
        ) : (
          <DashboardSection selectedSite={selectedSite} onNavigate={setActiveSection} />
        );
      case "dashboard":
        return <DashboardSection selectedSite={selectedSite} onNavigate={setActiveSection} />;
      case "website-statistics":
      case "device-appearance":
      case "query-page-matrix":
      case "sitemap-health":
      case "seo-opportunities":
        return <SearchConsoleSection selectedSite={seoSite} />;
      case "site-intelligence":
        return (
          <SiteIntelligenceSection selectedSite={seoSite} onNavigateSection={setActiveSection} />
        );
      case "seranking-domain":
        return (
          <SiteIntelligenceSection
            selectedSite={seoSite}
            initialTab="authority"
            onNavigateSection={setActiveSection}
          />
        );
      case "site-health":
      case "pagespeed-insights":
      case "domain-authority":
        return (
          <SiteIntelligenceSection
            selectedSite={seoSite}
            initialTab="authority"
            onNavigateSection={setActiveSection}
          />
        );
      case "site-audit":
      case "seranking-audit":
        return (
          <SiteIntelligenceSection
            selectedSite={seoSite}
            initialTab="audit"
            onNavigateSection={setActiveSection}
          />
        );
      case "keyword-research":
      case "ai-keyword-research":
      case "seranking-keywords":
        return <KeywordWorkbenchSection selectedSite={seoSite} initialTab="research" />;
      case "url-inspection":
        return <UrlInspectionSection selectedSite={seoSite} />;
      case "site-explorer":
      case "seranking-explorer":
        return (
          <SiteIntelligenceSection
            selectedSite={seoSite}
            initialTab="backlinks"
            initialBacklinkMode="explorer"
            onNavigateSection={setActiveSection}
          />
        );
      case "backlink-profile":
      case "seranking-backlinks":
        return (
          <SiteIntelligenceSection
            selectedSite={seoSite}
            initialTab="backlinks"
            initialBacklinkMode="profile"
            onNavigateSection={setActiveSection}
          />
        );
      case "serp-analysis":
      case "competitor-matrix":
        return <SerpAnalysisSection selectedSite={seoSite} />;
      case "link-opportunities":
        return <LinkOpportunitiesSection selectedSite={seoSite} />;
      case "keyword-opportunities":
        return <KeywordWorkbenchSection selectedSite={seoSite} initialTab="ideas" />;
      case "smm-statistics":
        return <SmmStatisticsSection selectedSite={selectedSite} />;
      case "calendar":
        return <CalendarSection selectedSite={selectedSite} />;
      case "my-approvals":
        return <MyApprovalsSection selectedSite={selectedSite} focusItemId={focusedItemId} />;
      case "my-blog-approvals":
        return (
          <MyBlogApprovalsSection selectedSite={selectedSite} focusItemId={focusedItemId} />
        );
      case "help":
        return (
          <HelpCenterSection
            selectedArticle={selectedHelpArticle}
            onSelectArticle={setSelectedHelpArticle}
            onBack={() => setActiveSection(previousSection)}
          />
        );
      case "reports-studio":
        return sessionCanAccessSection(session, "reports-studio") ? (
          <ReportsStudioSection selectedSite={selectedSite} />
        ) : (
          fallback()
        );
      case "user-management":
        return sessionCanAccessSection(session, "user-management") ? (
          <AdminSection onNavigate={setActiveSection} />
        ) : (
          fallback()
        );
      case "admin-approvals":
        return sessionCanAccessSection(session, "admin-approvals") ? (
          <AdminApprovalsSection selectedSite={selectedSite} focusItemId={focusedItemId} />
        ) : (
          fallback()
        );
      case "post-board":
        return sessionCanAccessSection(session, "post-board") ? (
          <PostBoardSection
            selectedSite={selectedSite}
            focusItemId={focusedItemId}
            onClearFocus={() => setFocusedItemId("")}
            onFocusItem={setFocusedItemId}
          />
        ) : (
          fallback()
        );
      case "admin-blogs":
        return sessionCanAccessSection(session, "admin-blogs") ? (
          <AdminBlogSection selectedSite={selectedSite} focusItemId={focusedItemId} />
        ) : (
          fallback()
        );
      case "blog-board":
        return sessionCanAccessSection(session, "blog-board") ? (
          <BlogBoardSection
            selectedSite={selectedSite}
            focusItemId={focusedItemId}
            onClearFocus={() => setFocusedItemId("")}
            onFocusItem={setFocusedItemId}
          />
        ) : (
          fallback()
        );
      case "seo-autopilot":
        return sessionCanAccessSection(session, "seo-autopilot") ? (
          <SeoAutopilotSection selectedSite={selectedSite} />
        ) : (
          fallback()
        );
      case "blog-automation":
        return sessionCanAccessSection(session, "blog-automation") ? (
          <BlogAutomationSection selectedSite={selectedSite} />
        ) : (
          fallback()
        );
      case "post-automation":
        return sessionCanAccessSection(session, "post-automation") ? (
          <PostAutomationSection selectedSite={selectedSite} />
        ) : (
          fallback()
        );
      case "post-autoschedule":
        return sessionCanAccessSection(session, "post-autoschedule") ? (
          <PostAutoscheduleSection selectedSite={selectedSite} />
        ) : (
          fallback()
        );
      case "blog-autoschedule":
        return sessionCanAccessSection(session, "blog-autoschedule") ? (
          <BlogAutoscheduleSection selectedSite={selectedSite} />
        ) : (
          fallback()
        );
      default:
        return sessionCanAccessSection(session, "dashboard") ? (
          <DashboardSection selectedSite={selectedSite} onNavigate={setActiveSection} />
        ) : sessionCanAccessSection(session, "calendar") ? (
          <CalendarSection />
        ) : (
          fallback()
        );
    }
  };

  return (
    <DashboardLayout
      activeSection={activeSection}
      onSectionChange={handleSectionChange}
      selectedSite={selectedSite}
      onSelectedSiteChange={setSelectedSite}
      onEnterClient={enterClient}
      onGoToPortfolio={goToPortfolio}
      canSwitchClients={canSwitchClients}
    >
      <SectionTransition sectionKey={activeSection}>{renderSection()}</SectionTransition>
    </DashboardLayout>
  );
}
