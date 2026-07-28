"use client";

import { ExternalLink, FileText, Globe, Map, Monitor, Zap } from "lucide-react";
import WebsiteStatisticsPanel from "./WebsiteStatisticsPanel";
import DeviceAppearanceSection from "./seo/DeviceAppearanceSection";
import QueryPageMatrixSection from "./seo/QueryPageMatrixSection";
import SitemapHealthSection from "./seo/SitemapHealthSection";
import SeoOpportunitiesSection from "./seo/SeoOpportunitiesSection";

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

function SectionBlock({ id, icon: Icon, title, description, children }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-5 border-b border-gray-100 pb-4">
        <div className="flex items-start gap-3">
          {Icon ? <Icon className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden /> : null}
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            {description ? <p className="mt-1 text-sm text-gray-500">{description}</p> : null}
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-4 sm:p-5">{children}</div>
    </section>
  );
}

export default function SearchConsoleSection({ selectedSite = "" }) {
  const host = siteHost(selectedSite);
  const siteHref =
    selectedSite && (String(selectedSite).startsWith("http") || String(selectedSite).startsWith("sc-domain:"))
      ? selectedSite.startsWith("sc-domain:")
        ? `https://${host}`
        : selectedSite
      : host
        ? `https://${host}`
        : "";

  return (
    <div className="min-h-[calc(100vh-2rem)] space-y-8 rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
      <header className="relative overflow-hidden rounded-2xl border border-gray-100 bg-gradient-to-br from-slate-900 via-slate-800 to-sky-950 p-6 text-white shadow-[0_8px_32px_rgba(0,0,0,0.12)] sm:p-8">
        <div className="absolute -right-16 -top-16 size-64 rounded-full bg-sky-500/10 blur-3xl" aria-hidden />
        <div className="relative min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300/90">Search Console</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Website Statistics</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-300">
            Performance, devices, query-page mapping, sitemaps, and actionable SEO opportunities — all from Google
            Search Console in one place.
          </p>
          {siteHref ? (
            <a
              href={siteHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-300 hover:text-sky-200"
            >
              {host || siteHref}
              <ExternalLink className="size-3.5 shrink-0" aria-hidden />
            </a>
          ) : null}
        </div>
      </header>

      <SectionBlock
        id="performance"
        icon={Globe}
        title="Performance overview"
        description="Clicks, impressions, CTR, position trends, top queries, pages, and countries."
      >
        <WebsiteStatisticsPanel selectedSite={selectedSite} embedded />
      </SectionBlock>

      <SectionBlock
        id="device-appearance"
        icon={Monitor}
        title="Device & search appearance"
        description="Traffic split by device and which search result formats drive clicks."
      >
        <DeviceAppearanceSection selectedSite={selectedSite} embedded />
      </SectionBlock>

      <SectionBlock
        id="query-page"
        icon={Map}
        title="Query × page"
        description="Which keywords drive which landing pages."
      >
        <QueryPageMatrixSection selectedSite={selectedSite} embedded />
      </SectionBlock>

      <SectionBlock
        id="sitemap-health"
        icon={FileText}
        title="Sitemap health"
        description="Monitor, submit, and resubmit sitemaps registered in Search Console."
      >
        <SitemapHealthSection selectedSite={selectedSite} embedded />
      </SectionBlock>

      <SectionBlock
        id="seo-opportunities"
        icon={Zap}
        title="SEO opportunities"
        description="Weekly task queue with step-by-step guides: striking distance, cannibalization, decay, and more."
      >
        <SeoOpportunitiesSection selectedSite={selectedSite} embedded />
      </SectionBlock>
    </div>
  );
}
