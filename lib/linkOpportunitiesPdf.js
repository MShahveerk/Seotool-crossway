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
    types: ["guest-post"],
    title: "Sites that accept contributions",
    hint: "These advertise a write-for-us, contribute or submit route. Pitch a piece directly - the fastest wins on this list.",
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
  {
    types: ["blog", "other"],
    title: "Editorial and unclassified",
    hint: "Reachable but needs a real pitch - a story angle, data, or a quote. Worth a look before writing them off.",
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

export async function buildLinkOpportunitiesPdf(data) {
  const site = hostLabel(data.yourHost);

  const ctx = await createCarbonReport({
    eyebrow: "Crossway SEO",
    reportTitle: "Link Opportunities",
    subject: `"${data.keyword}"${site ? ` - for ${site}` : ""}`,
    meta: `${data.location || "No location set"} - ${data.device} - ${nf(data.targets?.length)} ranking sites analysed`,
    introNote: summary(data),
  });

  const { section, statTiles, tableHeader, tableRow, bullet, callout, CARBON } = ctx;
  const s = data.summary || {};

  section("What this found", "The shape of the opportunity before the detail.");
  statTiles([
    { label: "You can pitch", value: nf(s.prospects), hint: "Realistic routes in", accent: true },
    { label: "Shared linkers", value: nf(s.sharedLinkers), hint: "Link to 2+ rivals" },
    { label: "Sites found", value: nf(s.uniqueLinkers), hint: "Across all rivals" },
    { label: "Already yours", value: nf(s.alreadyYours), hint: "Excluded below" },
  ]);

  const rows = data.intersect || [];
  let any = false;

  for (const group of GROUPS) {
    const all = rows.filter((r) => group.types.includes(r.type) && !r.youHaveIt);
    if (!all.length) continue;
    any = true;

    const shown = all.slice(0, 40);
    section(
      `${group.title} (${nf(all.length)})`,
      all.length > shown.length ? `${group.hint} Showing the top ${nf(shown.length)}.` : group.hint
    );

    tableHeader(
      ["Site", "Rivals", "Authority", "Follow", "Anchors it gives out"],
      [0.34, 0.1, 0.13, 0.12, 0.31],
      ["l", "c", "r", "c", "l"]
    );
    shown.forEach((r, i) => {
      tableRow(
        [
          `${r.domain}${r.alsoRanks ? " *" : ""}`,
          String(r.hits),
          r.authority != null ? String(r.authority) : "-",
          r.dofollow === true ? "dofollow" : r.dofollow === false ? "nofollow" : "-",
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

  if ((data.targets || []).length) {
    section("Ranking sites analysed", "Their backlink profiles are the source of every prospect above.");
    tableHeader(["Rank", "Site"], [0.14, 0.86], ["c", "l"]);
    data.targets.forEach((t, i) => {
      tableRow([`#${t.position ?? "-"}`, t.domain], { alt: i % 2 === 1, accentFirst: true });
    });
  }

  if ((data.notes || []).length) bullet(data.notes.join(" "));

  return ctx.pdf.save();
}
