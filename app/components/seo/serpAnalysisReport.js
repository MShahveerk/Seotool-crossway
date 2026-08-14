/**
 * Build a beautiful, self-contained PDF from a SERP Analysis result and DOWNLOAD it
 * (client-side, via html2pdf.js). Styles are scoped under `.sr` so they never leak
 * into the app during generation. No external assets.
 */

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function num(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("en-US").format(Math.round(Number(n)));
}

function slugify(s) {
  return String(s || "serp-analysis")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "serp-analysis";
}

function metricRow(items) {
  return `<div class="metrics">${items
    .map((i) => `<div class="metric"><span class="mlabel">${esc(i.label)}</span><span class="mval">${i.value}</span>${i.sub ? `<span class="msub">${esc(i.sub)}</span>` : ""}</div>`)
    .join("")}</div>`;
}

function backlinksBlock(b) {
  if (!b) return `<p class="muted">No backlink data indexed.</p>`;
  const refs = (b.refdomainList || []).slice(0, 24);
  const anchors = (b.topAnchors || []).slice(0, 8);
  return `
    <div class="bl">
      ${metricRow([
        { label: "Referring domains", value: num(b.refdomains) },
        { label: "Backlinks", value: num(b.backlinks) },
        { label: "Domain trust", value: b.domainTrust != null ? `${b.domainTrust}/100` : "—" },
      ])}
      ${refs.length ? `<div class="sub"><b>Referring domains giving authority</b><div class="chips">${refs.map((r) => `<span class="chip">${esc(r.domain)}${r.inlinkRank != null ? ` <em>${r.inlinkRank}</em>` : ""}</span>`).join("")}</div></div>` : ""}
      ${anchors.length ? `<div class="sub"><b>Top anchor texts</b><div class="chips">${anchors.map((a) => `<span class="chip">${esc(a.anchor)}</span>`).join("")}</div></div>` : ""}
    </div>`;
}

function keywordsTable(profile) {
  const kws = (profile?.keywords || []).slice(0, 8);
  if (!kws.length) return "";
  return `
    <div class="sub"><b>Keywords it ranks for</b>
      <table class="kw"><colgroup><col style="width:52%"><col style="width:14%"><col style="width:17%"><col style="width:17%"></colgroup>
      <thead><tr><th>Keyword</th><th class="c">Rank</th><th class="r">Volume</th><th class="r">Traffic</th></tr></thead>
      <tbody>${kws
        .map((k) => `<tr><td>${esc(k.keyword)}</td><td class="c">#${esc(k.position)}</td><td class="r">${num(k.volume)}</td><td class="r">${num(k.traffic)}</td></tr>`)
        .join("")}</tbody></table>
    </div>`;
}

function headingsBlock(headings) {
  const list = (headings || []).slice(0, 12);
  if (!list.length) return "";
  return `<div class="sub"><b>Content outline</b><ul class="hl">${list
    .map((h) => `<li><span class="tag ${esc(h.tag)}">${esc(h.tag)}</span> ${esc(h.text)}</li>`)
    .join("")}</ul></div>`;
}

function card(item, opts = {}) {
  const tag = item.isYou ? "YOU" : item.relation === "above" ? "ABOVE YOU" : item.relation === "below" ? "BELOW YOU" : "";
  const tagCls = item.isYou ? "" : item.relation === "above" ? " above" : item.relation === "below" ? " below" : "";
  return `
    <div class="card ${item.isYou ? "you" : ""}">
      <div class="chead">
        <span class="rank">#${esc(item.position)}</span>
        <div class="ctitle">
          <div class="ct">${esc(item.title)} ${tag ? `<span class="badge${tagCls}">${tag}</span>` : ""}</div>
          <span class="url">${esc(item.link)}</span>
        </div>
        <div class="cbadges">
          ${item.speed?.score != null ? `<span class="pill">Speed ${item.speed.score}</span>` : ""}
          ${item.authority?.score != null ? `<span class="pill">DA ${item.authority.score}/10</span>` : ""}
        </div>
      </div>
      ${metricRow([
        { label: "Content", value: `${num(item.wordCount)} words`, sub: `~${item.readingTimeMinutes || 1} min` },
        { label: "Structure", value: `H1:${item.h1Count} H2:${item.h2Count}`, sub: `${(item.headings || []).length} headings` },
        { label: "Vitals", value: `LCP ${esc(item.speed?.lcp || "—")}`, sub: `CLS ${esc(item.speed?.cls || "—")}` },
        { label: "Images", value: num(item.totalImages), sub: `${num(item.imagesWithAlt)} w/ alt` },
      ])}
      ${item.metaDescription ? `<p class="meta">“${esc(item.metaDescription)}”</p>` : ""}
      ${backlinksBlock(item.backlinks)}
      ${opts.headings ? headingsBlock(item.headings) : ""}
      ${keywordsTable(item.keywordProfile)}
    </div>`;
}

/**
 * Print styling.
 *
 * Two rules govern everything here, because the previous version broke both:
 *  1. **Nothing lighter than #4B5563 on white.** The old palette leaned on
 *     #9CA3AF for labels, sub-values, footers and the ladder — fine on a backlit
 *     screen, washed out on paper and in a rasterised PDF.
 *  2. **Nothing smaller than 9.5px.** Sub-10px type doesn't survive rasterising;
 *     it thins out and reads grey even when the colour is black. Labels moved
 *     from 8px to 9.5px and gained weight instead of relying on size to recede.
 *
 * Colour is a light document on purpose — this gets printed and emailed to
 * clients. Crossway green is the accent; everything else is ink on paper.
 */
const STYLES = `
  .sr { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #111827; font-size: 12.5px; line-height: 1.5; background: #fff; padding: 0; }
  .sr * { box-sizing: border-box; }

  .sr .cover { background: linear-gradient(135deg, #052e22, #065f46 58%, #047857); color: #fff; border-radius: 14px; padding: 28px 30px; margin-bottom: 20px; }
  .sr .cover .eyebrow { font-size: 10.5px; letter-spacing: .18em; text-transform: uppercase; color: #a7f3d0; font-weight: 700; }
  .sr .cover h1 { font-size: 26px; margin: 8px 0 6px; color: #fff; line-height: 1.2; }
  .sr .cover .subhdr { color: #e6fffa; font-size: 11.5px; font-weight: 500; }
  .sr .cover .forsite { color: #a7f3d0; font-size: 11px; margin-top: 4px; }
  .sr .cover .rankchip { display: inline-block; margin-top: 14px; background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.4); border-radius: 999px; padding: 7px 16px; font-weight: 700; font-size: 13.5px; color: #fff; }

  .sr h2 { font-size: 15.5px; margin: 22px 0 10px; padding-bottom: 7px; border-bottom: 2px solid #059669; color: #064e3b; }
  .sr h3 { font-size: 12.5px; margin: 14px 0 6px; color: #065f46; text-transform: uppercase; letter-spacing: .06em; }
  .sr .muted { color: #4b5563; }

  .sr .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0; }
  .sr .metric { background: #f7f8f9; border: 1px solid #dfe3e8; border-radius: 8px; padding: 9px 10px; }
  .sr .mlabel { display: block; font-size: 9.5px; text-transform: uppercase; letter-spacing: .05em; color: #4b5563; font-weight: 700; }
  .sr .mval { display: block; font-weight: 700; font-size: 14px; margin-top: 3px; color: #111827; }
  .sr .msub { display: block; font-size: 10px; color: #4b5563; margin-top: 1px; }

  .sr .card { border: 1px solid #d5dae0; border-radius: 12px; padding: 15px; margin: 11px 0; page-break-inside: avoid; }
  .sr .card.you { border-color: #059669; border-width: 2px; background: #f0fdf7; }
  .sr .chead { display: flex; gap: 11px; align-items: flex-start; border-bottom: 1px solid #dfe3e8; padding-bottom: 9px; margin-bottom: 9px; }
  .sr .rank { background: #111827; color: #fff; font-weight: 700; border-radius: 8px; padding: 6px 10px; font-size: 12.5px; }
  .sr .card.you .rank { background: #047857; }
  .sr .ctitle { flex: 1; min-width: 0; }
  .sr .ct { font-weight: 700; font-size: 13px; color: #111827; }
  .sr .badge { font-size: 9.5px; font-weight: 700; background: #047857; color: #fff; padding: 2px 7px; border-radius: 10px; margin-left: 4px; }
  .sr .badge.above { background: #b91c1c; }
  .sr .badge.below { background: #4b5563; }
  .sr .url { color: #047857; font-size: 10.5px; word-break: break-all; font-weight: 500; }
  .sr .cbadges { text-align: right; white-space: nowrap; }
  .sr .pill { display: inline-block; background: #eef4ff; color: #1e3a8a; border: 1px solid #c7d7f5; border-radius: 6px; padding: 3px 7px; font-size: 10px; font-weight: 700; margin-left: 4px; }

  .sr .meta { color: #374151; background: #f7f8f9; border-left: 3px solid #059669; border-radius: 0 6px 6px 0; padding: 7px 10px; margin: 8px 0; font-size: 11px; }
  .sr .bl { background: #f5f9ff; border: 1px solid #c7d7f5; border-radius: 8px; padding: 9px; margin: 8px 0; }
  .sr .sub { margin-top: 10px; }
  .sr .sub b { display: block; font-size: 9.5px; text-transform: uppercase; letter-spacing: .05em; color: #1f2937; margin-bottom: 4px; }
  .sr .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .sr .chip { background: #fff; border: 1px solid #c7d7f5; color: #1e3a8a; border-radius: 5px; padding: 2px 7px; font-size: 10px; }
  .sr .chip em { color: #1d4ed8; font-style: normal; font-weight: 700; }

  /* The report renders inside the live (dark) app, so its element defaults
     reach these tables — notably a dark border-top on every cell that the
     report never overrode. Reset first, then style. */
  .sr table, .sr thead, .sr tbody, .sr tr, .sr th, .sr td {
    border: 0; background: transparent; color: inherit; font: inherit;
    letter-spacing: normal; text-transform: none; white-space: normal;
  }
  /* Fixed layout so a long keyword can't strangle the numeric columns, and so
     every table in the document lines up with the others. */
  .sr table.kw { width: 100%; table-layout: fixed; border-collapse: collapse; margin-top: 4px; font-size: 10.5px; }
  .sr table.kw th { text-align: left; background: #eef0f3; color: #1f2937; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; padding: 5px 7px; border-bottom: 1px solid #d5dae0; }
  .sr table.kw th.c { text-align: center; }
  .sr table.kw th.r { text-align: right; }
  .sr table.kw td { overflow-wrap: anywhere; word-break: break-word; }
  .sr table.kw td { padding: 4px 7px; border-bottom: 1px solid #e8eaed; color: #1f2937; }
  .sr table.kw tr:nth-child(even) td { background: #fafbfc; }
  .sr table.kw td.c { text-align: center; font-weight: 700; } .sr table.kw td.r { text-align: right; }

  .sr ul.hl { list-style: none; margin: 4px 0 0; padding: 0; }
  .sr ul.hl li { font-size: 10.5px; padding: 2px 0; color: #1f2937; }
  .sr .tag { font-family: monospace; font-size: 9.5px; font-weight: 700; text-transform: uppercase; padding: 1px 5px; border-radius: 3px; background: #e0e7ff; color: #3730a3; margin-right: 4px; }

  .sr .action { display: flex; gap: 9px; padding: 10px; border: 1px solid #d5dae0; border-radius: 8px; margin: 7px 0; page-break-inside: avoid; }
  .sr .action b { font-size: 12px; color: #111827; }
  .sr .action div div { color: #374151; font-size: 11px; margin-top: 2px; }
  .sr .prio { font-size: 9.5px; font-weight: 700; padding: 3px 7px; border-radius: 4px; height: fit-content; white-space: nowrap; }
  .sr .prio.HIGH { background: #b91c1c; color: #fff; } .sr .prio.MEDIUM { background: #b45309; color: #fff; }

  .sr table.ladder { width: 100%; table-layout: fixed; border-collapse: collapse; }
  .sr table.ladder td { padding: 4px 7px; border-bottom: 1px solid #e8eaed; font-size: 10.5px; color: #1f2937; }
  .sr table.ladder tr:nth-child(even) td { background: #fafbfc; }
  .sr table.ladder .dir { color: #4b5563; }
  .sr table.ladder .me { font-weight: 700; color: #047857; }

  .sr ul.paa { margin: 6px 0 0; padding-left: 18px; }
  .sr ul.paa li { font-size: 11px; color: #1f2937; padding: 2px 0; }

  .sr .foot { margin-top: 24px; padding-top: 11px; border-top: 1px solid #d5dae0; color: #4b5563; font-size: 10px; text-align: center; }
`;

export function buildSerpReportFragment(data) {
  const km = data.keywordMetrics || {};
  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  const yourCard = data.you
    ? card({ ...data.you, isYou: true }, { headings: true })
    : `<p class="muted">${esc(data.yourHost || "Your site")} did not rank in the top ${esc(data.serpDepth)} results for this keyword.</p>`;

  const actions = (data.actions || [])
    .map((a) => `<div class="action"><span class="prio ${esc(a.priority)}">${esc(a.priority)}</span><div><b>${esc(a.title)}</b><div>${esc(a.description)}</div></div></div>`)
    .join("");

  // Grouped the same way the app groups them, so the PDF and the screen tell
  // the same story rather than two different ones.
  const rivals = data.directCompetitors || [];
  const above = rivals.filter((c) => c.relation === "above").map((c) => card(c, { headings: true })).join("");
  const below = rivals.filter((c) => c.relation === "below").map((c) => card(c, { headings: true })).join("");
  const other = rivals
    .filter((c) => c.relation !== "above" && c.relation !== "below")
    .map((c) => card(c, { headings: true }))
    .join("");
  const leaders = (data.topRankers || []).map((c) => card(c, { headings: false })).join("");

  const ladder = (data.fullLadder || [])
    .map(
      (r) =>
        `<tr><td class="${r.tag === "you" ? "me" : ""}">#${esc(r.position)}</td><td class="${r.tag === "directory" ? "dir" : r.tag === "you" ? "me" : ""}">${esc(r.title || r.domain)}</td><td class="dir">${esc(r.domain)}</td><td class="${r.tag === "you" ? "me" : "dir"}">${r.tag === "you" ? "YOU" : r.tag === "directory" ? "directory" : ""}</td></tr>`
    )
    .join("");

  const analysedFor = data.yourHost || "";

  const content = `
    <div class="cover">
      <div class="eyebrow">Crossway SEO · SERP Analysis</div>
      <h1>“${esc(data.keyword)}”</h1>
      <div class="subhdr">${esc(data.location || "no location set")} · ${esc(data.device)} · ${esc(data.serpDepth)} results · ${esc(today)}</div>
      ${analysedFor ? `<div class="forsite">Analysed for ${esc(analysedFor)}</div>` : ""}
      <div class="rankchip">${data.found ? `Position #${esc(data.yourRank)}` : `Not ranking in the top ${esc(data.serpDepth)} results`}</div>
    </div>

    <h2>Keyword Metrics</h2>
    ${km.available ? metricRow([
      { label: "Search volume", value: num(km.volume), sub: "per month" },
      { label: "Difficulty", value: km.difficulty != null ? `${km.difficulty}/100` : "—" },
      { label: "CPC", value: km.cpcFormatted || (km.cpc != null ? `$${km.cpc}` : "—") },
      { label: "Competition", value: esc(km.competitionLevel || "—"), sub: `trend: ${esc(km.trendDirection || "stable")}` },
    ]) : `<p class="muted">Keyword metrics unavailable for this keyword.</p>`}

    <h2>${analysedFor ? esc(analysedFor) : "Your Site"}</h2>
    ${yourCard}
    ${actions ? `<h2>How To Move Up</h2>${actions}` : ""}
    ${above || below || other ? `<h2>Direct Competitors</h2>` : ""}
    ${above ? `<h3>Above you</h3>${above}` : ""}
    ${below ? `<h3>Below you</h3>${below}` : ""}
    ${other ? `<h3>Nearest rivals</h3>${other}` : ""}
    ${leaders ? `<h2>Top Ranking Sites</h2>${leaders}` : ""}
    ${ladder ? `<h2>Full Google SERP (${esc(data.serpDepth)} results)</h2><table class="ladder"><colgroup><col style="width:8%"><col style="width:46%"><col style="width:32%"><col style="width:14%"></colgroup>${ladder}</table>` : ""}
    ${(data.relatedQuestions || []).length ? `<h2>People Also Ask</h2><ul class="paa">${data.relatedQuestions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>` : ""}
    <div class="foot">Generated by Crossway SEO Tool · SERP Analysis · ${esc(today)}</div>
  `;

  return `<style>${STYLES}</style><div class="sr">${content}</div>`;
}

/** Render the report offscreen and download it as a PDF. */
export async function downloadSerpReportPdf(data) {
  const html2pdf = (await import("html2pdf.js")).default;

  const holder = document.createElement("div");
  holder.style.cssText = "position:fixed;left:-10000px;top:0;width:780px;background:#fff;padding:24px;";
  holder.innerHTML = buildSerpReportFragment(data);
  document.body.appendChild(holder);

  const target = holder.querySelector(".sr") || holder;
  const opt = {
    margin: [10, 10, 12, 10],
    filename: `serp-analysis-${slugify(data.keyword)}.pdf`,
    // PNG, not JPEG. The report is almost entirely small text, and JPEG's
    // chroma subsampling softens exactly that — it was a large part of why the
    // text read washed out. Bigger file, dramatically crisper type.
    image: { type: "png" },
    html2canvas: {
      scale: 2.5,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: 780,
      useCORS: true,
    },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait", compress: true },
    pagebreak: { mode: ["css", "legacy"], avoid: [".card", ".action", "h2", "h3"] },
  };

  try {
    await html2pdf().set(opt).from(target).save();
  } finally {
    holder.remove();
  }
}
