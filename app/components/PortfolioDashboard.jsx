"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Activity,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  FileText,
  Gauge,
  Globe,
  Megaphone,
  MousePointerClick,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  entryMatchesSelectValue,
  getClientAccountSelectValue,
  mergeClientAccountEntries,
} from "@/lib/clientAccountList";
import { canonicalizeSiteKey, isMetaPageId } from "@/lib/siteAccess";
import { ROLES } from "@/lib/rbac";
import ClientAccountLogo from "./ui-shared/ClientAccountLogo";
import { FadeIn } from "./ui-shared/Motion";
import Btn from "./ui-shared/Btn";

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
  if (entry?.type === "meta_page") return false;
  const link = String(entry?.siteLink || "").trim();
  return Boolean(link && (link.startsWith("http") || link.startsWith("sc-domain:")));
}

/** Same normalisation on both sides so a stored siteLink matches a project. */
function normalizeMatchKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d+$/.test(raw)) return raw;
  return canonicalizeSiteKey(raw) || raw.toLowerCase();
}

function projectMatchKeys(entry) {
  return [
    normalizeMatchKey(entry.siteLink),
    entry.facebookPageId ? String(entry.facebookPageId).trim() : "",
    entry.instagramUserId ? String(entry.instagramUserId).trim() : "",
  ].filter(Boolean);
}

function sumForProject(entry, countMap) {
  let total = 0;
  const seen = new Set();
  for (const key of projectMatchKeys(entry)) {
    if (seen.has(key)) continue;
    seen.add(key);
    total += countMap.get(key) || 0;
  }
  return total;
}

/**
 * Bare host, for facts that arrive keyed by whatever URL the provider stored.
 *
 * Content rows key off our own `siteLink` and match exactly, but SE Ranking,
 * Search Console and URL inspection each record the site in their own shape
 * (`example.com`, `https://www.example.com`, `sc-domain:example.com`). Matching
 * on the host is the only key all four agree on.
 */
function hostKey(value) {
  const host = siteHost(value);
  return host ? host.replace(/^www\./, "").toLowerCase() : "";
}

/** `[{ siteLink|domain, ... }]` → Map keyed by host, newest row winning. */
function toHostMap(rows) {
  const m = new Map();
  for (const row of rows || []) {
    const k = hostKey(row.domain || row.siteLink);
    if (k && !m.has(k)) m.set(k, row);
  }
  return m;
}

/** `[{ siteLink, count }]` → Map keyed by the same normalisation projects use. */
function toCountMap(rows) {
  const m = new Map();
  for (const row of rows || []) {
    const k = normalizeMatchKey(row.siteLink);
    if (k) m.set(k, (m.get(k) || 0) + Number(row.count || 0));
  }
  return m;
}

/**
 * Follower rows come per site+platform. Dedupe per platform across a project's
 * identifiers (a project may have stats under both a URL and a page id) and sum
 * — the same shape the Social section / dashboard baseline produces. LinkedIn
 * is excluded to match them.
 */
function followersForProject(entry, rowsByKey) {
  const perPlatform = new Map();
  const seen = new Set();
  for (const key of projectMatchKeys(entry)) {
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

/**
 * Daily reach for the card sparkline. Same dedupe rule as the headline number,
 * applied per day: max per platform, then summed across platforms.
 */
function followerTrendForProject(entry, seriesByKey) {
  const perDate = new Map();
  const seen = new Set();
  for (const key of projectMatchKeys(entry)) {
    if (seen.has(key)) continue;
    seen.add(key);
    for (const row of seriesByKey.get(key) || []) {
      const platform = String(row.platform || "").toLowerCase();
      if (!platform || platform === "linkedin") continue;
      const day = String(row.date).slice(0, 10);
      if (!perDate.has(day)) perDate.set(day, new Map());
      const platforms = perDate.get(day);
      platforms.set(platform, Math.max(platforms.get(platform) || 0, Number(row.count) || 0));
    }
  }
  return [...perDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, platforms]) => {
      let total = 0;
      for (const v of platforms.values()) total += v;
      return { date, total };
    });
}

function compactNum(n) {
  const v = Number(n) || 0;
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);
}

/** Neon above 80, amber in the middle, red when a site needs real work. */
function healthTone(score) {
  if (score == null) return { color: "var(--cw-ink-faint)", label: "No audit" };
  if (score >= 80) return { color: "var(--cw-neon)", label: "Healthy" };
  if (score >= 50) return { color: "var(--cw-caution)", label: "Needs work" };
  return { color: "var(--cw-danger)", label: "Critical" };
}

/** Compact progress donut. Falls back to a dim dashed ring when unaudited. */
function HealthRing({ score, size = 56 }) {
  const tone = healthTone(score);
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, Number(score) || 0));

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--cw-hairline)"
          strokeWidth={stroke}
          strokeDasharray={score == null ? "3 4" : undefined}
        />
        {score != null ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={tone.color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - (pct / 100) * c}
            style={{ transition: "stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1)" }}
          />
        ) : null}
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-[15px] font-bold tabular-nums leading-none"
          style={{ color: score == null ? "var(--cw-ink-faint)" : tone.color }}
        >
          {score == null ? "—" : Math.round(score)}
        </span>
      </span>
    </div>
  );
}

/** Reach over the last 30 days. Flat/absent data renders a calm baseline. */
function Sparkline({ points, id, tone = "var(--cw-neon)" }) {
  const values = points.map((p) => p.total);
  const w = 120;
  const h = 34;

  if (values.length < 2) {
    return (
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-8 w-full">
        <line
          x1="0"
          y1={h / 2}
          x2={w}
          y2={h / 2}
          stroke="var(--cw-hairline)"
          strokeWidth="1.5"
          strokeDasharray="3 4"
        />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = w / (values.length - 1);
  const coords = values.map((v, i) => [i * step, h - 3 - ((v - min) / span) * (h - 8)]);
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const last = coords[coords.length - 1];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-8 w-full overflow-visible">
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tone} stopOpacity="0.32" />
          <stop offset="100%" stopColor={tone} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${id})`} />
      <path
        d={line}
        fill="none"
        stroke={tone}
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={tone} />
    </svg>
  );
}

function DeltaBadge({ value }) {
  if (value === null || value === 0) {
    return <span className="text-[11px] font-medium text-[var(--cw-ink-faint)]">No change</span>;
  }
  const up = value > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-bold tabular-nums"
      style={{ color: up ? "var(--cw-neon)" : "var(--cw-danger)" }}
    >
      <Icon className="size-3" />
      {up ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}

function MiniStat({ icon: Icon, label, value, title }) {
  return (
    <div className="min-w-0" title={title}>
      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--cw-ink-faint)]">
        <Icon className="size-3" aria-hidden />
        {label}
      </span>
      <span className="mt-0.5 block truncate text-[15px] font-bold tabular-nums text-[var(--cw-ink)]">
        {value}
      </span>
    </div>
  );
}

const ONBOARD_STEPS = [
  {
    n: "1",
    title: "Paste the website",
    body: "The live URL is enough. Search Console can be connected after the project exists.",
  },
  {
    n: "2",
    title: "It lands in this grid",
    body: "The site becomes a project you can open. Every tool then follows that project.",
  },
  {
    n: "3",
    title: "Open it and work",
    body: "Blog Studio, Search Console, and audits all need a website project. Social can run from a Meta page on its own.",
  },
];

function OnboardPanel({ isAdmin, hasProjects, onProjectsChanged }) {
  const [open, setOpen] = useState(!hasProjects);
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [fetchingMeta, setFetchingMeta] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    if (!hasProjects) setOpen(true);
  }, [hasProjects]);

  const addWebsite = async (event) => {
    event?.preventDefault?.();
    if (!isAdmin) return;
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Paste a website URL first.");
      setOk("");
      return;
    }
    setSaving(true);
    setError("");
    setOk("");
    try {
      const res = await fetch("/api/admin/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not add this website.");
      setUrl("");
      setOk("Website added. It is now a project in the grid.");
      await onProjectsChanged?.();
    } catch (err) {
      setError(err.message || "Could not add this website.");
    } finally {
      setSaving(false);
    }
  };

  const fetchMeta = async () => {
    if (!isAdmin) return;
    setFetchingMeta(true);
    setError("");
    setOk("");
    try {
      const res = await fetch("/api/admin/meta-accounts", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not fetch Meta pages.");
      const count = Array.isArray(data.accounts) ? data.accounts.length : 0;
      const saved = Number(data.persisted || 0);
      if (count === 0) {
        setError(
          data.error ||
            "Meta returned no pages. Check META_PAGE_ACCESS_TOKEN on the server, then try again."
        );
      } else {
        setOk(
          saved > 0
            ? `Fetched ${count} Meta ${count === 1 ? "page" : "pages"} and saved them as projects.`
            : `Loaded ${count} Meta ${count === 1 ? "page" : "pages"}.`
        );
      }
      await onProjectsChanged?.();
    } catch (err) {
      setError(err.message || "Could not fetch Meta pages.");
    } finally {
      setFetchingMeta(false);
    }
  };

  const showForm = isAdmin && (open || !hasProjects);

  return (
    <div data-guide="portfolio-onboard">
      {hasProjects ? (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {isAdmin ? (
            <>
              <Btn
                variant={open ? "primary" : "secondary"}
                size="sm"
                icon={Plus}
                onClick={() => setOpen((v) => !v)}
              >
                {open ? "Hide website setup" : "Add a website"}
              </Btn>
              <Btn
                variant="outline"
                size="sm"
                icon={RefreshCw}
                loading={fetchingMeta}
                onClick={fetchMeta}
                disabled={fetchingMeta}
              >
                Fetch Meta pages
              </Btn>
            </>
          ) : (
            <p className="text-xs text-[var(--cw-ink-muted)]">
              Need another site here? Ask an admin to onboard it from this page.
            </p>
          )}
        </div>
      ) : null}
      {hasProjects && !open && (error || ok) ? (
        <div className="mt-2 max-w-xl">
          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-[color-mix(in_srgb,var(--cw-danger)_35%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-danger)_12%,var(--cw-surface))] px-3 py-2 text-xs text-[var(--cw-danger)]"
            >
              {error}
            </p>
          ) : null}
          {ok ? (
            <p
              role="status"
              className="inline-flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--cw-neon)_35%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-neon)_12%,var(--cw-surface))] px-3 py-2 text-xs text-[var(--cw-neon)]"
            >
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {ok}
            </p>
          ) : null}
        </div>
      ) : null}

      {showForm || !hasProjects ? (
        <div
          className={`mt-5 overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--cw-neon)_32%,var(--cw-hairline))] bg-[var(--cw-surface)] ${
            hasProjects ? "" : "shadow-[0_0_40px_-18px_color-mix(in_srgb,var(--cw-neon)_55%,transparent)]"
          }`}
        >
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
            <div className="p-5 sm:p-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--cw-neon)]">
                Onboard a website
              </p>
              <h2 className="mt-1.5 font-heading text-xl font-bold tracking-tight text-[var(--cw-ink)] sm:text-2xl">
                Put the site on the board
              </h2>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-[var(--cw-ink-muted)]">
                A website project is what Search Console, Blog Studio, and site health hang off.
                Add the URL here and it shows up with the rest of your projects.
              </p>
              <ol className="mt-5 space-y-3">
                {ONBOARD_STEPS.map((step) => (
                  <li key={step.n} className="flex gap-3">
                    <span
                      className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--cw-neon)_40%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-neon)_10%,transparent)] text-[11px] font-bold tabular-nums text-[var(--cw-neon)]"
                      aria-hidden
                    >
                      {step.n}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-[var(--cw-ink)]">{step.title}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-[var(--cw-ink-muted)]">
                        {step.body}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="border-t border-[var(--cw-hairline)] bg-[var(--cw-canvas)]/55 p-5 sm:p-6 lg:border-l lg:border-t-0">
              {isAdmin ? (
                <form onSubmit={addWebsite} className="flex h-full flex-col">
                  <label htmlFor="portfolio-onboard-url" className="text-sm font-semibold text-[var(--cw-ink)]">
                    Website URL
                  </label>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--cw-ink-muted)]">
                    example.com works. So does https://www.example.com.
                  </p>
                  <input
                    id="portfolio-onboard-url"
                    type="text"
                    inputMode="url"
                    autoComplete="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://www.example.com"
                    className="mt-3 w-full rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3.5 py-2.5 text-sm text-[var(--cw-ink)] placeholder:text-[var(--cw-ink-faint)] focus:border-[color-mix(in_srgb,var(--cw-neon)_45%,var(--cw-hairline))] focus:outline-none"
                  />
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Btn type="submit" variant="primary" size="md" icon={Plus} loading={saving} disabled={saving}>
                      Add website
                    </Btn>
                    {!hasProjects ? (
                      <Btn
                        type="button"
                        variant="secondary"
                        size="md"
                        icon={RefreshCw}
                        loading={fetchingMeta}
                        disabled={fetchingMeta}
                        onClick={fetchMeta}
                      >
                        Fetch Meta pages
                      </Btn>
                    ) : null}
                  </div>
                  {!hasProjects ? (
                    <p className="mt-3 text-[11px] leading-relaxed text-[var(--cw-ink-faint)]">
                      Fetch Meta pages pulls Facebook pages from Graph and saves them as social
                      projects, even when they are not attached to a website.
                    </p>
                  ) : null}
                </form>
              ) : (
                <div className="flex h-full flex-col justify-center">
                  <p className="text-sm font-semibold text-[var(--cw-ink)]">An admin adds websites here</p>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--cw-ink-muted)]">
                    Once your site is onboarded it appears in this grid. You can then open it and use
                    every project tool against it.
                  </p>
                </div>
              )}

              {error ? (
                <p
                  role="alert"
                  className="mt-3 rounded-lg border border-[color-mix(in_srgb,var(--cw-danger)_35%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-danger)_12%,var(--cw-surface))] px-3 py-2 text-xs text-[var(--cw-danger)]"
                >
                  {error}
                </p>
              ) : null}
              {ok ? (
                <p
                  role="status"
                  className="mt-3 inline-flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--cw-neon)_35%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-neon)_12%,var(--cw-surface))] px-3 py-2 text-xs text-[var(--cw-neon)]"
                >
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {ok}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryTile({ icon: Icon, label, value, sub, accent = "var(--cw-neon)" }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-4">
      <span
        className="pointer-events-none absolute -right-6 -top-6 size-20 rounded-full opacity-20 blur-2xl"
        style={{ background: accent }}
      />
      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--cw-ink-faint)]">
        <Icon className="size-3.5" style={{ color: accent }} aria-hidden />
        {label}
      </span>
      <p className="mt-2 text-2xl font-bold tabular-nums leading-none text-[var(--cw-ink)]">{value}</p>
      {sub ? <p className="mt-1.5 text-[11px] text-[var(--cw-ink-muted)]">{sub}</p> : null}
    </div>
  );
}

function ProjectCard({ project, isActive, onOpen, index }) {
  const pending = project.pendingBlogs + project.pendingPosts;
  const tone = healthTone(project.healthScore);
  const coverage =
    project.indexedTotal > 0 ? Math.round((project.indexedCount / project.indexedTotal) * 100) : null;

  /* Search traffic is the headline where it exists — it's the number a client
     asks about first. Social-only projects have none, so reach takes the slot
     rather than leaving the hero empty. */
  const hero = project.hasClicks
    ? {
        label: "Clicks 28d",
        value: compactNum(project.clicks),
        delta: project.clicksDelta,
        points: project.clicksTrend,
        tone: "var(--cw-neon)",
      }
    : {
        label: "Reach 30d",
        value: project.followers ? compactNum(project.followers) : "—",
        delta: project.followerDelta,
        points: project.trend,
        tone: "var(--cw-info)",
      };

  /* Built as a list so the grid can be 3 or 4 wide without a second layout:
     reach only earns a cell when search clicks already took the hero slot. */
  const stats = [
    project.hasClicks && project.followers
      ? { icon: Megaphone, label: "Reach", value: compactNum(project.followers) }
      : null,
    {
      icon: ShieldCheck,
      label: "Indexed",
      value: coverage == null ? "—" : `${coverage}%`,
      title:
        coverage == null
          ? "No URL inspection run yet"
          : `${project.indexedCount} of ${project.indexedTotal} URLs indexed`,
    },
    {
      icon: FileText,
      label: "Blogs",
      value: compactNum(project.totalBlogs),
      title: `${project.recentBlogs} published in the last 30 days`,
    },
    {
      icon: Send,
      label: "Posts",
      value: compactNum(project.totalPosts),
      title: `${project.recentPosts} published in the last 30 days`,
    },
  ].filter(Boolean);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${project.name}`}
      data-guide={index === 0 ? "portfolio-open" : undefined}
      className={`group relative flex w-full flex-col overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cw-neon)] ${
        isActive
          ? "border-[color-mix(in_srgb,var(--cw-neon)_55%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-neon)_7%,var(--cw-surface))] shadow-[0_0_30px_-10px_color-mix(in_srgb,var(--cw-neon)_65%,transparent)]"
          : "border-[var(--cw-hairline)] bg-[var(--cw-surface)] hover:border-[color-mix(in_srgb,var(--cw-neon)_38%,var(--cw-hairline))] hover:shadow-[var(--cw-shadow-lg)]"
      }`}
      style={{ animation: `cwCardIn .45s cubic-bezier(.2,.8,.2,1) ${Math.min(index, 11) * 40}ms both` }}
    >
      {/* Sheen that tracks the hover, kept behind the content. */}
      <span className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--cw-neon)_60%,transparent)] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)]">
          <ClientAccountLogo entry={project.entry} size="md" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[15px] font-bold text-[var(--cw-ink)]">{project.name}</p>
            {isActive ? (
              <span className="shrink-0 rounded-full bg-[var(--cw-neon)] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[var(--cw-neon-ink)]">
                Live
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-[var(--cw-ink-faint)]">
            {project.host || (project.social ? "Social only" : "No domain linked")}
          </p>
          <div className="mt-1.5 flex items-center gap-1">
            {project.website ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--cw-ink-muted)]">
                <Globe className="size-2.5" /> Web
              </span>
            ) : null}
            {project.social ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--cw-ink-muted)]">
                <Megaphone className="size-2.5" /> Social
              </span>
            ) : null}
          </div>
        </div>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-raised)] opacity-0 transition-all duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
          <ArrowUpRight className="size-3.5 text-[var(--cw-neon)]" />
        </span>
      </div>

      {/* Health + traffic: the two things worth knowing at a glance. */}
      <div className="mt-4 flex items-center gap-4 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-canvas)]/50 p-3" data-guide={index === 0 ? "portfolio-health" : undefined}>
        <div className="flex items-center gap-2.5">
          <HealthRing score={project.healthScore} />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--cw-ink-faint)]">
              Health
            </p>
            <p className="text-[11px] font-semibold" style={{ color: tone.color }}>
              {tone.label}
            </p>
            {project.criticalCount > 0 ? (
              <p className="text-[10px] text-[var(--cw-ink-muted)]">
                {project.criticalCount} critical
              </p>
            ) : null}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--cw-ink-faint)]">
              {hero.label}
            </span>
            <DeltaBadge value={hero.delta} />
          </div>
          <p className="text-[15px] font-bold tabular-nums leading-tight text-[var(--cw-ink)]">
            {hero.value}
          </p>
          <Sparkline points={hero.points} id={project.sparkId} tone={hero.tone} />
        </div>
      </div>

      <div className={`mt-3 grid gap-2 ${stats.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
        {stats.map((s) => (
          <MiniStat key={s.label} icon={s.icon} label={s.label} value={s.value} title={s.title} />
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--cw-hairline)] pt-3">
        {pending > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--cw-caution)_40%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-caution)_12%,transparent)] px-2 py-1 text-[11px] font-bold text-[var(--cw-caution)]">
            <Bell className="size-3" />
            {pending} awaiting review
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--cw-ink-faint)]">
            <Activity className="size-3" />
            {project.recentBlogs + project.recentPosts} shipped in 30d
          </span>
        )}
        <span className="text-[11px] font-bold text-[var(--cw-ink-faint)] transition-colors group-hover:text-[var(--cw-neon)]">
          Open
        </span>
      </div>
    </button>
  );
}

const SORTS = [
  { id: "attention", label: "Needs attention" },
  { id: "name", label: "Name" },
  { id: "clicks", label: "Search clicks" },
  { id: "reach", label: "Reach" },
  { id: "health", label: "Lowest health" },
  { id: "activity", label: "Most active" },
];

const FILTERS = [
  { id: "all", label: "All" },
  { id: "attention", label: "Needs attention" },
  { id: "website", label: "Websites" },
  { id: "social", label: "Social" },
];

/**
 * Portfolio — the "all projects" lobby.
 *
 * A dashboard of project cards rather than a picker: each card carries the
 * numbers you'd otherwise have to enter the project to see (site health, index
 * coverage, 30-day reach trend, content volume, what's waiting on you), so the
 * grid answers "where do I need to look today" before anyone clicks anything.
 */
export default function PortfolioDashboard({ selectedSite = "", onEnterClient }) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === ROLES.SUPER_ADMIN;
  const [sites, setSites] = useState([]);
  const [metaAccounts, setMetaAccounts] = useState([]);
  const [overview, setOverview] = useState({
    posts: [],
    blogs: [],
    totalPosts: [],
    totalBlogs: [],
    recentPosts: [],
    recentBlogs: [],
    followers: [],
    health: [],
    indexed: [],
    followerSeries: [],
    clicks: [],
  });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("attention");
  const [filter, setFilter] = useState("all");

  const loadPortfolio = useCallback(async ({ initial = false } = {}) => {
    if (initial) setLoading(true);
    try {
      const [integrations, meta, ov] = await Promise.all([
        fetch("/api/admin/site-integrations").then((r) => r.json()).catch(() => ({})),
        fetch("/api/admin/meta-accounts").then((r) => r.json()).catch(() => ({})),
        fetch("/api/portfolio/overview").then((r) => r.json()).catch(() => ({})),
      ]);
      const arr = (v) => (Array.isArray(v) ? v : []);
      setSites(mergeClientAccountEntries(integrations?.sites || []));
      setMetaAccounts(arr(meta?.accounts));
      setOverview({
        posts: arr(ov?.posts),
        blogs: arr(ov?.blogs),
        totalPosts: arr(ov?.totalPosts),
        totalBlogs: arr(ov?.totalBlogs),
        recentPosts: arr(ov?.recentPosts),
        recentBlogs: arr(ov?.recentBlogs),
        followers: arr(ov?.followers),
        health: arr(ov?.health),
        indexed: arr(ov?.indexed),
        followerSeries: arr(ov?.followerSeries),
        clicks: arr(ov?.clicks),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPortfolio({ initial: true });
  }, [loadPortfolio]);

  const postMap = useMemo(() => toCountMap(overview.posts), [overview.posts]);
  const blogMap = useMemo(() => toCountMap(overview.blogs), [overview.blogs]);
  const totalPostMap = useMemo(() => toCountMap(overview.totalPosts), [overview.totalPosts]);
  const totalBlogMap = useMemo(() => toCountMap(overview.totalBlogs), [overview.totalBlogs]);
  const recentPostMap = useMemo(() => toCountMap(overview.recentPosts), [overview.recentPosts]);
  const recentBlogMap = useMemo(() => toCountMap(overview.recentBlogs), [overview.recentBlogs]);
  const healthMap = useMemo(() => toHostMap(overview.health), [overview.health]);
  const indexedMap = useMemo(() => toHostMap(overview.indexed), [overview.indexed]);
  const clicksMap = useMemo(() => toHostMap(overview.clicks), [overview.clicks]);

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

  const followerSeriesByKey = useMemo(() => {
    const m = new Map();
    for (const row of overview.followerSeries || []) {
      const k = normalizeMatchKey(row.siteLink);
      if (!k) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(row);
    }
    return m;
  }, [overview.followerSeries]);

  const allProjects = useMemo(() => {
    return sites
      .map((entry, i) => {
        const host = entry.type === "meta_page" ? "" : siteHost(entry.siteLink);
        const trend = followerTrendForProject(entry, followerSeriesByKey);
        const first = trend.length > 1 ? trend[0].total : 0;
        const last = trend.length > 1 ? trend[trend.length - 1].total : 0;
        const key = hostKey(entry.siteLink);
        const health = key ? healthMap.get(key) : null;
        const indexed = key ? indexedMap.get(key) : null;
        const clicks = key ? clicksMap.get(key) : null;
        const prevClicks = clicks?.prevClicks;
        return {
          entry,
          value: getClientAccountSelectValue(entry),
          sparkId: `p${i}`,
          name: projectDisplayName(entry, metaAccounts),
          host,
          website: isWebsiteEntry(entry),
          social: Boolean(entry.facebookPageId),
          pendingPosts: sumForProject(entry, postMap),
          pendingBlogs: sumForProject(entry, blogMap),
          totalPosts: sumForProject(entry, totalPostMap),
          totalBlogs: sumForProject(entry, totalBlogMap),
          recentPosts: sumForProject(entry, recentPostMap),
          recentBlogs: sumForProject(entry, recentBlogMap),
          followers: followersForProject(entry, followerRowsByKey),
          trend,
          followerDelta: first > 0 ? ((last - first) / first) * 100 : null,
          healthScore: health?.score ?? null,
          criticalCount: health?.critical || 0,
          indexedCount: indexed?.indexed || 0,
          indexedTotal: indexed?.total || 0,
          hasClicks: Boolean(clicks),
          clicks: clicks?.clicks || 0,
          impressions: clicks?.impressions || 0,
          // Sparkline speaks one shape; clicks arrive under their own key.
          clicksTrend: (clicks?.series || []).map((d) => ({ date: d.date, total: d.clicks })),
          clicksDelta:
            prevClicks > 0 ? ((clicks.clicks - prevClicks) / prevClicks) * 100 : null,
        };
      })
      .filter((p) => p.value);
  }, [
    sites,
    metaAccounts,
    postMap,
    blogMap,
    totalPostMap,
    totalBlogMap,
    recentPostMap,
    recentBlogMap,
    followerRowsByKey,
    followerSeriesByKey,
    healthMap,
    indexedMap,
    clicksMap,
  ]);

  const projects = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = allProjects
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.host.toLowerCase().includes(q))
      .filter((p) => {
        if (filter === "attention") return p.pendingBlogs + p.pendingPosts > 0;
        if (filter === "website") return p.website;
        if (filter === "social") return p.social;
        return true;
      });

    const pendingOf = (p) => p.pendingBlogs + p.pendingPosts;
    const sorters = {
      // Default view is a worklist: whoever is waiting on you floats up, and
      // unaudited sites sink rather than pretending to score zero.
      attention: (a, b) => pendingOf(b) - pendingOf(a) || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name),
      clicks: (a, b) => b.clicks - a.clicks || a.name.localeCompare(b.name),
      reach: (a, b) => b.followers - a.followers || a.name.localeCompare(b.name),
      health: (a, b) => (a.healthScore ?? 999) - (b.healthScore ?? 999) || a.name.localeCompare(b.name),
      activity: (a, b) =>
        b.recentBlogs + b.recentPosts - (a.recentBlogs + a.recentPosts) || a.name.localeCompare(b.name),
    };
    return [...rows].sort(sorters[sort] || sorters.name);
  }, [allProjects, query, filter, sort]);

  const stats = useMemo(() => {
    const pending = allProjects.reduce((s, p) => s + p.pendingBlogs + p.pendingPosts, 0);
    const reach = allProjects.reduce((s, p) => s + p.followers, 0);
    const clicks = allProjects.reduce((s, p) => s + p.clicks, 0);
    const tracked = allProjects.filter((p) => p.hasClicks).length;
    const scored = allProjects.filter((p) => p.healthScore != null);
    const avgHealth = scored.length
      ? Math.round(scored.reduce((s, p) => s + p.healthScore, 0) / scored.length)
      : null;
    const shipped = allProjects.reduce((s, p) => s + p.recentBlogs + p.recentPosts, 0);
    const attention = allProjects.filter((p) => p.pendingBlogs + p.pendingPosts > 0).length;
    return { pending, reach, clicks, tracked, avgHealth, scored: scored.length, shipped, attention };
  }, [allProjects]);

  const counts = useMemo(
    () => ({
      all: allProjects.length,
      attention: allProjects.filter((p) => p.pendingBlogs + p.pendingPosts > 0).length,
      website: allProjects.filter((p) => p.website).length,
      social: allProjects.filter((p) => p.social).length,
    }),
    [allProjects]
  );

  return (
    <div className="mx-auto w-full max-w-[1440px]">
      <style>{`
        @keyframes cwCardIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) {
          [style*="cwCardIn"] { animation: none !important; }
        }
      `}</style>

      <FadeIn>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-1 text-[11px] font-medium text-[var(--cw-ink-muted)]">
              <Users className="size-3.5 text-[var(--cw-neon)]" />
              Portfolio · {counts.all} {counts.all === 1 ? "project" : "projects"}
            </div>
            <h1 className="font-heading text-2xl font-bold tracking-tight text-[var(--cw-ink)] sm:text-3xl">
              Projects
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-[var(--cw-ink-muted)]">
              Every project at a glance — health, reach and what&rsquo;s waiting on you. Open one to
              scope every project tool to it; Toolkit research stays available either way.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-canvas)]/60 px-3 py-2 focus-within:border-[color-mix(in_srgb,var(--cw-neon)_45%,var(--cw-hairline))]" data-guide="portfolio-search">
              <Search className="size-4 shrink-0 text-[var(--cw-ink-faint)]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects…"
                className="w-40 bg-transparent text-sm text-[var(--cw-ink)] placeholder:text-[var(--cw-ink-faint)] focus:outline-none sm:w-52"
              />
            </div>
            {/* Native option lists ignore the trigger's colours on most
                platforms, so they're themed explicitly or they render light. */}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              aria-label="Sort projects"
              className="rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-2 text-sm font-medium text-[var(--cw-ink-dim)] focus:border-[color-mix(in_srgb,var(--cw-neon)_45%,var(--cw-hairline))] focus:outline-none [&_option]:bg-[var(--cw-surface)] [&_option]:text-[var(--cw-ink)]"
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  Sort: {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </FadeIn>

      {!loading ? (
        <FadeIn delay={40}>
          <OnboardPanel
            isAdmin={isAdmin}
            hasProjects={allProjects.length > 0}
            onProjectsChanged={() => loadPortfolio()}
          />
        </FadeIn>
      ) : null}

      <FadeIn delay={50}>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4" data-guide="portfolio-list">
          <SummaryTile
            icon={Users}
            label="Projects"
            value={counts.all}
            sub={`${counts.website} with a website · ${counts.social} social`}
          />
          <SummaryTile
            icon={Bell}
            label="Awaiting review"
            value={stats.pending}
            sub={
              stats.attention > 0
                ? `across ${stats.attention} ${stats.attention === 1 ? "project" : "projects"}`
                : "Everything is cleared"
            }
            accent="var(--cw-caution)"
          />
          <SummaryTile
            icon={MousePointerClick}
            label="Search clicks 28d"
            value={compactNum(stats.clicks)}
            sub={
              stats.tracked > 0
                ? `${stats.tracked} ${stats.tracked === 1 ? "site" : "sites"} in Search Console · ${compactNum(stats.reach)} followers`
                : `No Search Console data · ${compactNum(stats.reach)} followers`
            }
            accent="var(--cw-info)"
          />
          <SummaryTile
            icon={Gauge}
            label="Avg site health"
            value={stats.avgHealth == null ? "—" : stats.avgHealth}
            sub={
              stats.scored > 0
                ? `${stats.scored} ${stats.scored === 1 ? "site" : "sites"} audited · ${stats.shipped} shipped in 30d`
                : "No audits run yet"
            }
            accent={healthTone(stats.avgHealth).color}
          />
        </div>
      </FadeIn>

      <FadeIn delay={90}>
        <div className="mt-5 flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => {
            const n = counts[f.id];
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-smooth ${
                  active
                    ? "border-[color-mix(in_srgb,var(--cw-neon)_50%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-neon)_12%,transparent)] text-[var(--cw-neon)]"
                    : "border-[var(--cw-hairline)] bg-[var(--cw-raised)] text-[var(--cw-ink-dim)] hover:border-[var(--cw-hairline-strong)] hover:text-[var(--cw-ink)]"
                }`}
              >
                {f.label}
                <span className="tabular-nums opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
      </FadeIn>

      {loading ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[268px] animate-pulse rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)]"
            />
          ))}
        </div>
      ) : projects.length === 0 ? (
        query || filter !== "all" ? (
          <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] px-6 py-16 text-center">
            <Globe className="size-8 text-[var(--cw-ink-faint)]" />
            <p className="mt-3 text-sm font-medium text-[var(--cw-ink)]">No projects match</p>
            <p className="mt-1 text-xs text-[var(--cw-ink-muted)]">
              Try a different name, domain or filter.
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
              className="mt-4 rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-1.5 text-xs font-semibold text-[var(--cw-ink-dim)] transition-smooth hover:text-[var(--cw-ink)]"
            >
              Clear filters
            </button>
          </div>
        ) : null
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p, i) => (
            <ProjectCard
              key={p.value}
              project={p}
              index={i}
              isActive={entryMatchesSelectValue(p.entry, selectedSite)}
              onOpen={() => onEnterClient?.(p.value)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function projectDisplayName(entry, metaAccounts) {
  const metaMatch = metaAccounts.find(
    (a) =>
      a.facebookPageId &&
      entry.facebookPageId &&
      String(a.facebookPageId).trim() === String(entry.facebookPageId).trim()
  );
  const metaName = String(metaMatch?.name || "").trim();
  if (metaName && !metaName.startsWith("http") && !/^\d+$/.test(metaName)) return metaName;
  const name = String(entry.displayName || entry.userName || "").trim();
  const isMeta = entry.type === "meta_page" || Boolean(entry.facebookPageId && !isWebsiteEntry(entry));
  if (name && !name.startsWith("http") && !/^\d+$/.test(name) && !/^your account$/i.test(name)) {
    return name;
  }
  if (isMeta) return metaName || "Meta page";
  return siteHost(entry.siteLink) || "Untitled project";
}
