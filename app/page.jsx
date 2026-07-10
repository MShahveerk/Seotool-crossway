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

  const renderSection = () => {
    switch (activeSection) {
      case "dashboard":
        return <DashboardSection selectedSite={selectedSite} onNavigate={setActiveSection} />;
      case "website-statistics":
        return <SearchConsoleSection selectedSite={selectedSite} />;
      case "smm-statistics":
        return <SmmStatisticsSection selectedSite={selectedSite} />;
      case "calendar":
        return <CalendarSection />;
      case "my-approvals":
        return <MyApprovalsSection />;
      case "user-management":
        return session?.user?.role === "super_admin" ? (
          <AdminSection />
        ) : (
          <DashboardSection selectedSite={selectedSite} onNavigate={setActiveSection} />
        );
      case "admin-approvals":
        return session?.user?.role === "super_admin" ? (
          <AdminApprovalsSection selectedSite={selectedSite} />
        ) : (
          <DashboardSection selectedSite={selectedSite} onNavigate={setActiveSection} />
        );
      default:
        return session?.user?.role === "approver" ? <CalendarSection /> : <DashboardSection selectedSite={selectedSite} onNavigate={setActiveSection} />;
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
