/**
 * Targeted reads of the selected project's own pages.
 * Not a crawl — homepage plus a handful of about/services URLs, using the same
 * on-page scan the SERP tool already uses for competitor URLs.
 */
import { scanOnPage } from "../serpAnalysis.js";
import { normalizeSiteOrigin } from "../validation.js";

const PATH_GUESSES = [
  "/",
  "/about",
  "/about-us",
  "/about-us/",
  "/services",
  "/our-services",
  "/what-we-do",
  "/solutions",
];

const SERVICEISH = /\b(service|services|solution|solutions|product|products|what-we-do|offerings|industries|practice)\b/i;

function originOf(siteLink) {
  const raw = String(siteLink || "").trim();
  if (raw.startsWith("sc-domain:")) return `https://${raw.slice("sc-domain:".length)}`;
  return normalizeSiteOrigin(raw) || (raw.startsWith("http") ? raw.replace(/\/+$/, "") : `https://${raw}`);
}

function sameHost(href, origin) {
  try {
    const a = new URL(href, origin);
    const b = new URL(origin);
    return a.hostname.replace(/^www\./, "") === b.hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
}

async function fetchHtml(url) {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(t);
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
}

function extractInternalHrefs(html, origin) {
  const hrefs = [];
  const re = /<a[^>]+href=["']([^"'#]+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1];
    if (!raw || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("javascript:")) continue;
    try {
      const abs = new URL(raw, origin).href;
      if (sameHost(abs, origin)) hrefs.push(abs.split("#")[0]);
    } catch {
      /* skip */
    }
  }
  return [...new Set(hrefs)];
}

export async function loadOwnSitePages(siteLink, { maxPages = 8 } = {}) {
  const origin = originOf(siteLink);
  if (!origin) return { origin: "", pages: [], errors: ["No website URL."] };

  const guessed = PATH_GUESSES.map((p) => new URL(p, origin).href);
  const homeHtml = await fetchHtml(origin);
  const nav = homeHtml ? extractInternalHrefs(homeHtml, origin).filter((u) => SERVICEISH.test(u)) : [];
  const queue = [...new Set([...guessed, ...nav])].slice(0, maxPages + 4);

  const pages = [];
  const seen = new Set();
  for (const url of queue) {
    const key = url.replace(/\/+$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const scan = await scanOnPage(url);
      if (!scan?.ok) continue;
      pages.push({
        url,
        title: scan.title || "",
        metaDescription: scan.metaDescription || "",
        headings: (scan.headings || []).slice(0, 20),
        paragraphs: (scan.paragraphs || []).slice(0, 6),
        schemas: scan.schemas || [],
        wordCount: scan.wordCount || 0,
      });
    } catch {
      /* skip failed page */
    }
    if (pages.length >= maxPages) break;
  }

  return { origin, pages, errors: pages.length ? [] : ["Could not fetch any site pages."] };
}

export function pagesBriefForLlm(pack, max = 14000) {
  const lines = (pack.pages || []).map((p) => {
    const h = (p.headings || []).map((x) => `${x.tag}: ${x.text}`).join(" | ");
    const paras = (p.paragraphs || []).join(" ");
    return [
      `URL: ${p.url}`,
      p.title ? `Title: ${p.title}` : null,
      p.metaDescription ? `Meta: ${p.metaDescription}` : null,
      p.schemas?.length ? `Schema: ${p.schemas.join(", ")}` : null,
      h ? `Headings: ${h}` : null,
      paras ? `Copy: ${paras.slice(0, 900)}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  });
  const blob = lines.join("\n\n");
  return blob.length > max ? `${blob.slice(0, max)}…` : blob;
}
