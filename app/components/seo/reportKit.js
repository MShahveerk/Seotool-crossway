/**
 * Shared print kit for the client-facing PDF reports.
 *
 * Both reports are light documents on purpose — they get printed and emailed to
 * clients, so they don't inherit the app's dark theme. Two rules are non-
 * negotiable here, because breaking either is what made the first SERP export
 * look washed out:
 *
 *   1. **Nothing lighter than #4B5563 on white.** Greys that read as "subtle"
 *      on a backlit screen disappear on paper and in a rasterised PDF.
 *   2. **Nothing smaller than 9.5px.** Sub-10px type thins out when rasterised
 *      and reads grey even when the colour is pure black. Labels should recede
 *      through weight and case, never through size.
 *
 * Keeping these in one module means a fix to one report can't silently drift
 * away from the other.
 */

export function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function num(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("en-US").format(Math.round(Number(n)));
}

export function slugify(s, fallback = "report") {
  return (
    String(s || fallback)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || fallback
  );
}

export function today() {
  return new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** A row of labelled figures. `items: [{ label, value, sub }]` */
export function metricRow(items) {
  return `<div class="metrics">${items
    .map(
      (i) =>
        `<div class="metric"><span class="mlabel">${esc(i.label)}</span><span class="mval">${i.value}</span>${
          i.sub ? `<span class="msub">${esc(i.sub)}</span>` : ""
        }</div>`
    )
    .join("")}</div>`;
}

/**
 * Column widths for a fixed-layout table.
 *
 * Fixed layout ignores content when sizing, so every table that shares a shape
 * lines up down the page — and a 200-character URL can no longer strangle the
 * numeric columns beside it.
 *
 * @param {string[]} widths CSS widths, one per column (e.g. ["46%","9%",…])
 */
export function cols(widths = []) {
  return `<colgroup>${widths.map((w) => `<col style="width:${w}">`).join("")}</colgroup>`;
}

/** Typography, cover, headings, metric tiles, tables, chips, footer. */
export const BASE_STYLES = `
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
  .sr .lead { color: #374151; font-size: 11.5px; margin: 0 0 10px; }

  .sr .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0; }
  .sr .metric { background: #f7f8f9; border: 1px solid #dfe3e8; border-radius: 8px; padding: 9px 10px; }
  .sr .mlabel { display: block; font-size: 9.5px; text-transform: uppercase; letter-spacing: .05em; color: #4b5563; font-weight: 700; }
  .sr .mval { display: block; font-weight: 700; font-size: 14px; margin-top: 3px; color: #111827; }
  .sr .msub { display: block; font-size: 10px; color: #4b5563; margin-top: 1px; }

  /* The report is rendered inside the live (dark) app, so the app's element
     defaults reach these tables. They set border-top and a dark cell colour
     that the report never overrode, giving every row a dark rule on top and a
     light one underneath. Reset first, then style — nothing here may rely on
     inheriting from the page. */
  .sr table, .sr thead, .sr tbody, .sr tr, .sr th, .sr td {
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    letter-spacing: normal;
    text-transform: none;
    white-space: normal;
  }

  /* table-layout:fixed is the fix for wonky columns. With auto layout the
     browser sizes each column from its content, so one long URL blows out
     column 1, squashes the numbers, and no two tables in the document line up.
     Fixed layout obeys the colgroup widths instead. */
  .sr table.grid {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    margin-top: 6px;
    font-size: 10.5px;
  }
  .sr table.grid th { text-align: left; background: #eef0f3; color: #1f2937; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; padding: 6px 8px; border-bottom: 1px solid #d5dae0; vertical-align: bottom; }
  .sr table.grid td { padding: 5px 8px; border-bottom: 1px solid #e8eaed; color: #1f2937; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }
  .sr table.grid tr:nth-child(even) td { background: #fafbfc; }
  .sr table.grid td.c { text-align: center; font-weight: 700; }
  .sr table.grid td.r { text-align: right; font-variant-numeric: tabular-nums; }
  .sr table.grid th.c { text-align: center; }
  .sr table.grid th.r { text-align: right; }
  .sr table.grid .dir { color: #4b5563; }

  .sr .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .sr .chip { background: #fff; border: 1px solid #c7d7f5; color: #1e3a8a; border-radius: 5px; padding: 2px 7px; font-size: 10px; }
  .sr .chip em { color: #1d4ed8; font-style: normal; font-weight: 700; }

  .sr .foot { margin-top: 24px; padding-top: 11px; border-top: 1px solid #d5dae0; color: #4b5563; font-size: 10px; text-align: center; }
`;

/**
 * Render an offscreen fragment and download it.
 *
 * PNG, not JPEG: these reports are almost entirely small text, and JPEG's
 * chroma subsampling softens exactly that. Larger file, far crisper type —
 * the right trade for something a client opens.
 */
export async function downloadReportPdf(fragmentHtml, filename, { avoid = [] } = {}) {
  const html2pdf = (await import("html2pdf.js")).default;

  const holder = document.createElement("div");
  holder.style.cssText = "position:fixed;left:-10000px;top:0;width:780px;background:#fff;padding:24px;";
  holder.innerHTML = fragmentHtml;
  document.body.appendChild(holder);

  const target = holder.querySelector(".sr") || holder;
  const opt = {
    margin: [10, 10, 12, 10],
    filename,
    image: { type: "png" },
    html2canvas: { scale: 2.5, backgroundColor: "#ffffff", logging: false, windowWidth: 780, useCORS: true },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait", compress: true },
    pagebreak: { mode: ["css", "legacy"], avoid: ["h2", "h3", ...avoid] },
  };

  try {
    await html2pdf().set(opt).from(target).save();
  } finally {
    holder.remove();
  }
}
