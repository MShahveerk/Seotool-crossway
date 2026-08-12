/**
 * Build a self-contained, print-optimized HTML report from a SERP Analysis result
 * and open it in a new window for "Save as PDF". No external assets — inline CSS only.
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

function metricRow(items) {
  return `<div class="metrics">${items
    .map((i) => `<div class="metric"><span class="mlabel">${esc(i.label)}</span><span class="mval">${i.value}</span>${i.sub ? `<span class="msub">${esc(i.sub)}</span>` : ""}</div>`)
    .join("")}</div>`;
}

function backlinksBlock(b) {
  if (!b) return `<p class="muted">No backlink data indexed.</p>`;
  const refs = (b.refdomainList || []).slice(0, 20);
  const anchors = (b.topAnchors || []).slice(0, 10);
  return `
    <div class="bl">
      ${metricRow([
        { label: "Referring domains", value: num(b.refdomains) },
        { label: "Backlinks", value: num(b.backlinks) },
        { label: "Domain trust", value: b.domainTrust != null ? `${b.domainTrust}/100` : "—" },
      ])}
      ${refs.length ? `<div class="sub"><b>Referring domains giving authority</b><div class="chips">${refs.map((r) => `<span class="chip">${esc(r.domain)}${r.inlinkRank != null ? ` <em>${r.inlinkRank}</em>` : ""}</span>`).join("")}</div></div>` : ""}
      ${anchors.length ? `<div class="sub"><b>Top anchor texts</b><div class="chips">${anchors.map((a) => `<span class="chip">${esc(a.anchor)}${a.count != null ? ` <em>${num(a.count)}</em>` : ""}</span>`).join("")}</div></div>` : ""}
    </div>`;
}

function keywordsTable(profile) {
  const kws = (profile?.keywords || []).slice(0, 10);
  if (!kws.length) return "";
  return `
    <div class="sub"><b>Keywords it ranks for</b>
      <table class="kw"><thead><tr><th>Keyword</th><th>Rank</th><th>Volume</th><th>Traffic</th></tr></thead>
      <tbody>${kws
        .map((k) => `<tr><td>${esc(k.keyword)}</td><td class="c">#${k.position}</td><td class="r">${num(k.volume)}</td><td class="r">${num(k.traffic)}</td></tr>`)
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
          <a class="url">${esc(item.link)}</a>
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

export function buildSerpReportHtml(data) {
  const km = data.keywordMetrics || {};
  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  const styles = `
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111827; margin: 0; padding: 28px 32px; font-size: 12px; line-height: 1.45; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    h2 { font-size: 15px; margin: 22px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #10b98133; color: #065f46; }
    .sub-hdr { color: #6b7280; font-size: 12px; margin-bottom: 14px; }
    .rankline { font-size: 15px; font-weight: 700; margin: 6px 0 2px; }
    .rankline .n { color: #059669; }
    .muted { color: #9ca3af; font-style: italic; }
    .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 8px 0; }
    .metric { background: #f9fafb; border: 1px solid #f0f1f3; border-radius: 8px; padding: 8px; }
    .mlabel { display: block; font-size: 8.5px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; font-weight: 700; }
    .mval { display: block; font-weight: 700; font-size: 13px; margin-top: 2px; }
    .msub { display: block; font-size: 9px; color: #9ca3af; }
    .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px; margin: 10px 0; page-break-inside: avoid; }
    .card.you { border-color: #10b981; background: #ecfdf5aa; }
    .chead { display: flex; gap: 10px; align-items: flex-start; border-bottom: 1px solid #f0f1f3; padding-bottom: 8px; margin-bottom: 8px; }
    .rank { background: #111827; color: #fff; font-weight: 700; border-radius: 8px; padding: 4px 8px; font-size: 12px; }
    .card.you .rank { background: #059669; }
    .ctitle { flex: 1; min-width: 0; }
    .ct { font-weight: 700; font-size: 12.5px; }
    .badge { font-size: 8px; background: #d1fae5; color: #065f46; padding: 2px 6px; border-radius: 10px; vertical-align: middle; }
    .url { color: #059669; font-size: 10px; word-break: break-all; }
    .cbadges { text-align: right; white-space: nowrap; }
    .pill { display: inline-block; background: #eff6ff; color: #1e40af; border: 1px solid #dbeafe; border-radius: 6px; padding: 2px 6px; font-size: 9px; font-weight: 700; margin-left: 4px; }
    .meta { font-style: italic; color: #4b5563; background: #f9fafb; border: 1px solid #f0f1f3; border-radius: 8px; padding: 6px 8px; margin: 6px 0; font-size: 10.5px; }
    .bl { background: #eff6ff55; border: 1px solid #dbeafe; border-radius: 8px; padding: 8px; margin: 6px 0; }
    .sub { margin-top: 8px; }
    .sub b { font-size: 8.5px; text-transform: uppercase; letter-spacing: .04em; color: #374151; }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .chip { background: #fff; border: 1px solid #dbeafe; color: #1e40af; border-radius: 5px; padding: 1px 6px; font-size: 9px; }
    .chip em { color: #93c5fd; font-style: normal; font-weight: 700; }
    table.kw { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 9.5px; }
    table.kw th { text-align: left; background: #f9fafb; color: #6b7280; font-size: 8px; text-transform: uppercase; padding: 3px 6px; border-bottom: 1px solid #eee; }
    table.kw td { padding: 3px 6px; border-bottom: 1px solid #f3f4f6; }
    table.kw td.c { text-align: center; font-weight: 700; } table.kw td.r { text-align: right; }
    ul.hl { list-style: none; margin: 4px 0 0; padding: 0; }
    ul.hl li { font-size: 9.5px; padding: 1px 0; }
    .tag { font-family: monospace; font-size: 8px; font-weight: 700; text-transform: uppercase; padding: 0 4px; border-radius: 3px; background: #eef2ff; color: #4338ca; }
    .action { display: flex; gap: 8px; padding: 8px; border: 1px solid #f0f1f3; border-radius: 8px; margin: 6px 0; page-break-inside: avoid; }
    .prio { font-size: 8px; font-weight: 700; padding: 2px 6px; border-radius: 4px; height: fit-content; }
    .prio.HIGH { background: #fee2e2; color: #b91c1c; } .prio.MEDIUM { background: #fef3c7; color: #92400e; }
    .ladder td { padding: 2px 6px; border-bottom: 1px solid #f3f4f6; font-size: 9.5px; }
    .ladder .dir { color: #9ca3af; }
    .foot { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 9px; text-align: center; }
    @media print { body { padding: 0; } h2 { page-break-after: avoid; } }
  `;

  const yourCard = data.you
    ? card({ ...data.you, isYou: true }, { headings: true })
    : `<p class="muted">${esc(data.yourHost || "Your site")} did not rank in the top ${data.serpDepth} results for this keyword.</p>`;

  const actions = (data.actions || [])
    .map((a) => `<div class="action"><span class="prio ${esc(a.priority)}">${esc(a.priority)}</span><div><b>${esc(a.title)}</b><div>${esc(a.description)}</div></div></div>`)
    .join("");

  const competitors = (data.directCompetitors || []).map((c) => card(c, { headings: true })).join("");
  const leaders = (data.topRankers || []).map((c) => card(c, { headings: false })).join("");

  const ladder = (data.fullLadder || [])
    .map((r) => `<tr><td>#${esc(r.position)}</td><td class="${r.tag === "directory" ? "dir" : ""}">${esc(r.title || r.domain)}</td><td class="dir">${esc(r.domain)}</td><td>${r.tag === "you" ? "YOU" : r.tag === "directory" ? "directory" : ""}</td></tr>`)
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>SERP Analysis — ${esc(data.keyword)}</title><style>${styles}</style></head>
  <body>
    <h1>SERP Analysis: “${esc(data.keyword)}”</h1>
    <div class="sub-hdr">${esc(data.location || "no location")} · ${esc(data.device)} · ${esc(data.serpDepth)} results · generated ${esc(today)}</div>
    <div class="rankline">${data.found ? `Your position: <span class="n">#${esc(data.yourRank)}</span>` : `Not ranking in the top ${esc(data.serpDepth)} results`}</div>

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

    ${ladder ? `<h2>Full Google SERP (${esc(data.serpDepth)} results)</h2><table class="ladder" style="width:100%;border-collapse:collapse">${ladder}</table>` : ""}

    ${(data.relatedQuestions || []).length ? `<h2>People Also Ask</h2><ul>${data.relatedQuestions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>` : ""}

    <div class="foot">Crossway SEO Tool · SERP Analysis · ${esc(data.keyword)} · ${esc(today)}</div>
  </body></html>`;
}

/** Open the report in a new window and trigger the print dialog (Save as PDF). */
export function openSerpReportPrint(data) {
  const html = buildSerpReportHtml(data);
  const w = window.open("", "_blank");
  if (!w) {
    alert("Please allow pop-ups to export the PDF.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  // Give the new document a tick to lay out before printing.
  setTimeout(() => {
    try {
      w.print();
    } catch {
      /* user can print manually */
    }
  }, 400);
}
