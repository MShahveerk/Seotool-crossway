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
    <div className="min-h-[calc(100vh-2rem)] space-y-6 rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-5 sm:p-6">
      <header className="cw-grid relative overflow-hidden rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-canvas)] p-6 sm:p-8">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_75%_at_6%_0%,rgba(56,225,255,0.10),transparent_62%),radial-gradient(ellipse_45%_60%_at_96%_8%,rgba(14,255,42,0.07),transparent_62%)]"
          aria-hidden
        />
        <div className="relative min-w-0">
          <p className="text-[10px] font-bold tracking-[0.18em] text-[var(--cw-info)] uppercase">
            Search Console
          </p>
          <h1 className="font-heading mt-2 text-2xl font-semibold tracking-tight text-balance text-[var(--cw-ink)] sm:text-[32px]">
            Website Statistics
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--cw-ink-muted)]">
            Performance, devices, query-page mapping, sitemaps and actionable opportunities — all
            straight from Google Search Console.
          </p>
          {siteHref ? (
            <a
              href={siteHref}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-smooth mt-4 inline-flex items-center gap-1.5 font-mono text-[13px] text-[var(--cw-info)] hover:text-[var(--cw-ink)]"
            >
              {host || siteHref}
              <ExternalLink className="size-3.5 shrink-0" aria-hidden />
            </a>
          ) : null}
        </div>
      </header>

      <TabRail
        tabs={VIEWS.map((v) => ({ id: v.id, label: v.label, icon: v.icon }))}
        value={view}
        onChange={setView}
        ariaLabel="Search Console views"
      />

      <section key={active.id} className="animate-section-enter scroll-mt-24">
        <div className="mb-5 border-b border-[var(--cw-hairline)] pb-4">
          <div className="flex items-start gap-3">
            <active.icon className="mt-0.5 size-5 shrink-0 text-[var(--cw-neon)]" aria-hidden />
            <div className="min-w-0">
              <h2 className="font-heading text-lg font-semibold text-[var(--cw-ink)]">
                {active.title}
              </h2>
              <p className="mt-1 text-sm text-[var(--cw-ink-muted)]">{active.description}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-canvas)] p-4 sm:p-5">
          {active.render(selectedSite)}
        </div>
      </section>
    </div>
  );
}
