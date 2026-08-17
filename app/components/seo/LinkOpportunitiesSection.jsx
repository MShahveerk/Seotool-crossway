"use client";

import { useEffect, useState } from "react";
import {
  FiDownload,
  FiExternalLink,
  FiKey,
  FiLink,
  FiMapPin,
  FiMonitor,
  FiRefreshCw,
  FiSearch,
  FiX,
  FiSmartphone,
  FiZap,
} from "react-icons/fi";
import { Link2Off, Trophy } from "lucide-react";
import SeoPanelShell, { formatNum } from "./SeoPanelShell";
import TabRail from "../ui-shared/TabRail";
import DataTable from "../ui-shared/DataTable";
import StatTile from "../ui-shared/StatTile";
import Btn from "../ui-shared/Btn";
import ProspectModal from "./ProspectModal";
import { downloadServerReport } from "./downloadReport";
import {
  PROVIDERS,
  modelsForProvider,
  defaultModelForProvider,
} from "../blogStudio/studioConstants";

const GEO_OPTIONS = [
  { value: "us", label: "US" },
  { value: "uk", label: "UK" },
  { value: "ca", label: "CA" },
  { value: "au", label: "AU" },
  { value: "pk", label: "PK" },
];

/**
 * Search depth. Every referring domain returned costs about a credit, so this
 * is the credit dial — shown with its cost rather than hidden, and cached
 * separately per depth so widening a search never re-bills the narrow one.
 */
/*
 * Referring domains are pinned at 200 because that is the ceiling
 * `fetchBacklinksRefdomains` enforces — asking for more silently returns 200,
 * so advertising a higher number here would be a lie. The real dial is how many
 * ranking sites get analysed: each new rival brings a genuinely different link
 * profile, where deeper refdomains just reach further down the same tail.
 */
const DEPTHS = {
  standard: { rankers: 10, refdomains: 200, label: "Standard", credits: "~3,000" },
  wide: { rankers: 15, refdomains: 200, label: "Wide", credits: "~4,500" },
  exhaustive: { rankers: 20, refdomains: 200, label: "Exhaustive", credits: "~6,000" },
  maximum: { rankers: 30, refdomains: 200, label: "Maximum", credits: "~9,000" },
};

const INPUT =
  "w-full rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3.5 py-2.5 text-sm text-[var(--cw-ink)] transition-smooth placeholder:text-[var(--cw-ink-faint)] focus:border-[var(--cw-neon)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--cw-neon)_25%,transparent)]";

/** Authority reads as a bar, not a bare number — easier to scan down a column. */
function AuthorityCell({ value }) {
  if (value == null) return <span className="text-[var(--cw-ink-faint)]">—</span>;
  const pct = Math.max(0, Math.min(100, Number(value)));
  const tone =
    pct >= 70 ? "var(--cw-neon)" : pct >= 40 ? "var(--cw-info)" : "var(--cw-ink-faint)";
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="h-1 w-10 overflow-hidden rounded-full bg-[var(--cw-hairline)]">
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: tone }} />
      </span>
      <span style={{ color: tone }}>{pct}</span>
    </span>
  );
}

export default function LinkOpportunitiesSection({ selectedSite = "" }) {
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("");
  const [device, setDevice] = useState("desktop");
  const [geo, setGeo] = useState("us");
  const [view, setView] = useState("intersect");
  const [onlyGaps, setOnlyGaps] = useState(true);
  const [typeFilter, setTypeFilter] = useState("actionable");
  const [detail, setDetail] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [depth, setDepth] = useState("standard");
  const [lastRequest, setLastRequest] = useState(null);
  const [query, setQuery] = useState("");

  /**
   * The selected client IS used here — for one thing only: marking which
   * prospects already link to you, which drives the "hide sites already linking
   * to me" filter and demotes them in the ranking. Prospect discovery itself is
   * entirely site-independent. Override to research for any domain, or clear
   * both to get an unfiltered list with no "you already have this" marking.
   */
  const [siteOverride, setSiteOverride] = useState("");
  const analysisSite = siteOverride.trim() || selectedSite || "";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [llmConfig, setLlmConfig] = useState(null);
  const [llmSaving, setLlmSaving] = useState(false);
  const [llmOpen, setLlmOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/seo/link-opportunities/llm");
        const json = await res.json();
        if (!cancelled && res.ok && json.config) setLlmConfig(json.config);
      } catch {
        /* settings are optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const patchLlm = (partial) => {
    setLlmConfig((prev) => {
      const next = { ...(prev || {}), ...partial };
      if (partial.provider && partial.provider !== prev?.provider) {
        next.model = defaultModelForProvider(partial.provider, "chat");
      }
      return next;
    });
  };

  const saveLlm = async () => {
    if (!llmConfig || llmSaving) return;
    setLlmSaving(true);
    setError("");
    try {
      const res = await fetch("/api/seo/link-opportunities/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: llmConfig.enabled !== false,
          provider: llmConfig.provider,
          model: llmConfig.model,
          openaiApiKey: llmConfig.openaiApiKey,
          anthropicApiKey: llmConfig.anthropicApiKey,
          openrouterApiKey: llmConfig.openrouterApiKey,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to save LLM keys");
      setLlmConfig(json.config);
    } catch (err) {
      setError(err.message || "Failed to save LLM keys");
    } finally {
      setLlmSaving(false);
    }
  };

  const exportPdf = async () => {
    if (!data || pdfBusy) return;
    setPdfBusy(true);
    try {
      /*
       * Replay the exact request the on-screen result came from.
       *
       * Reconstructing it from form state was the bug: the export sent back
       * `data.location` — the location the engine *derived* from the keyword —
       * while the analysis had been cached under the blank location actually
       * typed. Different cache key, so the PDF quietly ran a second, narrower
       * analysis and printed that instead of what you were looking at.
       */
      await downloadServerReport(
        "/api/seo/link-opportunities/report",
        lastRequest || {
          keyword: data.keyword,
          siteUrl: analysisSite,
          location: location.trim(),
          device: data.device || device,
          geo: data.geo || geo,
          rankers: data.depth?.rankers ?? DEPTHS[depth].rankers,
          refdomains: data.depth?.refdomains ?? DEPTHS[depth].refdomains,
        },
        "link-opportunities.pdf"
      );
    } catch (err) {
      setError(`PDF export failed: ${err.message || "unknown error"}`);
    } finally {
      setPdfBusy(false);
    }
  };

  const run = async (e, force = false) => {
    if (e) e.preventDefault();
    if (!keyword.trim()) {
      setError("Enter a keyword to find link opportunities for.");
      return;
    }
    setLoading(true);
    setError("");

    // Exactly what this run is keyed on. Kept so the PDF can replay it rather
    // than reconstructing it from form state that may since have changed.
    const request = {
      keyword: keyword.trim(),
      siteUrl: analysisSite,
      location: location.trim(),
      device,
      geo,
      rankers: DEPTHS[depth].rankers,
      refdomains: DEPTHS[depth].refdomains,
    };

    try {
      const res = await fetch("/api/seo/link-opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...request, refresh: force }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to build link opportunities");
      setData(json.data);
      setLastRequest(request);
    } catch (err) {
      setError(err.message || "Failed to build link opportunities");
      setData(null);
      setLastRequest(null);
    } finally {
      setLoading(false);
    }
  };

  /** Types you can realistically pitch, as opposed to links you can only observe. */
  const ACTIONABLE = ["serp-listing", "guest-post", "publication", "directory", "resource", "roundup"];

  /**
   * Free-text filter across everything that identifies a prospect — the domain,
   * the anchors it hands out, who it links to, and its opportunity type. With
   * hundreds of rows, scrolling is not a search strategy.
   */
  const q = query.trim().toLowerCase();
  const matchesQuery = (haystacks) =>
    !q || haystacks.filter(Boolean).some((h) => String(h).toLowerCase().includes(q));

  const intersectRows = (data?.intersect || []).filter((r) => {
    if (onlyGaps && r.youHaveIt) return false;
    if (typeFilter === "actionable" && !ACTIONABLE.includes(r.type)) return false;
    if (typeFilter === "unpaid" && (!ACTIONABLE.includes(r.type) || r.cost === "paid")) return false;
    if (typeFilter === "paid" && (!ACTIONABLE.includes(r.type) || r.cost !== "paid")) return false;
    if (!["all", "actionable", "unpaid", "paid"].includes(typeFilter) && r.type !== typeFilter) {
      return false;
    }
    return matchesQuery([
      r.domain,
      r.typeLabel,
      r.cost,
      (r.anchors || []).join(" "),
      (r.linksTo || []).join(" "),
      (r.examples || []).map((e) => e.sourceUrl).join(" "),
    ]);
  });

  const strongestRows = (data?.strongest || []).filter((r) => {
    if (onlyGaps && r.youHaveIt) return false;
    return matchesQuery([r.sourceDomain, r.sourceUrl, r.anchor, r.targetDomain]);
  });

  /* Rejected buckets stay visible — you should be able to see what was ruled
     out and why — but they sit behind their own tabs, never in Can pitch. */
  const typeTabs = [
    { id: "actionable", label: "Can pitch", badge: data?.summary?.prospects },
    { id: "unpaid", label: "Unpaid", badge: data?.summary?.unpaid },
    { id: "paid", label: "Paid", badge: data?.summary?.paid },
    ...(data?.byType || [])
      .filter((t) => t.count > 0 && !ACTIONABLE.includes(t.type))
      .map((t) => ({ id: t.type, label: t.label, badge: t.count })),
    { id: "all", label: "All" },
  ];

  const intersectColumns = [
    {
      key: "domain",
      label: "Linking site",
      grow: true,
      sortable: true,
      render: (row) => (
        <span className="flex min-w-0 items-center gap-2">
          <a
            href={`https://${row.domain}`}
            target="_blank"
            rel="noreferrer"
            className="transition-smooth truncate font-mono text-[var(--cw-ink)] hover:text-[var(--cw-neon)]"
            onClick={(e) => e.stopPropagation()}
          >
            {row.domain}
          </a>
          {row.onNiche ? (
            <span
              className="shrink-0 rounded-full border border-[color-mix(in_srgb,var(--cw-info)_35%,transparent)] bg-[color-mix(in_srgb,var(--cw-info)_10%,transparent)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--cw-info)]"
              title="This domain reads as being in your niche"
            >
              NICHE
            </span>
          ) : null}
          {row.cost === "paid" ? (
            <span
              className="shrink-0 rounded-full border border-[color-mix(in_srgb,var(--cw-caution)_40%,transparent)] bg-[color-mix(in_srgb,var(--cw-caution)_10%,transparent)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--cw-caution)]"
              title={row.costNote || "Paid listing or sponsored placement"}
            >
              PAID
            </span>
          ) : row.cost === "unpaid" ? (
            <span
              className="shrink-0 rounded-full border border-[color-mix(in_srgb,var(--cw-neon)_32%,transparent)] bg-[color-mix(in_srgb,var(--cw-neon)_10%,transparent)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--cw-neon)]"
              title={row.costNote || "Free to submit, claim, or pitch"}
            >
              FREE
            </span>
          ) : ACTIONABLE.includes(row.type) ? (
            <span
              className="shrink-0 rounded-full border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--cw-ink-faint)]"
              title={row.costNote || "Couldn't confirm whether a listing is free"}
            >
              UNCONFIRMED
            </span>
          ) : null}
          {row.serpPosition != null ? (
            <span
              className="shrink-0 rounded-full border border-[color-mix(in_srgb,var(--cw-neon)_30%,transparent)] bg-[color-mix(in_srgb,var(--cw-neon)_10%,transparent)] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[var(--cw-neon)]"
              title="Where this listing site ranks for your keyword"
            >
              #{row.serpPosition}
            </span>
          ) : null}
          {row.youHaveIt ? (
            <span className="shrink-0 rounded-full border border-[color-mix(in_srgb,var(--cw-neon)_30%,transparent)] bg-[color-mix(in_srgb,var(--cw-neon)_10%,transparent)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--cw-neon)]">
              YOU HAVE
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "typeLabel",
      label: "Opportunity",
      width: "168px",
      sortable: true,
      render: (row) => (
        <span
          title={row.typeHint}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[10px] font-bold whitespace-nowrap ${
            ACTIONABLE.includes(row.type)
              ? "border-[color-mix(in_srgb,var(--cw-neon)_32%,transparent)] bg-[color-mix(in_srgb,var(--cw-neon)_10%,transparent)] text-[var(--cw-neon)]"
              : "border-[var(--cw-hairline)] bg-[var(--cw-raised)] text-[var(--cw-ink-faint)]"
          }`}
        >
          {row.typeLabel}
          {row.alsoRanks ? (
            <span className="text-[var(--cw-info)]" title="This site also ranks for the keyword">
              ★
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "hits",
      label: "Rivals linked",
      numeric: true,
      width: "116px",
      headerHint: "How many of the analysed top rankers this site links to",
      render: (row) => (
        <span
          className={
            row.hits > 1 ? "font-bold text-[var(--cw-neon)]" : "text-[var(--cw-ink-muted)]"
          }
        >
          {row.hits}/{data?.targets?.length ?? 0}
        </span>
      ),
      sortValue: (row) => row.hits,
    },
    {
      key: "authority",
      label: "Authority",
      numeric: true,
      width: "120px",
      render: (row) => <AuthorityCell value={row.authority} />,
    },
    {
      key: "linksTo",
      label: "Links to",
      width: "230px",
      sortable: false,
      render: (row) => (
        <span className="block truncate text-[11px] text-[var(--cw-ink-muted)]" title={row.linksTo.join(", ")}>
          {row.linksTo.join(", ")}
        </span>
      ),
    },
    {
      key: "pageCount",
      label: "Pages",
      numeric: true,
      width: "88px",
      headerHint: "Exact linking pages captured for this site — click a row to open them",
      render: (row) =>
        row.pageCount ? (
          <span className="text-[var(--cw-ink)]">{row.pageCount}</span>
        ) : (
          <span className="text-[var(--cw-ink-faint)]">—</span>
        ),
    },
    {
      key: "anchors",
      label: "Anchors used",
      width: "180px",
      sortable: false,
      render: (row) =>
        row.anchors?.length ? (
          <span className="block truncate text-[11px] text-[var(--cw-ink-muted)]" title={row.anchors.join(" · ")}>
            {row.anchors.join(" · ")}
          </span>
        ) : (
          <span className="text-[var(--cw-ink-faint)]">—</span>
        ),
    },
  ];


  const strongestColumns = [
    {
      key: "sourceUrl",
      label: "Linking page",
      grow: true,
      sortable: true,
      sortKey: "sourceDomain",
      render: (row) => (
        <span className="flex min-w-0 flex-col">
          <a
            href={row.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="transition-smooth truncate font-mono text-[12px] text-[var(--cw-ink)] hover:text-[var(--cw-neon)]"
            onClick={(e) => e.stopPropagation()}
          >
            {row.sourceUrl || row.sourceDomain}
          </a>
          {row.anchor ? (
            <span className="truncate text-[11px] text-[var(--cw-ink-muted)]">
              anchor: &ldquo;{row.anchor}&rdquo;
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "authority",
      label: "Authority",
      numeric: true,
      width: "120px",
      render: (row) => <AuthorityCell value={row.authority} />,
    },
    {
      key: "targetDomain",
      label: "Points at",
      width: "200px",
      sortable: true,
      render: (row) => (
        <span className="block truncate font-mono text-[11px] text-[var(--cw-info)]" title={row.targetUrl}>
          {row.targetDomain}
        </span>
      ),
    },
  ];

  return (
    <SeoPanelShell
      title="Link Opportunities"
      description="Sites you could get a link from for a keyword — found by reading who already links to whoever ranks, then sorted by how gettable each one is."
      selectedSite={selectedSite}
      loading={false}
      error={error}
    >
      <div className="cw-lit space-y-3 rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-5">
        <button
          type="button"
          onClick={() => setLlmOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span className="flex items-center gap-2">
            <FiKey className="size-4 text-[var(--cw-neon)]" />
            <span className="text-sm font-semibold text-[var(--cw-ink)]">LLM probe keys</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                llmConfig?.ready
                  ? "bg-[color-mix(in_srgb,var(--cw-neon)_14%,transparent)] text-[var(--cw-neon)]"
                  : "bg-[var(--cw-raised)] text-[var(--cw-ink-muted)]"
              }`}
            >
              {llmConfig?.ready ? "Ready" : "Not configured"}
            </span>
          </span>
          <span className="text-[11px] text-[var(--cw-ink-faint)]">
            {llmOpen ? "Hide" : "Same as Autopilot — OpenRouter, OpenAI or Anthropic"}
          </span>
        </button>
        {llmOpen ? (
          <div className="space-y-4 border-t border-[var(--cw-hairline)] pt-4">
            <p className="text-[12px] leading-relaxed text-[var(--cw-ink-muted)]">
              Live pages are fetched to mark paid vs free and to drop parked spam. A missing
              form does not remove a site. The model may only cite fetched evidence — it
              cannot invent a URL or veto a live route. Leave a field masked to keep the
              saved key. Server env keys (OPENROUTER_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY)
              still work as fallback.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {[
                ["openaiApiKey", "OpenAI API key", "openai"],
                ["anthropicApiKey", "Anthropic API key", "anthropic"],
                ["openrouterApiKey", "OpenRouter API key", "openrouter"],
              ].map(([key, label, statusKey]) => (
                <div key={key} className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] text-[var(--cw-ink-faint)] uppercase">
                    {label}
                    {llmConfig?.keyStatus?.[statusKey] ? (
                      <span className="normal-case tracking-normal text-[var(--cw-neon)]">ready</span>
                    ) : null}
                  </label>
                  <input
                    type="password"
                    value={llmConfig?.[key] || ""}
                    onChange={(e) => patchLlm({ [key]: e.target.value })}
                    placeholder="Leave masked to keep existing"
                    className={INPUT}
                    autoComplete="off"
                  />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold tracking-[0.12em] text-[var(--cw-ink-faint)] uppercase">
                  Provider
                </label>
                <select
                  value={llmConfig?.provider || "openrouter"}
                  onChange={(e) => patchLlm({ provider: e.target.value })}
                  className={INPUT}
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[10px] font-bold tracking-[0.12em] text-[var(--cw-ink-faint)] uppercase">
                  Model
                </label>
                <input
                  list="lo-llm-models"
                  value={llmConfig?.model || ""}
                  onChange={(e) => patchLlm({ model: e.target.value })}
                  placeholder="Type any model id, e.g. google/gemma-2-9b-it:free"
                  className={INPUT}
                  autoComplete="off"
                  spellCheck={false}
                />
                <datalist id="lo-llm-models">
                  {modelsForProvider(llmConfig?.provider || "openrouter", {
                    kind: "chat",
                    current: llmConfig?.model || "",
                  }).map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </datalist>
                <p className="text-[11px] text-[var(--cw-ink-faint)]">
                  Suggestions are optional. Paste any OpenRouter id, including{" "}
                  <span className="font-mono">:free</span> models.
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <Btn type="button" variant="secondary" size="sm" loading={llmSaving} onClick={saveLlm}>
                Save keys
              </Btn>
            </div>
          </div>
        ) : null}
      </div>

      <form
        onSubmit={run}
        className="cw-lit space-y-4 rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-5"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-1.5 md:col-span-2">
            <label className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] text-[var(--cw-ink-faint)] uppercase">
              <FiSearch className="size-3.5 text-[var(--cw-neon)]" /> Keyword
            </label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="e.g. dallas email marketing"
              className={INPUT}
            />
          </div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] text-[var(--cw-ink-faint)] uppercase">
              <FiMapPin className="size-3.5 text-[var(--cw-neon)]" /> Location
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Blank = detected from your keyword"
              className={INPUT}
            />
          </div>
          <div className="space-y-1.5 md:col-span-3">
            <label className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] text-[var(--cw-ink-faint)] uppercase">
              <FiLink className="size-3.5 text-[var(--cw-neon)]" /> Prepare for domain
            </label>
            <input
              type="text"
              value={siteOverride}
              onChange={(e) => setSiteOverride(e.target.value)}
              placeholder={
                selectedSite
                  ? `Blank = ${selectedSite} (the selected client)`
                  : "e.g. example.com — leave blank for an unfiltered list"
              }
              className={INPUT}
            />
            <p className="text-[11px] text-[var(--cw-ink-faint)]">
              Only used to flag which prospects already link to that domain. Discovery itself is
              the same either way.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <TabRail
              size="sm"
              tabs={[
                { id: "desktop", label: "Desktop", icon: FiMonitor },
                { id: "mobile", label: "Mobile", icon: FiSmartphone },
              ]}
              value={device}
              onChange={setDevice}
              ariaLabel="Device"
            />
            <select
              value={geo}
              onChange={(e) => setGeo(e.target.value)}
              className="rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-2.5 py-2 text-xs font-semibold text-[var(--cw-ink-dim)] transition-smooth focus:border-[var(--cw-neon)] focus:outline-none"
            >
              {GEO_OPTIONS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
            <TabRail
              size="sm"
              tabs={Object.entries(DEPTHS).map(([id, d]) => ({ id, label: d.label }))}
              value={depth}
              onChange={setDepth}
              ariaLabel="Search depth"
            />
            <span className="text-[11px] text-[var(--cw-ink-faint)]">
              Top {DEPTHS[depth].rankers} rankers · {DEPTHS[depth].refdomains} referring domains
              each · {DEPTHS[depth].credits} credits when uncached
            </span>
          </div>
          <Btn type="submit" variant="primary" size="lg" icon={FiZap} loading={loading} disabled={loading}>
            Find opportunities
          </Btn>
        </div>
      </form>

      {loading ? (
        <div className="rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-8 text-center text-sm text-[var(--cw-ink-muted)]">
          <FiRefreshCw className="mx-auto mb-3 size-6 animate-spin text-[var(--cw-neon)]" />
          Pulling rival backlinks, then checking live submit routes
          {llmConfig?.ready ? " with the saved LLM" : ""}. A keyword you&rsquo;ve
          analysed before is mostly cached — a brand new one can take a minute.
        </div>
      ) : null}

      {data && !loading ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--cw-ink-muted)]">
            <span className="font-mono">
              &ldquo;{data.keyword}&rdquo; · {data.device}
              {data.location ? ` · ${data.location}` : ""} · {data.targets?.length || 0} rivals
              analysed
              {data.yourHost ? ` · for ${data.yourHost}` : " · no site context"}
            </span>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  data.cached
                    ? "bg-[var(--cw-raised)] text-[var(--cw-ink-muted)]"
                    : "bg-[color-mix(in_srgb,var(--cw-neon)_14%,transparent)] text-[var(--cw-neon)]"
                }`}
              >
                {data.cached ? "Cached" : "Fresh"}
              </span>
              <Btn
                variant="outline"
                size="xs"
                icon={FiDownload}
                loading={pdfBusy}
                onClick={exportPdf}
                disabled={pdfBusy}
              >
                {pdfBusy ? "Building PDF…" : "Download PDF"}
              </Btn>
              <Btn variant="ghost" size="xs" icon={FiRefreshCw} onClick={() => run(null, true)}>
                Refresh
              </Btn>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="You can pitch"
              value={formatNum(data.summary?.prospects)}
              hint={`${formatNum(data.summary?.unpaid)} unpaid · ${formatNum(data.summary?.paid)} paid`}
              accent
              icon={Trophy}
            />
            <StatTile
              label="Shared linkers"
              value={formatNum(data.summary?.sharedLinkers)}
              hint="Link to 2+ rivals — proven willing"
              icon={FiLink}
            />
            <StatTile
              label="Sites found"
              value={formatNum(data.summary?.uniqueLinkers)}
              hint="Across every rival analysed"
            />
            <StatTile
              label="You already have"
              value={formatNum(data.summary?.alreadyYours)}
              hint="Linking to you as well"
              icon={Link2Off}
            />
          </div>

          {data.notes?.length ? (
            <p className="rounded-xl border border-[color-mix(in_srgb,var(--cw-caution)_32%,transparent)] bg-[color-mix(in_srgb,var(--cw-caution)_8%,transparent)] px-4 py-2.5 text-xs text-[var(--cw-caution)]">
              {data.notes.join(" ")}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabRail
              tabs={[
                { id: "intersect", label: "Prospects", badge: intersectRows.length },
                { id: "strongest", label: "Strongest links", badge: strongestRows.length },
              ]}
              value={view}
              onChange={setView}
              ariaLabel="Opportunity view"
            />
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <FiSearch className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-[var(--cw-ink-faint)]" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter domains, anchors, pages…"
                  aria-label="Filter prospects"
                  className="w-56 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] py-2 pr-8 pl-9 text-xs text-[var(--cw-ink)] transition-smooth placeholder:text-[var(--cw-ink-faint)] focus:border-[var(--cw-neon)] focus:outline-none sm:w-72"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear filter"
                    className="transition-smooth absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-[var(--cw-ink-faint)] hover:text-[var(--cw-ink)]"
                  >
                    <FiX className="size-3.5" />
                  </button>
                ) : null}
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[var(--cw-ink-muted)]">
                <input
                  type="checkbox"
                  checked={onlyGaps}
                  onChange={(e) => setOnlyGaps(e.target.checked)}
                  className="size-3.5"
                />
                Hide sites already linking to me
              </label>
            </div>
          </div>

          {view === "intersect" ? (
            <TabRail
              size="sm"
              tabs={typeTabs}
              value={typeFilter}
              onChange={setTypeFilter}
              ariaLabel="Opportunity type"
            />
          ) : null}

          {view === "intersect" ? (
            <DataTable
              columns={intersectColumns}
              rows={intersectRows}
              getRowKey={(row) => row.domain}
              onRowClick={(row) => setDetail(row)}
              maxHeight="60vh"
              emptyIcon={Link2Off}
              emptyTitle={query ? `Nothing matches “${query}”` : "No prospects in this filter"}
              emptyDescription={
                query
                  ? "Clear the filter, or widen the type tabs above."
                  : "Try the All tab, or untick 'hide sites already linking to me'. If everything is empty, the rivals' backlink data may not have returned."
              }
              footer={`${formatNum(intersectRows.length)} sites · click any row for full detail and an outreach check · ranked by how gettable the link is, then by how many rivals already have it`}
              ariaLabel="Link prospects"
            />
          ) : (
            <DataTable
              columns={strongestColumns}
              rows={strongestRows}
              getRowKey={(row, i) => `${row.sourceUrl}-${i}`}
              defaultSort={{ key: "authority", dir: "desc" }}
              maxHeight="60vh"
              emptyIcon={Link2Off}
              emptyTitle="No individual links returned"
              emptyDescription="The rivals' link lists came back empty for this keyword."
              footer={`${formatNum(strongestRows.length)} links · sorted by the authority of the linking domain`}
              ariaLabel="Strongest individual backlinks"
            />
          )}

          {data.targets?.length ? (
            <div className="rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] px-4 py-3">
              <p className="mb-2 text-[10px] font-bold tracking-[0.12em] text-[var(--cw-ink-faint)] uppercase">
                Rivals analysed
                {data.summary?.fromCompetitors ? (
                  <span className="ml-2 font-normal normal-case tracking-normal text-[var(--cw-ink-muted)]">
                    {data.summary.fromSerp} from the results page ·{" "}
                    {data.summary.fromCompetitors} true competitors by keyword overlap
                  </span>
                ) : null}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {data.targets.map((t) => (
                  <a
                    key={t.domain}
                    href={`https://${t.domain}`}
                    target="_blank"
                    rel="noreferrer"
                    className="transition-smooth inline-flex items-center gap-1.5 rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-2 py-1 font-mono text-[11px] text-[var(--cw-ink-dim)] hover:border-[color-mix(in_srgb,var(--cw-neon)_35%,transparent)] hover:text-[var(--cw-neon)]"
                  >
                    <span className="text-[var(--cw-ink-faint)]">
                      {t.position != null ? `#${t.position}` : "overlap"}
                    </span>
                    {t.domain}
                    <FiExternalLink className="size-2.5" />
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {detail ? (
        <ProspectModal
          prospect={detail}
          targets={data?.targets || []}
          onClose={() => setDetail(null)}
        />
      ) : null}
    </SeoPanelShell>
  );
}
