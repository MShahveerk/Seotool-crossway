"use client";

import { useState } from "react";
import {
  FiArrowUp,
  FiDownload,
  FiExternalLink,
  FiGlobe,
  FiRefreshCw,
  FiTarget,
  FiZap,
} from "react-icons/fi";
import { SearchX, Trophy } from "lucide-react";
import SeoPanelShell, { formatNum } from "./SeoPanelShell";
import TabRail from "../ui-shared/TabRail";
import DataTable from "../ui-shared/DataTable";
import StatTile from "../ui-shared/StatTile";
import Btn from "../ui-shared/Btn";
import { downloadKeywordOpportunitiesPdf } from "./keywordOpportunitiesReport";

const INPUT =
  "w-full rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3.5 py-2.5 text-sm text-[var(--cw-ink)] transition-smooth placeholder:text-[var(--cw-ink-faint)] focus:border-[var(--cw-neon)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--cw-neon)_25%,transparent)]";

const TYPE_TONE = {
  "quick-win": "border-[color-mix(in_srgb,var(--cw-neon)_35%,transparent)] bg-[color-mix(in_srgb,var(--cw-neon)_11%,transparent)] text-[var(--cw-neon)]",
  striking: "border-[color-mix(in_srgb,var(--cw-info)_35%,transparent)] bg-[color-mix(in_srgb,var(--cw-info)_11%,transparent)] text-[var(--cw-info)]",
  gap: "border-[color-mix(in_srgb,#b184ff_35%,transparent)] bg-[color-mix(in_srgb,#b184ff_11%,transparent)] text-[#c9a8ff]",
  climbing: "border-[var(--cw-hairline)] bg-[var(--cw-raised)] text-[var(--cw-ink-dim)]",
  defend: "border-[color-mix(in_srgb,var(--cw-caution)_30%,transparent)] bg-[color-mix(in_srgb,var(--cw-caution)_10%,transparent)] text-[var(--cw-caution)]",
  deep: "border-[var(--cw-hairline)] bg-[var(--cw-raised)] text-[var(--cw-ink-faint)]",
};

const EFFORT_TONE = {
  low: "text-[var(--cw-neon)]",
  medium: "text-[var(--cw-info)]",
  high: "text-[var(--cw-caution)]",
  "very high": "text-[var(--cw-danger)]",
  unknown: "text-[var(--cw-ink-faint)]",
};

export default function KeywordOpportunitiesSection({ selectedSite = "" }) {
  // Pre-filled with the selected client so the common case is one click, but
  // it's just a text field — any domain works, and each gets its own cache.
  const [domain, setDomain] = useState(selectedSite || "");
  const [view, setView] = useState("all");
  const [loading, setLoading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const run = async (e, force = false) => {
    if (e) e.preventDefault();
    if (!domain.trim()) {
      setError("Enter a domain to analyse.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/seo/keyword-opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.trim(), refresh: force }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to build keyword opportunities");
      setData(json.data);
    } catch (err) {
      setError(err.message || "Failed to build keyword opportunities");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const exportPdf = async () => {
    if (!data || pdfBusy) return;
    setPdfBusy(true);
    try {
      await downloadKeywordOpportunitiesPdf(data);
    } catch (err) {
      setError(`PDF export failed: ${err.message || "unknown error"}`);
    } finally {
      setPdfBusy(false);
    }
  };

  const rows = (data?.rows || []).filter((r) => {
    if (view === "all") return true;
    if (view === "worth-it") return ["quick-win", "striking", "gap"].includes(r.type);
    return r.type === view;
  });

  const columns = [
    {
      key: "keyword",
      label: "Keyword",
      grow: true,
      sortable: true,
      render: (row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-[var(--cw-ink)]" title={row.keyword}>
            {row.keyword}
          </span>
          {row.url ? (
            <a
              href={row.url}
              target="_blank"
              rel="noreferrer"
              className="transition-smooth truncate font-mono text-[10px] text-[var(--cw-ink-faint)] hover:text-[var(--cw-neon)]"
              onClick={(e) => e.stopPropagation()}
              title={row.url}
            >
              {row.url}
            </a>
          ) : null}
        </span>
      ),
    },
    {
      key: "typeLabel",
      label: "Opportunity",
      width: "150px",
      sortable: true,
      render: (row) => (
        <span
          title={row.typeHint}
          className={`inline-block rounded-lg border px-2 py-0.5 text-[10px] font-bold whitespace-nowrap ${
            TYPE_TONE[row.type] || TYPE_TONE.climbing
          }`}
        >
          {row.typeLabel}
        </span>
      ),
    },
    {
      key: "position",
      label: "Rank",
      numeric: true,
      width: "84px",
      headerHint: "Where this domain currently ranks",
      render: (row) =>
        row.position != null ? (
          <span className={row.position <= 10 ? "font-bold text-[var(--cw-neon)]" : ""}>
            #{row.position}
          </span>
        ) : (
          <span className="text-[var(--cw-ink-faint)]" title="Not ranking — this is a gap">
            —
          </span>
        ),
      sortValue: (row) => row.position ?? 9999,
    },
    {
      key: "volume",
      label: "Volume",
      numeric: true,
      width: "96px",
      render: (row) => (row.volume != null ? formatNum(row.volume) : "—"),
    },
    {
      key: "difficulty",
      label: "Effort",
      numeric: true,
      width: "104px",
      headerHint: "Keyword difficulty, and what that means in practice",
      render: (row) => (
        <span className={EFFORT_TONE[row.effort] || EFFORT_TONE.unknown} title={`KD ${row.difficulty ?? "—"}`}>
          {row.difficulty ?? "—"}
          <span className="ml-1 text-[10px] opacity-80">{row.effort}</span>
        </span>
      ),
      sortValue: (row) => row.difficulty ?? 999,
    },
    {
      key: "cpc",
      label: "CPC",
      numeric: true,
      width: "84px",
      render: (row) => row.cpcFormatted || (row.cpc != null ? `$${row.cpc}` : "—"),
      sortValue: (row) => row.cpc ?? -1,
    },
    {
      key: "rivalCount",
      label: "Rivals",
      numeric: true,
      width: "86px",
      headerHint: "How many analysed competitors also rank for this",
      render: (row) =>
        row.rivalCount ? (
          <span title={row.rivalDomains.join(", ")}>{row.rivalCount}</span>
        ) : (
          <span className="text-[var(--cw-ink-faint)]">—</span>
        ),
    },
    {
      key: "score",
      label: "Score",
      numeric: true,
      width: "88px",
      headerHint: "Reward versus effort — volume and commercial value, minus difficulty, plus how cheap the win is",
      render: (row) => <span className="font-bold text-[var(--cw-ink)]">{row.score}</span>,
    },
  ];

  return (
    <SeoPanelShell
      title="Keyword Opportunities"
      description="The keywords actually worth working on for any domain — ranked by reward against effort, not by what already wins."
      selectedSite={selectedSite}
      loading={false}
      error={error}
    >
      <form
        onSubmit={run}
        className="cw-lit space-y-4 rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-5"
      >
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] text-[var(--cw-ink-faint)] uppercase">
            <FiGlobe className="size-3.5 text-[var(--cw-neon)]" /> Domain
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="e.g. crosswayconsulting.com — or any competitor"
              className={`${INPUT} min-w-0 flex-1`}
            />
            <Btn type="submit" variant="primary" size="lg" icon={FiZap} loading={loading} disabled={loading}>
              Find opportunities
            </Btn>
          </div>
          <p className="text-[11px] text-[var(--cw-ink-faint)]">
            Pre-filled with the selected client, but any domain works — each gets its own cache, so
            you can research a competitor&rsquo;s best keywords the same way.
          </p>
        </div>
      </form>

      {loading ? (
        <div className="rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-8 text-center text-sm text-[var(--cw-ink-muted)]">
          <FiRefreshCw className="mx-auto mb-3 size-6 animate-spin text-[var(--cw-neon)]" />
          Pulling this domain&rsquo;s ranking keywords, finding its competitors, and reading what
          they rank for that it doesn&rsquo;t…
        </div>
      ) : null}

      {data && !loading ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--cw-ink-muted)]">
            <span className="font-mono">
              {data.domain} · {formatNum(data.summary?.ranking)} ranking keywords ·{" "}
              {data.summary?.rivalsAnalysed || 0} rivals analysed
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
              label="Quick wins"
              value={formatNum(data.summary?.quickWins)}
              hint="Rank 4–10 — cheapest gains"
              accent
              icon={Trophy}
            />
            <StatTile
              label="Striking distance"
              value={formatNum(data.summary?.striking)}
              hint="Rank 11–20 — one push to page 1"
              icon={FiArrowUp}
            />
            <StatTile
              label="Competitor gaps"
              value={formatNum(data.summary?.gaps)}
              hint="Rivals rank, this domain doesn't"
              icon={SearchX}
            />
            <StatTile
              label="Defending"
              value={formatNum(data.summary?.defend)}
              hint="Already top 3 — protect these"
              icon={FiTarget}
            />
          </div>

          {data.notes?.length ? (
            <p className="rounded-xl border border-[color-mix(in_srgb,var(--cw-caution)_32%,transparent)] bg-[color-mix(in_srgb,var(--cw-caution)_8%,transparent)] px-4 py-2.5 text-xs text-[var(--cw-caution)]">
              {data.notes.join(" ")}
            </p>
          ) : null}

          <TabRail
            tabs={[
              { id: "worth-it", label: "Worth pursuing", badge: (data.rows || []).filter((r) => ["quick-win", "striking", "gap"].includes(r.type)).length },
              { id: "quick-win", label: "Quick wins", badge: data.summary?.quickWins || undefined },
              { id: "striking", label: "Striking distance", badge: data.summary?.striking || undefined },
              { id: "gap", label: "Gaps", badge: data.summary?.gaps || undefined },
              { id: "defend", label: "Defend", badge: data.summary?.defend || undefined },
              { id: "all", label: "All" },
            ]}
            value={view}
            onChange={setView}
            ariaLabel="Opportunity view"
          />

          <DataTable
            columns={columns}
            rows={rows}
            getRowKey={(row, i) => `${row.keyword}-${i}`}
            maxHeight="62vh"
            emptyIcon={SearchX}
            emptyTitle="Nothing in this view"
            emptyDescription="Try the All tab. If everything is empty, the keyword database may not have this domain indexed yet."
            footer={`${formatNum(rows.length)} keywords · scored on volume and commercial value, minus difficulty, plus how cheap the win is`}
            ariaLabel="Keyword opportunities"
          />

          {data.competitors?.length ? (
            <div className="rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] px-4 py-3">
              <p className="mb-2 text-[10px] font-bold tracking-[0.12em] text-[var(--cw-ink-faint)] uppercase">
                Competitors read for gaps
              </p>
              <div className="flex flex-wrap gap-1.5">
                {data.competitors.map((c) => (
                  <a
                    key={c.domain}
                    href={`https://${c.domain}`}
                    target="_blank"
                    rel="noreferrer"
                    className="transition-smooth inline-flex items-center gap-1.5 rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-2 py-1 font-mono text-[11px] text-[var(--cw-ink-dim)] hover:border-[color-mix(in_srgb,var(--cw-neon)_35%,transparent)] hover:text-[var(--cw-neon)]"
                  >
                    {c.domain}
                    <span className="text-[var(--cw-ink-faint)]">{formatNum(c.keywordsFound)} kw</span>
                    <FiExternalLink className="size-2.5" />
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </SeoPanelShell>
  );
}
