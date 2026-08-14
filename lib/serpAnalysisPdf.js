/**
 * SERP Analysis — branded PDF **document**.
 *
 * Replaces the client-side html2pdf export, which rasterised the entire on-screen
 * report into one enormous image and sliced it into pages. That produced a
 * 74-page, 7MB file with no selectable text, no page furniture, and a full card
 * for every competitor — a screen pretending to be a document.
 *
 * This uses the same pdf-lib engine as the rest of the Crossway report suite
 * (`reportPdfTheme`), so it comes out as a real document: vector text you can
 * select and search, embedded fonts, the branded header and logo on page one,
 * continuation headers and page numbers on the rest, and automatic page breaks
 * that never cut a table row in half. Typically 8–12 pages and well under 1MB.
 *
 * The editorial decision that fixes the length: competitors are a *comparison
 * table*, not a page each. You compare rivals by scanning a column, not by
 * flipping between 74 pages of identical cards. Only the closest rivals get a
 * detail block, and even then it's a few lines plus their top keywords.
 */

import {
  createBrandedReportContext,
  formatPropertyLabel,
  nf,
  safePdfText,
  MARGIN,
  PAGE_W,
} from "./reportPdfTheme.js";

/** Column x-positions for a table, from proportional widths. */
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

function hostOf(value) {
  const raw = String(value || "");
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

/**
 * A plain-language read of where the site stands. Written here rather than in
 * the UI because a client opening the PDF has no tooltips to hover.
 */
function executiveSummary(data) {
  const site = formatPropertyLabel(data.yourHost || "");
  const parts = [];

  if (data.found) {
    parts.push(`${site} ranks #${data.yourRank} for "${data.keyword}"`);
    if (data.yourRank <= 3) parts.push("which is already a top-three position");
    else if (data.yourRank <= 10) parts.push("putting it on page one");
    else if (data.yourRank <= 20) parts.push("just off page one");
    else parts.push("well outside the positions that earn meaningful traffic");
  } else {
    parts.push(
      `${site} does not appear in the top ${data.serpDepth} results for "${data.keyword}"`
    );
  }

  const km = data.keywordMetrics || {};
  if (km.available && km.volume != null) {
    parts.push(`The term draws about ${nf(km.volume)} searches a month`);
    if (km.difficulty != null) {
      const band =
        km.difficulty < 30 ? "and is not heavily contested" : km.difficulty < 60 ? "with moderate competition" : "and is heavily contested";
      parts.push(band);
    }
  }

  const leaders = data.topRankers || [];
  const scanned = leaders.filter((c) => c.wordCount > 0);
  if (scanned.length) {
    const avgWords = Math.round(
      scanned.reduce((sum, c) => sum + (c.wordCount || 0), 0) / scanned.length
    );
    parts.push(`Pages winning this term average about ${nf(avgWords)} words`);
  }
  if (data.summary?.avgRefdomains) {
    parts.push(`and around ${nf(data.summary.avgRefdomains)} referring domains`);
  }

  return `${parts.join(". ")}.`;
}

/**
 * @param {object} data  the SERP analysis payload
 * @returns {Promise<Uint8Array>}
 */
export async function buildSerpAnalysisPdf(data) {
  const propertyLabel = formatPropertyLabel(data.yourHost || "");
  const ctx = await createBrandedReportContext({
    reportTitle: "SERP Analysis",
    propertyLabel: `${propertyLabel} — "${truncate(data.keyword, 40)}"`,
    introNote: executiveSummary(data),
  });

  const { drawSection, drawMetricRow, drawTableHeader, drawTableRow, drawBullet, drawPlainBox } = ctx;

  /* ── Search context ─────────────────────────────────────────────────── */
  const km = data.keywordMetrics || {};
  drawSection(
    "The keyword",
    `${data.location || "No location set"} · ${data.device} · top ${data.serpDepth} results reviewed`
  );

  drawMetricRow([
    {
      label: "Your position",
      value: data.found ? `#${data.yourRank}` : "Not ranking",
      hint: data.found ? "In Google today" : `Outside top ${data.serpDepth}`,
    },
    { label: "Monthly searches", value: km.available ? nf(km.volume) : "—", hint: "Estimated" },
    {
      label: "Difficulty",
      value: km.difficulty != null ? `${km.difficulty}/100` : "—",
      hint: "How hard to rank",
    },
    {
      label: "Cost per click",
      value: km.cpcFormatted || (km.cpc != null ? `$${km.cpc}` : "—"),
      hint: "What advertisers pay",
    },
  ]);

  /* ── What to do ─────────────────────────────────────────────────────── */
  if ((data.actions || []).length) {
    drawSection("What to do next", "Ordered by the difference it should make");
    for (const action of data.actions.slice(0, 8)) {
      drawBullet(`${action.title}. ${action.description || ""}`.trim());
    }
  }

  /* ── The comparison ─────────────────────────────────────────────────────
     One row per site. This is the section that used to be 74 pages of cards:
     rivals are compared by scanning a column, not by flipping between pages. */
  const compare = [];
  if (data.you) compare.push({ ...data.you, isYou: true });
  for (const c of data.directCompetitors || []) compare.push(c);
  for (const c of data.topRankers || []) {
    if (!compare.some((existing) => existing.domain === c.domain)) compare.push(c);
  }
  compare.sort((a, b) => (a.position ?? 999) - (b.position ?? 999));

  if (compare.length) {
    drawSection(
      "How you compare",
      "Every site worth measuring against, in the order Google ranks them. Your own row is marked."
    );

    const xs = columns([0.07, 0.34, 0.13, 0.11, 0.11, 0.14]);
    drawTableHeader(["#", "Site", "Words", "Headings", "Authority", "Ref. domains"], xs);

    compare.slice(0, 25).forEach((c, i) => {
      drawTableRow(
        [
          String(c.position ?? "—"),
          truncate(c.isYou ? `${hostOf(c.domain)}  (you)` : hostOf(c.domain), 34),
          c.wordCount ? nf(c.wordCount) : "—",
          String((c.headings || []).length || "—"),
          c.authority?.score != null ? `${c.authority.score}/10` : "—",
          c.backlinks?.refdomains != null ? nf(c.backlinks.refdomains) : "—",
        ],
        xs,
        i % 2 === 1
      );
    });
  }

  /* ── Closest rivals, in a little more depth ─────────────────────────── */
  const rivals = (data.directCompetitors || []).slice(0, 5);
  if (rivals.length) {
    drawSection(
      "Your closest rivals",
      "The sites immediately around you — the ones you have to pass to move up."
    );

    for (const rival of rivals) {
      const where =
        rival.relation === "above"
          ? `#${rival.position} — ahead of you`
          : rival.relation === "below"
            ? `#${rival.position} — behind you`
            : `#${rival.position}`;

      drawPlainBox(
        `${hostOf(rival.domain)} (${where}). ${truncate(rival.title || "", 90)}. ` +
          `${rival.wordCount ? `${nf(rival.wordCount)} words` : "Content could not be read"}, ` +
          `${(rival.headings || []).length} headings, ` +
          `${rival.backlinks?.refdomains != null ? `${nf(rival.backlinks.refdomains)} referring domains` : "backlinks unknown"}.`
      );

      const kws = (rival.keywordProfile?.keywords || []).slice(0, 6);
      if (kws.length) {
        const kxs = columns([0.55, 0.15, 0.15, 0.15]);
        drawTableHeader(["Also ranks for", "Rank", "Volume", "Traffic"], kxs);
        kws.forEach((k, i) => {
          drawTableRow(
            [
              truncate(k.keyword, 52),
              k.position != null ? `#${k.position}` : "—",
              k.volume != null ? nf(k.volume) : "—",
              k.traffic != null ? nf(k.traffic) : "—",
            ],
            kxs,
            i % 2 === 1
          );
        });
      }
    }
  }

  /* ── The ladder ─────────────────────────────────────────────────────── */
  const ladder = (data.fullLadder || []).slice(0, 30);
  if (ladder.length) {
    drawSection(
      "The Google results page",
      `The first ${ladder.length} results exactly as Google returned them${
        (data.fullLadder || []).length > ladder.length
          ? `, of ${nf(data.fullLadder.length)} reviewed`
          : ""
      }.`
    );

    const lxs = columns([0.08, 0.5, 0.28, 0.14]);
    drawTableHeader(["#", "Page", "Site", ""], lxs);
    ladder.forEach((row, i) => {
      drawTableRow(
        [
          String(row.position ?? "—"),
          truncate(row.title || row.domain || "", 48),
          truncate(hostOf(row.domain), 28),
          row.tag === "you" ? "YOU" : row.tag === "directory" ? "directory" : "",
        ],
        lxs,
        i % 2 === 1
      );
    });
  }

  /* ── What people also ask ───────────────────────────────────────────── */
  const questions = (data.relatedQuestions || []).slice(0, 12);
  if (questions.length) {
    drawSection(
      "Questions people also ask",
      "Straight from the results page — each one is a heading or a page you could write."
    );
    for (const q of questions) drawBullet(String(q));
  }

  const related = (data.relatedSearches || []).slice(0, 14);
  if (related.length) {
    drawSection("Related searches", "Terms Google associates with this one.");
    drawBullet(related.map((r) => safePdfText(String(r), 40)).join(", "));
  }

  return ctx.pdf.save();
}
