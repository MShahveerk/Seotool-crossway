"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  FiCheck,
  FiDownload,
  FiEyeOff,
  FiFileText,
  FiLoader,
  FiMail,
  FiRefreshCw,
  FiSave,
  FiSliders,
} from "react-icons/fi";
import ReportsManagementPanel from "./ReportsManagementPanel";

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
        checked ? "bg-[#1d9c35]" : "bg-gray-300"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow mt-1 transition ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function hostLabel(site) {
  if (!site) return "Select a client";
  try {
    if (String(site).startsWith("http")) return new URL(site).hostname.replace(/^www\./, "");
  } catch {
    /* fall through */
  }
  return String(site).replace(/^www\./, "");
}

export default function ReportsStudioSection({ selectedSite = "" }) {
  const { data: session } = useSession();
  const isSuperAdmin = session?.user?.role === "super_admin";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [config, setConfig] = useState(null);
  const [catalog, setCatalog] = useState({ slides: [], stats: [] });
  const [summary, setSummary] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [statFilter, setStatFilter] = useState("all");

  const siteKey = String(selectedSite || "").trim();

  const load = useCallback(async () => {
    if (!siteKey) {
      setLoading(false);
      setConfig(null);
      setError("Select a client site from the sidebar to configure reports.");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/reports/studio/config?url=${encodeURIComponent(siteKey)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setConfig(data.config);
      setCatalog(data.catalog || { slides: [], stats: [] });
      setSummary(data.summary);
      setDirty(false);
    } catch (e) {
      setError(e.message || "Failed to load report studio");
    } finally {
      setLoading(false);
    }
  }, [siteKey]);

  useEffect(() => {
    load();
  }, [load]);

  const setSlide = (id, on) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        slides: { ...prev.slides, [id]: on },
        stats: { ...prev.stats },
      };
      if (!on) {
        for (const st of catalog.stats || []) {
          if (st.slide === id) next.stats[st.id] = false;
        }
      }
      return next;
    });
    setDirty(true);
    setMessage("");
  };

  const setStat = (id, on) => {
    setConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, stats: { ...prev.stats, [id]: on } };
    });
    setDirty(true);
    setMessage("");
  };

  const save = async () => {
    if (!siteKey || !config) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/reports/studio/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: siteKey, config }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setConfig(data.config);
      setSummary(data.summary);
      setDirty(false);
      setMessage("Saved. Downloads, Send all, and the Monday cron will use this template.");
    } catch (e) {
      setError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const download = async (kind) => {
    if (!siteKey) return;
    if (dirty) {
      setError("Save your template before downloading so the PDF matches what you configured.");
      return;
    }
    setDownloading(kind);
    setError("");
    try {
      const q = new URLSearchParams({ section: kind, url: siteKey });
      const res = await fetch(`/api/reports/export?${q}`, { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Download failed");
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const match = /filename="([^"]+)"/.exec(cd);
      const filename = match?.[1] || `${kind}-report.pdf`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      setMessage(`Downloaded ${kind} deck for ${hostLabel(siteKey)}.`);
    } catch (e) {
      setError(e.message || "Download failed");
    } finally {
      setDownloading("");
    }
  };

  const enableAll = () => {
    setConfig((prev) => {
      if (!prev) return prev;
      const slides = Object.fromEntries((catalog.slides || []).map((s) => [s.id, true]));
      const stats = Object.fromEntries((catalog.stats || []).map((s) => [s.id, true]));
      return { ...prev, slides, stats };
    });
    setDirty(true);
  };

  const websiteSlides = useMemo(
    () => (catalog.slides || []).filter((s) => s.deck === "website" || s.deck === "both"),
    [catalog.slides]
  );
  const smmSlides = useMemo(
    () => (catalog.slides || []).filter((s) => s.deck === "smm" || s.deck === "both"),
    [catalog.slides]
  );

  const visibleStats = useMemo(() => {
    const list = catalog.stats || [];
    if (statFilter === "all") return list;
    return list.filter((s) => s.slide === statFilter);
  }, [catalog.stats, statFilter]);

  const liveSummary = useMemo(() => {
    if (!config) return summary;
    const slides = catalog.slides || [];
    const stats = catalog.stats || [];
    const slidesOff = slides.filter((s) => config.slides?.[s.id] === false).map((s) => s.label);
    const statsOff = stats
      .filter((s) => config.slides?.[s.slide] !== false && config.stats?.[s.id] === false)
      .map((s) => s.label);
    const hiddenBySlide = stats.filter((s) => config.slides?.[s.slide] === false).length;
    return {
      slidesOn: slides.length - slidesOff.length,
      slidesTotal: slides.length,
      statsOn: stats.length - statsOff.length - hiddenBySlide,
      statsTotal: stats.length - hiddenBySlide,
      slidesOff,
      statsOff,
    };
  }, [config, catalog, summary]);

  const slidesOffCount = liveSummary?.slidesOff?.length ?? 0;
  const statsOffCount = liveSummary?.statsOff?.length ?? 0;

  return (
    <div className="min-h-[calc(100vh-2rem)] space-y-6">
      <header className="relative overflow-hidden rounded-3xl border border-gray-900/10 bg-gradient-to-br from-gray-950 via-gray-900 to-emerald-950 px-6 py-8 text-white shadow-[0_16px_48px_rgba(0,0,0,0.18)] sm:px-8" data-guide="report-month">
        <div className="absolute -right-20 -top-16 size-72 rounded-full bg-emerald-400/15 blur-3xl" aria-hidden />
        <div className="absolute -bottom-24 left-10 size-56 rounded-full bg-lime-300/10 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-300/90">Reports</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Report Studio</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-300">
              Micromanage every slide and stat for{" "}
              <span className="font-semibold text-white">{hostLabel(siteKey)}</span>. What you save here is
              exactly what gets downloaded — and what the weekly cron emails.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              <FiRefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              Reload
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving || !config}
              className="inline-flex items-center gap-2 rounded-xl bg-[#00A3FF] px-4 py-2 text-sm font-bold text-gray-950 hover:bg-[#4DC4FF] disabled:opacity-40"
            >
              {saving ? <FiLoader className="size-4 animate-spin" /> : <FiSave className="size-4" />}
              {saving ? "Saving…" : dirty ? "Save template" : "Saved"}
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {message ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm ring-1 ring-gray-50 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3" data-guide="report-build">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Download filtered decks</h2>
              <p className="text-sm text-gray-500">Uses the saved template for this client.</p>
            </div>
            {dirty ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                Unsaved changes
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                <FiCheck className="size-3.5" /> Template in sync
              </span>
            )}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3" data-guide="report-kind">
            {[
              { kind: "website", label: "Website" },
              { kind: "smm", label: "Social" },
              { kind: "combined", label: "Combined" },
            ].map((item) => (
              <button
                key={item.kind}
                type="button"
                disabled={!siteKey || Boolean(downloading)}
                onClick={() => download(item.kind)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold text-gray-900 hover:border-[#1d9c35]/40 hover:bg-emerald-50/60 disabled:opacity-40"
              >
                {downloading === item.kind ? (
                  <FiLoader className="size-4 animate-spin" />
                ) : (
                  <FiDownload className="size-4 text-[#1d9c35]" />
                )}
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm ring-1 ring-gray-50">
          <div className="flex items-center gap-2 text-gray-900">
            <FiSliders className="size-5 text-[#1d9c35]" />
            <h2 className="text-lg font-bold">Template status</h2>
          </div>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">Slides on</dt>
              <dd className="font-semibold text-gray-900">
                {liveSummary ? `${liveSummary.slidesOn}/${liveSummary.slidesTotal}` : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">Stats on</dt>
              <dd className="font-semibold text-gray-900">
                {liveSummary ? `${liveSummary.statsOn}/${liveSummary.statsTotal}` : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">Hidden slides</dt>
              <dd className="font-semibold text-gray-900">{slidesOffCount}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">Hidden stats</dt>
              <dd className="font-semibold text-gray-900">{statsOffCount}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={enableAll}
            disabled={!config}
            className="mt-4 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            Reset — show everything
          </button>
        </div>
      </section>

      {loading ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center text-sm text-gray-500">
          Loading report template…
        </div>
      ) : config ? (
        <>
          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm ring-1 ring-gray-50 sm:p-6">
            <div className="mb-5 flex items-center gap-2">
              <FiFileText className="size-5 text-[#1d9c35]" />
              <div>
                <h2 className="text-lg font-bold text-gray-900">Slides</h2>
                <p className="text-sm text-gray-500">Turn off entire pages in the PDF deck.</p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">
                  Website deck
                </p>
                <ul className="space-y-2">
                  {websiteSlides.map((slide) => {
                    const on = config.slides?.[slide.id] !== false;
                    return (
                      <li
                        key={slide.id}
                        className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-3 ${
                          on ? "border-gray-100 bg-gray-50/70" : "border-dashed border-gray-200 bg-white"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900">{slide.label}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{slide.description}</p>
                        </div>
                        <Toggle checked={on} onChange={(v) => setSlide(slide.id, v)} />
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div>
                <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">
                  Social deck
                </p>
                <ul className="space-y-2">
                  {smmSlides.map((slide) => {
                    const on = config.slides?.[slide.id] !== false;
                    return (
                      <li
                        key={slide.id}
                        className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-3 ${
                          on ? "border-gray-100 bg-gray-50/70" : "border-dashed border-gray-200 bg-white"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900">{slide.label}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{slide.description}</p>
                        </div>
                        <Toggle checked={on} onChange={(v) => setSlide(slide.id, v)} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm ring-1 ring-gray-50 sm:p-6">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-center gap-2">
                <FiEyeOff className="size-5 text-[#1d9c35]" />
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Stats inside slides</h2>
                  <p className="text-sm text-gray-500">Hide individual KPIs, panels, and tables.</p>
                </div>
              </div>
              <select
                value={statFilter}
                onChange={(e) => setStatFilter(e.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800"
              >
                <option value="all">All slides</option>
                {(catalog.slides || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <ul className="grid gap-2 md:grid-cols-2">
              {visibleStats.map((stat) => {
                const slideOn = config.slides?.[stat.slide] !== false;
                const on = slideOn && config.stats?.[stat.id] !== false;
                return (
                  <li
                    key={stat.id}
                    className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-3 ${
                      !slideOn
                        ? "border-gray-100 bg-gray-50 opacity-50"
                        : on
                          ? "border-gray-100 bg-white"
                          : "border-dashed border-gray-200 bg-amber-50/40"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{stat.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {(catalog.slides || []).find((s) => s.id === stat.slide)?.label || stat.slide}
                        {" · "}
                        {stat.description}
                      </p>
                    </div>
                    <Toggle
                      checked={on}
                      disabled={!slideOn}
                      onChange={(v) => setStat(stat.id, v)}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      ) : null}

      {isSuperAdmin ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <FiMail className="size-5 text-[#1d9c35]" />
            <div>
              <h2 className="text-lg font-bold text-gray-900">Delivery &amp; Send all</h2>
              <p className="text-sm text-gray-500">
                Cron and Send all use each site&apos;s saved template from this studio.
              </p>
            </div>
          </div>
          <div data-guide="report-history">
            <ReportsManagementPanel />
          </div>
        </section>
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-white px-5 py-4 text-sm text-gray-600 ring-1 ring-gray-50">
          Weekly email delivery is managed by super admins. Your saved template still applies whenever a
          report for this client is generated or sent.
        </div>
      )}
    </div>
  );
}
