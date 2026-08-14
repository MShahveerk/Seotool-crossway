/**
 * Link Opportunities — branded PDF **document**.
 *
 * Same rebuild as the SERP report: the previous export rasterised the screen
 * into images, so it had no selectable text, no page furniture and a file size
 * measured in megabytes. This builds a real document on `reportPdfTheme`.
 *
 * Written as an outreach brief. Prospects are grouped by what you'd actually
 * *do* about them — submit a listing, pitch a roundup, ask for a resource-page
 * add — because "sorted by score" is a spreadsheet, not a plan. Each group
 * states the task, then lists the sites with the evidence behind them.
 */

import {
  createBrandedReportContext,
  formatPropertyLabel,
  nf,
  MARGIN,
  PAGE_W,
} from "./reportPdfTheme.js";

function columns(fractions) {
  const usable = PAGE_W - MARGIN * 2;
  const xs = [];
  let acc = 0;
  for (const f of fractions) {
    xs.push(MARGIN + 6 + acc * usable);
    acc += f;
  }
  return xs;
}

function truncate(text, max) {
  const s = String(text ?? "");
  return s.length > max ? `${s.slice(0, max - 1)}...` : s;
}

/** Groups mirror the intent: what would you actually do about this site? */
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

function summaryLine(data) {
  const s = data.summary || {};
  const forSite = formatPropertyLabel(data.yourHost || "");
  const bits = [
    `Every site in this report already links to at least one page ranking for "${truncate(data.keyword, 48)}", so it demonstrably links out in this niche`,
    `${nf(s.uniqueLinkers)} linking sites were found across ${nf(data.targets?.length)} ranking competitors`,
    `${nf(s.prospects)} of them offer a realistic route in`,
  ];
  if (data.yourHost) {
    bits.push(`Sites already linking to ${forSite} are excluded`);
  }
  return `${bits.join(". ")}.`;
}

export async function buildLinkOpportunitiesPdf(data) {
  const forSite = data.yourHost ? formatPropertyLabel(data.yourHost) : "No site context";

  const ctx = await createBrandedReportContext({
    reportTitle: "Link Opportunities",
    propertyLabel: `${forSite} — "${truncate(data.keyword, 40)}"`,
    introNote: summaryLine(data),
  });

  const { drawSection, drawMetricRow, drawTableHeader, drawTableRow, drawBullet, drawPlainBox } = ctx;

  const s = data.summary || {};

  drawSection(
    "What this found",
    `${data.location || "No location set"} · ${data.device} · ${nf(data.targets?.length)} ranking sites analysed`
  );

  drawMetricRow([
    { label: "You can pitch", value: nf(s.prospects), hint: "Realistic routes in" },
    { label: "Shared linkers", value: nf(s.sharedLinkers), hint: "Link to 2+ rivals" },
    { label: "Sites found", value: nf(s.uniqueLinkers), hint: "Across all rivals" },
    { label: "Already yours", value: nf(s.alreadyYours), hint: "Excluded below" },
  ]);

  /* ── The opportunities, grouped by the action they imply ────────────── */
  const rows = data.intersect || [];
  let anyGroup = false;

  for (const group of GROUPS) {
    const all = rows.filter((r) => group.types.includes(r.type) && !r.youHaveIt);
    if (!all.length) continue;
    anyGroup = true;

    const shown = all.slice(0, 40);
    drawSection(
      `${group.title} (${nf(all.length)})`,
      all.length > shown.length ? `${group.hint} Showing the top ${nf(shown.length)}.` : group.hint
    );

    const xs = columns([0.42, 0.1, 0.13, 0.35]);
    drawTableHeader(["Site", "Rivals", "Authority", "Anchors it gives out"], xs);

    shown.forEach((r, i) => {
      drawTableRow(
        [
          truncate(r.domain, 44) + (r.alsoRanks ? "  *ranks*" : ""),
          `${r.hits}`,
          r.authority != null ? String(r.authority) : "—",
          truncate((r.anchors || []).slice(0, 2).join(", ") || "—", 38),
        ],
        xs,
        i % 2 === 1
      );
    });

    // The exact pages are the deliverable — someone opens these to find the
    // contact form. Listed for the strongest handful in each group so the
    // document stays readable.
    const withPages = shown.filter((r) => (r.examples || []).length).slice(0, 6);
    if (withPages.length) {
      ctx.y -= 6;
      for (const r of withPages) {
        drawPlainBox(
          `${r.domain} — links to ${(r.linksTo || []).join(", ")}. ` +
            (r.examples || [])
              .slice(0, 3)
              .map((e) => e.sourceUrl)
              .join("   ")
        );
      }
    }
  }

  if (!anyGroup) {
    drawSection("Opportunities", "");
    drawBullet(
      "No actionable prospects were found for this keyword at the current depth. Try a broader keyword, or raise the number of referring domains read per competitor."
    );
  }

  /* ── Who was analysed ───────────────────────────────────────────────── */
  if ((data.targets || []).length) {
    drawSection(
      "Ranking sites analysed",
      "Their backlink profiles are the source of every prospect above."
    );
    const xs = columns([0.12, 0.88]);
    drawTableHeader(["Rank", "Site"], xs);
    data.targets.forEach((t, i) => {
      drawTableRow([`#${t.position ?? "—"}`, truncate(t.domain, 70)], xs, i % 2 === 1);
    });
  }

  if ((data.notes || []).length) {
    drawBullet(data.notes.join(" "));
  }

  return ctx.pdf.save();
}
