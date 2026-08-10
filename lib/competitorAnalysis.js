import { fetchDomainCompetitors } from "./seranking/api.js";

/**
 * Fetch live organic ranking competitors via SE Ranking API or Google Search API (NO DataForSEO)
 */
export async function fetchSERPCompetitors(keyword, siteUrl) {
  const cleanSite = String(siteUrl || "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];

  // 1. SE Ranking API Domain Competitors Discovery
  if (cleanSite) {
    try {
      const compData = await fetchDomainCompetitors(siteUrl, cleanSite).catch(() => null);
      const items = compData?.data?.competitors || compData?.data || [];
      if (Array.isArray(items) && items.length > 0) {
        return items.slice(0, 6).map((item, idx) => {
          const domainStr = typeof item === "string" ? item : item.domain || item.host || item.url;
          const fullUrl = String(domainStr).startsWith("http") ? domainStr : `https://${domainStr}`;
          return {
            url: fullUrl,
            domain: domainStr,
            rank: idx + 1,
          };
        });
      }
    } catch {
      // Fallback
    }
  }

  // 2. Google Custom Search API if configured
  const cleanQuery = String(keyword || "").trim();
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY || process.env.PAGESPEED_API_KEY || "";
  const cx = process.env.GOOGLE_SEARCH_CX || "";
  if (cleanQuery && apiKey && cx) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(cleanQuery)}`
      );
      if (res.ok) {
        const data = await res.json();
        const items = data.items || [];
        if (items.length > 0) {
          return items.slice(0, 6).map((item, idx) => ({
            url: item.link,
            title: item.title,
            snippet: item.snippet,
            rank: idx + 1,
          }));
        }
      }
    } catch {
      // Fallback
    }
  }

  return [];
}

/**
 * Helper to attempt fetching HTML with redirect following and Googlebot/Browser header fallbacks
 */
async function fetchHtmlWithFallbacks(originalUrl) {
  let urlObj;
  try {
    urlObj = new URL(originalUrl.startsWith("http") ? originalUrl : `https://${originalUrl}`);
  } catch {
    return { html: "", finalUrl: originalUrl };
  }

  const hostname = urlObj.hostname.replace(/^www\./, "");
  const pathAndQuery = urlObj.pathname + urlObj.search + urlObj.hash;

  // Candidate URLs
  const candidates = [
    urlObj.href,
    `https://www.${hostname}${pathAndQuery}`,
    `https://${hostname}${pathAndQuery}`,
    `http://www.${hostname}${pathAndQuery}`,
    `http://${hostname}${pathAndQuery}`,
  ];
  const uniqueCandidates = [...new Set(candidates)];

  // User-Agent options to bypass 403 blocks (Googlebot first since site firewalls allow Googlebot)
  const userAgentHeaders = [
    {
      "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  ];

  for (const candidate of uniqueCandidates) {
    for (const headers of userAgentHeaders) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 9000);

        const res = await fetch(candidate, {
          signal: controller.signal,
          redirect: "follow",
          headers,
        });

        clearTimeout(timeoutId);

        if (res.ok) {
          const html = await res.text();
          if (html && html.trim().length > 100 && !html.includes("403 - Forbidden")) {
            return { html, finalUrl: candidate };
          }
        }
      } catch {
        // Try next candidate / header
      }
    }
  }

  return { html: "", finalUrl: originalUrl };
}

/**
 * Fetch and extract on-page HTML details from a competitor or user URL
 */
export async function fetchCompetitorHtmlDetails(targetUrl) {
  try {
    const { html } = await fetchHtmlWithFallbacks(targetUrl);

    if (!html || !html.trim()) {
      return {
        url: targetUrl,
        error: "Failed to fetch HTML content",
        wordCount: 0,
        headings: [],
        schemas: [],
      };
    }

    // 1. Title Tag
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/&amp;/g, "&").replace(/&#38;/g, "&").trim() : "";

    // 2. Meta Description
    const metaDescMatch =
      html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
    const metaDescription = metaDescMatch ? metaDescMatch[1].replace(/&amp;/g, "&").trim() : "";

    // 3. Extract Headings (H1, H2, H3)
    const headings = [];
    const headingRegex = /<(h[1-3])[^>]*>([\s\S]*?)<\/\1>/gi;
    let match;
    while ((match = headingRegex.exec(html)) !== null) {
      const tag = match[1].toLowerCase();
      const text = match[2]
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&#8211;/g, "-")
        .replace(/&#8217;/g, "'")
        .trim();
      if (text) {
        headings.push({ tag, text });
      }
    }

    // 4. Word Count Estimation (Strip scripts, styles, noscript)
    const cleanText = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const words = cleanText ? cleanText.split(" ").filter((w) => w.length > 1) : [];
    const wordCount = words.length;

    // 5. Schema.org Microdata Detection
    const schemas = [];
    const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let jsonLdMatch;
    while ((jsonLdMatch = jsonLdRegex.exec(html)) !== null) {
      try {
        const parsed = JSON.parse(jsonLdMatch[1]);
        if (parsed["@type"]) {
          const types = Array.isArray(parsed["@type"]) ? parsed["@type"] : [parsed["@type"]];
          schemas.push(...types);
        } else if (Array.isArray(parsed)) {
          parsed.forEach((item) => item["@type"] && schemas.push(item["@type"]));
        } else if (parsed["@graph"] && Array.isArray(parsed["@graph"])) {
          parsed["@graph"].forEach((item) => item["@type"] && schemas.push(item["@type"]));
        }
      } catch {
        // Ignore invalid JSON-LD
      }
    }

    // Also check itemType microdata
    const itemTypeRegex = /itemtype=["']https?:\/\/schema\.org\/([^"']+)["']/gi;
    let itemTypeMatch;
    while ((itemTypeMatch = itemTypeRegex.exec(html)) !== null) {
      schemas.push(itemTypeMatch[1]);
    }

    // 6. Image Alt Tag Ratio
    const imgMatches = html.match(/<img[^>]+>/gi) || [];
    const totalImages = imgMatches.length;
    const imagesWithAlt = imgMatches.filter((img) => /alt=["']([^"']+)["']/i.test(img)).length;

    return {
      url: targetUrl,
      title,
      metaDescription,
      wordCount,
      readingTimeMinutes: Math.ceil(wordCount / 200) || 1,
      headings,
      h1Count: headings.filter((h) => h.tag === "h1").length,
      h2Count: headings.filter((h) => h.tag === "h2").length,
      h3Count: headings.filter((h) => h.tag === "h3").length,
      schemas: [...new Set(schemas.filter(Boolean))],
      totalImages,
      imagesWithAlt,
    };
  } catch (err) {
    return {
      url: targetUrl,
      error: err.message || "Failed to fetch HTML",
      wordCount: 0,
      headings: [],
      schemas: [],
    };
  }
}

/**
 * Fetch Free Google PageSpeed Insights Performance Metrics for a URL
 */
export async function fetchCompetitorPageSpeed(targetUrl) {
  try {
    let cleanUrl = targetUrl;
    if (!cleanUrl.startsWith("http")) cleanUrl = `https://${cleanUrl}`;

    const apiKey = process.env.PAGESPEED_API_KEY || "";
    const params = new URLSearchParams({
      url: cleanUrl,
      category: "performance",
      strategy: "mobile",
    });
    if (apiKey) params.append("key", apiKey);

    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`;
    const res = await fetch(apiUrl);
    if (!res.ok) return null;

    const data = await res.json();
    const lighthouse = data.lighthouseResult || {};
    const score = Math.round((lighthouse.categories?.performance?.score || 0) * 100);
    const audits = lighthouse.audits || {};

    return {
      score,
      lcp: audits["largest-contentful-paint"]?.displayValue || null,
      cls: audits["cumulative-layout-shift"]?.displayValue || null,
      ttfb: audits["server-response-time"]?.displayValue || null,
      totalByteWeight: audits["total-byte-weight"]?.displayValue || null,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch Open PageRank Authority for a domain
 */
export async function fetchDomainAuthority(domain) {
  try {
    const cleanDomain = String(domain)
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0];

    const apiKey = process.env.OPEN_PAGERANK_API_KEY || "";
    if (!apiKey) {
      return { domain: cleanDomain, pageRank: 0, rank: "N/A" };
    }

    const res = await fetch(`https://openpagerank.com/api/v1.0/getPageRank?domains[]=${cleanDomain}`, {
      headers: { "API-OPR": apiKey },
    });

    if (!res.ok) return { domain: cleanDomain, pageRank: 0, rank: "N/A" };

    const data = await res.json();
    const result = data.response?.[0] || {};
    return {
      domain: cleanDomain,
      pageRank: Number(result.page_rank_decimal || 0).toFixed(1),
      rank: result.rank || "N/A",
    };
  } catch {
    return { domain: String(domain), pageRank: 0, rank: "N/A" };
  }
}

function formatNum(n) {
  return new Intl.NumberFormat("en-US").format(Math.round(Number(n) || 0));
}

/**
 * Build Full Empirical Competitor Intelligence Matrix
 */
export async function buildCompetitorMatrix(siteUrl, keyword, competitorUrls = []) {
  const cleanSite = String(siteUrl || "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];

  let listToAudit = Array.isArray(competitorUrls) && competitorUrls.length > 0 ? competitorUrls : [];

  // 1. SE Ranking API / Google Search API Competitor Discovery (NO DataForSEO)
  if (!listToAudit.length) {
    const discovered = await fetchSERPCompetitors(keyword, siteUrl);
    if (discovered.length > 0) {
      listToAudit = discovered;
    }
  }

  // 2. ALWAYS INCLUDE OUR SITE in the audit list for side-by-side benchmarking!
  if (cleanSite && !listToAudit.some((i) => (typeof i === "string" ? i : i.url).includes(cleanSite))) {
    const siteFullUrl = siteUrl.startsWith("http") ? siteUrl : `https://${cleanSite}`;
    listToAudit.unshift({ url: siteFullUrl, rank: 0, title: `Your Site (${cleanSite})` });
  }

  // 3. Audit all competitor URLs + Our Site in parallel
  const urlsToAudit = listToAudit.slice(0, 7);
  const auditPromises = urlsToAudit.map(async (item, index) => {
    const url = typeof item === "string" ? item : item.url;
    const rank = item.rank != null ? item.rank : index + 1;
    let domain = "competitor";
    try {
      domain = new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
    } catch {
      domain = url;
    }

    const [htmlDetails, speedDetails, authority] = await Promise.all([
      fetchCompetitorHtmlDetails(url),
      fetchCompetitorPageSpeed(url),
      fetchDomainAuthority(domain),
    ]);

    const isYourSite = Boolean(
      cleanSite && (domain.includes(cleanSite) || cleanSite.includes(domain))
    );

    return {
      rank,
      url,
      domain,
      title: htmlDetails.title || item.title || domain,
      metaDescription: htmlDetails.metaDescription || item.snippet || "",
      wordCount: htmlDetails.wordCount || 0,
      readingTimeMinutes: htmlDetails.readingTimeMinutes || 1,
      headings: htmlDetails.headings || [],
      h1Count: htmlDetails.h1Count || 0,
      h2Count: htmlDetails.h2Count || 0,
      h3Count: htmlDetails.h3Count || 0,
      schemas: htmlDetails.schemas || [],
      totalImages: htmlDetails.totalImages || 0,
      imagesWithAlt: htmlDetails.imagesWithAlt || 0,
      speed: speedDetails,
      authority,
      isYourSite,
    };
  });

  const competitorResults = await Promise.all(auditPromises);

  // 4. Separate Our Site vs Competitors
  const yourPage = competitorResults.find((c) => c.isYourSite) || null;
  const competitorsOnly = competitorResults.filter((c) => !c.isYourSite);

  // 5. Categorize Competitors into 3 Tiers
  const topLeaders = competitorsOnly.filter((c) => c.rank <= 3 || competitorsOnly.indexOf(c) < 3);
  const closeCompetitors = competitorsOnly.filter((c) => !topLeaders.includes(c) && competitorsOnly.indexOf(c) < 5);
  const lowerPages = competitorsOnly.filter((c) => !topLeaders.includes(c) && !closeCompetitors.includes(c));

  // 6. Compute Averages & Gap Analysis for Top 3 Leaders
  const leaderWords = topLeaders.map((c) => c.wordCount).filter(Boolean);
  const avgLeaderWordCount = leaderWords.length
    ? Math.round(leaderWords.reduce((a, b) => a + b, 0) / leaderWords.length)
    : 0;

  const leaderH2Counts = topLeaders.map((c) => c.h2Count).filter((n) => n != null);
  const avgLeaderH2Count = leaderH2Counts.length
    ? Math.round(leaderH2Counts.reduce((a, b) => a + b, 0) / leaderH2Counts.length)
    : 0;

  const leaderSpeedScores = topLeaders.map((c) => c.speed?.score).filter((s) => s != null);
  const avgLeaderSpeedScore = leaderSpeedScores.length
    ? Math.round(leaderSpeedScores.reduce((a, b) => a + b, 0) / leaderSpeedScores.length)
    : 0;

  const leaderSchemas = [...new Set(topLeaders.flatMap((c) => c.schemas))];

  // 7. Build Action Checklist based on Empirical Gaps between OUR SITE and TOP 3 WINNERS
  const actionChecklist = [];

  if (yourPage && yourPage.wordCount > 0) {
    if (yourPage.wordCount < avgLeaderWordCount * 0.85) {
      actionChecklist.push({
        type: "content",
        title: "Expand Content Depth",
        description: `Add ~${formatNum(avgLeaderWordCount - yourPage.wordCount)} words to your page. Top 3 leaders average ${formatNum(avgLeaderWordCount)} words vs your ${formatNum(yourPage.wordCount)} words.`,
        priority: "HIGH",
      });
    }

    if (yourPage.h2Count < avgLeaderH2Count) {
      actionChecklist.push({
        type: "structure",
        title: "Add Additional H2 Sub-Topics",
        description: `Include ${avgLeaderH2Count - yourPage.h2Count} more H2 headings. Top 3 leaders average ${avgLeaderH2Count} H2 sub-sections.`,
        priority: "MEDIUM",
      });
    }

    const missingSchemas = leaderSchemas.filter((s) => !yourPage.schemas.includes(s));
    if (missingSchemas.length > 0) {
      actionChecklist.push({
        type: "schema",
        title: `Implement ${missingSchemas.join(", ")} Microdata`,
        description: `Top 3 leaders implement ${missingSchemas.join(", ")} JSON-LD schema on their pages. Adding structured data enhances rich snippets in Google.`,
        priority: "HIGH",
      });
    }

    if (yourPage.speed?.score != null && avgLeaderSpeedScore > 0 && yourPage.speed.score < avgLeaderSpeedScore - 10) {
      actionChecklist.push({
        type: "performance",
        title: "Improve PageSpeed & Core Web Vitals",
        description: `Your PageSpeed score (${yourPage.speed.score}) is behind the Top 3 leader average (${avgLeaderSpeedScore}). Optimize images and LCP TTFB.`,
        priority: "HIGH",
      });
    }
  } else {
    actionChecklist.push({
      type: "benchmark",
      title: "Content Depth Benchmark",
      description: `Target at least ${formatNum(avgLeaderWordCount)} words to match the content depth of Top 3 ranking leaders for "${keyword || cleanSite}".`,
      priority: "HIGH",
    });
    if (leaderSchemas.length > 0) {
      actionChecklist.push({
        type: "schema",
        title: `Target Schemas: ${leaderSchemas.join(", ")}`,
        description: `Top ranking leaders implement ${leaderSchemas.join(", ")} microdata.`,
        priority: "MEDIUM",
      });
    }
  }

  return {
    keyword: keyword || cleanSite,
    siteUrl: cleanSite,
    yourPage,
    topLeaders,
    closeCompetitors,
    lowerPages,
    summary: {
      avgLeaderWordCount,
      avgLeaderH2Count,
      avgLeaderSpeedScore,
      commonLeaderSchemas: leaderSchemas,
      competitorsAudited: competitorsOnly.length,
    },
    actionChecklist,
  };
}
