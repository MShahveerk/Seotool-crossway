"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Bell,
  FileText,
  Gauge,
  Globe,
  Link2,
  Megaphone,
  Search,
  Send,
  Users,
} from "lucide-react";
import {
  entryMatchesSelectValue,
  getClientAccountSelectValue,
  mergeClientAccountEntries,
} from "@/lib/clientAccountList";
import { canonicalizeSiteKey, isMetaPageId } from "@/lib/siteAccess";
import ClientAccountLogo from "./ui-shared/ClientAccountLogo";
import CrosswayLogo from "./ui-shared/CrosswayLogo";
import { FadeIn } from "./ui-shared/Motion";

function siteHost(siteLink) {
  const raw = String(siteLink || "").trim();
  if (!raw || isMetaPageId(raw)) return "";
  try {
    const url = raw.startsWith("http") || raw.startsWith("sc-domain:") ? raw : `https://${raw}`;
    if (url.startsWith("sc-domain:")) return url.replace(/^sc-domain:/, "").trim();
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || "";
  }
}

function isWebsiteEntry(entry) {
  const link = String(entry?.siteLink || "").trim();
  return Boolean(link && (link.startsWith("http") || link.startsWith("sc-domain:")));
}

/** Same normalisation on both sides so a stored siteLink matches a client. */
function normalizeMatchKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d+$/.test(raw)) return raw;
  return canonicalizeSiteKey(raw) || raw.toLowerCase();
}

function clientMatchKeys(entry) {
  return [
    normalizeMatchKey(entry.siteLink),
    entry.facebookPageId ? String(entry.facebookPageId).trim() : "",
    entry.instagramUserId ? String(entry.instagramUserId).trim() : "",
  ].filter(Boolean);
}

function sumForClient(entry, countMap) {
  let total = 0;
  const seen = new Set();
  for (const key of clientMatchKeys(entry)) {
    if (seen.has(key)) continue;
    seen.add(key);
    total += countMap.get(key) || 0;
  }
  return total;
}

/** `[{ siteLink, count }]` → Map keyed by the same normalisation clients use. */
function toCountMap(rows) {
  const m = new Map();
  for (const row of rows || []) {
    const k = normalizeMatchKey(row.siteLink);
    if (k) m.set(k, (m.get(k) || 0) + Number(row.count || 0));
  }
  return m;
}

/**
 * Follower rows come per site+platform. Dedupe per platform across a client's
 * identifiers (a client may have stats under both a URL and a page id) and sum
 * — the same shape the Social section / dashboard baseline produces. LinkedIn
 * is excluded to match them.
 */
function followersForClient(entry, rowsByKey) {
  const perPlatform = new Map();
  const seen = new Set();
  for (const key of clientMatchKeys(entry)) {
    if (seen.has(key)) continue;
    seen.add(key);
    for (const row of rowsByKey.get(key) || []) {
      const platform = String(row.platform || "").toLowerCase();
      if (!platform || platform === "linkedin") continue;
      perPlatform.set(platform, Math.max(perPlatform.get(platform) || 0, Number(row.count) || 0));
    }
  }
  let total = 0;
  for (const v of perPlatform.values()) total += v;
  return total;
}

/** Authority snapshots are keyed by bare domain; match against a client host. */
function toAuthorityMap(rows) {
  const m = new Map();
  for (const row of rows || []) {
    const k = String(row.domain || "").toLowerCase().replace(/^www\./, "");
    if (k && !m.has(k)) m.set(k, row);
  }
  return m;
}

/** Domain-keyed lookup for site-explorer referring-domain snapshots. */
function toDomainMap(rows) {
  const m = new Map();
  for (const row of rows || []) {
    const k = String(row.domain || "").toLowerCase().replace(/^www\./, "");
    if (k && !m.has(k)) m.set(k, row);
  }
  return m;
}

/**
 * SE Ranking backlink rows (`[{ domain, refdomains, inlinkRank }]`) → domain-keyed
 * map. Domain (bare host) is the only key stable across the many siteUrl variants
 * SE Ranking snapshots are stored under. Max per field when a host repeats.
 */
function toBacklinkMap(rows) {
  const m = new Map();
  for (const row of rows || []) {
    const k = String(row.domain || "").toLowerCase().replace(/^www\./, "");
    if (!k) continue;
    const prev = m.get(k) || { refdomains: null, inlinkRank: null };
    const rd = Number(row.refdomains);
    const ir = Number(row.inlinkRank);
    m.set(k, {
      refdomains: Number.isFinite(rd) ? Math.max(prev.refdomains || 0, rd) : prev.refdomains,
      inlinkRank: Number.isFinite(ir) ? Math.max(prev.inlinkRank || 0, ir) : prev.inlinkRank,
    });
  }
  return m;
}

/** First finite value > 0, else null — mirrors the dashboard's firstPositive. */
function firstPositive(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function compactNum(n) {
  const v = Number(n) || 0;
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);
}

function Metric({ icon: Icon, label, value }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-3.5 text-[var(--cw-ink-faint)]" aria-hidden />
      <span className="text-[11px] text-[var(--cw-ink-muted)]">{label}</span>
      <span className="text-[13px] font-bold tabular-nums text-[var(--cw-ink)]">{value}</span>
    </span>
  );
}

function clientDisplayName(entry, metaAccounts) {
  const metaMatch = metaAccounts.find(
    (a) =>
      a.facebookPageId &&
      entry.facebookPageId &&
      String(a.facebookPageId).trim() === String(entry.facebookPageId).trim()
  );
  if (metaMatch?.name) return metaMatch.name;
  const name = entry.displayName || entry.userName || "";
  if (name && !name.startsWith("http") && !/^\d+$/.test(String(name).trim())) return name;
  return siteHost(entry.siteLink) || "Client account";
}

/** Point on an ellipse centred at (50,50), in 0–100 canvas percentages. */
function polar(rx, ry, angleDeg) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: 50 + rx * Math.cos(a), y: 50 + ry * Math.sin(a) };
}

/**
 * Positions for `n` client nodes around the hub. One ring for small portfolios,
 * two concentric rings once it gets busy so nothing overlaps the centre.
 */
function layoutPositions(n) {
  if (n <= 0) return [];
  const out = [];
  if (n <= 10) {
    const rx = n <= 3 ? 30 : 42;
    const ry = n <= 3 ? 24 : 34;
    for (let i = 0; i < n; i++) out.push(polar(rx, ry, -90 + (360 / n) * i));
    return out;
  }
  const inner = Math.floor(n * 0.4);
  const outer = n - inner;
  for (let i = 0; i < inner; i++) out.push(polar(23, 19, -90 + (360 / inner) * i));
  for (let i = 0; i < outer; i++)
    out.push(polar(44, 36, -90 + (360 / outer) * i + 180 / outer));
  return out;
}

/**
 * Portfolio (the "all clients" lobby), rendered as an interactive constellation:
 * an agency hub at the centre with each client orbiting as a node. Nothing is
 * scoped to a single client here — picking a node enters that workspace.
 */
export default function PortfolioDashboard({ selectedSite = "", onEnterClient }) {
  const [sites, setSites] = useState([]);
  const [metaAccounts, setMetaAccounts] = useState([]);
  const [overview, setOverview] = useState({
    posts: [],
    blogs: [],
    totalPosts: [],
    totalBlogs: [],
    authority: [],
    backlinks: [],
    explorer: [],
    followers: [],
  });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [hovered, setHovered] = useState(-1);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/admin/site-integrations").then((r) => r.json()).catch(() => ({})),
      fetch("/api/admin/meta-accounts").then((r) => r.json()).catch(() => ({})),
      fetch("/api/portfolio/overview").then((r) => r.json()).catch(() => ({})),
    ]).then(([integrations, meta, ov]) => {
      if (cancelled) return;
      setSites(mergeClientAccountEntries(integrations?.sites || []));
      setMetaAccounts(Array.isArray(meta?.accounts) ? meta.accounts : []);
      setOverview({
        posts: Array.isArray(ov?.posts) ? ov.posts : [],
        blogs: Array.isArray(ov?.blogs) ? ov.blogs : [],
        totalPosts: Array.isArray(ov?.totalPosts) ? ov.totalPosts : [],
        totalBlogs: Array.isArray(ov?.totalBlogs) ? ov.totalBlogs : [],
        authority: Array.isArray(ov?.authority) ? ov.authority : [],
        backlinks: Array.isArray(ov?.backlinks) ? ov.backlinks : [],
        explorer: Array.isArray(ov?.explorer) ? ov.explorer : [],
        followers: Array.isArray(ov?.followers) ? ov.followers : [],
      });
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const postMap = useMemo(() => toCountMap(overview.posts), [overview.posts]);
  const blogMap = useMemo(() => toCountMap(overview.blogs), [overview.blogs]);
  const totalPostMap = useMemo(() => toCountMap(overview.totalPosts), [overview.totalPosts]);
  const totalBlogMap = useMemo(() => toCountMap(overview.totalBlogs), [overview.totalBlogs]);
  const authorityMap = useMemo(() => toAuthorityMap(overview.authority), [overview.authority]);
  const backlinkMap = useMemo(() => toBacklinkMap(overview.backlinks), [overview.backlinks]);
  const explorerMap = useMemo(() => toDomainMap(overview.explorer), [overview.explorer]);

  const followerRowsByKey = useMemo(() => {
    const m = new Map();
    for (const row of overview.followers || []) {
      const k = normalizeMatchKey(row.siteLink);
      if (!k) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(row);
    }
    return m;
  }, [overview.followers]);

  const clients = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sites
      .map((entry) => {
        const host = siteHost(entry.siteLink);
        const hostKey = host ? host.toLowerCase() : "";
        const auth = hostKey ? authorityMap.get(hostKey) : null;
        const exp = hostKey ? explorerMap.get(hostKey) : null;
        const bl = hostKey ? backlinkMap.get(hostKey) : null;
        return {
          entry,
          value: getClientAccountSelectValue(entry),
          name: clientDisplayName(entry, metaAccounts),
          host,
          website: isWebsiteEntry(entry),
          social: Boolean(entry.facebookPageId),
          pendingPosts: sumForClient(entry, postMap),
          pendingBlogs: sumForClient(entry, blogMap),
          totalPosts: sumForClient(entry, totalPostMap),
          totalBlogs: sumForClient(entry, totalBlogMap),
          followers: followersForClient(entry, followerRowsByKey),
          // Same cascade as Site Intelligence / the dashboard: SE Ranking's
          // domain inlink rank (0-100) first, Open PageRank (scaled) as fallback.
          authority: firstPositive(bl?.inlinkRank, auth?.score100),
          // SE Ranking referring domains first, then site-explorer (OPR/count),
          // then OPR authority — the dashboard's exact order.
          referringDomains: firstPositive(
            bl?.refdomains,
            exp?.refOpr,
            auth?.referringDomains,
            exp?.refCount
          ),
        };
      })
      .filter((c) => c.value)
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.host.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [
    sites,
    metaAccounts,
    query,
    postMap,
    blogMap,
    totalPostMap,
    totalBlogMap,
    followerRowsByKey,
    authorityMap,
    backlinkMap,
    explorerMap,
  ]);

  const totalAlerts = useMemo(
    () => clients.reduce((s, c) => s + c.pendingPosts + c.pendingBlogs, 0),
    [clients]
  );

  const positions = useMemo(() => layoutPositions(clients.length), [clients.length]);
  const total = useMemo(() => sites.filter((s) => getClientAccountSelectValue(s)).length, [sites]);

  const activeIndex = useMemo(
    () => clients.findIndex((c) => entryMatchesSelectValue(c.entry, selectedSite)),
    [clients, selectedSite]
  );
  // The HUD card defaults to the live client (or the first) so metrics are
  // visible without interaction, and follows whichever node you hover/focus.
  const detail = clients[hovered] || clients[activeIndex] || clients[0] || null;

  return (
    <div className="mx-auto w-full max-w-[1360px]">
      <style>{`
        @keyframes cwNodeFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        @keyframes cwHubPulse { 0% { transform: scale(1); opacity: .45; } 70% { opacity: 0; } 100% { transform: scale(1.9); opacity: 0; } }
        @keyframes cwDash { to { stroke-dashoffset: -12; } }
        @media (prefers-reduced-motion: reduce) {
          .cw-node-float, .cw-hub-pulse { animation: none !important; }
        }
      `}</style>

      {/* Header */}
      <FadeIn>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-1 text-[11px] font-medium text-[var(--cw-ink-muted)]">
              <Users className="size-3.5 text-[var(--cw-neon)]" />
              Portfolio · {total} {total === 1 ? "client" : "clients"}
            </div>
            <h1 className="font-heading text-2xl font-bold tracking-tight text-[var(--cw-ink)] sm:text-3xl">
              Choose a client
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-[var(--cw-ink-muted)]">
              Each node is a client. Tap one to open its workspace — every SEO tool, studio and
              approval scopes to it. Jump back here any time.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {totalAlerts > 0 ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-xl border border-[color-mix(in_srgb,var(--cw-caution)_40%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-caution)_12%,var(--cw-surface))] px-3 py-2 text-xs font-semibold text-[var(--cw-caution)]"
                title="Blog and post approvals awaiting review across all clients"
              >
                <Bell className="size-3.5" />
                {totalAlerts} pending
              </span>
            ) : null}
            <div className="flex items-center gap-2 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-canvas)]/60 px-3 py-2 focus-within:border-[color-mix(in_srgb,var(--cw-neon)_45%,var(--cw-hairline))]">
              <Search className="size-4 shrink-0 text-[var(--cw-ink-faint)]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search clients…"
                className="w-40 bg-transparent text-sm text-[var(--cw-ink)] placeholder:text-[var(--cw-ink-faint)] focus:outline-none sm:w-56"
              />
            </div>
          </div>
        </div>
      </FadeIn>

      {/* Constellation canvas */}
      <FadeIn delay={60}>
        <div className="relative mt-5 aspect-[16/10] max-h-[68vh] min-h-[440px] w-full overflow-hidden rounded-3xl border border-[var(--cw-hairline)] bg-[radial-gradient(circle_at_50%_45%,color-mix(in_srgb,var(--cw-neon)_10%,var(--cw-surface))_0%,var(--cw-surface)_55%,var(--cw-canvas)_100%)]">
          {/* faint grid texture */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.4]"
            style={{
              backgroundImage:
                "linear-gradient(var(--cw-hairline) 1px, transparent 1px), linear-gradient(90deg, var(--cw-hairline) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
              maskImage: "radial-gradient(circle at 50% 50%, #000 30%, transparent 78%)",
            }}
          />

          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="size-24 animate-pulse rounded-full border border-[var(--cw-hairline)] bg-[var(--cw-raised)]" />
            </div>
          ) : clients.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <Globe className="size-8 text-[var(--cw-ink-faint)]" />
              <p className="mt-3 text-sm font-medium text-[var(--cw-ink)]">
                {query ? "No clients match your search" : "No clients linked yet"}
              </p>
              <p className="mt-1 text-xs text-[var(--cw-ink-muted)]">
                {query
                  ? "Try a different name or domain."
                  : "Link a site or Meta page to get started."}
              </p>
            </div>
          ) : (
            <>
              {/* Connectors: hub → each node. Non-scaling stroke keeps them crisp. */}
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                {positions.map((p, i) => {
                  const isActive = entryMatchesSelectValue(clients[i]?.entry, selectedSite);
                  const lit = hovered === i || isActive;
                  return (
                    <line
                      key={`line-${i}`}
                      x1="50"
                      y1="50"
                      x2={p.x}
                      y2={p.y}
                      stroke={lit ? "var(--cw-neon)" : "var(--cw-hairline-strong)"}
                      strokeWidth={lit ? 1.6 : 1}
                      strokeOpacity={lit ? 0.9 : 0.35}
                      strokeDasharray={lit ? "4 4" : undefined}
                      vectorEffect="non-scaling-stroke"
                      style={lit ? { animation: "cwDash 0.6s linear infinite" } : undefined}
                    />
                  );
                })}
              </svg>

              {/* Hub */}
              <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
                <span className="cw-hub-pulse absolute inset-0 -z-10 rounded-full bg-[color-mix(in_srgb,var(--cw-neon)_40%,transparent)]" style={{ animation: "cwHubPulse 3.4s ease-out infinite" }} />
                <span className="cw-hub-pulse absolute inset-0 -z-10 rounded-full bg-[color-mix(in_srgb,var(--cw-neon)_40%,transparent)]" style={{ animation: "cwHubPulse 3.4s ease-out 1.7s infinite" }} />
                <div className="flex size-20 flex-col items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--cw-neon)_35%,var(--cw-hairline))] bg-[var(--cw-raised)] shadow-[0_0_36px_-6px_color-mix(in_srgb,var(--cw-neon)_55%,transparent)]">
                  <CrosswayLogo variant="dark" size={30} />
                  <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--cw-ink-faint)]">
                    Agency
                  </span>
                </div>
              </div>

              {/* Nodes */}
              {clients.map((c, i) => {
                const p = positions[i] || { x: 50, y: 50 };
                const isActive = entryMatchesSelectValue(c.entry, selectedSite);
                const isHover = hovered === i;
                const alertCount = c.pendingBlogs + c.pendingPosts;
                return (
                  <button
                    key={`${c.value}-${i}`}
                    type="button"
                    onClick={() => onEnterClient?.(c.value)}
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered((h) => (h === i ? -1 : h))}
                    onFocus={() => setHovered(i)}
                    onBlur={() => setHovered((h) => (h === i ? -1 : h))}
                    aria-label={`Open ${c.name}`}
                    className="group absolute z-20 -translate-x-1/2 -translate-y-1/2 focus:outline-none"
                    style={{ left: `${p.x}%`, top: `${p.y}%` }}
                  >
                    <span
                      className="cw-node-float flex flex-col items-center"
                      style={{ animation: `cwNodeFloat ${5 + (i % 4)}s ease-in-out ${(i % 6) * 0.35}s infinite` }}
                    >
                      <span
                        className={`relative flex size-14 items-center justify-center rounded-2xl border bg-[var(--cw-surface)] transition-all duration-200 group-hover:-translate-y-0.5 group-hover:scale-110 group-focus-visible:scale-110 ${
                          isActive
                            ? "border-[var(--cw-neon)] shadow-[0_0_26px_-4px_color-mix(in_srgb,var(--cw-neon)_70%,transparent)]"
                            : isHover
                              ? "border-[color-mix(in_srgb,var(--cw-neon)_55%,var(--cw-hairline))] shadow-[0_0_22px_-6px_color-mix(in_srgb,var(--cw-neon)_55%,transparent)]"
                              : "border-[var(--cw-hairline)]"
                        }`}
                      >
                        <ClientAccountLogo entry={c.entry} size="md" />
                        {alertCount > 0 ? (
                          <span
                            className="absolute -left-2 -top-2 flex min-w-[18px] items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--cw-caution)_55%,transparent)] bg-[var(--cw-caution)] px-1 text-[9px] font-bold text-[var(--cw-canvas)] shadow-[0_0_10px_-1px_var(--cw-caution)]"
                            title={`${c.pendingBlogs} blog${c.pendingBlogs === 1 ? "" : "s"} · ${c.pendingPosts} post${c.pendingPosts === 1 ? "" : "s"} awaiting review`}
                          >
                            {alertCount > 9 ? "9+" : alertCount}
                          </span>
                        ) : null}
                        {isActive ? (
                          <span className="absolute -right-1.5 -top-1.5 rounded-full bg-[var(--cw-neon)] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[var(--cw-canvas)]">
                            Live
                          </span>
                        ) : null}
                        <span className="pointer-events-none absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border border-[var(--cw-hairline)] bg-[var(--cw-raised)] opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
                          <ArrowUpRight className="size-3 text-[var(--cw-neon)]" />
                        </span>
                      </span>
                      <span
                        className={`mt-2 max-w-[7rem] truncate rounded-md px-1.5 text-center text-[11px] font-medium transition-colors ${
                          isActive || isHover
                            ? "bg-[var(--cw-raised)] text-[var(--cw-ink)]"
                            : "text-[var(--cw-ink-dim)]"
                        }`}
                      >
                        {c.name}
                      </span>
                      <span className="mt-1 flex items-center gap-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
                        {c.pendingBlogs > 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[var(--cw-caution)]">
                            <FileText className="size-3" /> {c.pendingBlogs}
                          </span>
                        ) : null}
                        {c.pendingPosts > 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[var(--cw-caution)]">
                            <Send className="size-3" /> {c.pendingPosts}
                          </span>
                        ) : null}
                        {alertCount === 0 ? (
                          <>
                            {c.website ? (
                              <Globe className="size-3 text-[var(--cw-ink-faint)]" />
                            ) : null}
                            {c.social ? (
                              <Megaphone className="size-3 text-[var(--cw-ink-faint)]" />
                            ) : null}
                          </>
                        ) : null}
                      </span>
                    </span>
                  </button>
                );
              })}

              {/* Metric HUD: a glass card with the focused client's general
                  metrics. Defaults to the live/first client, follows hover. */}
              {detail ? (
                <div className="pointer-events-none absolute inset-x-3 bottom-3 z-30 flex justify-center">
                  <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-2xl border border-[var(--cw-hairline)] bg-[color-mix(in_srgb,var(--cw-surface)_88%,transparent)] px-4 py-3 shadow-[0_12px_44px_-14px_rgba(0,0,0,0.65)] backdrop-blur-md">
                    <div className="flex min-w-0 items-center gap-2.5 sm:pr-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)]">
                        <ClientAccountLogo entry={detail.entry} size="sm" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--cw-ink)]">{detail.name}</p>
                        <p className="truncate text-[11px] text-[var(--cw-ink-faint)]">
                          {detail.host || (detail.social ? "Social account" : "—")}
                        </p>
                      </div>
                    </div>
                    <div className="hidden h-8 w-px bg-[var(--cw-hairline)] sm:block" />
                    <div className="flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1.5">
                      <Metric icon={Gauge} label="Authority" value={detail.authority != null ? detail.authority : "—"} />
                      <Metric
                        icon={Link2}
                        label="Ref. domains"
                        value={detail.referringDomains != null ? compactNum(detail.referringDomains) : "—"}
                      />
                      <Metric
                        icon={Users}
                        label="Followers"
                        value={detail.followers ? compactNum(detail.followers) : "—"}
                      />
                      <Metric icon={FileText} label="Blogs" value={compactNum(detail.totalBlogs)} />
                      <Metric icon={Send} label="Posts" value={compactNum(detail.totalPosts)} />
                      {detail.pendingBlogs + detail.pendingPosts > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-[color-mix(in_srgb,var(--cw-caution)_40%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-caution)_12%,transparent)] px-2 py-1 text-[11px] font-semibold text-[var(--cw-caution)]">
                          <Bell className="size-3" /> {detail.pendingBlogs + detail.pendingPosts} pending
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </FadeIn>

      <p className="mt-3 text-center text-[11px] text-[var(--cw-ink-faint)]">
        Hover a node to see its metrics in the card below · amber badge = approvals awaiting review ·
        click to enter the workspace
      </p>
    </div>
  );
}
