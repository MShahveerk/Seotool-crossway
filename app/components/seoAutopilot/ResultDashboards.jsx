"use client";

import { FiCopy, FiExternalLink, FiMapPin, FiCheckCircle } from "react-icons/fi";
import { Link2, Radar, Search, Target } from "lucide-react";
import SeoAutopilotMark from "./SeoAutopilotMark";

/** Client-side fallback when older Fixer artifacts lack guide JSON */
const CLIENT_GUIDES = {
  robots_txt: {
    id: "robots_txt",
    title: "Allow AI crawlers in robots.txt",
    purpose:
      "Explicitly allowing GPTBot, ClaudeBot, PerplexityBot, and OAI-SearchBot makes your pages eligible for AI citation.",
    where: "https://yoursite.com/robots.txt (site root) or your CMS SEO plugin’s robots editor",
    difficulty: "Easy",
    platforms: ["WordPress", "Next.js /public", "Shopify", "Webflow"],
    steps: [
      "Open /robots.txt in a browser. Create it at the web root if it 404s.",
      "WordPress: SEO plugin → robots.txt editor → paste the payload → Save.",
      "Next.js: add public/robots.txt, commit, redeploy.",
      "Keep existing Sitemap lines; merge Autopilot’s AI bot allow blocks.",
    ],
    verify: "Reload /robots.txt publicly and confirm the AI User-agent blocks appear.",
    caution: "Never Disallow: / globally. Only block private areas.",
  },
  llms_txt: {
    id: "llms_txt",
    title: "Publish llms.txt",
    purpose: "A short AI “menu” describing your brand and best URLs for accurate citations.",
    where: "https://yoursite.com/llms.txt",
    difficulty: "Easy",
    platforms: ["Next.js /public", "WordPress root", "CDN / static host"],
    steps: [
      "Copy the llms.txt payload and fill real brand name + URLs.",
      "Upload as plain text at the site root (same level as robots.txt).",
      "Next.js: public/llms.txt then redeploy.",
      "Confirm the URL is public (no login wall) and text/plain.",
    ],
    verify: "Open /llms.txt — you should see headings and links, not a 404 HTML page.",
    caution: "Link only to pages you want AI to summarize.",
  },
  faq_schema: {
    id: "faq_schema",
    title: "Add FAQ JSON-LD",
    purpose: "Marks Q&A so Google and AI systems can surface rich results / citations.",
    where: "Inside <head> or end of <body> on the FAQ / service page",
    difficulty: "Medium",
    platforms: ["WordPress", "Next.js", "Shopify"],
    steps: [
      "Pick one high-intent page.",
      "Wrap the Autopilot JSON in <script type=\"application/ld+json\">…</script>.",
      "WordPress: Rank Math / Yoast schema or a header-footer scripts plugin.",
      "Next.js: inject JSON-LD in the page component.",
      "Ensure FAQ text matches visible on-page content.",
    ],
    verify: "Run Google’s Rich Results Test on the page URL.",
    caution: "Do not mark up FAQ that users cannot see.",
  },
  answer_block: {
    id: "answer_block",
    title: "Add a citable answer block",
    purpose: "Short, quotable paragraph AI engines can cite with your brand attached.",
    where: "Target page on the Fixer card — under the H1",
    difficulty: "Easy",
    platforms: ["WordPress", "Next.js", "Any CMS"],
    steps: [
      "Open the page URL on this card.",
      "Paste the citable answer under the H1 (40–80 words).",
      "Update meta description with the provided meta line.",
      "Publish and internal-link once from a related page.",
    ],
    verify: "Preview the live page — answer and meta are present.",
    caution: "Keep one clear, defensible claim.",
  },
};

function fmt(n, digits = 0) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(Number(n));
}

function fmtPct(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Number(n) > 1 ? Number(n) : Number(n) * 100;
  return `${v.toFixed(1)}%`;
}

function MetricTile({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_8px_rgba(0,0,0,0.03)]">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-gray-900 tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-gray-500 leading-snug">{hint}</p> : null}
    </div>
  );
}

function ScoreHero({ label, value, tone = "emerald" }) {
  const n = Number(value);
  const show = Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  const bar =
    tone === "sky"
      ? "from-sky-500 to-cyan-400"
      : show != null && show < 45
        ? "from-amber-500 to-orange-400"
        : "from-emerald-600 to-lime-400";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_14px_rgba(0,0,0,0.04)]">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${bar}`} />
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-2 text-5xl font-semibold tracking-tight bg-gradient-to-br ${bar} bg-clip-text text-transparent`}>
        {show != null ? show : "—"}
      </p>
      <p className="text-xs text-gray-500 mt-1">out of 100</p>
    </div>
  );
}

function impactClass(impact) {
  const k = String(impact || "").toLowerCase();
  if (k === "high") return "bg-red-50 text-red-800 border-red-100";
  if (k === "medium") return "bg-amber-50 text-amber-900 border-amber-100";
  return "bg-gray-50 text-gray-700 border-gray-100";
}

export function ScorecardDashboard({ scorecard, siteLink }) {
  if (!scorecard) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
        <Radar className="mx-auto h-8 w-8 text-emerald-700/70" />
        <p className="mt-3 text-sm font-semibold text-gray-900">No scorecard yet</p>
        <p className="mt-1 text-sm text-gray-500 max-w-md mx-auto">
          Run Autopilot (Auditor + GEO Spy + Tracker) to build a live Google + GEO + backlink briefing for{" "}
          {siteLink || "this site"}.
        </p>
      </div>
    );
  }

  const m = scorecard.metrics || {};
  const bl = scorecard.backlinks || {};
  const geo = scorecard.geo || {};
  const tracker = scorecard.tracker || {};

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <ScoreHero label="Google health" value={scorecard.googleHealthScore} />
        <ScoreHero
          label="GEO readiness"
          value={scorecard.geoReadinessScore ?? geo.overallVisibilityScore}
          tone="sky"
        />
        <MetricTile
          label="Referring domains"
          value={fmt(bl.refdomains)}
          hint="Unique sites linking in"
        />
        <MetricTile
          label="Backlinks"
          value={fmt(bl.backlinks)}
          hint={bl.dofollow != null ? `${fmt(bl.dofollow)} dofollow` : "From authority snapshot"}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricTile label="Impressions" value={fmt(m.impressions)} hint="Search Console window" />
        <MetricTile label="Clicks" value={fmt(m.clicks)} />
        <MetricTile label="Avg position" value={fmt(m.avgPosition, 1)} />
        <MetricTile label="CTR" value={fmtPct(m.ctr)} />
      </div>

      <div className="cw-lit rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-5">
        <div className="mb-3 flex items-center gap-2">
          <SeoAutopilotMark className="h-4 w-4 text-[var(--cw-neon)]" />
          <h3 className="font-heading text-sm font-semibold text-[var(--cw-ink)]">
            Executive briefing
          </h3>
          {scorecard.at ? (
            <span className="ml-auto font-mono text-[10px] text-[var(--cw-ink-faint)]">
              Updated {new Date(scorecard.at).toLocaleString()}
            </span>
          ) : null}
        </div>
        <p className="max-w-4xl text-sm leading-relaxed whitespace-pre-wrap text-[var(--cw-ink-dim)]">
          {scorecard.summary || "Summary unavailable for this run."}
        </p>
        {Array.isArray(scorecard.nextSteps) && scorecard.nextSteps.length ? (
          <div className="mt-4 border-t border-[var(--cw-hairline)] pt-4">
            <p className="mb-2 text-[10px] font-bold tracking-[0.12em] text-[var(--cw-ink-faint)] uppercase">
              Next steps
            </p>
            <ol className="space-y-1.5">
              {scorecard.nextSteps.filter(Boolean).map((s, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-[var(--cw-ink-dim)]">
                  <span className="font-mono font-bold tabular-nums text-[var(--cw-neon)]">
                    {i + 1}.
                  </span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-emerald-700" />
            <h3 className="text-sm font-bold text-gray-900">Top problems</h3>
          </div>
          <div className="space-y-2">
            {(scorecard.topProblems || []).length ? (
              scorecard.topProblems.map((p, i) => (
                <div key={`${p.title}-${i}`} className="rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">{p.title}</span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wide rounded-full border px-2 py-0.5 ${impactClass(p.impact)}`}
                    >
                      {p.impact || "—"} · {p.effort || "—"} effort
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-gray-600 leading-relaxed">{p.fix}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">No problems listed for this run.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Link2 className="w-4 h-4 text-emerald-700" />
              <h3 className="text-sm font-bold text-gray-900">Backlink pulse</h3>
            </div>
            {tracker.summary ? (
              <p className="text-sm text-gray-700 leading-relaxed">{tracker.summary}</p>
            ) : (
              <p className="text-sm text-gray-500">
                Run the Tracker agent to attach a narrative to these counts. Numbers above come from your
                authority / backlink snapshot when available.
              </p>
            )}
            {tracker.visibilityTrend ? (
              <p className="mt-2 text-xs font-semibold text-gray-600">
                Visibility trend:{" "}
                <span className="uppercase tracking-wide text-gray-900">{tracker.visibilityTrend}</span>
              </p>
            ) : null}
          </div>
          {Array.isArray(geo.engines) && geo.engines.length ? (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                AI engines (estimated)
              </p>
              <div className="space-y-1.5">
                {geo.engines.map((e) => (
                  <div
                    key={e.name}
                    className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-gray-800">{e.name}</span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 border ${
                        e.citedLikely
                          ? "bg-emerald-50 text-emerald-800 border-emerald-100"
                          : "bg-gray-50 text-gray-600 border-gray-100"
                      }`}
                    >
                      {e.citedLikely ? "Likely cited" : "Likely skipped"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function GuideBlock({ guide }) {
  if (!guide) return null;
  return (
    <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4 space-y-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
          How to implement
        </p>
        <p className="mt-1 text-sm text-gray-800 leading-relaxed">{guide.purpose}</p>
      </div>
      {guide.where ? (
        <p className="text-sm text-gray-700 flex gap-2">
          <FiMapPin className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <span>
            <span className="font-semibold">Where: </span>
            {guide.where}
          </span>
        </p>
      ) : null}
      {guide.difficulty ? (
        <p className="text-xs font-semibold text-gray-600">Difficulty: {guide.difficulty}</p>
      ) : null}
      {Array.isArray(guide.platforms) && guide.platforms.length ? (
        <div className="flex flex-wrap gap-1.5">
          {guide.platforms.map((p) => (
            <span
              key={p}
              className="rounded-md bg-white border border-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-900"
            >
              {p}
            </span>
          ))}
        </div>
      ) : null}
      {Array.isArray(guide.steps) && guide.steps.length ? (
        <ol className="space-y-2">
          {guide.steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-gray-800">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-[11px] font-bold text-white">
                {i + 1}
              </span>
              <span className="leading-relaxed pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {guide.verify ? (
        <p className="text-sm text-gray-700 flex gap-2">
          <FiCheckCircle className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <span>
            <span className="font-semibold">Verify: </span>
            {guide.verify}
          </span>
        </p>
      ) : null}
      {guide.caution ? (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          {guide.caution}
        </p>
      ) : null}
    </div>
  );
}

const FIX_META = {
  robots_txt: {
    eyebrow: "Technical · AI crawlers",
    blurb: "Root file that grants GPTBot, ClaudeBot, PerplexityBot, and friends permission to read your site.",
  },
  llms_txt: {
    eyebrow: "GEO · Discovery",
    blurb: "A new standard “menu” for AI systems — what you do and which pages matter most.",
  },
  faq_schema: {
    eyebrow: "Structured data",
    blurb: "JSON-LD that marks Q&A so Google and AI can understand and cite answers.",
  },
  answer_block: {
    eyebrow: "On-page · Citations",
    blurb: "A short citable paragraph + meta you can paste into a target page.",
  },
  deploy_guide: {
    eyebrow: "Playbook",
    blurb: "Full step-by-step implementation notes for every fix in this run.",
  },
};

export function FixesDashboard({ artifacts, onCopy }) {
  const items = (artifacts || []).filter((a) =>
    ["robots_txt", "llms_txt", "faq_schema", "answer_block", "deploy_guide"].includes(a.kind)
  );

  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center text-sm text-gray-600">
        No fixes yet. Run the <span className="font-semibold">Fixer</span> agent to generate files plus
        step-by-step deploy guides.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-5">
        <h3 className="text-sm font-bold text-gray-900">GEO fix kit</h3>
        <p className="mt-1 text-sm text-gray-600 max-w-3xl leading-relaxed">
          Each card is one deployable change: what it is, why it matters, where it goes, and exact steps.
          Copy the payload, then follow the guide for your CMS (WordPress, Next.js, Shopify, etc.).
        </p>
      </div>

      {items.map((a) => {
        const meta = FIX_META[a.kind] || FIX_META.answer_block;
        const json = a.contentJson && typeof a.contentJson === "object" ? a.contentJson : {};
        const fileBody =
          json.file ||
          a.contentText ||
          (a.kind === "deploy_guide" ? null : JSON.stringify(json, null, 2));
        const guide =
          json.guide ||
          CLIENT_GUIDES[a.kind] ||
          (a.kind === "answer_block" ? CLIENT_GUIDES.answer_block : null);
        const purpose = json.purpose || meta.blurb;

        if (a.kind === "deploy_guide") {
          const guides = json.deployGuides || [];
          return (
            <div key={a.id} className="rounded-2xl border border-gray-100 bg-white p-5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                {meta.eyebrow}
              </p>
              <h3 className="mt-1 text-base font-bold text-gray-900">{a.title}</h3>
              <p className="mt-1 text-sm text-gray-600">{meta.blurb}</p>
              <div className="mt-4 space-y-4">
                {guides.map((g, i) => (
                  <div key={g.id || i} className="rounded-xl border border-gray-100 p-4">
                    <h4 className="text-sm font-bold text-gray-900">{g.title || g.id}</h4>
                    <GuideBlock guide={g} />
                  </div>
                ))}
              </div>
            </div>
          );
        }

        return (
          <div key={a.id} className="rounded-2xl border border-gray-100 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                  {meta.eyebrow}
                </p>
                <h3 className="mt-1 text-base font-bold text-gray-900">{a.title || a.kind}</h3>
                <p className="mt-1 text-sm text-gray-600 leading-relaxed max-w-2xl">{purpose}</p>
                {a.pageUrl ? (
                  <a
                    href={a.pageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:underline"
                  >
                    Target page <FiExternalLink className="w-3 h-3" />
                  </a>
                ) : null}
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700"
                onClick={() => onCopy?.(fileBody || "")}
              >
                <FiCopy className="w-3.5 h-3.5" /> Copy payload
              </button>
            </div>
            <GuideBlock guide={guide} />
            {fileBody ? (
              <div className="mt-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                  Paste-ready content
                </p>
                <pre className="max-h-56 overflow-auto rounded-xl bg-gray-50 border border-gray-100 p-3 text-xs text-gray-800 whitespace-pre-wrap">
                  {fileBody}
                </pre>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function SectionCard({ icon: Icon, title, purpose, when, children }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_1px_8px_rgba(0,0,0,0.03)]">
      <div className="flex items-start gap-3 mb-3">
        <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-2">
          <Icon className="w-4 h-4 text-emerald-700" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-gray-900">{title}</h3>
          <p className="mt-0.5 text-sm text-gray-600 leading-relaxed">{purpose}</p>
          {when ? (
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              When: {when}
            </p>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}

export function GapsDashboard({ artifacts }) {
  const byKind = (kind) => (artifacts || []).find((a) => a.kind === kind);
  const diagnoser = byKind("diagnoser")?.contentJson;
  const geo = byKind("geo_spy")?.contentJson;
  const tracker = byKind("tracker")?.contentJson;
  const foundation = byKind("foundation_list")?.contentJson;

  const hasAny = diagnoser || geo || tracker || foundation;
  if (!hasAny) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center text-sm text-gray-600">
        Gaps dashboard fills after Diagnoser, AI-Search Spy, Tracker, and/or Foundation run.
      </div>
    );
  }

  const striking = diagnoser?.strikingDistance || [];
  const questions = diagnoser?.aiQuestions || [];
  const writes = diagnoser?.priorityWrites || [];
  const engines = geo?.engines || [];
  const links = foundation?.links || [];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-gradient-to-r from-white to-sky-50/50 p-5">
        <h3 className="text-sm font-bold text-gray-900">Opportunity dashboard</h3>
        <p className="mt-1 text-sm text-gray-600 max-w-3xl leading-relaxed">
          This is where Autopilot explains <span className="font-semibold">what to write</span>,{" "}
          <span className="font-semibold">where AI skips you</span>, and{" "}
          <span className="font-semibold">which links to claim</span> — not raw JSON dumps.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricTile label="Striking-distance KWs" value={fmt(striking.length)} hint="Near page 1–2" />
        <MetricTile label="AI questions" value={fmt(questions.length)} hint="Intent-tagged gaps" />
        <MetricTile label="Priority briefs" value={fmt(writes.length)} hint="For Writer → Blog Studio" />
        <MetricTile label="Foundation targets" value={fmt(links.length)} hint="Directories to claim" />
      </div>

      <SectionCard
        icon={Search}
        title="Diagnoser — keyword & question gaps"
        purpose="Shows long-tail keywords you almost rank for and buyer questions AI is asked. Use this to feed the Writer."
        when="After every content sprint / weekly Autopilot run"
      >
        {striking.length ? (
          <div className="mb-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
              Striking distance
            </p>
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Keyword</th>
                    <th className="text-left px-3 py-2 font-semibold">Pos</th>
                    <th className="text-left px-3 py-2 font-semibold">Opportunity</th>
                  </tr>
                </thead>
                <tbody>
                  {striking.slice(0, 12).map((row, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-medium text-gray-900">{row.keyword}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-700">
                        {row.position ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{row.opportunity || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500 mb-3">No striking-distance rows in the latest Diagnoser pass.</p>
        )}
        {questions.length ? (
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              AI / buyer questions
            </p>
            {questions.slice(0, 10).map((q, i) => (
              <div key={i} className="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2.5">
                <div className="flex flex-wrap gap-2 items-center">
                  <p className="text-sm font-semibold text-gray-900">{q.question}</p>
                  <span className="text-[10px] font-bold uppercase tracking-wide rounded-full bg-white border border-gray-200 px-2 py-0.5 text-gray-600">
                    {q.intent || "—"}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wide rounded-full bg-white border border-gray-200 px-2 py-0.5 text-gray-600">
                    {q.coverage || "—"} · {q.recommendedFormat || "blog"}
                  </span>
                </div>
                {q.brief ? <p className="mt-1 text-xs text-gray-600">{q.brief}</p> : null}
              </div>
            ))}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        icon={Radar}
        title="AI-Search Spy — citation readiness"
        purpose="Estimates whether major AI engines would cite you for your buying questions, and the single reason they skip you."
        when="After brand profile is set; re-check after shipping Fixer files"
      >
        {geo?.biggestGap ? (
          <p className="text-sm text-gray-800 mb-3 leading-relaxed">
            <span className="font-semibold">Biggest gap: </span>
            {geo.biggestGap}
          </p>
        ) : null}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {engines.map((e) => (
            <div key={e.name} className="rounded-xl border border-gray-100 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-gray-900">{e.name}</span>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 border ${
                    e.citedLikely
                      ? "bg-emerald-50 text-emerald-800 border-emerald-100"
                      : "bg-gray-50 text-gray-600 border-gray-100"
                  }`}
                >
                  {e.citedLikely ? "Likely yes" : "Likely no"}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-gray-600 leading-relaxed">{e.reason || "—"}</p>
            </div>
          ))}
        </div>
        {Array.isArray(geo?.quickWins) && geo.quickWins.length ? (
          <ul className="mt-3 space-y-1">
            {geo.quickWins.map((w, i) => (
              <li key={i} className="text-sm text-gray-700 flex gap-2">
                <span className="text-emerald-700 font-bold">→</span>
                {typeof w === "string" ? w : w.title || JSON.stringify(w)}
              </li>
            ))}
          </ul>
        ) : null}
      </SectionCard>

      <SectionCard
        icon={Link2}
        title="Tracker — links & visibility"
        purpose="Narrative on backlinks landed, visibility direction, and competitor link gaps worth pitching."
        when="Weekly; after outreach batches"
      >
        {tracker?.summary ? (
          <p className="text-sm text-gray-800 leading-relaxed mb-3">{tracker.summary}</p>
        ) : (
          <p className="text-sm text-gray-500 mb-3">No tracker narrative yet.</p>
        )}
        <div className="flex flex-wrap gap-2 text-xs font-semibold text-gray-600 mb-3">
          {tracker?.visibilityTrend ? (
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1">
              Trend: {tracker.visibilityTrend}
            </span>
          ) : null}
          {tracker?.backlinksLandedHint ? (
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1">
              {tracker.backlinksLandedHint}
            </span>
          ) : null}
        </div>
        {Array.isArray(tracker?.competitorGaps) && tracker.competitorGaps.length ? (
          <div className="space-y-2">
            {tracker.competitorGaps.map((g, i) => (
              <div key={i} className="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2 text-sm">
                <span className="font-semibold text-gray-900">{g.competitor || "Competitor"}</span>
                <span className="text-gray-600"> — {g.idea || "—"}</span>
              </div>
            ))}
          </div>
        ) : null}
        {Array.isArray(tracker?.nextActions) && tracker.nextActions.length ? (
          <ol className="mt-3 space-y-1">
            {tracker.nextActions.map((a, i) => (
              <li key={i} className="text-sm text-gray-700">
                {i + 1}. {a}
              </li>
            ))}
          </ol>
        ) : null}
      </SectionCard>

      <SectionCard
        icon={Target}
        title="Foundation — claimable profiles"
        purpose="High-authority directories every real business should claim. Submissions also appear under Pitches when drafts exist."
        when="Once at launch, then quarterly refresh"
      >
        {links.length ? (
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Site</th>
                  <th className="text-left px-3 py-2 font-semibold">DA</th>
                  <th className="text-left px-3 py-2 font-semibold">Follow</th>
                  <th className="text-left px-3 py-2 font-semibold">Why</th>
                </tr>
              </thead>
              <tbody>
                {links.slice(0, 15).map((l, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900">{l.name}</div>
                      {l.url ? (
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-emerald-800 hover:underline"
                        >
                          {l.url}
                        </a>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{l.domainAuthority ?? "—"}</td>
                    <td className="px-3 py-2">{l.doFollow === false ? "nofollow" : "dofollow"}</td>
                    <td className="px-3 py-2 text-gray-600">{l.why || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No foundation list in the latest run.</p>
        )}
      </SectionCard>
    </div>
  );
}
