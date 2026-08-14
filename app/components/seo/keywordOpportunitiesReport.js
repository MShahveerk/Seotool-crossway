/**
 * Client-facing PDF for Keyword Opportunities.
 *
 * Ordered as a plan of work rather than a keyword dump: quick wins first
 * (cheapest gains), then striking distance, then the gaps that need new pages.
 * Each section states what the work actually is, so the reader can hand it
 * straight to whoever writes.
 */

import { BASE_STYLES, downloadReportPdf, esc, metricRow, num, slugify, today } from "./reportKit";

const STYLES = `
  ${BASE_STYLES}
  .sr .grouphdr { display: flex; align-items: baseline; gap: 8px; margin: 18px 0 4px; }
  .sr .grouphdr h3 { margin: 0; }
  .sr .gcount { font-size: 10px; color: #4b5563; font-weight: 700; }
  .sr .ghint { font-size: 10.5px; color: #374151; margin: 0 0 6px; }
  .sr .kw { font-weight: 700; color: #111827; }
  .sr .kurl { color: #4b5563; font-size: 9.5px; word-break: break-all; }
  .sr .pos { display: inline-block; background: #047857; color: #fff; border-radius: 4px; padding: 1px 6px; font-size: 9.5px; font-weight: 700; }
  .sr .pos.none { background: #6b7280; }
  .sr .eff-low { color: #047857; font-weight: 700; }
  .sr .eff-medium { color: #1d4ed8; font-weight: 700; }
  .sr .eff-high { color: #b45309; font-weight: 700; }
  .sr .eff-veryhigh { color: #b91c1c; font-weight: 700; }
  .sr .score { font-weight: 700; color: #111827; }
`;

const GROUPS = [
  {
    type: "quick-win",
    title: "Quick wins — rank 4 to 10",
    hint: "The page already ranks and Google already trusts it for the term. A refreshed title, a stronger intro, better internal links. Cheapest traffic on this list; start here.",
  },
  {
    type: "striking",
    title: "Striking distance — rank 11 to 20",
    hint: "One serious push from page one. Expand the page properly, add what the top results cover and you don't, and earn a link or two to it.",
  },
  {
    type: "gap",
    title: "Competitor gaps — not ranking",
    hint: "Competitors rank for these and this domain doesn't at all. Proven to carry traffic in this niche. Each needs a new page written for it.",
  },
  {
    type: "defend",
    title: "Defend — already top 3",
    hint: "Nothing to win, plenty to lose. Keep these pages current and watch for rivals closing in.",
  },
];

function effortClass(effort) {
  return `eff-${String(effort || "unknown").replace(/\s+/g, "")}`;
}

function rowsFor(rows) {
  return rows
    .map(
      (r) => `<tr>
        <td>
          <span class="kw">${esc(r.keyword)}</span>
          ${r.url ? `<div class="kurl">${esc(r.url)}</div>` : ""}
        </td>
        <td class="c"><span class="pos ${r.position == null ? "none" : ""}">${r.position != null ? `#${esc(r.position)}` : "—"}</span></td>
        <td class="r">${num(r.volume)}</td>
        <td class="r"><span class="${effortClass(r.effort)}">${r.difficulty ?? "—"}</span> <span class="dir">${esc(r.effort)}</span></td>
        <td class="r">${esc(r.cpcFormatted || (r.cpc != null ? `$${r.cpc}` : "—"))}</td>
        <td class="r">${r.rivalCount ? esc(r.rivalCount) : "—"}</td>
        <td class="r score">${esc(r.score)}</td>
      </tr>`
    )
    .join("");
}

export function buildKeywordOpportunitiesFragment(data, { limitPerGroup = 25 } = {}) {
  const day = today();
  const rows = data.rows || [];
  const s = data.summary || {};

  const groups = GROUPS.map((g) => {
    const list = rows.filter((r) => r.type === g.type).slice(0, limitPerGroup);
    if (!list.length) return "";
    return `
      <div class="grouphdr"><h3>${esc(g.title)}</h3><span class="gcount">${num(list.length)} keyword${list.length === 1 ? "" : "s"}</span></div>
      <p class="ghint">${esc(g.hint)}</p>
      <table class="grid">
        <thead><tr><th>Keyword</th><th>Rank</th><th>Volume</th><th>Effort</th><th>CPC</th><th>Rivals</th><th>Score</th></tr></thead>
        <tbody>${rowsFor(list)}</tbody>
      </table>`;
  }).join("");

  const rivals = (data.competitors || [])
    .map((c) => `<span class="chip">${esc(c.domain)} <em>${num(c.keywordsFound)}</em></span>`)
    .join("");

  const content = `
    <div class="cover">
      <div class="eyebrow">Crossway SEO · Keyword Opportunities</div>
      <h1>${esc(data.domain)}</h1>
      <div class="subhdr">${num(s.ranking)} ranking keywords · ${esc(s.rivalsAnalysed || 0)} competitors read · ${esc(day)}</div>
      <div class="rankchip">${num(s.quickWins + s.striking + s.gaps)} keywords worth pursuing</div>
    </div>

    <p class="lead">
      Ordered by reward against effort rather than by what already ranks. Volume and commercial
      value push a keyword up; difficulty pushes it down; and how cheap the win is — a page sitting
      at #6 versus a page that doesn't exist yet — decides the rest.
    </p>

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
        value: num((s.distribution || []).find((d) => d.band === "1–3")?.count),
        sub: "already winning",
      },
    ])}
    ${
      (s.distribution || []).some((d) => d.count > 0)
        ? `<table class="grid">
            <thead><tr><th>Position band</th><th>What it means</th><th>Keywords</th></tr></thead>
            <tbody>${(s.distribution || [])
              .map(
                (d) =>
                  `<tr><td><b>${esc(d.band)}</b></td><td class="dir">${esc(d.label)}</td><td class="r">${num(d.count)}</td></tr>`
              )
              .join("")}</tbody>
          </table>`
        : ""
    }

    <h2>Opportunity summary</h2>
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
           <table class="grid">
             <thead><tr><th>Page</th><th>Est. traffic</th><th>Keywords</th></tr></thead>
             <tbody>${data.topPages
               .slice(0, 12)
               .map(
                 (p) =>
                   `<tr><td class="kurl">${esc(p.url)}</td><td class="r">${num(p.traffic)}</td><td class="r">${num(p.keywords)}</td></tr>`
               )
               .join("")}</tbody>
           </table>`
        : ""
    }

    ${rivals ? `<h2>Competitors read for gaps</h2><div class="chips">${rivals}</div>` : ""}

    ${(data.notes || []).length ? `<p class="lead" style="margin-top:14px">${esc(data.notes.join(" "))}</p>` : ""}

    <div class="foot">Generated by Crossway SEO Tool · Keyword Opportunities · ${esc(day)}</div>
  `;

  return `<style>${STYLES}</style><div class="sr">${content}</div>`;
}

export async function downloadKeywordOpportunitiesPdf(data) {
  await downloadReportPdf(
    buildKeywordOpportunitiesFragment(data),
    `keyword-opportunities-${slugify(data.domain, "domain")}.pdf`,
    { avoid: ["table"] }
  );
}
