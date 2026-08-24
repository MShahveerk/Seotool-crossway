/**
 * Link Opportunities — the on-screen report, recreated as a PDF document.
 *
 * Carbon Neon theme, so it matches the app it came from. Written as an outreach
 * brief: prospects are grouped by the action they imply, because "sorted by
 * score" is a spreadsheet, not a plan.
 */

import { createCarbonReport, hostLabel, nf } from "./carbonReportTheme.js";

const GROUPS = [
  {
    types: ["serp-listing"],
    title: "Listing sites that rank for this keyword",
    hint: "Directories and locators Google already sends this traffic to. Getting listed puts you on a page that ranks - usually the best link available, and often just a submission form.",
  },
  {
    types: ["guest-post"],
    title: "Sites that accept contributions",
    hint: "These advertise a write-for-us, contribute or submit route. Pitch a piece directly - the fastest wins on this list.",
  },
  {
    types: ["publication"],
    title: "Industry publications",
    hint: "Magazines and blogs that already rank for this keyword. Pitch a guest piece or a resource mention.",
  },
  {
    types: ["directory"],
    title: "Directories and listings",
    hint: "Submit or claim a listing. Usually quick, often free, and they already list your competitors.",
  },
  {
    types: ["resource"],
    title: "Resource pages",
    hint: "Curated link pages. Email the page owner and make the case that you belong on the list.",
  },
  {
    types: ["roundup"],
    title: "Roundups and comparisons",
    hint: "Best-of posts that already feature rivals. Ask to be added, or to be considered in the next update.",
  },
];

const MAYBE = [
  {
    types: ["giant"],
    title: "Giants - big publishers and platforms",
    hint: "Household names like Forbes, Business Insider and Stripe. A link here is real but usually comes through PR, a customer story or paid placement rather than a quick pitch. Listed separately so you can see them without them crowding the pitch list.",
  },
  {
    types: ["blog", "other"],
    title: "Editorial and unclassified",
    hint: "Reachable but needs a real pitch - a story angle, data, or a quote. Not in Can pitch: there is no advertised route in.",
  },
  {
    types: ["press"],
    title: "News and PR pickups",
    hint: "Newswire or press coverage. Rarely repeatable on demand, but it shows who covers this industry.",
  },
  {
    types: ["profile"],
    title: "Profiles and forums",
    hint: "User-generated pages. Low value and easily spammed, but occasionally a community worth joining properly.",
  },
];

/* Everything ruled out, and why. Included so the report can be trusted: a list
   that silently drops things is harder to believe than one that shows its
   working. Kept firmly apart from the pitchable sections above. */
const REJECTED = [
  {
    types: ["off-niche"],
    title: "Directories for the wrong niche",
    hint: "Real directories, wrong subject. A wedding-vendor list or a dive-photo guide will not take this business.",
  },
  {
    types: ["link-farm"],
    title: "Spam directory networks",
    hint: "Bought directory blasts - dozens of near-identical sites named after SEO rather than a subject. Never pitch these.",
  },
  {
    types: ["scraper"],
    title: "Auto-listings and data scrapers",
    hint: "Scraped automatically. Nobody to pitch, and being added means nothing.",
  },
  {
    types: ["unreachable"],
    title: "No way in",
    hint: "Platforms, major publishers and academic sites. They link to businesses, but not by request.",
  },
  {
    types: ["no-route"],
    title: "No live route in",
    hint: "Fetched, and no submit, listing or contribute page was found. Not a pitch this week.",
  },
];

function summary(data) {
  const s = data.summary || {};
  const site = hostLabel(data.yourHost);
  const bits = [
    `Every site in this report already links to at least one page ranking for "${data.keyword}", so it demonstrably links out in this niche`,
    `${nf(s.uniqueLinkers)} linking sites were found across ${nf(data.targets?.length)} ranking competitors, and ${nf(s.prospects)} of them offer a realistic route in`,
  ];
  if (site) bits.push(`Sites already linking to ${site} are excluded`);
  return `${bits.join(". ")}.`;
}

/** Every type the sections above account for — used to catch anything new. */
const COVERED = new Set([...GROUPS, ...MAYBE, ...REJECTED].flatMap((g) => g.types));

/**
 * @param {object} data
 * @param {{ limitPerGroup?: number, rejectedLimit?: number }} [opts]
 *   Defaults are the engine's own ceiling, i.e. everything it found. The report
 *   is the deliverable; truncating it to keep the page count down just hides
 *   work that was already paid for in credits.
 */
export async function buildLinkOpportunitiesPdf(data, { limitPerGroup = 1000, rejectedLimit = 1000 } = {}) {
  const site = hostLabel(data.yourHost);

  const ctx = await createCarbonReport({
    eyebrow: "RoboSEO.Ai",
    reportTitle: "Link Opportunities",
    subject: `"${data.keyword}"${site ? ` - for ${site}` : ""}`,
    meta: `${data.location || "No location set"} - ${data.device} - ${nf(data.targets?.length)} ranking sites analysed`,
    introNote: summary(data),
  });

  const { section, statTiles, tableHeader, tableRow, bullet, callout, CARBON } = ctx;
  const s = data.summary || {};

  section("What this found", "The shape of the opportunity before the detail.");
  statTiles([
    { label: "You can pitch", value: nf(s.prospects), hint: `${nf(s.unpaid)} unpaid · ${nf(s.paid)} paid`, accent: true },
    { label: "Shared linkers", value: nf(s.sharedLinkers), hint: "Link to 2+ rivals" },
    { label: "Sites found", value: nf(s.uniqueLinkers), hint: "Across all rivals" },
    { label: "Already yours", value: nf(s.alreadyYours), hint: "Excluded below" },
  ]);

  const rows = data.intersect || [];
  let any = false;

  // Anything the named sections don't account for still gets printed — a
  // category added to the engine must never silently vanish from the report,
  // which is exactly how "press" and "profile" went missing.
  const uncovered = [...new Set(rows.map((r) => r.type))].filter((t) => !COVERED.has(t));
  const pitchGroups = uncovered.length
    ? [...GROUPS, { types: uncovered, title: "Other", hint: "Everything not covered above." }]
    : GROUPS;

  for (const group of pitchGroups) {
    const all = rows.filter((r) => group.types.includes(r.type) && !r.youHaveIt);
    if (!all.length) continue;
    any = true;

    const shown = all.slice(0, limitPerGroup);
    section(
      `${group.title} (${nf(all.length)})`,
      all.length > shown.length ? `${group.hint} Showing the top ${nf(shown.length)}.` : group.hint
    );

    tableHeader(
      ["Site", "Rivals", "Authority", "Cost", "Anchors it gives out"],
      [0.3, 0.1, 0.12, 0.12, 0.36],
      ["l", "c", "r", "c", "l"]
    );
    shown.forEach((r, i) => {
      tableRow(
        [
          `${r.domain}${r.serpPosition != null ? ` (ranks #${r.serpPosition})` : r.alsoRanks ? " *" : ""}`,
          String(r.hits),
          r.authority != null ? String(r.authority) : "-",
          r.cost === "paid" ? "paid" : r.cost === "unpaid" ? "free" : "-",
          (r.anchors || []).slice(0, 2).join(", ") || "-",
        ],
        { alt: i % 2 === 1, accentFirst: true, tone: r.alsoRanks ? CARBON.info : null }
      );
    });

    // The exact pages are the deliverable — someone opens these to find the
    // contact form. Shown for the strongest few so the document stays readable.
    const withPages = shown.filter((r) => (r.examples || []).length).slice(0, 5);
    if (withPages.length) {
      ctx.spacer(6);
      for (const r of withPages) {
        callout(
          `${r.domain} - links to ${(r.linksTo || []).join(", ")}. ` +
            (r.examples || [])
              .slice(0, 3)
              .map((e) => e.sourceUrl)
              .join("   ")
        );
      }
    }
  }

  if (!any) {
    section("Opportunities", "");
    bullet(
      "No actionable prospects were found for this keyword at the current depth. Try a broader keyword, or raise the number of referring domains read per competitor."
    );
  }

  for (const group of MAYBE) {
    const all = rows.filter((r) => group.types.includes(r.type) && !r.youHaveIt);
    if (!all.length) continue;
    section(`${group.title} (${nf(all.length)})`, group.hint);
    tableHeader(["Site", "Rivals", "Authority"], [0.6, 0.2, 0.2], ["l", "c", "r"]);
    all.slice(0, limitPerGroup).forEach((r, i) => {
      tableRow(
        [r.domain, String(r.hits), r.authority != null ? String(r.authority) : "-"],
        { alt: i % 2 === 1 }
      );
    });
  }

  /* ── What was ruled out ─────────────────────────────────────────────── */
  const rejectedSections = REJECTED.map((g) => ({
    g,
    all: rows.filter((r) => g.types.includes(r.type)),
  })).filter((x) => x.all.length);

  if (rejectedSections.length) {
    section(
      "Ruled out, and why",
      "Sites that link in this niche but are not worth your time. Listed so nothing is silently dropped."
    );
    for (const { g, all } of rejectedSections) {
      ctx.paragraph(`${g.title} (${nf(all.length)}) - ${g.hint}`, { size: 9 });
      tableHeader(["Site", "Rivals", "Authority"], [0.6, 0.2, 0.2], ["l", "c", "r"]);
      all.slice(0, rejectedLimit).forEach((r, i) => {
        tableRow(
          [r.domain, String(r.hits), r.authority != null ? String(r.authority) : "-"],
          { alt: i % 2 === 1 }
        );
      });
      ctx.spacer(8);
    }
  }

  if ((data.targets || []).length) {
    section(
      "Sites analysed",
      "Their backlink profiles are the source of every prospect above. Some rank for the keyword; the rest are true competitors found by organic keyword overlap, whose link profiles are closer to this niche."
    );
    tableHeader(["Site", "Source", "Shared keywords"], [0.5, 0.25, 0.25], ["l", "l", "r"]);
    data.targets.forEach((t, i) => {
      tableRow(
        [
          t.domain,
          t.source === "competitor" ? "keyword overlap" : `ranks #${t.position ?? "-"}`,
          t.commonKeywords != null ? nf(t.commonKeywords) : "-",
        ],
        { alt: i % 2 === 1, accentFirst: true }
      );
    });
  }

  if ((data.notes || []).length) bullet(data.notes.join(" "));

  return ctx.pdf.save();
}
