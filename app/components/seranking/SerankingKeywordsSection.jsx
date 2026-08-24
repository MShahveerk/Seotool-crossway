"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useGuidePrepare } from "@/lib/guideNav";
import {
  ArrowDown,
  ArrowUp,
  Globe2,
  Minus,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import SerankingShell, { formatSerankingCompact, formatSerankingNum, useSerankingStatus } from "./SerankingShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import ProjectPicker from "@/app/components/ui-shared/ProjectPicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MARKETS = [
  { id: "us", label: "United States" },
  { id: "uk", label: "United Kingdom" },
  { id: "ca", label: "Canada" },
  { id: "au", label: "Australia" },
  { id: "pk", label: "Pakistan" },
];

const INTENT_MAP = { I: "Info", C: "Commercial", T: "Transaction", L: "Local", N: "Nav" };

function TrendSparkline({ trend, id = "trend" }) {
  const pts = (trend || []).filter((t) => t.searches != null);
  if (pts.length < 2) return <span className="text-muted-foreground text-xs">—</span>;
  const vals = pts.map((p) => p.searches);
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals);
  const w = 72;
  const h = 22;
  const coords = vals
    .map((v, i) => {
      const x = (i / (vals.length - 1)) * w;
      const y = h - ((v - min) / Math.max(max - min, 1)) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden>
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--cw-neon)]" points={coords} />
    </svg>
  );
}

function TrendBadge({ direction }) {
  if (direction === "rising") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[var(--cw-neon)]">
        <TrendingUp className="size-3" /> Rising
      </span>
    );
  }
  if (direction === "declining") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[var(--cw-danger)]">
        <TrendingDown className="size-3" /> Declining
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-muted-foreground">
      <Minus className="size-3" /> Stable
    </span>
  );
}

function DifficultyCell({ value }) {
  const n = Number(value);
  if (!Number.isFinite(n)) return <span className="text-muted-foreground">—</span>;
  const tone =
    n >= 70
      ? "text-[var(--cw-danger)] bg-[color-mix(in_srgb,var(--cw-danger)_14%,var(--cw-surface))]"
      : n >= 40
        ? "text-[var(--cw-caution)] bg-[color-mix(in_srgb,var(--cw-caution)_14%,var(--cw-surface))]"
        : "text-[var(--cw-neon)] bg-[color-mix(in_srgb,var(--cw-neon)_14%,var(--cw-surface))]";
  return (
    <span className={`inline-flex min-w-[2rem] justify-center rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${tone}`}>
      {n}
    </span>
  );
}

function IntentBadges({ intents }) {
  if (!intents?.length) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {intents.map((t) => (
        <Badge key={t} variant="secondary" className="text-[10px] px-1.5 py-0">
          {INTENT_MAP[t] || t}
        </Badge>
      ))}
    </div>
  );
}

function SeedKeywordCard({ row, fromCache, fetchedAt, expiresAt }) {
  if (!row) return null;
  return (
    <Card className="shadow-sm border-[color-mix(in_srgb,var(--cw-neon)_28%,var(--cw-hairline))] overflow-hidden">
      <div className="bg-gradient-to-r from-[color-mix(in_srgb,var(--cw-neon)_18%,var(--cw-surface))] to-[var(--cw-raised)] px-4 py-3 text-[var(--cw-ink)]">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--cw-neon)]">Your keyword</p>
        <p className="text-lg sm:text-xl font-bold truncate">{row.keyword}</p>
        {fromCache ? (
          <p className="text-[11px] text-[var(--cw-ink-muted)] mt-1">
            Cached · renews weekly{fetchedAt ? ` · saved ${new Date(fetchedAt).toLocaleDateString()}` : ""}
          </p>
        ) : null}
      </div>
      <CardContent className="p-4 sm:p-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4 text-sm">
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Search volume</p>
            <p className="mt-1 text-xl font-bold tabular-nums">
              {row.volume != null ? formatSerankingCompact(row.volume) : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Keyword difficulty</p>
            <div className="mt-1">
              <DifficultyCell value={row.difficulty} />
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground">CPC</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{row.cpcFormatted || "—"}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Competition</p>
            <p className="mt-1 font-semibold tabular-nums">
              {row.competition != null ? Number(row.competition).toFixed(2) : "—"}
              {row.competitionLevel ? (
                <span className="block text-xs font-normal text-muted-foreground">{row.competitionLevel}</span>
              ) : null}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Traffic potential</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-[var(--cw-neon)]">
              {row.trafficPotential != null ? formatSerankingCompact(row.trafficPotential) : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">Top #1 page / mo</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Est. clicks</p>
            <p className="mt-1 text-xl font-bold tabular-nums">
              {row.estimatedClicks != null ? formatSerankingCompact(row.estimatedClicks) : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">At target rank / mo</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Intent</p>
            <div className="mt-1">
              <IntentBadges intents={row.intents} />
            </div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-border/60 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">12-month trend</p>
            <div className="flex items-center gap-3">
              <TrendSparkline trend={row.monthlyTrend} id={`seed-${row.keyword}`} />
              <TrendBadge direction={row.trendDirection} />
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Words / length</p>
            <p className="font-semibold tabular-nums">
              {row.wordCount ?? "—"} words · {row.keyword?.length ?? "—"} chars
            </p>
          </div>
          {row.serpFeatures?.length ? (
            <div className="sm:col-span-2">
              <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">SERP features</p>
              <div className="flex flex-wrap gap-1">
                {row.serpFeatures.map((f) => (
                  <Badge key={f} variant="outline" className="text-[10px]">
                    {f.replace(/_/g, " ")}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        {!row.isDataFound ? (
          <p className="mt-3 text-sm text-[var(--cw-caution)]">No keyword data for this term in the selected market.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function KeywordDetailPanel({ row }) {
  if (!row) return null;
  return (
    <div className="border-t border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-4 py-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5 text-sm">
      <div>
        <p className="text-[10px] font-bold uppercase text-muted-foreground">Traffic potential</p>
        <p className="mt-1 text-lg font-bold tabular-nums text-[var(--cw-neon)]">
          {row.trafficPotential != null ? formatSerankingCompact(row.trafficPotential) : "—"}
        </p>
        <p className="text-[10px] text-muted-foreground">Top #1 page organic traffic / mo</p>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase text-muted-foreground">Est. clicks</p>
        <p className="mt-1 text-lg font-bold tabular-nums">
          {row.estimatedClicks != null ? formatSerankingCompact(row.estimatedClicks) : "—"}
        </p>
        <p className="text-[10px] text-muted-foreground">Est. clicks/mo at target rank</p>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase text-muted-foreground">Competition</p>
        <p className="mt-1 font-semibold tabular-nums">
          {row.competition != null ? Number(row.competition).toFixed(2) : "—"}
          {row.competitionLevel ? ` · ${row.competitionLevel}` : ""}
        </p>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase text-muted-foreground">Words / length</p>
        <p className="mt-1 font-semibold tabular-nums">
          {row.wordCount ?? "—"} words · {row.keyword?.length ?? "—"} chars
        </p>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase text-muted-foreground">12-month trend</p>
        <div className="mt-1 flex items-center gap-2">
          <TrendSparkline trend={row.monthlyTrend} id={`detail-${row.keyword}`} />
          <TrendBadge direction={row.trendDirection} />
        </div>
      </div>
      {row.serpFeatures?.length ? (
        <div className="sm:col-span-2 lg:col-span-4">
          <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">SERP features</p>
          <div className="flex flex-wrap gap-1">
            {row.serpFeatures.map((f) => (
              <Badge key={f} variant="outline" className="text-[10px]">
                {f.replace(/_/g, " ")}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
      {row.url ? (
        <div className="sm:col-span-2 lg:col-span-4">
          <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Ranking URL</p>
          <p className="text-xs truncate text-muted-foreground">{row.url}</p>
        </div>
      ) : null}
    </div>
  );
}

function KeywordTable({ rows, sortField, sortDir, onSort, expandedKey, onToggleExpand, showPosition = false }) {
  const SortBtn = ({ field, label, className = "" }) => (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={`inline-flex items-center gap-1 hover:text-foreground ${className}`}
    >
      {label}
      {sortField === field ? (
        sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
      ) : null}
    </button>
  );

  if (!rows.length) {
    return <p className="px-4 py-10 text-center text-sm text-muted-foreground">No keywords to show.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1060px] text-sm">
        <thead className="bg-muted/40 border-b border-border/60">
          <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-3 w-8" />
            <th className="px-3 py-3 min-w-[200px]">
              <SortBtn field="keyword" label="Keyword" />
            </th>
            {showPosition ? (
              <th className="px-3 py-3">
                <SortBtn field="position" label="Pos" />
              </th>
            ) : null}
            <th className="px-3 py-3">
              <SortBtn field="volume" label="Volume" />
            </th>
            <th className="px-3 py-3">
              <SortBtn field="difficulty" label="KD" />
            </th>
            <th className="px-3 py-3">
              <SortBtn field="cpc" label="CPC" />
            </th>
            <th className="px-3 py-3">
              <SortBtn field="competition" label="Comp" />
            </th>
            <th className="px-3 py-3">
              <SortBtn field="trafficPotential" label="Traffic potential" />
            </th>
            <th className="px-3 py-3">
              <SortBtn field="estimatedClicks" label="Est. clicks" />
            </th>
            <th className="px-3 py-3">Intent</th>
            <th className="px-3 py-3">Trend</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {rows.map((row) => {
            const key = row.keyword;
            const open = expandedKey === key;
            return (
              <Fragment key={key}>
                <tr
                  className={`cursor-pointer hover:bg-[var(--cw-raised)] ${
                    open ? "bg-[color-mix(in_srgb,var(--cw-neon)_8%,var(--cw-surface))]" : ""
                  }`}
                  onClick={() => onToggleExpand(key)}
                >
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{open ? "▼" : "▶"}</td>
                  <td className="px-3 py-2.5 font-medium max-w-[240px]">
                    <span className="truncate block" title={row.keyword}>
                      {row.keyword}
                    </span>
                    {!row.isDataFound ? (
                      <span className="text-[10px] text-[var(--cw-caution)]">No data in this market</span>
                    ) : null}
                  </td>
                  {showPosition ? (
                    <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                      {row.position != null ? `#${Math.round(row.position)}` : "—"}
                    </td>
                  ) : null}
                  <td className="px-3 py-2.5 tabular-nums font-semibold">
                    {row.volume != null ? formatSerankingCompact(row.volume) : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <DifficultyCell value={row.difficulty} />
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{row.cpcFormatted || "—"}</td>
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                    {row.competition != null ? Number(row.competition).toFixed(2) : "—"}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums font-medium text-[var(--cw-neon)]">
                    {row.trafficPotential != null ? formatSerankingCompact(row.trafficPotential) : "—"}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums font-medium">
                    {row.estimatedClicks != null ? formatSerankingCompact(row.estimatedClicks) : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <IntentBadges intents={row.intents} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col gap-0.5">
                      <TrendSparkline trend={row.monthlyTrend} id={`row-${key}`} />
                      <TrendBadge direction={row.trendDirection} />
                    </div>
                  </td>
                </tr>
                {open ? (
                  <tr key={`${key}-detail`}>
                    <td colSpan={showPosition ? 11 : 10} className="p-0">
                      <KeywordDetailPanel row={row} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function sortRows(rows, field, dir) {
  const mult = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    if (field === "keyword") return mult * String(av || "").localeCompare(String(bv || ""));
    const an = av == null ? -Infinity : Number(av);
    const bn = bv == null ? -Infinity : Number(bv);
    if (an === bn) return 0;
    return mult * (an < bn ? -1 : 1);
  });
}

function siteHostLabel(url) {
  try {
    return new URL(String(url).startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return String(url || "").replace(/^https?:\/\//, "").split("/")[0] || "";
  }
}

export default function SerankingKeywordsSection({ selectedSite = "" }) {
  const { data: session } = useSession();
  const hasGlobalAccess = session?.user?.role === "super_admin" || session?.user?.role === "smm";
  /* Toolkit tool: the status probe must not require a selected project. */
  const { credits, status: metaStatus } = useSerankingStatus(selectedSite, { siteOptional: true });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [domainKeywords, setDomainKeywords] = useState([]);
  const [viewTab, setViewTab] = useState("research");
  useGuidePrepare((nav) => {
    if (nav.kwView) setViewTab(nav.kwView);
  });

  const [market, setMarket] = useState("us");
  // Fixed expansion type — the Similar/Related/Questions/Long-tail selector was
  // removed as it added noise without value.
  const mode = "similar";
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(25);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [results, setResults] = useState([]);
  const [seedMetrics, setSeedMetrics] = useState(null);
  const [lastSearch, setLastSearch] = useState(null);
  const [sortField, setSortField] = useState("volume");
  const [sortDir, setSortDir] = useState("desc");
  const [expandedKey, setExpandedKey] = useState(null);
  const [domainSortField, setDomainSortField] = useState("traffic");
  const [domainSortDir, setDomainSortDir] = useState("desc");
  const [domainExpanded, setDomainExpanded] = useState(null);
  /* Keyword research is a Toolkit tool: it must work with no project selected.
     The typed domain wins over the selection, so research never depends on
     which project happens to be open. Scoped users stay pinned to their own
     site — the API would reject anything else anyway. */
  const [domainOverride, setDomainOverride] = useState("");

  const activeSite = useMemo(() => {
    if (!hasGlobalAccess) return session?.user?.siteLink || "";
    const typed = domainOverride.trim();
    if (typed) return typed.startsWith("http") ? typed : `https://${typed}`;
    return selectedSite || "";
  }, [hasGlobalAccess, domainOverride, selectedSite, session?.user?.siteLink]);

  const loadSiteData = useCallback(async () => {
    const site = activeSite;
    if (!site?.startsWith("http")) {
      setDomainKeywords([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const q = new URLSearchParams();
    if (hasGlobalAccess) q.set("url", site);
    try {
      const res = await fetch(`/api/seranking/keywords?${q}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Failed to load keyword data.");
      else setDomainKeywords(Array.isArray(data.domainKeywords) ? data.domainKeywords : []);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [activeSite, hasGlobalAccess]);

  useEffect(() => {
    loadSiteData();
  }, [loadSiteData]);

  const runSearch = async (refresh = false) => {
    const site = activeSite;
    const kw = query.trim();
    if (!kw || !site?.startsWith("http")) return;
    setSearchLoading(true);
    setSearchError("");
    if (!refresh) {
      setResults([]);
      setSeedMetrics(null);
    }
    setExpandedKey(null);
    try {
      const q = new URLSearchParams();
      if (hasGlobalAccess) q.set("url", site);
      const res = await fetch(`/api/seranking/keywords?${q}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: kw, type: mode, source: market, limit, refresh: refresh ? 1 : 0 }),
      });
      const data = await res.json();
      if (!res.ok) setSearchError(data.error || "Search failed.");
      else {
        setResults(Array.isArray(data.data) ? data.data : []);
        setSeedMetrics(data.seedMetrics || null);
        setLastSearch({
          keyword: kw,
          type: mode,
          source: market,
          creditsSpent: data.creditsSpent,
          fromCache: data.fromCache,
          fetchedAt: data.fetchedAt,
          expiresAt: data.expiresAt,
        });
      }
    } catch {
      setSearchError("Network error.");
    } finally {
      setSearchLoading(false);
    }
  };

  const creditCost = limit * 10 + 100;
  const sortedResults = useMemo(() => sortRows(results, sortField, sortDir), [results, sortField, sortDir]);
  const sortedDomain = useMemo(
    () => sortRows(domainKeywords, domainSortField, domainSortDir),
    [domainKeywords, domainSortField, domainSortDir]
  );

  const handleSort = (field) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir(field === "keyword" ? "asc" : "desc");
    }
  };

  const handleDomainSort = (field) => {
    if (domainSortField === field) setDomainSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setDomainSortField(field);
      setDomainSortDir(field === "keyword" ? "asc" : "desc");
    }
  };

  return (
    <SerankingShell
      title="Keyword Explorer"
      description="Full keyword metrics — volume, KD, CPC, competition, traffic potential, intent, and 12-month trends. Separate from AI Keyword Research."
      selectedSite={selectedSite}
      requireWebsite={false}
      siteBadge={activeSite ? siteHostLabel(activeSite) : "No project — type a domain"}
      loading={loading}
      error={error}
      credits={credits}
      configured={metaStatus?.configured !== false}
      fetchedAt={metaStatus?.snapshots?.domain_keywords?.fetchedAt}
      expiresAt={metaStatus?.snapshots?.domain_keywords?.expiresAt}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 border-b border-border/60 pb-3">
          <Button
            type="button"
            variant={viewTab === "research" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewTab("research")}
          >
            <Search className="size-4 mr-1.5" />
            Keyword research
          </Button>
          <Button
            type="button"
            variant={viewTab === "domain" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewTab("domain")}
          >
            <Globe2 className="size-4 mr-1.5" />
            Domain keywords
            {domainKeywords.length ? (
              <Badge variant="secondary" className="ml-2 tabular-nums">
                {domainKeywords.length}
              </Badge>
            ) : null}
          </Button>
        </div>

        {hasGlobalAccess ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-2">
            <span className="text-[10px] font-bold tracking-[0.12em] text-[var(--cw-ink-faint)] uppercase">
              Domain
            </span>
            <Input
              value={domainOverride}
              onChange={(e) => setDomainOverride(e.target.value)}
              placeholder={
                selectedSite
                  ? `Blank = ${selectedSite} (the selected project)`
                  : "e.g. example.com — or pick a project"
              }
              className="h-9 min-w-0 flex-1 text-sm"
            />
            <ProjectPicker onSelect={setDomainOverride} />
          </div>
        ) : null}

        {viewTab === "research" ? (
          <>
            <Card className="shadow-sm border-[color-mix(in_srgb,var(--cw-neon)_20%,var(--cw-hairline))] overflow-hidden">
              <CardContent className="p-0">
                <div className="bg-gradient-to-br from-[color-mix(in_srgb,var(--cw-neon)_10%,var(--cw-surface))] via-[var(--cw-surface)] to-[var(--cw-raised)] p-5 sm:p-6 space-y-4">
                  <div className="flex flex-col lg:flex-row gap-3">
                    <div className="relative flex-1" data-guide="kw-seed">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && runSearch(false)}
                        placeholder="Enter seed keyword…"
                        className="pl-9 h-11 text-base"
                      />
                    </div>
                    <Select value={market} onValueChange={setMarket}>
                      <SelectTrigger className="w-full lg:w-[180px] h-11">
                        <SelectValue placeholder="Market" />
                      </SelectTrigger>
                      <SelectContent>
                        {MARKETS.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
                      <SelectTrigger className="w-full lg:w-[120px] h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[15, 25, 40, 50].map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n} results
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      className="h-11 px-6"
                      onClick={() => runSearch(false)}
                      disabled={searchLoading || !query.trim()}
                      data-guide="kw-run"
                    >
                      {searchLoading ? "Searching…" : `Search (~${creditCost} cr)`}
                    </Button>
                    {lastSearch ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11"
                        onClick={() => runSearch(true)}
                        disabled={searchLoading || !query.trim()}
                      >
                        Refresh
                      </Button>
                    ) : null}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {MARKETS.find((m) => m.id === market)?.label} · results cached 7 days ·
                    click any row for full metrics
                  </p>
                </div>
              </CardContent>
            </Card>

            {searchError ? <p className="text-sm text-destructive px-1">{searchError}</p> : null}

            {lastSearch ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground px-1">
                <Sparkles className="size-3.5 text-[var(--cw-neon)]" />
                <span>
                  <strong className="text-foreground">{lastSearch.keyword}</strong> · {lastSearch.type} ·{" "}
                  {lastSearch.source.toUpperCase()} · {formatSerankingNum(results.length)} related ·{" "}
                  {lastSearch.creditsSpent} credits
                  {lastSearch.fromCache ? " · from cache" : ""}
                </span>
              </div>
            ) : null}

            {seedMetrics ? (
              <SeedKeywordCard
                row={seedMetrics}
                fromCache={lastSearch?.fromCache}
                fetchedAt={lastSearch?.fetchedAt}
                expiresAt={lastSearch?.expiresAt}
              />
            ) : null}

            {results.length ? (
              <Card className="shadow-sm overflow-hidden" data-guide="kw-table">
                <div className="border-b border-border/60 px-4 py-2 bg-muted/20">
                  <p className="text-sm font-medium">Related keywords</p>
                </div>
                <KeywordTable
                  rows={sortedResults}
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  expandedKey={expandedKey}
                  onToggleExpand={(k) => setExpandedKey((prev) => (prev === k ? null : k))}
                />
              </Card>
            ) : !searchLoading ? (
              <Card className="shadow-sm border-dashed" data-guide="kw-table">
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  Search any seed keyword to see volume, KD, CPC, competition, traffic potential, intent, and trends.
                </CardContent>
              </Card>
            ) : null}
          </>
        ) : (
          <Card className="shadow-sm overflow-hidden">
            <div className="border-b border-border/60 px-4 py-3 bg-muted/20">
              <p className="text-sm font-medium">Organic keywords your domain ranks for</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Cached from domain analysis · expand rows for full metrics
              </p>
            </div>
            <KeywordTable
              rows={sortedDomain}
              sortField={domainSortField}
              sortDir={domainSortDir}
              onSort={handleDomainSort}
              expandedKey={domainExpanded}
              onToggleExpand={(k) => setDomainExpanded((prev) => (prev === k ? null : k))}
              showPosition
            />
          </Card>
        )}
      </div>
    </SerankingShell>
  );
}
