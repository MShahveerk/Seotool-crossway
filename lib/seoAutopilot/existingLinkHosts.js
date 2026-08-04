/**
 * Collect hostnames that already link to (or were already pitched for) a site,
 * so Autopilot Pitch / Foundation never re-target them.
 */
import prisma from "../prisma.js";
import { toSerankingDomain } from "../seranking/domain.js";
import { normalizeSiteOrigin } from "../validation.js";

export function normalizeHost(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "";
  try {
    const u = s.startsWith("http") ? new URL(s) : new URL(`https://${s}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return s
      .replace(/^https?:\/\//, "")
      .split("/")[0]
      .replace(/^www\./, "")
      .toLowerCase();
  }
}

/** Treat example.com and blog.example.com as the same linker family. */
export function hostsOverlap(a, b) {
  const x = normalizeHost(a);
  const y = normalizeHost(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
}

export function isExistingLinker(targetUrlOrHost, existingHosts) {
  const host = normalizeHost(targetUrlOrHost);
  if (!host) return false;
  for (const h of existingHosts) {
    if (hostsOverlap(host, h)) return true;
  }
  return false;
}

async function hostsFromSiteExplorer(siteLink) {
  const domain = toSerankingDomain(siteLink);
  if (!domain) return [];
  try {
    const row = await prisma.siteExplorerSnapshot.findFirst({
      where: { domain, status: "success" },
      orderBy: { fetchedDate: "desc" },
    });
    const referring = row?.payload?.referring;
    if (!Array.isArray(referring)) return [];
    return referring
      .map((r) => normalizeHost(r?.host || r?.domain || r?.sampleUrl || r))
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function hostsFromExistingPitches(siteLink) {
  const link = String(siteLink || "").trim();
  if (!link) return [];
  try {
    const rows = await prisma.seoAutopilotPitch.findMany({
      where: { siteLink: link },
      select: { targetUrl: true, targetName: true },
      take: 500,
      orderBy: { createdAt: "desc" },
    });
    const out = [];
    for (const r of rows) {
      const h = normalizeHost(r.targetUrl);
      if (h) out.push(h);
    }
    return out;
  } catch {
    return [];
  }
}

async function hostsFromSerankingRefdomains(siteLink) {
  try {
    const { isSerankingConfigured } = await import("../seranking/config.js");
    if (!isSerankingConfigured()) return [];
    const { loadReferringDomains } = await import("../seranking/loadBundle.js");
    const result = await loadReferringDomains(siteLink, { allowManual: true, limit: 100 });
    return Array.isArray(result?.hosts) ? result.hosts : [];
  } catch {
    return [];
  }
}

/**
 * @returns {{ hosts: string[], sources: { siteExplorer: number, pitches: number, seranking: number } }}
 */
export async function collectExistingLinkHosts(siteLink) {
  const site = normalizeSiteOrigin(siteLink) || String(siteLink || "").trim();
  const [fromExplorer, fromPitches, fromSeranking] = await Promise.all([
    hostsFromSiteExplorer(site),
    hostsFromExistingPitches(site),
    hostsFromSerankingRefdomains(site),
  ]);

  const set = new Set();
  for (const h of [...fromExplorer, ...fromPitches, ...fromSeranking]) {
    const n = normalizeHost(h);
    if (n) set.add(n);
  }

  // Never treat the site itself as an external linker to pitch.
  const self = toSerankingDomain(site);
  if (self) set.add(self);

  return {
    hosts: [...set],
    sources: {
      siteExplorer: fromExplorer.length,
      pitches: fromPitches.length,
      seranking: fromSeranking.length,
    },
  };
}

export function filterNewOutreachTargets(items, existingHosts, urlKey = "url") {
  const kept = [];
  const skipped = [];
  for (const item of items || []) {
    const url = item?.[urlKey] || item?.targetUrl || item?.url || "";
    if (isExistingLinker(url, existingHosts)) {
      skipped.push(item);
    } else {
      kept.push(item);
    }
  }
  return { kept, skipped };
}
