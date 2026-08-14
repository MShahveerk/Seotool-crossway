/**
 * Client-facing PDF for Link Opportunities.
 *
 * Written as an outreach brief, not a data dump: the reader should be able to
 * work down it and know who to contact and why. So prospects are grouped by
 * what you'd actually *do* — submit a listing, pitch a roundup, ask for a
 * resource-page add — rather than sorted into one long table by score.
 */

import {
  BASE_STYLES,
  downloadReportPdf,
  esc,
  metricRow,
  num,
  slugify,
  today,
} from "./reportKit";

const STYLES = `
  ${BASE_STYLES}
  .sr .grouphdr { display: flex; align-items: baseline; gap: 8px; margin: 18px 0 4px; }
  .sr .grouphdr h3 { margin: 0; }
  .sr .gcount { font-size: 10px; color: #4b5563; font-weight: 700; }
  .sr .ghint { font-size: 10.5px; color: #374151; margin: 0 0 6px; }
  .sr .dom { font-weight: 700; color: #111827; }
  .sr .pages { color: #4b5563; font-size: 9.5px; word-break: break-all; }
  .sr .hit { display: inline-block; background: #047857; color: #fff; border-radius: 4px; padding: 1px 6px; font-size: 9.5px; font-weight: 700; }
  .sr .hit.one { background: #6b7280; }
  .sr .have { display: inline-block; background: #e5e7eb; color: #1f2937; border-radius: 4px; padding: 1px 6px; font-size: 9.5px; font-weight: 700; }
  .sr .star { color: #b45309; font-weight: 700; }
  .sr .targets { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .sr .tchip { background: #f7f8f9; border: 1px solid #dfe3e8; color: #1f2937; border-radius: 5px; padding: 2px 7px; font-size: 10px; }
  .sr .tchip b { color: #047857; }
`;

/** Groups mirror the intent: what would you actually do about this site? */
const GROUPS = [
  {
    types: ["guest-post"],
    title: "Accepts contributions",
    hint: "These advertise a write-for-us, contribute or submit route. Pitch a piece directly — the fastest wins on this list.",
  },
  {
    types: ["directory"],
    title: "Directories & listings",
    hint: "Submit or claim a listing. Usually quick, often free, and they already list your competitors.",
  },
  {
    types: ["resource"],
    title: "Resource pages",
    hint: "Curated link pages. Email the page owner and make the case that you belong on the list.",
  },
  {
    types: ["roundup"],
    title: "Roundups & comparisons",
    hint: "\"Best of\" posts that already feature rivals. Ask to be added, or to be considered in the next update.",
  },
  {
    types: ["blog", "other"],
    title: "Editorial & unclassified",
    hint: "Reachable but needs a real pitch — a story angle, data, or a quote. Worth a look before writing them off.",
  },
];

function prospectRows(rows) {
  return rows
    .map((r) => {
      const pages = (r.examples || []).slice(0, 2).map((e) => esc(e.sourceUrl)).join("<br>");
      return `<tr>
        <td>
          <span class="dom">${esc(r.domain)}</span>
          ${r.alsoRanks ? ' <span class="star">★ also ranks</span>' : ""}
          ${r.youHaveIt ? ' <span class="have">ALREADY LINKS TO YOU</span>' : ""}
          ${pages ? `<div class="pages">${pages}</div>` : ""}
        </td>
        <td class="c"><span class="hit ${r.hits > 1 ? "" : "one"}">${esc(r.hits)}</span></td>
        <td class="r">${r.authority != null ? esc(r.authority) : "—"}</td>
        <td class="dir">${esc((r.anchors || []).slice(0, 2).join(" · ") || "—")}</td>
      </tr>`;
    })
    .join("");
}

export function buildLinkOpportunitiesFragment(data, { limitPerGroup = 25 } = {}) {
  const day = today();
  const rows = data.intersect || [];
  const summary = data.summary || {};
  const forSite = data.yourHost || "";

  const groups = GROUPS.map((g) => {
    const list = rows.filter((r) => g.types.includes(r.type) && !r.youHaveIt).slice(0, limitPerGroup);
    if (!list.length) return "";
    return `
      <div class="grouphdr"><h3>${esc(g.title)}</h3><span class="gcount">${num(list.length)} site${list.length === 1 ? "" : "s"}</span></div>
      <p class="ghint">${esc(g.hint)}</p>
      <table class="grid">
        <thead><tr><th>Site &amp; example linking pages</th><th>Rivals</th><th>Authority</th><th>Anchors used</th></tr></thead>
        <tbody>${prospectRows(list)}</tbody>
      </table>`;
  }).join("");

  const analysed = (data.targets || [])
    .map((t) => `<span class="tchip"><b>#${esc(t.position ?? "—")}</b> ${esc(t.domain)}</span>`)
    .join("");

  const content = `
    <div class="cover">
      <div class="eyebrow">Crossway SEO · Link Opportunities</div>
      <h1>“${esc(data.keyword)}”</h1>
      <div class="subhdr">${esc(data.location || "no location set")} · ${esc(data.device)} · ${num(data.targets?.length)} ranking sites analysed · ${esc(day)}</div>
      ${forSite ? `<div class="forsite">Prepared for ${esc(forSite)}</div>` : ""}
      <div class="rankchip">${num(summary.prospects)} sites you can pitch</div>
    </div>

    <p class="lead">
      Every site below already links to at least one page ranking for this keyword, so it
      demonstrably links out in this niche. They're grouped by what you'd actually do about them,
      and ordered by how gettable the link is rather than by raw authority${
        forSite ? `. Sites already linking to ${esc(forSite)} are excluded` : ""
      }.
    </p>

    <h2>Summary</h2>
    ${metricRow([
      { label: "Sites you can pitch", value: num(summary.prospects), sub: "listings, resources, roundups" },
      { label: "Shared linkers", value: num(summary.sharedLinkers), sub: "link to 2+ rivals" },
      { label: "Sites found", value: num(summary.uniqueLinkers), sub: "across all rivals" },
      { label: "You already have", value: num(summary.alreadyYours), sub: "excluded below" },
    ])}

    <h2>Opportunities</h2>
    ${groups || `<p class="muted">No actionable prospects were found for this keyword at the current depth.</p>`}

    ${analysed ? `<h2>Ranking sites analysed</h2><div class="targets">${analysed}</div>` : ""}

    ${
      (data.notes || []).length
        ? `<p class="lead" style="margin-top:14px">${esc(data.notes.join(" "))}</p>`
        : ""
    }

    <div class="foot">Generated by Crossway SEO Tool · Link Opportunities · ${esc(day)}</div>
  `;

  return `<style>${STYLES}</style><div class="sr">${content}</div>`;
}

export async function downloadLinkOpportunitiesPdf(data) {
  await downloadReportPdf(
    buildLinkOpportunitiesFragment(data),
    `link-opportunities-${slugify(data.keyword, "keyword")}.pdf`,
    { avoid: ["table"] }
  );
}
