/**
 * Keyword Opportunities — branded PDF **document**.
 *
 * Same rebuild as the SERP and Link reports: real pdf-lib output rather than a
 * rasterised screen, so the file has selectable text, page numbers, the
 * Crossway header, and a size measured in kilobytes.
 *
 * Ordered as a plan of work, not a keyword dump: where the domain stands today,
 * then the opportunities in the order they should be worked, then an appendix
 * of everything it currently ranks for. Each section states what the work
 * actually is, so it can be handed straight to whoever writes.
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
];

function summaryLine(data) {
  const s = data.summary || {};
  const site = formatPropertyLabel(data.domain || "");
  const worth = (s.quickWins || 0) + (s.striking || 0) + (s.gaps || 0);
  const bits = [
    `${site} ranks for about ${nf(data.overview?.keywords ?? s.ranking)} organic keywords`,
  ];
  if (data.overview?.traffic != null) {
    bits.push(`worth roughly ${nf(data.overview.traffic)} visits a month`);
  }
  if (data.overview?.price != null) {
    bits.push(`traffic that would cost about $${nf(data.overview.price)} a month to buy`);
  }
  bits.push(
    `Of everything reviewed, ${nf(worth)} keywords are worth active work: ${nf(s.quickWins)} quick wins, ${nf(s.striking)} within striking distance, and ${nf(s.gaps)} gaps competitors already hold`
  );
  return `${bits.join(". ")}.`;
}

export async function buildKeywordOpportunitiesPdf(data) {
  const site = formatPropertyLabel(data.domain || "");

  const ctx = await createBrandedReportContext({
    reportTitle: "Keyword Opportunities",
    propertyLabel: site,
    introNote: summaryLine(data),
  });

  const { drawSection, drawMetricRow, drawTableHeader, drawTableRow, drawBullet } = ctx;

  const s = data.summary || {};
  const dist = s.distribution || [];

  /* ── Where the domain stands ────────────────────────────────────────── */
  drawSection(
    "Where the domain stands today",
    "The plain picture before any recommendations - what it ranks for, and what that is worth."
  );

  drawMetricRow([
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
      value: data.overview?.price != null ? `$${nf(data.overview.price)}` : "—",
      hint: "Equivalent ad spend",
    },
    {
      label: "Top 3 positions",
      value: nf(dist.find((d) => d.band === "1–3")?.count),
      hint: "Already winning",
    },
  ]);

  if (dist.some((d) => d.count > 0)) {
    const xs = columns([0.18, 0.55, 0.27]);
    drawTableHeader(["Position", "What it means", "Keywords"], xs);
    dist.forEach((d, i) => {
      drawTableRow([d.band, d.label, nf(d.count)], xs, i % 2 === 1);
    });
  }

  /* ── The work, in order ─────────────────────────────────────────────── */
  const rows = data.rows || [];
  const kxs = columns([0.44, 0.1, 0.14, 0.14, 0.18]);

  for (const group of GROUPS) {
    const all = rows.filter((r) => r.type === group.type);
    if (!all.length) continue;

    const shown = all.slice(0, 40);
    drawSection(
      `${group.title} (${nf(all.length)})`,
      all.length > shown.length ? `${group.hint} Showing the top ${nf(shown.length)}.` : group.hint
    );

    drawTableHeader(["Keyword", "Rank", "Volume", "Difficulty", "Value / month"], kxs);
    shown.forEach((r, i) => {
      drawTableRow(
        [
          truncate(r.keyword, 46),
          r.position != null ? `#${r.position}` : "new",
          r.volume != null ? nf(r.volume) : "—",
          r.difficulty != null ? `${r.difficulty} (${r.effort})` : "—",
          r.cpcFormatted || (r.cpc != null ? `$${r.cpc}` : "—"),
        ],
        kxs,
        i % 2 === 1
      );
    });
  }

  /* ── Pages doing the work ───────────────────────────────────────────── */
  if ((data.topPages || []).length) {
    drawSection(
      "Pages carrying the traffic",
      "Where the existing rankings actually live - the pages worth protecting and improving first."
    );
    const xs = columns([0.62, 0.19, 0.19]);
    drawTableHeader(["Page", "Visits", "Keywords"], xs);
    data.topPages.slice(0, 20).forEach((p, i) => {
      drawTableRow([truncate(p.url, 62), nf(p.traffic), nf(p.keywords)], xs, i % 2 === 1);
    });
  }

  /* ── Who the gaps came from ─────────────────────────────────────────── */
  if ((data.competitors || []).length) {
    drawSection("Competitors read for gaps", "Their keyword profiles are the source of every gap above.");
    const xs = columns([0.4, 0.2, 0.2, 0.2]);
    drawTableHeader(["Competitor", "Keywords read", "Shared", "Traffic"], xs);
    data.competitors.forEach((c, i) => {
      drawTableRow(
        [
          truncate(c.domain, 40),
          nf(c.keywordsFound),
          c.commonKeywords != null ? nf(c.commonKeywords) : "—",
          c.traffic != null ? nf(c.traffic) : "—",
        ],
        xs,
        i % 2 === 1
      );
    });
  }

  /* ── Appendix ───────────────────────────────────────────────────────── */
  const ranking = rows
    .filter((r) => r.position != null)
    .sort((a, b) => a.position - b.position)
    .slice(0, 120);

  if (ranking.length) {
    drawSection(
      "Appendix - everything currently ranking",
      `Every keyword ${site} holds a position for, best first.`
    );
    const xs = columns([0.5, 0.12, 0.19, 0.19]);
    drawTableHeader(["Keyword", "Rank", "Volume", "Difficulty"], xs);
    ranking.forEach((r, i) => {
      drawTableRow(
        [
          truncate(r.keyword, 54),
          `#${r.position}`,
          r.volume != null ? nf(r.volume) : "—",
          r.difficulty != null ? String(r.difficulty) : "—",
        ],
        xs,
        i % 2 === 1
      );
    });
  }

  if ((data.notes || []).length) {
    drawBullet(data.notes.join(" "));
  }

  return ctx.pdf.save();
}
