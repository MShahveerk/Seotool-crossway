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
      <table class="kw"><thead><tr><th>Keyword</th><th>Rank</th><th>Volume</th><th>Traffic</th></tr></thead>
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
  return `
    <div class="card ${item.isYou ? "you" : ""}">
      <div class="chead">
        <span class="rank">#${esc(item.position)}</span>
        <div class="ctitle">
          <div class="ct">${esc(item.title)} ${tag ? `<span class="badge">${tag}</span>` : ""}</div>
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

const STYLES = `
  .sr { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #111827; font-size: 12px; line-height: 1.45; background: #fff; padding: 0; }
  .sr * { box-sizing: border-box; }
  .sr .cover { background: linear-gradient(135deg, #064e3b, #065f46 55%, #047857); color: #fff; border-radius: 14px; padding: 26px 28px; margin-bottom: 18px; }
  .sr .cover .eyebrow { font-size: 10px; letter-spacing: .18em; text-transform: uppercase; color: #6ee7b7; font-weight: 700; }
  .sr .cover h1 { font-size: 24px; margin: 6px 0 4px; color: #fff; }
  .sr .cover .subhdr { color: #d1fae5; font-size: 11px; }
  .sr .cover .rankchip { display: inline-block; margin-top: 12px; background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.25); border-radius: 999px; padding: 6px 14px; font-weight: 700; font-size: 13px; }
  .sr h2 { font-size: 15px; margin: 20px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #10b98155; color: #065f46; }
  .sr .muted { color: #9ca3af; font-style: italic; }
  .sr .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 8px 0; }
  .sr .metric { background: #f9fafb; border: 1px solid #eef0f2; border-radius: 8px; padding: 8px; }
  .sr .mlabel { display: block; font-size: 8px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; font-weight: 700; }
  .sr .mval { display: block; font-weight: 700; font-size: 13px; margin-top: 2px; }
  .sr .msub { display: block; font-size: 9px; color: #9ca3af; }
  .sr .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px; margin: 10px 0; page-break-inside: avoid; }
  .sr .card.you { border-color: #10b981; background: #ecfdf5; }
  .sr .chead { display: flex; gap: 10px; align-items: flex-start; border-bottom: 1px solid #f0f1f3; padding-bottom: 8px; margin-bottom: 8px; }
  .sr .rank { background: #111827; color: #fff; font-weight: 700; border-radius: 8px; padding: 5px 9px; font-size: 12px; }
  .sr .card.you .rank { background: #059669; }
  .sr .ctitle { flex: 1; min-width: 0; }
  .sr .ct { font-weight: 700; font-size: 12.5px; }
  .sr .badge { font-size: 8px; background: #d1fae5; color: #065f46; padding: 2px 6px; border-radius: 10px; }
  .sr .url { color: #059669; font-size: 10px; word-break: break-all; }
  .sr .cbadges { text-align: right; white-space: nowrap; }
  .sr .pill { display: inline-block; background: #eff6ff; color: #1e40af; border: 1px solid #dbeafe; border-radius: 6px; padding: 2px 6px; font-size: 9px; font-weight: 700; margin-left: 4px; }
  .sr .meta { font-style: italic; color: #4b5563; background: #f9fafb; border: 1px solid #f0f1f3; border-radius: 8px; padding: 6px 8px; margin: 6px 0; font-size: 10.5px; }
  .sr .bl { background: #eff6ff88; border: 1px solid #dbeafe; border-radius: 8px; padding: 8px; margin: 6px 0; }
  .sr .sub { margin-top: 8px; }
  .sr .sub b { font-size: 8px; text-transform: uppercase; letter-spacing: .04em; color: #374151; }
  .sr .chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
  .sr .chip { background: #fff; border: 1px solid #dbeafe; color: #1e40af; border-radius: 5px; padding: 1px 6px; font-size: 9px; }
  .sr .chip em { color: #60a5fa; font-style: normal; font-weight: 700; }
  .sr table.kw { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 9.5px; }
  .sr table.kw th { text-align: left; background: #f9fafb; color: #6b7280; font-size: 8px; text-transform: uppercase; padding: 3px 6px; border-bottom: 1px solid #eee; }
  .sr table.kw td { padding: 3px 6px; border-bottom: 1px solid #f3f4f6; }
  .sr table.kw td.c { text-align: center; font-weight: 700; } .sr table.kw td.r { text-align: right; }
  .sr ul.hl { list-style: none; margin: 4px 0 0; padding: 0; }
  .sr ul.hl li { font-size: 9.5px; padding: 1px 0; }
  .sr .tag { font-family: monospace; font-size: 8px; font-weight: 700; text-transform: uppercase; padding: 0 4px; border-radius: 3px; background: #eef2ff; color: #4338ca; }
  .sr .action { display: flex; gap: 8px; padding: 8px; border: 1px solid #f0f1f3; border-radius: 8px; margin: 6px 0; page-break-inside: avoid; }
  .sr .prio { font-size: 8px; font-weight: 700; padding: 2px 6px; border-radius: 4px; height: fit-content; }
  .sr .prio.HIGH { background: #fee2e2; color: #b91c1c; } .sr .prio.MEDIUM { background: #fef3c7; color: #92400e; }
  .sr table.ladder { width: 100%; border-collapse: collapse; }
  .sr table.ladder td { padding: 2px 6px; border-bottom: 1px solid #f3f4f6; font-size: 9.5px; }
  .sr table.ladder .dir { color: #9ca3af; }
  .sr .foot { margin-top: 22px; padding-top: 10px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 9px; text-align: center; }
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

  const competitors = (data.directCompetitors || []).map((c) => card(c, { headings: true })).join("");
  const leaders = (data.topRankers || []).map((c) => card(c, { headings: false })).join("");

  const ladder = (data.fullLadder || [])
    .map((r) => `<tr><td>#${esc(r.position)}</td><td class="${r.tag === "directory" ? "dir" : ""}">${esc(r.title || r.domain)}</td><td class="dir">${esc(r.domain)}</td><td>${r.tag === "you" ? "YOU" : r.tag === "directory" ? "directory" : ""}</td></tr>`)
    .join("");

  const content = `
    <div class="cover">
      <div class="eyebrow">Crossway SEO · SERP Analysis</div>
      <h1>“${esc(data.keyword)}”</h1>
      <div class="subhdr">${esc(data.location || "no location")} · ${esc(data.device)} · ${esc(data.serpDepth)} results · ${esc(today)}</div>
      <div class="rankchip">${data.found ? `Your position: #${esc(data.yourRank)}` : `Not ranking in the top ${esc(data.serpDepth)} results`}</div>
    </div>

    <h2>Keyword Metrics</h2>
    ${km.available ? metricRow([
      { label: "Search volume", value: num(km.volume), sub: "/ mo" },
      { label: "Difficulty", value: km.difficulty != null ? `${km.difficulty}/100` : "—" },
      { label: "CPC", value: km.cpcFormatted || (km.cpc != null ? `$${km.cpc}` : "—") },
      { label: "Competition", value: esc(km.competitionLevel || "—"), sub: `trend: ${esc(km.trendDirection || "stable")}` },
    ]) : `<p class="muted">Keyword metrics unavailable.</p>`}

    <h2>Your Site</h2>
    ${yourCard}
    ${actions ? `<h2>How To Move Up</h2>${actions}` : ""}
    ${competitors ? `<h2>Your Direct Competitors</h2>${competitors}` : ""}
    ${leaders ? `<h2>Top Rankers</h2>${leaders}` : ""}
    ${ladder ? `<h2>Full Google SERP (${esc(data.serpDepth)} results)</h2><table class="ladder">${ladder}</table>` : ""}
    ${(data.relatedQuestions || []).length ? `<h2>People Also Ask</h2><ul>${data.relatedQuestions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>` : ""}
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
    image: { type: "jpeg", quality: 0.96 },
    html2canvas: { scale: 2, backgroundColor: "#ffffff", logging: false, windowWidth: 780 },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["css", "legacy"], avoid: [".card", ".action"] },
  };

  try {
    await html2pdf().set(opt).from(target).save();
  } finally {
    holder.remove();
  }
}
