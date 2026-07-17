/**
 * Highly detailed start-to-finish guides for SEO Opportunities tasks.
 * Safe for client + server (no Node-only imports).
 */

function step(title, detail) {
  return { title, detail };
}

function fmtPos(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(1) : "—";
}

function fmtPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function fmtNum(n) {
  return new Intl.NumberFormat("en-US").format(Math.round(Number(n) || 0));
}

/**
 * Build guided SEO tasks from an opportunities pack.
 */
export function buildGuidedSeoTasks(pack) {
  if (!pack) return [];
  const tasks = [];
  const site = pack.siteUrl || "your site";
  const range = pack.dateRange?.range || "28d";
  const compare = pack.compareDateRange
    ? `${pack.compareDateRange.startDate} → ${pack.compareDateRange.endDate}`
    : "the previous equal period";

  for (const w of pack.sitemapWarnings || []) {
    tasks.push(buildSitemapTask(w, site));
  }
  for (const g of pack.deviceGaps?.gaps || []) {
    tasks.push(buildDeviceTask(g, site, pack.deviceGaps));
  }

  const strike = pack.strikingDistance || [];
  if (strike.length) {
    tasks.push(buildStrikingBatchTask(strike, site, range));
  }

  const cann = pack.cannibalization || [];
  if (cann.length) {
    tasks.push(buildCannibalizationBatchTask(cann, site, range));
  }

  const decayQ = pack.decayingQueries || [];
  if (decayQ.length) {
    tasks.push(buildDecayQueriesBatchTask(decayQ, site, range, compare));
  }

  const decayP = pack.decayingPages || [];
  if (decayP.length) {
    tasks.push(buildDecayPagesBatchTask(decayP, site, range, compare));
  }

  return tasks;
}

function buildSitemapTask(w, site) {
  const type = w.type || "generic";
  const base = {
    id: `sm-${type}`,
    group: "Sitemap",
    severity: w.severity || "medium",
    label: w.message,
  };

  if (type === "missing") {
    return {
      ...base,
      summary: `No sitemap is submitted for ${site} in Google Search Console. Without a sitemap, Google relies only on links and discovery — slower and less complete indexing.`,
      steps: [
        step(
          "Confirm the live sitemap URL",
          `Open ${site.replace(/\/$/, "")}/sitemap.xml (or your CMS sitemap path such as /sitemap_index.xml, /wp-sitemap.xml, /sitemap_index.xml). It must return HTTP 200 and list canonical indexable URLs only.`
        ),
        step(
          "Validate sitemap contents",
          "Open the XML and spot-check: only https canonical URLs, no login/cart/thank-you pages, no redirected or 404 URLs, and lastmod dates that look reasonable. If you use a sitemap index, each child sitemap should also load."
        ),
        step(
          "Submit in Google Search Console",
          `In GSC → Sitemaps for this property, enter the full sitemap URL and submit. Or use this app’s Sitemap Health → Resubmit after it appears once in GSC.`
        ),
        step(
          "Fix access blockers",
          "Ensure robots.txt does not Disallow the sitemap path or the URLs inside it. Confirm the service account / property ownership is correct so GSC can read the feed."
        ),
        step(
          "Verify processing",
          "Return to Sitemap Health in 24–48 hours. Pending should clear and discovered URL counts should rise. If “Couldn’t fetch”, fix hosting/CDN blocking of Googlebot for the sitemap file."
        ),
        step(
          "Keep it maintained",
          "Whenever you publish important pages, confirm they appear in the sitemap. Prefer weekly digest + resubmit after content deploys rather than blind daily resubmits."
        ),
      ],
    };
  }

  if (type === "pending") {
    return {
      ...base,
      summary: `One or more sitemaps for ${site} are still pending processing in Google. That usually means Google has the feed but has not finished reading it.`,
      steps: [
        step(
          "Check which sitemaps are pending",
          "Open Sitemap Health and note each pending path. Open those URLs in a browser — they must load quickly with valid XML."
        ),
        step(
          "Fix fetch/format issues",
          "Repair invalid XML, huge uncompressed files, wrong content-type, or auth walls. Prefer gzip only if Google accepts your hosting setup; many sites serve plain XML successfully."
        ),
        step(
          "Resubmit once",
          "Use Resubmit on the pending feed. Do not spam submissions every hour — wait for Google to process."
        ),
        step(
          "Confirm discovery",
          "After processing, contents/discovered counts should update. Then spot-check key URLs with URL Inspection."
        ),
      ],
    };
  }

  // stale / default
  return {
    ...base,
    summary: `Sitemap(s) for ${site} look stale (not freshly submitted). Refreshing helps Google notice new/updated URLs sooner.`,
    steps: [
      step(
        "Confirm the sitemap still reflects the site",
        "Open the live sitemap. New blog/product/service URLs from recent publishes should appear. Remove dead URLs."
      ),
      step(
        "Resubmit from Sitemap Health",
        "Click Resubmit (or Resubmit all). Confirm last-submitted time updates."
      ),
      step(
        "Align publishing workflow",
        "After major content releases, resubmit once. Keep SEO_AUTO_SUBMIT_SITEMAPS only as a weekly safety net if you want hands-off pings."
      ),
      step(
        "Validate outcomes",
        "Over the next week, check URL Inspection / indexing tasks for new pages and watch Search performance for impressions on new URLs."
      ),
    ],
  };
}

function buildDeviceTask(g, site, deviceGaps) {
  const desktop = deviceGaps?.desktop;
  const mobile = deviceGaps?.mobile;
  const statsNote =
    desktop && mobile
      ? ` Current snapshot — Desktop: ${fmtNum(desktop.clicks)} clicks, CTR ${fmtPct(desktop.ctr)}, pos ${fmtPos(desktop.position)}. Mobile: ${fmtNum(mobile.clicks)} clicks, CTR ${fmtPct(mobile.ctr)}, pos ${fmtPos(mobile.position)}.`
      : "";

  const type = g.type || "device";
  const base = {
    id: `dev-${type}`,
    group: "Device",
    severity: g.severity || "medium",
    label: g.message,
    summary: `${g.message}${statsNote}`,
  };

  if (type === "ctr") {
    return {
      ...base,
      steps: [
        step(
          "Confirm the gap is real",
          `In Device & Appearance (same date range), compare mobile vs desktop CTR. Mobile CTR meaningfully trailing desktop means snippets or page experience are weaker on phones for ${site}.`
        ),
        step(
          "Audit mobile SERP snippets",
          "Search your top queries on a phone (or GSC → Performance → filter Device=Mobile). Check titles truncated awkwardly, weak meta descriptions, missing FAQ/HowTo rich results, and brand mismatch."
        ),
        step(
          "Rewrite titles/descriptions for mobile",
          "Put the primary keyword + clear benefit in the first ~35–45 characters of the title. Write meta descriptions that complete the promise in 1–2 short sentences. Avoid keyword stuffing."
        ),
        step(
          "Fix mobile page experience",
          "Run PageSpeed / CWV on top landing pages (mobile). Fix large CLS (unstable banners), slow LCP images, intrusive interstitials, tiny tap targets, and horizontal scroll."
        ),
        step(
          "Ensure content is visible without interaction traps",
          "Important copy should be in the initial HTML or quickly visible. Avoid forcing multiple taps/accordions to reveal the answer Google ranked you for."
        ),
        step(
          "Re-measure in 2–4 weeks",
          "Return to Device & Appearance. Mobile CTR should move closer to desktop. If position improved but CTR did not, keep iterating snippets; if both lag, prioritize CWV + content clarity."
        ),
      ],
    };
  }

  if (type === "position") {
    return {
      ...base,
      steps: [
        step(
          "Identify mobile-weak pages",
          "In Website Statistics / Query × Page, filter or sort for queries where mobile underperforms. Note the landing URLs."
        ),
        step(
          "Mobile usability pass",
          "On each weak URL: readable font size, no horizontal overflow, tap-friendly nav, fast LCP, and no layout jumps. Fix template-level issues first (header, fonts, hero image)."
        ),
        step(
          "Match mobile intent",
          "Mobile users often want faster answers. Put the answer, pricing, CTA, or key facts higher on the page. Reduce wall of text above the fold."
        ),
        step(
          "Strengthen mobile relevance signals",
          "Tighten H1/H2 to the query, add concise FAQs, and ensure internal links are easy to tap from related mobile pages."
        ),
        step(
          "Track position recovery",
          "Recheck Device & Appearance after the next data lag window (~2–3 days for GSC, longer for ranking shifts). Aim for mobile average position within ~1 of desktop on core queries."
        ),
      ],
    };
  }

  // mobile_dominant or generic
  return {
    ...base,
    steps: [
      step(
        "Treat mobile as the primary experience",
        `Most clicks are on mobile for ${site}, but mobile CTR lags. Prioritize mobile design/content over desktop-only polish.`
      ),
      step(
        "Mobile-first content edit on top pages",
        "Take the top 10 landing pages by mobile clicks. Rewrite above-the-fold copy, CTAs, and titles for phone screens first."
      ),
      step(
        "Snippet + CWV sprint",
        "In one week: update titles/descriptions for those 10 pages and fix the worst LCP/CLS issues. Then expand to the next 10."
      ),
      step(
        "Validate with device report",
        "Use Device & Appearance weekly until mobile CTR is no longer a clear under-performer versus desktop."
      ),
    ],
  };
}

function buildStrikingBatchTask(strike, site, range) {
  const top = strike.slice(0, 8);
  const examples = top.map((q) => `“${q.query}” (pos ${fmtPos(q.position)}, ${fmtNum(q.impressions)} impr)`).join("; ");

  return {
    id: "strike",
    group: "Rankings",
    severity: "medium",
    label: `Polish ${Math.min(strike.length, 5)}+ striking-distance queries (pos 8–20) — e.g. “${strike[0].query}”.`,
    summary: `You have ${strike.length} queries in positions ~8–20 for ${site} (${range}). These are close to page-one wins. Priority examples: ${examples}.`,
    steps: [
      step(
        "Pick 5 priority queries",
        `From the Striking distance table, choose queries with high impressions and position 8–15 first. Start with: ${top
          .slice(0, 5)
          .map((q) => q.query)
          .join(", ")}.`
      ),
      step(
        "Find the ranking URL for each query",
        "Use Query × Page (or GSC Performance → Pages for that query). Note the primary landing URL. That is the page you will improve — do not create a competing new URL yet."
      ),
      step(
        "SERP competitor teardown",
        "Google the query in an incognito window (relevant country). Note what top 3 results do better: content depth, freshness, tools/tables, FAQs, local proof, page speed, or richer titles."
      ),
      step(
        "On-page optimization pass",
        "On your URL: align title + H1 to the query (naturally), add a clear intro answering the intent in the first 100 words, improve H2 outline, add supporting sections competitors cover, and include one unique asset (table, checklist, screenshot, calculator, original example)."
      ),
      step(
        "Internal linking boost",
        "Add 3–5 internal links from relevant stronger pages with descriptive anchors pointing to this URL. Add the URL to the appropriate hub/category page if missing."
      ),
      step(
        "CTR upgrade while you wait for position lifts",
        "Rewrite title/meta to earn more clicks at the current position (numbers, year, bracket clarifiers where honest). Higher CTR can reinforce rankings."
      ),
      step(
        "Technical clean check",
        "Confirm the URL is indexed (URL Inspection / Indexing tasks), mobile-friendly, fast enough, self-canonical, and in the sitemap."
      ),
      step(
        "Measure and iterate",
        `Recheck Striking distance in 2–4 weeks for the same ${range} window. Queries that move to pos <8 are wins; remaining ones need another content depth pass or a different intent match.`
      ),
    ],
  };
}

function buildCannibalizationBatchTask(cann, site, range) {
  const top = cann.slice(0, 5);
  const examples = top
    .map((c) => `“${c.query}” (${c.pageCount} pages; primary ${c.primaryPage || "—"})`)
    .join("; ");

  return {
    id: "cann",
    group: "Content",
    severity: "high",
    label: `Resolve keyword cannibalization on ${Math.min(cann.length, 3)}+ queries (same keyword → multiple URLs).`,
    summary: `${cann.length} queries on ${site} (${range}) are splitting impressions/clicks across multiple URLs. Examples: ${examples}. Google is unsure which page to rank.`,
    steps: [
      step(
        "Choose the winner URL per query",
        `For each conflicted query, pick one canonical winner — usually the primary page with most clicks/impressions. Start with: ${top
          .map((c) => c.query)
          .join(", ")}.`
      ),
      step(
        "Map losers and intent",
        "List competing URLs. Decide for each: (A) 301 into the winner, (B) retarget to a different keyword/intent, or (C) keep but demote with canonical + weaker internal links if it must stay live for users."
      ),
      step(
        "Consolidate content",
        "Move unique useful sections from loser pages into the winner. Do not leave two near-identical articles. Update the winner’s outline so it fully covers the intent."
      ),
      step(
        "Implement redirects / canonicals",
        "301 true duplicates to the winner. Set rel=canonical on near-duplicates to the winner. Update sitemap to include only the winner for that topic."
      ),
      step(
        "Fix internal links and nav",
        "Point menus, blogs, and contextual links to the winner URL with consistent anchors. Remove or rewrite links that still push the losers for the same keyword."
      ),
      step(
        "Request indexing on the winner",
        "After publish, live-test the winner in URL Inspection and request indexing. Monitor Query × Page until secondary URLs stop competing for the same query."
      ),
      step(
        "Verify in Opportunities",
        "In 2–4 weeks, cannibalization count for that query should fall (ideally one dominant URL). If not, the loser may still be stronger — reconsider the winner choice."
      ),
    ],
  };
}

function buildDecayQueriesBatchTask(decayQ, site, range, compare) {
  const top = decayQ.slice(0, 5);
  const examples = top
    .map(
      (q) =>
        `“${q.query}” (${fmtNum(q.clicks)}←${fmtNum(q.previousClicks)}, ${Number(q.clickChangePct || 0).toFixed(0)}%)`
    )
    .join("; ");

  return {
    id: "decay-q",
    group: "Decay",
    severity: "high",
    label: `Investigate ${Math.min(decayQ.length, 3)}+ decaying queries vs prior period (largest drop: “${decayQ[0].query}”).`,
    summary: `${decayQ.length} queries lost clicks for ${site} comparing ${range} vs ${compare}. Worst movers: ${examples}.`,
    steps: [
      step(
        "Triage by business impact",
        `Sort decaying queries by previous clicks. Prioritize commercial/high-intent terms first. Immediate focus: ${top
          .map((q) => q.query)
          .join(", ")}.`
      ),
      step(
        "Diagnose why each query dropped",
        "For each query check: (1) did average position worsen? (2) did CTR fall at similar position? (3) did impressions fall (demand/seasonality)? (4) did the landing page change or break?"
      ),
      step(
        "SERP change check",
        "Google the query again. Note new competitors, SERP features (AI overview, videos, local pack) that stole clicks, or intent shifts (informational vs commercial)."
      ),
      step(
        "Refresh the landing page",
        "Update stats/dates, expand thin sections, improve title/H1 alignment, add missing subtopics, fix broken modules, and restore unique value that competitors now outpace."
      ),
      step(
        "Recover technical health",
        "If the page lost indexation or CWV tanked, fix via URL Inspection / Indexing tasks and PageSpeed before chasing content tweaks."
      ),
      step(
        "Rebuild supporting links",
        "Re-introduce internal links from fresh content. Consider a small PR/digital PR mention for competitive head terms if rankings fell due to authority gaps."
      ),
      step(
        "Confirm recovery",
        "Watch Decaying queries on the next period. A successful fix shows clicks returning and/or position improving toward the prior baseline."
      ),
    ],
  };
}

function buildDecayPagesBatchTask(decayP, site, range, compare) {
  const top = decayP.slice(0, 5);
  const examples = top
    .map(
      (p) =>
        `${p.page} (${fmtNum(p.clicks)}←${fmtNum(p.previousClicks)}, ${Number(p.clickChangePct || 0).toFixed(0)}%)`
    )
    .join("; ");

  return {
    id: "decay-p",
    group: "Decay",
    severity: "high",
    label: `Investigate ${Math.min(decayP.length, 3)}+ decaying landing pages vs prior period.`,
    summary: `${decayP.length} landing pages lost clicks for ${site} (${range} vs ${compare}). Examples: ${examples}.`,
    steps: [
      step(
        "Open the page and verify it still works",
        `Load each priority URL. Confirm 200 OK, no soft-404, correct canonical, and that primary content renders. Start with: ${top
          .map((p) => p.page)
          .slice(0, 3)
          .join(", ")}.`
      ),
      step(
        "Pull queries for that page",
        "In Query × Page / GSC, see which queries the page lost. That tells you whether the issue is topical relevance, CTR, or broad demand decline."
      ),
      step(
        "Content refresh or consolidation",
        "If outdated: refresh thoroughly. If overlapping another stronger URL: consolidate (see cannibalization playbook). If still strategic: expand depth and improve UX."
      ),
      step(
        "Restore distribution",
        "Update internal links, add the page back into hubs, share/republish if appropriate, and ensure sitemap inclusion."
      ),
      step(
        "Technical + snippet pass",
        "Improve title/meta, fix CWV, compress hero media, and ensure mobile layout is clean."
      ),
      step(
        "Re-check Decaying pages",
        "After 2–4 weeks, the page should leave the decay list or show a much smaller negative Δ%."
      ),
    ],
  };
}

/** Per-row guides for tables */
export function guideForStrikingQuery(row, site = "your site") {
  const q = row?.query || "this query";
  return {
    summary: `“${q}” is in striking distance (pos ${fmtPos(row.position)}) with ${fmtNum(row.impressions)} impressions and CTR ${fmtPct(row.ctr)} on ${site}.`,
    steps: [
      step("Identify the ranking URL", `In Query × Page, find which URL ranks for “${q}”. Work on that URL only.`),
      step(
        "Match search intent",
        `Decide if “${q}” is informational, commercial, or transactional. Align H1, intro, and CTA to that intent in the first screen.`
      ),
      step(
        "Expand to beat positions 1–7",
        "Add the missing sections top results cover (definitions, steps, pricing, comparisons, FAQs). Include one original element."
      ),
      step(
        "Internal links + title CTR",
        `Add internal links with anchors related to “${q}”. Rewrite title/meta to improve CTR at the current position.`
      ),
      step(
        "Technical confirm + wait",
        "Ensure indexed + fast on mobile. Recheck position in 2–4 weeks."
      ),
    ],
  };
}

export function guideForCannibalization(row, site = "your site") {
  const q = row?.query || "this query";
  const pages = (row.competingPages || []).slice(0, 5).join("\n• ") || row.primaryPage || "multiple URLs";
  return {
    summary: `“${q}” is split across ${row.pageCount || "multiple"} URLs on ${site} (${fmtNum(row.totalImpressions)} impr). Primary: ${row.primaryPage || "—"}.`,
    steps: [
      step("Pick one winner", `Prefer the strongest useful URL (often ${row.primaryPage || "the top-click page"}).`),
      step(
        "List competitors",
        `Competing URLs include:\n• ${pages}\nDecide redirect vs retarget vs canonicalize for each.`
      ),
      step(
        "Merge unique content into the winner",
        "Move distinctive sections from losers into the winner, then 301 or canonicalize losers."
      ),
      step(
        "Fix links + sitemap",
        "Point internal links and sitemap to the winner only for this intent."
      ),
      step("Request indexing on the winner", "Live-test and request indexing; monitor until one URL dominates."),
    ],
  };
}

export function guideForDecayingQuery(row, site = "your site") {
  const q = row?.query || "this query";
  return {
    summary: `“${q}” fell from ${fmtNum(row.previousClicks)} to ${fmtNum(row.clicks)} clicks (${Number(row.clickChangePct || 0).toFixed(0)}%) on ${site}.`,
    steps: [
      step("Confirm the landing page", `Find the URL ranking for “${q}” and verify it loads correctly.`),
      step(
        "Separate ranking vs CTR vs demand",
        `Compare position ${fmtPos(row.previousPosition)} → ${fmtPos(row.position)} and impressions ${fmtNum(row.previousImpressions)} → ${fmtNum(row.impressions)}.`
      ),
      step("Refresh content against current SERP winners", "Update facts, improve depth, and match new SERP features."),
      step("Fix technical regressions", "Indexing, redirects, CWV, and noindex mistakes first if present."),
      step("Re-measure next period", "Expect recovery signals within 2–4 weeks after a real refresh."),
    ],
  };
}

export function guideForDecayingPage(row, site = "your site") {
  const page = row?.page || "this page";
  return {
    summary: `${page} fell from ${fmtNum(row.previousClicks)} to ${fmtNum(row.clicks)} clicks (${Number(row.clickChangePct || 0).toFixed(0)}%) on ${site}.`,
    steps: [
      step("QA the URL", `Open ${page}. Check status code, canonical, content rendering, and mobile layout.`),
      step("See which queries it lost", "Use Query × Page filtered to this URL to prioritize fixes."),
      step("Refresh or consolidate", "Update content, or merge into a stronger URL if cannibalizing."),
      step("Restore links + snippets", "Internal links, sitemap, title/meta, and CWV."),
      step("Confirm in Decaying pages", "Δ% should improve on the next comparison window."),
    ],
  };
}
