/**
 * Global cron job toggles (AppSetting) + catalog for Admin → User Management.
 *
 * Enablement: DB false wins → off; DB true → on; DB null → defaultEnabled
 * (or envFallback when set).
 */
import prisma from "./prisma.js";
import {
  getSeoDigestEnabled,
  setSeoDigestEnabled,
  ENABLED_KEY as SEO_DIGEST_KEY,
} from "./seoDigestSettings.js";
import {
  getClientReportsEnabled,
  setClientReportsEnabled,
  ENABLED_KEY as CLIENT_REPORTS_KEY,
} from "./clientReportSettings.js";

function envFlag(name) {
  const v = String(process.env[name] || "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function settingKeyFor(id) {
  return `cron_${String(id || "").trim()}_enabled`;
}

/**
 * @typedef {object} CronJobDef
 * @property {string} id
 * @property {string} label
 * @property {string} schedule
 * @property {string} when
 * @property {string} description
 * @property {"ops"|"publish"|"seo"|"ingest"|"reports"} group
 * @property {boolean} defaultEnabled - when AppSetting is unset
 * @property {string|null} [envFallback] - env flag name used when DB unset
 * @property {string|null} [legacySettingKey] - reuse existing AppSetting key
 * @property {{ type: "per-site", section: string, sectionLabel: string, note: string }|null} [dependency]
 */

/** @type {CronJobDef[]} */
export const CRON_JOB_CATALOG = [
  {
    id: "keep-alive",
    label: "Keep-alive ping",
    schedule: "*/14 * * * *",
    when: "Every 14 minutes",
    description: "Pings NEXTAUTH_URL so free-tier hosts (e.g. Render) stay awake.",
    group: "ops",
    defaultEnabled: true,
    envFallback: null,
    dependency: null,
  },
  {
    id: "post-publish",
    label: "SMM post publisher",
    schedule: "* * * * *",
    when: "Every minute",
    description: "Publishes approved social posts whose schedule is due.",
    group: "publish",
    defaultEnabled: true,
    envFallback: null,
    dependency: null,
  },
  {
    id: "blog-publish",
    label: "Blog publisher",
    schedule: "* * * * *",
    when: "Every minute",
    description: "Publishes approved blogs whose schedule is due.",
    group: "publish",
    defaultEnabled: true,
    envFallback: null,
    dependency: null,
  },
  {
    id: "blog-automation",
    label: "Blog automation / Studio",
    schedule: "* * * * *",
    when: "Every minute",
    description: "Runs Blog Studio / n8n automation for sites that opted in.",
    group: "publish",
    defaultEnabled: true,
    envFallback: null,
    dependency: {
      type: "per-site",
      section: "blog-automation",
      sectionLabel: "Blog Automation",
      note: "Also requires per-site Auto-run (Blog Automation). Global off stops all sites.",
    },
  },
  {
    id: "post-automation",
    label: "Post Studio automation",
    schedule: "* * * * *",
    when: "Every minute",
    description: "Runs Post Studio automation for sites that opted in.",
    group: "publish",
    defaultEnabled: true,
    envFallback: null,
    dependency: {
      type: "per-site",
      section: "post-automation",
      sectionLabel: "Post Automation",
      note: "Also requires per-site Auto-run (Post Automation). Global off stops all sites.",
    },
  },
  {
    id: "seo-autopilot",
    label: "SEO Autopilot",
    schedule: "* * * * *",
    when: "Every minute",
    description: "Runs SEO Autopilot agents for sites that opted in.",
    group: "seo",
    defaultEnabled: true,
    envFallback: null,
    dependency: {
      type: "per-site",
      section: "seo-autopilot",
      sectionLabel: "SEO Autopilot",
      note: "Also requires per-site schedule enable inside SEO Autopilot.",
    },
  },
  {
    id: "content-autoschedule",
    label: "Content autoscheduler",
    schedule: "* * * * *",
    when: "Every minute",
    description: "Fills blank weekday slots for posts/blogs when autoschedule is on.",
    group: "publish",
    defaultEnabled: true,
    envFallback: null,
    dependency: {
      type: "per-site",
      section: "blog-autoschedule",
      sectionLabel: "Blog / Post Autoschedule",
      note: "Per-site enable lives under Blog Autoschedule and Post Autoschedule panels.",
    },
  },
  {
    id: "wordpress-pull",
    label: "WordPress draft pull",
    schedule: "0 * * * *",
    when: "Hourly",
    description: "Pulls WP drafts into the blog approval queue.",
    group: "ingest",
    defaultEnabled: true,
    envFallback: null,
    dependency: {
      type: "per-site",
      section: "admin-blogs",
      sectionLabel: "Admin Blogs → WordPress pull",
      note: "Per-site WordPress pull toggle in Admin Blogs publish config.",
    },
  },
  {
    id: "meta-pull",
    label: "Meta draft pull",
    schedule: "15 * * * *",
    when: "Hourly (:15)",
    description: "Pulls scheduled Meta drafts into the post approval queue.",
    group: "ingest",
    defaultEnabled: true,
    envFallback: null,
    dependency: {
      type: "per-site",
      section: "admin-approvals",
      sectionLabel: "Create Post / Post publish config",
      note: "Per-site Meta pull toggle in post publish settings.",
    },
  },
  {
    id: "email-inbound",
    label: "Email inbound pull",
    schedule: "*/10 * * * *",
    when: "Every 10 minutes",
    description: "Polls configured mailboxes for inbound post/blog drafts.",
    group: "ingest",
    defaultEnabled: true,
    envFallback: null,
    dependency: {
      type: "per-site",
      section: "admin-approvals",
      sectionLabel: "Email inbound config",
      note: "Per-site email inbound toggles on post/blog publish config.",
    },
  },
  {
    id: "email-promote",
    label: "Promote email drafts",
    schedule: "0 9 * * *",
    when: "Daily 09:00",
    description: "Promotes the latest email inbound drafts into the approval queue.",
    group: "ingest",
    defaultEnabled: true,
    envFallback: null,
    dependency: null,
  },
  {
    id: "seo-digest",
    label: "Staff weekly digests",
    schedule: "0 6 * * 1",
    when: "Mondays 06:00",
    description: "Emails staff landscape digests (also controlled in SEO Digest panel).",
    group: "reports",
    defaultEnabled: false,
    envFallback: "SEO_DIGEST_EMAIL",
    legacySettingKey: SEO_DIGEST_KEY,
    dependency: {
      type: "admin-panel",
      section: null,
      sectionLabel: "SEO Digest settings (above)",
      note: "Global toggle + recipients also live in the SEO Digest panel. Per-user weeklyDigestEnabled still applies.",
    },
  },
  {
    id: "sitemap-resubmit",
    label: "Weekly sitemap resubmit",
    schedule: "0 6 * * 1",
    when: "Mondays 06:00",
    description: "Resubmits known GSC sitemaps for every website.",
    group: "seo",
    defaultEnabled: false,
    envFallback: "SEO_AUTO_SUBMIT_SITEMAPS",
    dependency: null,
  },
  {
    id: "client-reports",
    label: "Monthly client reports",
    schedule: "0 7 * * 1",
    when: "Mondays 07:00",
    description: "Emails monthly report decks (also controlled in Monthly reports panel).",
    group: "reports",
    defaultEnabled: false,
    envFallback: "CLIENT_REPORTS_EMAIL",
    legacySettingKey: CLIENT_REPORTS_KEY,
    dependency: {
      type: "admin-panel",
      section: null,
      sectionLabel: "Monthly reports panel (above)",
      note: "Global toggle also lives in Monthly reports. Per-user receive* prefs still apply.",
    },
  },
  {
    id: "pagespeed",
    label: "PageSpeed snapshots",
    schedule: "10 */2 * * *",
    when: "Every 2 hours (:10)",
    description: "Refreshes mobile/desktop PageSpeed for known websites.",
    group: "seo",
    defaultEnabled: true,
    envFallback: null,
    dependency: null,
  },
  {
    id: "authority",
    label: "Domain authority refresh",
    schedule: "30 4 * * *",
    when: "Daily 04:30",
    description: "Refreshes Open PageRank authority scores.",
    group: "seo",
    defaultEnabled: true,
    envFallback: null,
    dependency: null,
  },
  {
    id: "seranking",
    label: "Organic SEO snapshots",
    schedule: "45 4 * * *",
    when: "Daily 04:45",
    description: "Cached organic SEO refresh within the daily credit budget.",
    group: "seo",
    defaultEnabled: true,
    envFallback: null,
    dependency: null,
  },
  {
    id: "site-explorer",
    label: "Common Crawl site explorer",
    schedule: "0 5 * * 1",
    when: "Mondays 05:00",
    description: "Weekly Common Crawl explorer refresh (7-day cache).",
    group: "seo",
    defaultEnabled: true,
    envFallback: null,
    dependency: null,
  },
  {
    id: "seranking-explorer",
    label: "Organic site explorer",
    schedule: "30 5 * * 1",
    when: "Mondays 05:30",
    description: "Weekly organic explorer refresh within credit caps.",
    group: "seo",
    defaultEnabled: true,
    envFallback: null,
    dependency: null,
  },
  {
    id: "url-inspect",
    label: "Daily URL inspection",
    schedule: "0 5 * * *",
    when: "Daily 05:00",
    description: "GSC URL Inspection monitor for sitemap + top pages.",
    group: "seo",
    defaultEnabled: false,
    envFallback: "SEO_URL_INSPECT_DAILY",
    dependency: null,
  },
  {
    id: "keyword-planner",
    label: "Keyword Planner cache",
    schedule: "30 6 * * 1",
    when: "Mondays 06:30",
    description: "Weekly Google Ads Keyword Planner enrichment.",
    group: "seo",
    defaultEnabled: true,
    envFallback: null,
    dependency: null,
  },
];

export const CRON_GROUP_LABELS = {
  ops: "Ops",
  publish: "Publishing & automation",
  ingest: "Inbound pulls",
  reports: "Reports & digests",
  seo: "SEO data jobs",
};

function parseBoolSetting(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return null;
}

export function getCronJobDef(id) {
  return CRON_JOB_CATALOG.find((j) => j.id === id) || null;
}

export async function getCronJobDbEnabled(id) {
  const def = getCronJobDef(id);
  if (!def) return null;
  try {
    if (def.legacySettingKey === SEO_DIGEST_KEY) return getSeoDigestEnabled();
    if (def.legacySettingKey === CLIENT_REPORTS_KEY) return getClientReportsEnabled();
    const row = await prisma.appSetting.findUnique({ where: { key: settingKeyFor(id) } });
    if (!row) return null;
    return parseBoolSetting(row.value);
  } catch {
    return null;
  }
}

export async function setCronJobEnabled(id, enabled) {
  const def = getCronJobDef(id);
  if (!def) {
    const err = new Error(`Unknown cron job: ${id}`);
    err.status = 400;
    throw err;
  }
  if (def.legacySettingKey === SEO_DIGEST_KEY) {
    return setSeoDigestEnabled(Boolean(enabled));
  }
  if (def.legacySettingKey === CLIENT_REPORTS_KEY) {
    return setClientReportsEnabled(Boolean(enabled));
  }
  const value = enabled ? "true" : "false";
  await prisma.appSetting.upsert({
    where: { key: settingKeyFor(id) },
    create: { key: settingKeyFor(id), value },
    update: { value },
  });
  return Boolean(enabled);
}

/** Effective on/off used by cron runners. */
export async function isCronJobEnabled(id) {
  const def = getCronJobDef(id);
  if (!def) return false;
  const db = await getCronJobDbEnabled(id);
  if (db === false) return false;
  if (db === true) return true;
  if (def.envFallback) return envFlag(def.envFallback);
  return def.defaultEnabled !== false;
}

async function dependencyStatus(def) {
  if (!def.dependency || def.dependency.type !== "per-site") {
    return null;
  }
  try {
    switch (def.id) {
      case "blog-automation": {
        const [enabled, total] = await Promise.all([
          prisma.blogAutomationSiteConfig.count({ where: { autoEnabled: true } }),
          prisma.blogAutomationSiteConfig.count(),
        ]);
        return { enabledSites: enabled, totalSites: total };
      }
      case "post-automation": {
        const [enabled, total] = await Promise.all([
          prisma.postAutomationSiteConfig.count({ where: { autoEnabled: true } }),
          prisma.postAutomationSiteConfig.count(),
        ]);
        return { enabledSites: enabled, totalSites: total };
      }
      case "seo-autopilot": {
        const [enabled, total] = await Promise.all([
          prisma.seoAutopilotSiteConfig.count({ where: { autoEnabled: true } }),
          prisma.seoAutopilotSiteConfig.count(),
        ]);
        return { enabledSites: enabled, totalSites: total };
      }
      case "content-autoschedule": {
        const [enabled, total] = await Promise.all([
          prisma.contentAutoscheduleConfig.count({ where: { enabled: true } }),
          prisma.contentAutoscheduleConfig.count(),
        ]);
        return { enabledSites: enabled, totalSites: total };
      }
      case "wordpress-pull": {
        const [enabled, total] = await Promise.all([
          prisma.sitePublishConfig.count({ where: { wordpressPullEnabled: true } }),
          prisma.sitePublishConfig.count(),
        ]);
        return { enabledSites: enabled, totalSites: total };
      }
      case "meta-pull": {
        const [enabled, total] = await Promise.all([
          prisma.sitePostConfig.count({ where: { metaPullEnabled: true } }),
          prisma.sitePostConfig.count(),
        ]);
        return { enabledSites: enabled, totalSites: total };
      }
      case "email-inbound": {
        const [blogOn, postOn, blogTotal, postTotal] = await Promise.all([
          prisma.sitePublishConfig.count({ where: { emailInboundEnabled: true } }),
          prisma.sitePostConfig.count({ where: { emailInboundEnabled: true } }),
          prisma.sitePublishConfig.count(),
          prisma.sitePostConfig.count(),
        ]);
        return {
          enabledSites: blogOn + postOn,
          totalSites: blogTotal + postTotal,
          detail: `${blogOn} blog config(s), ${postOn} post config(s)`,
        };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** Turn off all per-site switches for a dependent job (does not change global cron toggle). */
export async function disableAllSiteDependencies(id) {
  const def = getCronJobDef(id);
  if (!def?.dependency || def.dependency.type !== "per-site") {
    const err = new Error("This job has no per-site dependencies to clear.");
    err.status = 400;
    throw err;
  }
  switch (id) {
    case "blog-automation":
      return {
        updated: (
          await prisma.blogAutomationSiteConfig.updateMany({
            where: { autoEnabled: true },
            data: { autoEnabled: false },
          })
        ).count,
      };
    case "post-automation":
      return {
        updated: (
          await prisma.postAutomationSiteConfig.updateMany({
            where: { autoEnabled: true },
            data: { autoEnabled: false },
          })
        ).count,
      };
    case "seo-autopilot":
      return {
        updated: (
          await prisma.seoAutopilotSiteConfig.updateMany({
            where: { autoEnabled: true },
            data: { autoEnabled: false },
          })
        ).count,
      };
    case "content-autoschedule":
      return {
        updated: (
          await prisma.contentAutoscheduleConfig.updateMany({
            where: { enabled: true },
            data: { enabled: false },
          })
        ).count,
      };
    case "wordpress-pull":
      return {
        updated: (
          await prisma.sitePublishConfig.updateMany({
            where: { wordpressPullEnabled: true },
            data: { wordpressPullEnabled: false },
          })
        ).count,
      };
    case "meta-pull":
      return {
        updated: (
          await prisma.sitePostConfig.updateMany({
            where: { metaPullEnabled: true },
            data: { metaPullEnabled: false },
          })
        ).count,
      };
    case "email-inbound": {
      const [a, b] = await Promise.all([
        prisma.sitePublishConfig.updateMany({
          where: { emailInboundEnabled: true },
          data: { emailInboundEnabled: false },
        }),
        prisma.sitePostConfig.updateMany({
          where: { emailInboundEnabled: true },
          data: { emailInboundEnabled: false },
        }),
      ]);
      return { updated: a.count + b.count };
    }
    default: {
      const err = new Error("Unsupported dependency clear.");
      err.status = 400;
      throw err;
    }
  }
}

export async function listCronJobStatuses() {
  const jobs = [];
  for (const def of CRON_JOB_CATALOG) {
    const [dbEnabled, effectiveEnabled, dep] = await Promise.all([
      getCronJobDbEnabled(def.id),
      isCronJobEnabled(def.id),
      dependencyStatus(def),
    ]);
    jobs.push({
      id: def.id,
      label: def.label,
      schedule: def.schedule,
      when: def.when,
      description: def.description,
      group: def.group,
      groupLabel: CRON_GROUP_LABELS[def.group] || def.group,
      defaultEnabled: def.defaultEnabled,
      envFallback: def.envFallback,
      envFlagOn: def.envFallback ? envFlag(def.envFallback) : null,
      dbEnabled,
      effectiveEnabled,
      dependency: def.dependency,
      dependencyStatus: dep,
    });
  }
  return jobs;
}

export { settingKeyFor };
