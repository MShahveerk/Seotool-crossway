/**
 * Client-facing PDF for Keyword Opportunities.
 *
 * This is the deliverable, so it carries everything the screen shows rather
 * than a sampled preview of it: where the domain stands today, every
 * opportunity class (not just the flattering ones), the pages earning the
 * traffic, the competitors read for gaps, and a complete appendix of what the
 * domain currently ranks for.
 *
 * Group caps are generous on purpose — the earlier version cut every section at
 * 25 rows, which quietly dropped most of the analysis and made the export feel
 * thinner than the tool.
 */

import { BASE_STYLES, cols, downloadReportPdf, esc, metricRow, num, slugify, today } from "./reportKit";

const STYLES = `
  ${BASE_STYLES}
  .sr .grouphdr { display: flex; align-items: baseline; gap: 8px; margin: 18px 0 4px; }
  .sr .grouphdr h3 { margin: 0; }
  .sr .gcount { font-size: 10px; color: #4b5563; font-weight: 700; }
  .sr .ghint { font-size: 10.5px; color: #374151; margin: 0 0 6px; }
  .sr .kw { font-weight: 700; color: #111827; }
  .sr .kurl { color: #4b5563; font-size: 9.5px; word-break: break-all; }
  .sr .kmeta { color: #4b5563; font-size: 9.5px; margin-top: 1px; }
  .sr .pos { display: inline-block; background: #047857; color: #fff; border-radius: 4px; padding: 1px 6px; font-size: 9.5px; font-weight: 700; }
  .sr .pos.mid { background: #1d4ed8; }
  .sr .pos.low { background: #6b7280; }
  .sr .pos.none { background: #7c3aed; }
  .sr .eff-low { color: #047857; font-weight: 700; }
  .sr .eff-medium { color: #1d4ed8; font-weight: 700; }
  .sr .eff-high { color: #b45309; font-weight: 700; }
  .sr .eff-veryhigh { color: #b91c1c; font-weight: 700; }
  .sr .eff-unknown { color: #4b5563; font-weight: 700; }
  .sr .score { font-weight: 700; color: #111827; }
  .sr .up { color: #047857; font-weight: 700; }
  .sr .down { color: #b91c1c; font-weight: 700; }
  .sr .toc { background: #f7f8f9; border: 1px solid #dfe3e8; border-radius: 8px; padding: 10px 14px; margin: 4px 0 6px; }
  .sr .toc ol { margin: 0; padding-left: 18px; }
  .sr .toc li { font-size: 10.5px; color: #1f2937; padding: 1px 0; }
  .sr .band { display: inline-block; width: 46px; font-weight: 700; color: #111827; }
  .sr .bar { display: inline-block; height: 8px; background: #047857; border-radius: 4px; vertical-align: middle; }
  .sr .bar.p1 { background: #10b981; }
  .sr .bar.p2 { background: #1d4ed8; }
  .sr .bar.pn { background: #9ca3af; }
`;

/** Every class, in the order the work should be done. */
const GROUPS = [
  {
    type: "quick-win",
    title: "Quick wins — rank 4 to 10",
    hint: "The page already ranks and Google already trusts it for the term. A refreshed title, a stronger intro, better internal links. Cheapest traffic on this list; start here.",
  },
  {
    type: "striking",
    title: "Striking distance — rank 11 to 20",
    hint: "One serious push from page one. Expand the page properly, cover what the top results cover and this one doesn't, and earn a link or two to it.",
  },
  {
    type: "gap",
    title: "Competitor gaps — not ranking",
    hint: "Competitors rank for these and this domain doesn't at all. Proven to carry traffic in this niche. Each needs a new page written for it.",
  },
  {
    type: "climbing",
    title: "Climbing — rank 21 to 50",
    hint: "Real work, but the term is already associated with the site. Worth picking up once the quick wins are done.",
  },
  {
    type: "defend",
    title: "Defend — already top 3",
    hint: "Nothing to win, plenty to lose. Keep these pages current and watch for rivals closing in.",
  },
  {
    type: "deep",
    title: "Long haul — beyond rank 50",
    hint: "Only worth pursuing if the term is strategically important. Listed for completeness.",
  },
];

function effortClass(effort) {
  return `eff-${String(effort || "unknown").replace(/\s+/g, "")}`;
}

function posClass(position) {
  if (position == null) return "none";
  if (position <= 10) return "";
  if (position <= 20) return "mid";
  return "low";
}

function trendCell(direction) {
  const d = String(direction || "").toLowerCase();
  if (d === "up") return '<span class="up">▲ rising</span>';
  if (d === "down") return '<span class="down">▼ falling</span>';
  return '<span class="dir">flat</span>';
}

function keywordRows(rows, { showRivals = true } = {}) {
  return rows
    .map((r) => {
      const intents = (r.intents || []).slice(0, 2).join(", ");
      const rivals = (r.rivalDomains || []).slice(0, 3).join(", ");
      return `<tr>
        <td>
          <span class="kw">${esc(r.keyword)}</span>
          ${r.url ? `<div class="kurl">${esc(r.url)}</div>` : ""}
          ${
            showRivals && rivals
              ? `<div class="kmeta">also ranked by: ${esc(rivals)}${r.rivalCount > 3 ? ` +${r.rivalCount - 3}` : ""}</div>`
              : ""
          }
          ${intents ? `<div class="kmeta">intent: ${esc(intents)}</div>` : ""}
        </td>
        <td class="c"><span class="pos ${posClass(r.position)}">${r.position != null ? `#${esc(r.position)}` : "new"}</span></td>
        <td class="r">${num(r.volume)}</td>
        <td class="r"><span class="${effortClass(r.effort)}">${r.difficulty ?? "—"}</span> <span class="dir">${esc(r.effort)}</span></td>
        <td class="r">${esc(r.cpcFormatted || (r.cpc != null ? `$${r.cpc}` : "—"))}</td>
        <td class="c">${trendCell(r.trendDirection)}</td>
        <td class="r score">${esc(r.score)}</td>
      </tr>`;
    })
    .join("");
}

/* Header alignment must match the cells beneath it — a left-aligned "Volume"
   sitting over right-aligned numbers is what made these read as misaligned. */
const KW_COLS = cols(["40%", "8%", "10%", "14%", "9%", "10%", "9%"]);
const HEAD = `<thead><tr><th>Keyword</th><th class="c">Rank</th><th class="r">Volume</th><th class="r">Effort</th><th class="r">CPC</th><th class="c">Trend</th><th class="r">Score</th></tr></thead>`;

export function buildKeywordOpportunitiesFragment(data, { limitPerGroup = 80, appendixLimit = 150 } = {}) {
  const day = today();
  const rows = data.rows || [];
  const s = data.summary || {};
  const dist = s.distribution || [];
  const distMax = Math.max(1, ...dist.map((d) => d.count));

  const present = GROUPS.map((g) => ({ g, list: rows.filter((r) => r.type === g.type) })).filter(
    (x) => x.list.length
  );

  const groups = present
    .map(({ g, list }) => {
      const shown = list.slice(0, limitPerGroup);
      return `
      <div class="grouphdr"><h3>${esc(g.title)}</h3><span class="gcount">${num(list.length)} keyword${list.length === 1 ? "" : "s"}${
        list.length > shown.length ? ` · showing top ${num(shown.length)}` : ""
      }</span></div>
      <p class="ghint">${esc(g.hint)}</p>
      <table class="grid">${KW_COLS}${HEAD}<tbody>${keywordRows(shown)}</tbody></table>`;
    })
    .join("");

  // Everything the domain currently holds a position for — the plain answer to
  // "what does this rank for", separate from the recommendations.
  const ranking = rows
    .filter((r) => r.position != null)
    .sort((a, b) => a.position - b.position)
    .slice(0, appendixLimit);

  const rivalsTable = (data.competitors || []).length
    ? `<table class="grid">${cols(["34%","22%","22%","22%"])}
        <thead><tr><th>Competitor</th><th class="r">Keywords read</th><th class="r">Shared keywords</th><th class="r">Est. traffic</th></tr></thead>
        <tbody>${data.competitors
          .map(
            (c) =>
              `<tr><td><b>${esc(c.domain)}</b></td><td class="r">${num(c.keywordsFound)}</td><td class="r">${
                c.commonKeywords != null ? num(c.commonKeywords) : "—"
              }</td><td class="r">${c.traffic != null ? num(c.traffic) : "—"}</td></tr>`
          )
          .join("")}</tbody>
      </table>`
    : "";

  const content = `
    <div class="cover">
      <div class="eyebrow">Crossway SEO · Keyword Opportunities</div>
      <h1>${esc(data.domain)}</h1>
      <div class="subhdr">${num(data.overview?.keywords ?? s.ranking)} organic keywords · ${num(
        data.overview?.traffic ?? s.sampleTraffic
      )} est. monthly visits · ${esc(s.rivalsAnalysed || 0)} competitors read · ${esc(day)}</div>
      <div class="rankchip">${num(s.quickWins + s.striking + s.gaps)} keywords worth pursuing</div>
    </div>

    <div class="toc">
      <ol>
        <li>Where the domain stands today</li>
        <li>Opportunity summary</li>
        ${present.map(({ g, list }) => `<li>${esc(g.title)} — ${num(list.length)}</li>`).join("")}
        ${(data.topPages || []).length ? "<li>Pages carrying the traffic</li>" : ""}
        ${rivalsTable ? "<li>Competitors read for gaps</li>" : ""}
        ${ranking.length ? `<li>Appendix — everything currently ranking (${num(ranking.length)})</li>` : ""}
      </ol>
    </div>

    <h2>Where the domain stands today</h2>
    ${metricRow([
      {
        label: "Organic keywords",
        value: num(data.overview?.keywords ?? s.ranking),
        sub: data.overview?.keywords ? "total indexed" : "in this sample",
      },
      {
        label: "Est. monthly traffic",
        value: num(data.overview?.traffic ?? s.sampleTraffic),
        sub: "organic visits",
      },
      {
        label: "Traffic value",
        value: data.overview?.price != null ? `$${num(data.overview.price)}` : "—",
        sub: "equivalent ad spend",
      },
      {
        label: "Top 3 positions",
        value: num(dist.find((d) => d.band === "1–3")?.count),
        sub: "already winning",
      },
    ])}
    ${
      dist.some((d) => d.count > 0)
        ? `<table class="grid">${cols(["14%","30%","36%","20%"])}
            <thead><tr><th>Position</th><th>What it means</th><th>Spread</th><th class="r">Keywords</th></tr></thead>
            <tbody>${dist
              .map((d) => {
                const cls = d.band === "1–3" ? "" : d.band === "4–10" ? "p1" : d.band === "11–20" ? "p2" : "pn";
                const w = Math.max(2, Math.round((d.count / distMax) * 150));
                return `<tr><td><span class="band">${esc(d.band)}</span></td><td class="dir">${esc(d.label)}</td><td><span class="bar ${cls}" style="width:${w}px"></span></td><td class="r">${num(d.count)}</td></tr>`;
              })
              .join("")}</tbody>
          </table>`
        : ""
    }

    <h2>Opportunity summary</h2>
    <p class="lead">
      Scored by reward against effort rather than by what already ranks. Volume and commercial value
      push a keyword up; difficulty pushes it down; and how cheap the win is — a page sitting at #6
      versus a page that doesn't exist yet — decides the rest.
    </p>
    ${metricRow([
      { label: "Quick wins", value: num(s.quickWins), sub: "rank 4–10" },
      { label: "Striking distance", value: num(s.striking), sub: "rank 11–20" },
      { label: "Competitor gaps", value: num(s.gaps), sub: "not ranking yet" },
      { label: "Defending", value: num(s.defend), sub: "already top 3" },
    ])}

    <h2>The work, in order</h2>
    ${groups || `<p class="muted">No opportunities were returned for this domain.</p>`}

    ${
      (data.topPages || []).length
        ? `<h2>Pages carrying the traffic</h2>
           <table class="grid">${cols(["62%","20%","18%"])}
             <thead><tr><th>Page</th><th class="r">Est. traffic</th><th class="r">Keywords</th></tr></thead>
             <tbody>${data.topPages
               .slice(0, 20)
               .map(
                 (p) =>
                   `<tr><td class="kurl">${esc(p.url)}</td><td class="r">${num(p.traffic)}</td><td class="r">${num(p.keywords)}</td></tr>`
               )
               .join("")}</tbody>
           </table>`
        : ""
    }

    ${rivalsTable ? `<h2>Competitors read for gaps</h2>${rivalsTable}` : ""}

    ${
      ranking.length
        ? `<h2>Appendix — everything currently ranking</h2>
           <p class="lead">Every keyword ${esc(data.domain)} holds a position for, best first.</p>
           <table class="grid">${KW_COLS}${HEAD}<tbody>${keywordRows(ranking, { showRivals: false })}</tbody></table>`
        : ""
    }

    ${(data.notes || []).length ? `<p class="lead" style="margin-top:14px">${esc(data.notes.join(" "))}</p>` : ""}

    <div class="foot">Generated by Crossway SEO Tool · Keyword Opportunities · ${esc(data.domain)} · ${esc(day)}</div>
  `;

  return `<style>${STYLES}</style><div class="sr">${content}</div>`;
}

export async function downloadKeywordOpportunitiesPdf(data) {
  await downloadReportPdf(
    buildKeywordOpportunitiesFragment(data),
    `keyword-opportunities-${slugify(data.domain, "domain")}.pdf`,
    { avoid: ["tr"] }
  );
}
