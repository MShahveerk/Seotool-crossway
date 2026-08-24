/**
 * SERP Analysis — the on-screen report, recreated as a PDF document.
 *
 * Built on `carbonReportTheme`, so it looks like the app: dark graphite canvas,
 * neon accents, stat tiles, and tables with a raised header and hairline rows.
 * Real pdf-lib output — selectable text, embedded Inter, page numbers, and
 * table headers that repeat across pages.
 *
 * The one place it deliberately departs from the screen: competitors are a
 * comparison table rather than a card each. On screen you scan a grid of cards;
 * on paper that became 74 pages. A table says the same thing in one.
 */

import { createCarbonReport, hostLabel, nf } from "./carbonReportTheme.js";

/** Plain-language read of where the site stands — a client has no tooltips. */
function executiveSummary(data) {
  const site = hostLabel(data.yourHost) || "This site";
  const parts = [];

  if (data.found) {
    const where =
      data.yourRank <= 3
        ? "already a top-three position"
        : data.yourRank <= 10
          ? "on page one"
          : data.yourRank <= 20
            ? "just off page one"
            : "well outside the positions that earn meaningful traffic";
    parts.push(`${site} ranks #${data.yourRank} for "${data.keyword}", ${where}`);
  } else {
    parts.push(`${site} does not appear in the top ${data.serpDepth} results for "${data.keyword}"`);
  }

  const km = data.keywordMetrics || {};
  if (km.available && km.volume != null) {
    const band =
      km.difficulty == null
        ? ""
        : km.difficulty < 30
          ? " and is not heavily contested"
          : km.difficulty < 60
            ? " with moderate competition"
            : " and is heavily contested";
    parts.push(`The term draws about ${nf(km.volume)} searches a month${band}`);
  }

  const scanned = (data.topRankers || []).filter((c) => c.wordCount > 0);
  if (scanned.length) {
    const avg = Math.round(scanned.reduce((s, c) => s + (c.wordCount || 0), 0) / scanned.length);
    const refs = data.summary?.avgRefdomains
      ? ` and around ${nf(data.summary.avgRefdomains)} referring domains`
      : "";
    parts.push(`Pages winning this term average about ${nf(avg)} words${refs}`);
  }

  return `${parts.join(". ")}.`;
}

export async function buildSerpAnalysisPdf(data) {
  const site = hostLabel(data.yourHost);

  const ctx = await createCarbonReport({
    eyebrow: "RoboSEO.Ai",
    reportTitle: "SERP Analysis",
    subject: `"${data.keyword}"${site ? ` - ${site}` : ""}`,
    meta: `${data.location || "No location set"} - ${data.device} - top ${data.serpDepth} results reviewed`,
    introNote: executiveSummary(data),
  });

  const { section, statTiles, tableHeader, tableRow, bullet, callout, CARBON } = ctx;

  /* ── The keyword ────────────────────────────────────────────────────── */
  const km = data.keywordMetrics || {};
  section("The keyword", "What this term is worth, and how hard it is to win.");
  statTiles([
    {
      label: "Your position",
      value: data.found ? `#${data.yourRank}` : "Not ranking",
      hint: data.found ? "In Google today" : `Outside top ${data.serpDepth}`,
      accent: true,
    },
    { label: "Monthly searches", value: km.available ? nf(km.volume) : "-", hint: "Estimated" },
    {
      label: "Difficulty",
      value: km.difficulty != null ? `${km.difficulty}/100` : "-",
      hint: "How hard to rank",
    },
    {
      label: "Cost per click",
      value: km.cpcFormatted || (km.cpc != null ? `$${km.cpc}` : "-"),
      hint: "What advertisers pay",
    },
  ]);

  /* ── What to do ─────────────────────────────────────────────────────── */
  if ((data.actions || []).length) {
    section("What to do next", "Ordered by the difference it should make.");
    for (const a of data.actions.slice(0, 8)) {
      bullet(`${a.title}. ${a.description || ""}`.trim());
    }
  }

  /* ── Comparison ─────────────────────────────────────────────────────── */
  const compare = [];
  if (data.you) compare.push({ ...data.you, isYou: true });
  for (const c of data.directCompetitors || []) compare.push(c);
  for (const c of data.topRankers || []) {
    if (!compare.some((e) => e.domain === c.domain)) compare.push(c);
  }
  compare.sort((a, b) => (a.position ?? 999) - (b.position ?? 999));

  if (compare.length) {
    section(
      "How you compare",
      "Every site worth measuring against, in the order Google ranks them. Your own row is marked."
    );
    tableHeader(
      ["#", "Site", "Words", "Headings", "Authority", "Ref. domains"],
      [0.08, 0.34, 0.14, 0.13, 0.14, 0.17],
      ["c", "l", "r", "r", "r", "r"]
    );
    compare.slice(0, 25).forEach((c, i) => {
      tableRow(
        [
          String(c.position ?? "-"),
          c.isYou ? `${hostLabel(c.domain)}  (you)` : hostLabel(c.domain),
          c.wordCount ? nf(c.wordCount) : "-",
          String((c.headings || []).length || "-"),
          c.authority?.score != null ? `${c.authority.score}/10` : "-",
          c.backlinks?.refdomains != null ? nf(c.backlinks.refdomains) : "-",
        ],
        { alt: i % 2 === 1, accentFirst: true, tone: c.isYou ? CARBON.neon : null }
      );
    });
  }

  /* ── Closest rivals ─────────────────────────────────────────────────── */
  const rivals = (data.directCompetitors || []).slice(0, 5);
  if (rivals.length) {
    section("Your closest rivals", "The sites immediately around you - the ones you have to pass.");

    for (const r of rivals) {
      const where =
        r.relation === "above"
          ? `#${r.position}, ahead of you`
          : r.relation === "below"
            ? `#${r.position}, behind you`
            : `#${r.position}`;
      callout(
        `${hostLabel(r.domain)} (${where}). ${r.title || ""} - ` +
          `${r.wordCount ? `${nf(r.wordCount)} words` : "content could not be read"}, ` +
          `${(r.headings || []).length} headings, ` +
          `${r.backlinks?.refdomains != null ? `${nf(r.backlinks.refdomains)} referring domains` : "backlinks unknown"}.`,
        r.relation === "above" ? "caution" : "neon"
      );

      const kws = (r.keywordProfile?.keywords || []).slice(0, 6);
      if (kws.length) {
        tableHeader(
          ["Also ranks for", "Rank", "Volume", "Traffic"],
          [0.52, 0.14, 0.17, 0.17],
          ["l", "c", "r", "r"]
        );
        kws.forEach((k, i) => {
          tableRow(
            [
              k.keyword,
              k.position != null ? `#${k.position}` : "-",
              k.volume != null ? nf(k.volume) : "-",
              k.traffic != null ? nf(k.traffic) : "-",
            ],
            { alt: i % 2 === 1 }
          );
        });
        ctx.spacer(8);
      }
    }
  }

  /* ── The ladder ─────────────────────────────────────────────────────── */
  const ladder = (data.fullLadder || []).slice(0, 30);
  if (ladder.length) {
    section(
      "The Google results page",
      `The first ${ladder.length} results exactly as Google returned them${
        (data.fullLadder || []).length > ladder.length ? `, of ${nf(data.fullLadder.length)} reviewed` : ""
      }.`
    );
    tableHeader(["#", "Page", "Site", ""], [0.08, 0.48, 0.3, 0.14], ["c", "l", "l", "r"]);
    ladder.forEach((row, i) => {
      const isYou = row.tag === "you";
      tableRow(
        [
          String(row.position ?? "-"),
          row.title || row.domain || "",
          hostLabel(row.domain),
          isYou ? "YOU" : row.tag === "directory" ? "directory" : "",
        ],
        { alt: i % 2 === 1, accentFirst: isYou, tone: isYou ? CARBON.neon : null }
      );
    });
  }

  /* ── Content gaps ───────────────────────────────────────────────────── */
  const questions = (data.relatedQuestions || []).slice(0, 12);
  if (questions.length) {
    section(
      "Questions people also ask",
      "Straight from the results page - each is a heading or a page you could write."
    );
    for (const q of questions) bullet(String(q));
  }

  const related = (data.relatedSearches || []).slice(0, 16);
  if (related.length) {
    section("Related searches", "Terms Google associates with this one.");
    bullet(related.join(", "));
  }

  return ctx.pdf.save();
}
