"use client";

import { useState } from "react";
import { ExternalLink, FileText, Globe, Map, Monitor, Zap } from "lucide-react";
import WebsiteStatisticsPanel from "./WebsiteStatisticsPanel";
import DeviceAppearanceSection from "./seo/DeviceAppearanceSection";
import QueryPageMatrixSection from "./seo/QueryPageMatrixSection";
import SitemapHealthSection from "./seo/SitemapHealthSection";
import SeoOpportunitiesSection from "./seo/SeoOpportunitiesSection";
import TabRail from "./ui-shared/TabRail";

function siteHost(url) {
  if (!url) return "";
  try {
    const u = url.startsWith("http") || url.startsWith("sc-domain:") ? url : `https://${url}`;
    if (u.startsWith("sc-domain:")) return u.replace("sc-domain:", "").trim();
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return String(url).replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || "";
  }
}

/**
 * Five heavy Search Console panels used to stack on one page — every one of
 * them fetching on load, and the last one a long scroll away. They're tabs now:
 * only the visible panel mounts, so the page opens fast and you can reach
 * "SEO opportunities" in one click.
 */
const VIEWS = [
  {
    id: "performance",
    label: "Performance",
    icon: Globe,
    title: "Performance overview",
    description: "Clicks, impressions, CTR and position trends, plus top queries, pages and countries.",
    render: (site) => <WebsiteStatisticsPanel selectedSite={site} embedded />,
  },
  {
    id: "devices",
    label: "Devices",
    icon: Monitor,
    title: "Device & search appearance",
    description: "Traffic split by device, and which search result formats actually drive clicks.",
    render: (site) => <DeviceAppearanceSection selectedSite={site} embedded />,
  },
  {
    id: "query-page",
    label: "Query × Page",
    icon: Map,
    title: "Query × page",
    description: "Which keywords drive which landing pages.",
    render: (site) => <QueryPageMatrixSection selectedSite={site} embedded />,
  },
  {
    id: "sitemaps",
    label: "Sitemaps",
    icon: FileText,
    title: "Sitemap health",
    description: "Monitor, submit and resubmit the sitemaps registered in Search Console.",
    render: (site) => <SitemapHealthSection selectedSite={site} embedded />,
  },
  {
    id: "opportunities",
    label: "Opportunities",
    icon: Zap,
    title: "SEO opportunities",
    description:
      "Weekly task queue with step-by-step guides: striking distance, cannibalisation, decay and more.",
    render: (site) => <SeoOpportunitiesSection selectedSite={site} embedded />,
  },
];

export default function SearchConsoleSection({ selectedSite = "" }) {
  const [view, setView] = useState("performance");
  const active = VIEWS.find((v) => v.id === view) || VIEWS[0];

  const host = siteHost(selectedSite);
  const siteHref =
    selectedSite &&
    (String(selectedSite).startsWith("http") || String(selectedSite).startsWith("sc-domain:"))
      ? selectedSite.startsWith("sc-domain:")
        ? `https://${host}`
        : selectedSite
      : host
        ? `https://${host}`
        : "";

  return (
    <div className="min-h-[calc(100vh-3.5rem)] space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-[var(--cw-hairline)] pb-4">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="font-heading text-lg font-semibold tracking-tight text-[var(--cw-ink)]">
            Website Statistics
          </h1>
          {siteHref ? (
            <a
              href={siteHref}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-smooth inline-flex items-center gap-1 truncate font-mono text-[11px] text-[var(--cw-ink-faint)] hover:text-[var(--cw-info)]"
            >
              {host || siteHref}
              <ExternalLink className="size-3 shrink-0" aria-hidden />
            </a>
          ) : null}
        </div>
        <TabRail
          size="sm"
          tabs={VIEWS.map((v) => ({ id: v.id, label: v.label, icon: v.icon }))}
          value={view}
          onChange={setView}
          ariaLabel="Search Console views"
        />
      </header>

      <section key={active.id} className="animate-section-enter">
        <p className="mb-3 text-xs text-[var(--cw-ink-muted)]">{active.description}</p>
        {active.render(selectedSite)}
      </section>
    </div>
  );
}
