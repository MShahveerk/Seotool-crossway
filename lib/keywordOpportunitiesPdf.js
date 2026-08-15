/**
 * Keyword Opportunities — the on-screen report, recreated as a PDF document.
 *
 * Carbon Neon theme, so it matches the app it came from. Ordered as a plan of
 * work: where the domain stands today, then each opportunity class in the order
 * it should be worked, then the evidence behind it.
 */

import { createCarbonReport, hostLabel, nf } from "./carbonReportTheme.js";

const GROUPS = [
  {
    type: "quick-win",
    title: "Quick wins",
    hint: "Ranking 4 to 10. The page already ranks and Google already trusts it for the term. A refreshed title, a stronger opening, better internal links. Cheapest traffic on this list - start here.",
  },
  {
    type: "striking",
    title: "Striking distance",
    hint: "Ranking 11 to 20. One serious push from page one. Expand the page properly, cover what the top results cover and this one does not, and earn a link or two to it.",
  },
  {
    type: "gap",
    title: "Competitor gaps",
    hint: "Competitors rank for these and this domain does not at all. Proven to carry traffic in this niche. Each needs a new page written for it.",
  },
  {
    type: "climbing",
    title: "Climbing",
    hint: "Ranking 21 to 50. Real work, but the term is already associated with the site. Worth picking up once the quick wins are done.",
  },
  {
    type: "defend",
    title: "Defend",
    hint: "Already top 3. Nothing to win, plenty to lose. Keep these pages current and watch for rivals closing in.",
  },
  {
    type: "deep",
    title: "Long haul",
    hint: "Ranking beyond 50. Only worth pursuing if the term is strategically important - but listed so the picture is complete.",
  },
];

/** Guards against a category being added to the engine and lost from here. */
const COVERED_TYPES = new Set(GROUPS.map((g) => g.type));

function summary(data) {
  const s = data.summary || {};
  const site = hostLabel(data.domain) || "This domain";
  const worth = (s.quickWins || 0) + (s.striking || 0) + (s.gaps || 0);
  const bits = [`${site} ranks for about ${nf(data.overview?.keywords ?? s.ranking)} organic keywords`];
  if (data.overview?.traffic != null) bits.push(`worth roughly ${nf(data.overview.traffic)} visits a month`);
  if (data.overview?.price != null) {
    bits.push(`traffic that would cost about $${nf(data.overview.price)} a month to buy`);
  }
  bits.push(
    `Of everything reviewed, ${nf(worth)} keywords are worth active work: ${nf(s.quickWins)} quick wins, ${nf(s.striking)} within striking distance, and ${nf(s.gaps)} gaps competitors already hold`
  );
  return `${bits.join(". ")}.`;
}

/**
 * @param {object} data
 * @param {{ limitPerGroup?: number, appendixLimit?: number }} [opts]
 *   Defaults print everything the engine found. The report is the deliverable;
 *   truncating it hides analysis that was already paid for in credits.
 */
export async function buildKeywordOpportunitiesPdf(
  data,
  { limitPerGroup = 1000, appendixLimit = 1000 } = {}
) {
  const site = hostLabel(data.domain) || data.domain || "";

  const ctx = await createCarbonReport({
    eyebrow: "Crossway SEO",
    reportTitle: "Keyword Opportunities",
    subject: site,
    meta: `${nf(data.summary?.rivalsAnalysed)} competitors read for gaps`,
    introNote: summary(data),
  });

  const { section, statTiles, tableHeader, tableRow, barRow, bullet, CARBON } = ctx;
  const s = data.summary || {};
  const dist = s.distribution || [];

  /* ── Standing ───────────────────────────────────────────────────────── */
  section(
    "Where the domain stands today",
    "The plain picture before any recommendations - what it ranks for, and what that is worth."
  );
  statTiles([
    {
      label: "Organic keywords",
      value: nf(data.overview?.keywords ?? s.ranking),
      hint: data.overview?.keywords ? "Total indexed" : "In this sample",
    },
    {
      label: "Monthly visits",
      value: nf(data.overview?.traffic ?? s.sampleTraffic),
      hint: "Estimated from rankings",
    },
    {
      label: "Traffic value",
      value: data.overview?.price != null ? `$${nf(data.overview.price)}` : "-",
      hint: "Equivalent ad spend",
    },
    {
      label: "Top 3 positions",
      value: nf(dist.find((d) => d.band === "1–3")?.count),
      hint: "Already winning",
      accent: true,
    },
  ]);

  if (dist.some((d) => d.count > 0)) {
    const max = Math.max(...dist.map((d) => d.count));
    ctx.text("WHERE IT RANKS", { size: 7, font: ctx.fonts.semibold, color: CARBON.faint, gap: 12 });
    dist.forEach((d) => {
      barRow(d.band, d.count, max, { hint: d.label, accent: d.band === "1–3" });
    });
    ctx.spacer(10);
  }

  /* ── The work ───────────────────────────────────────────────────────── */
  const rows = data.rows || [];
  const uncovered = [...new Set(rows.map((r) => r.type))].filter((t) => !COVERED_TYPES.has(t));
  const groups = uncovered.length
    ? [...GROUPS, ...uncovered.map((t) => ({ type: t, title: t, hint: "" }))]
    : GROUPS;

  for (const group of groups) {
    const all = rows.filter((r) => r.type === group.type);
    if (!all.length) continue;

    const shown = all.slice(0, limitPerGroup);
    section(
      `${group.title} (${nf(all.length)})`,
      all.length > shown.length ? `${group.hint} Showing the top ${nf(shown.length)}.` : group.hint
    );

    tableHeader(
      ["Keyword", "Rank", "Volume", "Difficulty", "CPC", "Score"],
      [0.4, 0.1, 0.14, 0.16, 0.1, 0.1],
      ["l", "c", "r", "r", "r", "r"]
    );
    shown.forEach((r, i) => {
      tableRow(
        [
          r.keyword,
          r.position != null ? `#${r.position}` : "new",
          r.volume != null ? nf(r.volume) : "-",
          r.difficulty != null ? `${r.difficulty} ${r.effort}` : "-",
          r.cpcFormatted || (r.cpc != null ? `$${r.cpc}` : "-"),
          String(r.score),
        ],
        { alt: i % 2 === 1, accentFirst: true }
      );
    });
  }

  /* ── Evidence ───────────────────────────────────────────────────────── */
  if ((data.topPages || []).length) {
    section(
      "Pages carrying the traffic",
      "Where the existing rankings actually live - the pages worth protecting and improving first."
    );
    tableHeader(["Page", "Visits", "Keywords"], [0.62, 0.19, 0.19], ["l", "r", "r"]);
    data.topPages.slice(0, 50).forEach((p, i) => {
      tableRow([p.url, nf(p.traffic), nf(p.keywords)], { alt: i % 2 === 1 });
    });
  }

  if ((data.competitors || []).length) {
    section("Competitors read for gaps", "Their keyword profiles are the source of every gap above.");
    tableHeader(
      ["Competitor", "Keywords read", "Shared", "Traffic"],
      [0.4, 0.2, 0.2, 0.2],
      ["l", "r", "r", "r"]
    );
    data.competitors.forEach((c, i) => {
      tableRow(
        [
          c.domain,
          nf(c.keywordsFound),
          c.commonKeywords != null ? nf(c.commonKeywords) : "-",
          c.traffic != null ? nf(c.traffic) : "-",
        ],
        { alt: i % 2 === 1, accentFirst: true }
      );
    });
  }

  /* ── Appendix ───────────────────────────────────────────────────────── */
  const ranking = rows
    .filter((r) => r.position != null)
    .sort((a, b) => a.position - b.position)
    .slice(0, appendixLimit);

  if (ranking.length) {
    section(
      "Appendix - everything currently ranking",
      `Every keyword ${site} holds a position for, best first.`
    );
    tableHeader(
      ["Keyword", "Rank", "Volume", "Difficulty"],
      [0.5, 0.12, 0.19, 0.19],
      ["l", "c", "r", "r"]
    );
    ranking.forEach((r, i) => {
      tableRow(
        [
          r.keyword,
          `#${r.position}`,
          r.volume != null ? nf(r.volume) : "-",
          r.difficulty != null ? String(r.difficulty) : "-",
        ],
        { alt: i % 2 === 1 }
      );
    });
  }

  if ((data.notes || []).length) bullet(data.notes.join(" "));

  return ctx.pdf.save();
}
