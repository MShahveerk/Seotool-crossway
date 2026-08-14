"use client";

import { useState } from "react";
import {
  FiExternalLink,
  FiLink,
  FiMapPin,
  FiMonitor,
  FiRefreshCw,
  FiSearch,
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

const GEO_OPTIONS = [
  { value: "us", label: "US" },
  { value: "uk", label: "UK" },
  { value: "ca", label: "CA" },
  { value: "au", label: "AU" },
  { value: "pk", label: "PK" },
];

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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const run = async (e, force = false) => {
    if (e) e.preventDefault();
    if (!keyword.trim()) {
      setError("Enter a keyword to find link opportunities for.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/seo/link-opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: keyword.trim(),
          siteUrl: selectedSite,
          location: location.trim(),
          device,
          geo,
          refresh: force,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to build link opportunities");
      setData(json.data);
    } catch (err) {
      setError(err.message || "Failed to build link opportunities");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  /** Types you can realistically pitch, as opposed to links you can only observe. */
  const ACTIONABLE = ["guest-post", "directory", "resource", "roundup"];

  const intersectRows = (data?.intersect || []).filter((r) => {
    if (onlyGaps && r.youHaveIt) return false;
    if (typeFilter === "all") return true;
    if (typeFilter === "actionable") return ACTIONABLE.includes(r.type);
    return r.type === typeFilter;
  });
  const strongestRows = (data?.strongest || []).filter((r) => (onlyGaps ? !r.youHaveIt : true));

  const typeTabs = [
    { id: "actionable", label: "Can pitch" },
    { id: "all", label: "All" },
    ...(data?.byType || [])
      .filter((t) => t.count > 0 && !ACTIONABLE.includes(t.type))
      .map((t) => ({ id: t.type, label: t.label, badge: t.count })),
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
            <span className="text-[11px] text-[var(--cw-ink-faint)]">
              Top 10 rankers · 200 referring domains each
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
          Pulling the link profile of every top-ranking site. A keyword in a niche you&rsquo;ve
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
              <Btn variant="ghost" size="xs" icon={FiRefreshCw} onClick={() => run(null, true)}>
                Refresh
              </Btn>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="You can pitch"
              value={formatNum(data.summary?.prospects)}
              hint="Directories, resource pages, roundups, contributor sites"
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
              emptyTitle="No prospects in this filter"
              emptyDescription="Try the All tab, or untick 'hide sites already linking to me'. If everything is empty, the rivals' backlink data may not have returned."
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
                    <span className="text-[var(--cw-ink-faint)]">#{t.position}</span>
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
