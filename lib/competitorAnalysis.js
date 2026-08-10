import { fetchBacklinksSummary } from "./seranking/api.js";

/**
 * Fetch and extract on-page HTML details from a competitor URL
 */
export async function fetchCompetitorHtmlDetails(targetUrl) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return { url: targetUrl, error: `HTTP ${res.status}` };
    }

    const html = await res.text();

    // 1. Title Tag
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";

    // 2. Meta Description
    const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                          html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
    const metaDescription = metaDescMatch ? metaDescMatch[1].trim() : "";

    // 3. Extract Headings (H1, H2, H3)
    const headings = [];
    const headingRegex = /<(h[1-3])[^>]*>([\s\S]*?)<\/\1>/gi;
    let match;
    while ((match = headingRegex.exec(html)) !== null) {
      const tag = match[1].toLowerCase();
      const text = match[2].replace(/<[^>]+>/g, "").trim();
      if (text) {
        headings.push({ tag, text });
      }
    }

    // 4. Word Count Estimation (strip scripts, styles, html tags)
    const cleanText = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const words = cleanText ? cleanText.split(" ").filter(Boolean) : [];
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
        }
      } catch {
        // Ignore invalid JSON-LD
      }
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
      readingTimeMinutes: Math.ceil(wordCount / 200),
      headings,
      h1Count: headings.filter((h) => h.tag === "h1").length,
      h2Count: headings.filter((h) => h.tag === "h2").length,
      h3Count: headings.filter((h) => h.tag === "h3").length,
      schemas: [...new Set(schemas)],
      totalImages,
      imagesWithAlt,
    };
  } catch (err) {
    return {
      url: targetUrl,
      error: err.message || "Failed to fetch competitor HTML",
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
    const apiKey = process.env.PAGESPEED_API_KEY || "";
    const params = new URLSearchParams({
      url: targetUrl,
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

/**
 * Build Full Empirical Competitor Intelligence Matrix
 */
export async function buildCompetitorMatrix(siteUrl, keyword, competitorUrls = []) {
  const cleanSite = String(siteUrl || "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];

  // 1. Audit competitor URLs in parallel
  const urlsToAudit = competitorUrls.slice(0, 6);
  const auditPromises = urlsToAudit.map(async (item, index) => {
    const url = typeof item === "string" ? item : item.url;
    const rank = item.rank || index + 1;
    const domain = new URL(url).hostname.replace(/^www\./, "");

    const [htmlDetails, speedDetails, authority] = await Promise.all([
      fetchCompetitorHtmlDetails(url),
      fetchCompetitorPageSpeed(url),
      fetchDomainAuthority(domain),
    ]);

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
      isYourSite: domain.includes(cleanSite) || cleanSite.includes(domain),
    };
  });

  const competitorResults = await Promise.all(auditPromises);

  // 2. Categorize into 3 Tiers
  // 3. Find user's page (if audited) or first item as reference
  const yourPage = competitorResults.find((c) => c.isYourSite) || null;

  // 4. Compute Averages & Gap Analysis for Top 3 Leaders
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

  // 5. Build Action Checklist based on Empirical Gaps
  const actionChecklist = [];

  if (yourPage) {
    if (yourPage.wordCount < avgLeaderWordCount * 0.8) {
      actionChecklist.push({
        type: "content",
        title: "Expand Content Depth",
        description: `Add ~${formatNum(avgLeaderWordCount - yourPage.wordCount)} words. Top 3 leaders average ${formatNum(avgLeaderWordCount)} words vs your ${formatNum(yourPage.wordCount)} words.`,
        priority: "HIGH",
      });
    }

    if (yourPage.h2Count < avgLeaderH2Count) {
      actionChecklist.push({
        type: "structure",
        title: "Add Additional H2 Sub-Topics",
        description: `Include ${avgLeaderH2Count - yourPage.h2Count} more H2 headings. Top leaders average ${avgLeaderH2Count} H2 sub-sections.`,
        priority: "MEDIUM",
      });
    }

    const missingSchemas = leaderSchemas.filter((s) => !yourPage.schemas.includes(s));
    if (missingSchemas.length > 0) {
      actionChecklist.push({
        type: "schema",
        title: `Implement ${missingSchemas.join(", ")} Microdata`,
        description: `Top 3 leaders use ${missingSchemas.join(", ")} JSON-LD schema. Adding structured data enhances rich snippets in Google.`,
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
      description: `Target at least ${formatNum(avgLeaderWordCount)} words to match the content depth of Top 3 ranking leaders.`,
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
    keyword,
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
      competitorsAudited: competitorResults.length,
    },
    actionChecklist,
  };
}
