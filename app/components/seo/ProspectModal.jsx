"use client";

/**
 * ProspectModal — everything about one link prospect, organised around a single
 * question: can I get a link here, and how?
 *
 * Overview answers "is this worth my time". Evidence proves it (who already
 * links from here, and to which of the ranking sites). Pages gives you the URLs
 * to open. Outreach goes and finds the actual route in — the only tab that
 * touches the network, and only when you ask it to.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  FiAlertCircle,
  FiCheckCircle,
  FiExternalLink,
  FiFileText,
  FiLink,
  FiMail,
  FiRefreshCw,
  FiSearch,
  FiTarget,
  FiX,
} from "react-icons/fi";
import SideTabs from "../ui-shared/SideTabs";
import Btn from "../ui-shared/Btn";
import StatTile from "../ui-shared/StatTile";

const VERDICT_TONE = {
  open: {
    cls: "border-[color-mix(in_srgb,var(--cw-neon)_40%,transparent)] bg-[color-mix(in_srgb,var(--cw-neon)_10%,transparent)] text-[var(--cw-neon)]",
    Icon: FiCheckCircle,
  },
  maybe: {
    cls: "border-[color-mix(in_srgb,var(--cw-info)_40%,transparent)] bg-[color-mix(in_srgb,var(--cw-info)_10%,transparent)] text-[var(--cw-info)]",
    Icon: FiTarget,
  },
  paid: {
    cls: "border-[color-mix(in_srgb,var(--cw-caution)_40%,transparent)] bg-[color-mix(in_srgb,var(--cw-caution)_10%,transparent)] text-[var(--cw-caution)]",
    Icon: FiAlertCircle,
  },
  unknown: {
    cls: "border-[var(--cw-hairline-strong)] bg-[var(--cw-raised)] text-[var(--cw-ink-muted)]",
    Icon: FiAlertCircle,
  },
  unreachable: {
    cls: "border-[var(--cw-hairline-strong)] bg-[var(--cw-raised)] text-[var(--cw-ink-faint)]",
    Icon: FiAlertCircle,
  },
};

function Row({ label, children }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--cw-hairline)] py-2 last:border-b-0">
      <span className="text-[11px] font-semibold text-[var(--cw-ink-muted)]">{label}</span>
      <span className="text-right text-[13px] text-[var(--cw-ink)]">{children}</span>
    </div>
  );
}

export default function ProspectModal({ prospect, targets = [], onClose }) {
  const [section, setSection] = useState("overview");
  const [probe, setProbe] = useState(null);
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState("");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (!prospect) return null;

  const runProbe = async (force = false) => {
    setProbing(true);
    setProbeError("");
    try {
      const res = await fetch("/api/seo/prospect-probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: prospect.domain, refresh: force }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Probe failed");
      setProbe(json.data);
    } catch (err) {
      setProbeError(err.message || "Probe failed");
    } finally {
      setProbing(false);
    }
  };

  // Which of the ranking sites this prospect links to, with their SERP position.
  const linkedRivals = (prospect.linksTo || []).map((domain) => ({
    domain,
    position: targets.find((t) => t.domain === domain)?.position ?? null,
  }));

  const dofollowCount = (prospect.examples || []).filter((e) => e.dofollow === true).length;
  const nofollowCount = (prospect.examples || []).filter((e) => e.dofollow === false).length;

  const sections = [
    { id: "overview", label: "Overview", icon: FiTarget },
    { id: "evidence", label: "Evidence", icon: FiLink, count: linkedRivals.length || undefined },
    { id: "pages", label: "Linking pages", icon: FiFileText, count: prospect.pageCount || undefined },
    { id: "outreach", label: "How to get in", icon: FiMail },
  ];

  const verdictTone = VERDICT_TONE[probe?.verdict] || VERDICT_TONE.unknown;
  const VerdictIcon = verdictTone.Icon;

  const overlay = (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className="cw-lit my-4 flex max-h-[92vh] w-full max-w-4xl flex-col rounded-3xl border border-[var(--cw-hairline-strong)] bg-[var(--cw-surface)] shadow-[var(--cw-shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--cw-hairline)] p-6">
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span
                title={prospect.typeHint}
                className={`rounded-lg border px-2 py-0.5 text-[10px] font-bold ${
                  ["guest-post", "directory", "resource", "roundup"].includes(prospect.type)
                    ? "border-[color-mix(in_srgb,var(--cw-neon)_32%,transparent)] bg-[color-mix(in_srgb,var(--cw-neon)_10%,transparent)] text-[var(--cw-neon)]"
                    : "border-[var(--cw-hairline)] bg-[var(--cw-raised)] text-[var(--cw-ink-faint)]"
                }`}
              >
                {prospect.typeLabel}
              </span>
              {prospect.alsoRanks ? (
                <span className="rounded-lg border border-[color-mix(in_srgb,var(--cw-info)_32%,transparent)] bg-[color-mix(in_srgb,var(--cw-info)_10%,transparent)] px-2 py-0.5 text-[10px] font-bold text-[var(--cw-info)]">
                  ALSO RANKS
                </span>
              ) : null}
              {prospect.youHaveIt ? (
                <span className="rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-2 py-0.5 text-[10px] font-bold text-[var(--cw-ink-muted)]">
                  ALREADY LINKS TO YOU
                </span>
              ) : null}
            </div>
            <h3 className="font-heading truncate text-xl font-semibold text-[var(--cw-ink)]">
              {prospect.domain}
            </h3>
            <a
              href={`https://${prospect.domain}`}
              target="_blank"
              rel="noreferrer"
              className="transition-smooth mt-1 inline-flex items-center gap-1.5 font-mono text-[12px] text-[var(--cw-neon)] hover:underline"
            >
              Open site <FiExternalLink className="size-3" />
            </a>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="transition-smooth shrink-0 rounded-xl p-2 text-[var(--cw-ink-faint)] hover:bg-[var(--cw-raised)] hover:text-[var(--cw-ink)]"
          >
            <FiX className="size-6" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="shrink-0 border-b border-[var(--cw-hairline)] p-3 md:border-r md:border-b-0">
            <SideTabs items={sections} value={section} onChange={setSection} ariaLabel="Prospect detail" />
          </div>

          <div className="min-w-0 flex-1 overflow-y-auto p-6">
            {section === "overview" ? (
              <div className="animate-soft-rise space-y-5">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <StatTile
                    label="Rivals linked"
                    value={`${prospect.hits}/${targets.length || 0}`}
                    hint="Proof it links out here"
                    accent
                  />
                  <StatTile label="Authority" value={prospect.authority ?? "—"} unit="/100" />
                  <StatTile label="Pages found" value={prospect.pageCount || 0} hint="Exact linking URLs" />
                  <StatTile
                    label="Gettability"
                    value={prospect.prospectScore ?? "—"}
                    hint="Higher = easier route in"
                  />
                </div>

                <div className="rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-4 py-3">
                  <Row label="Opportunity type">{prospect.typeLabel}</Row>
                  <Row label="Cost">
                    {prospect.cost === "paid" ? (
                      <span className="text-[var(--cw-caution)]" title={prospect.costNote}>
                        Paid listing / sponsored
                      </span>
                    ) : prospect.cost === "unpaid" ? (
                      <span className="text-[var(--cw-neon)]" title={prospect.costNote}>
                        Unpaid — pitch or submit free
                      </span>
                    ) : (
                      <span className="text-[var(--cw-ink-faint)]" title={prospect.costNote}>
                        Unconfirmed
                      </span>
                    )}
                  </Row>
                  <Row label="Link type">
                    {dofollowCount || nofollowCount ? (
                      <>
                        <span className="text-[var(--cw-neon)]">{dofollowCount} dofollow</span>
                        {nofollowCount ? (
                          <span className="text-[var(--cw-ink-muted)]"> · {nofollowCount} nofollow</span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-[var(--cw-ink-faint)]">not reported</span>
                    )}
                  </Row>
                  <Row label="Also ranks for this keyword">
                    {prospect.alsoRanks ? (
                      <span className="text-[var(--cw-info)]">Yes — a ranking page that links out</span>
                    ) : (
                      "No"
                    )}
                  </Row>
                  <Row label="Already links to you">
                    {prospect.youHaveIt ? "Yes" : "No — this is a gap"}
                  </Row>
                </div>

                <div>
                  <p className="mb-1.5 text-[10px] font-bold tracking-[0.12em] text-[var(--cw-ink-faint)] uppercase">
                    Why it&rsquo;s ranked here
                  </p>
                  <p className="text-[13px] leading-relaxed text-[var(--cw-ink-dim)]">
                    {prospect.typeHint}{" "}
                    {prospect.hits > 1
                      ? `It links to ${prospect.hits} of the sites ranking for this keyword, so it demonstrably links out in your niche.`
                      : "It links to one of the ranking sites."}
                  </p>
                </div>

                {prospect.anchors?.length ? (
                  <div>
                    <p className="mb-1.5 text-[10px] font-bold tracking-[0.12em] text-[var(--cw-ink-faint)] uppercase">
                      Anchors it gives out
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {prospect.anchors.map((a, i) => (
                        <span
                          key={i}
                          className="rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-2 py-1 text-[11px] text-[var(--cw-ink-dim)]"
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[11px] text-[var(--cw-ink-faint)]">
                      A good indication of the anchor you&rsquo;d get if they linked to you.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {section === "evidence" ? (
              <div className="animate-soft-rise space-y-3">
                <p className="text-[13px] leading-relaxed text-[var(--cw-ink-muted)]">
                  This site links to the following ranking sites. The more of them, and the higher
                  they rank, the stronger the case that it will link to you too.
                </p>
                <ul className="space-y-1.5">
                  {linkedRivals.map((rival) => (
                    <li
                      key={rival.domain}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-2.5"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="font-heading inline-flex size-7 shrink-0 items-center justify-center rounded-lg border border-[var(--cw-hairline-strong)] bg-[var(--cw-surface)] font-mono text-[11px] font-bold text-[var(--cw-ink)]">
                          {rival.position != null ? `#${rival.position}` : "—"}
                        </span>
                        <a
                          href={`https://${rival.domain}`}
                          target="_blank"
                          rel="noreferrer"
                          className="transition-smooth truncate font-mono text-[13px] text-[var(--cw-ink-dim)] hover:text-[var(--cw-neon)]"
                        >
                          {rival.domain}
                        </a>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {section === "pages" ? (
              <div className="animate-soft-rise space-y-2">
                {prospect.examples?.length ? (
                  prospect.examples.map((ex, i) => (
                    <div
                      key={`${ex.sourceUrl}-${i}`}
                      className="rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3.5 py-2.5"
                    >
                      <a
                        href={ex.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="transition-smooth font-mono text-[12px] break-all text-[var(--cw-info)] hover:text-[var(--cw-neon)]"
                      >
                        {ex.sourceUrl}
                      </a>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--cw-ink-muted)]">
                        {ex.anchor ? (
                          <span>
                            anchor:{" "}
                            <span className="text-[var(--cw-ink)]">&ldquo;{ex.anchor}&rdquo;</span>
                          </span>
                        ) : null}
                        <span>→ {ex.targetDomain}</span>
                        {ex.dofollow === false ? (
                          <span className="text-[var(--cw-caution)]">nofollow</span>
                        ) : ex.dofollow === true ? (
                          <span className="text-[var(--cw-neon)]">dofollow</span>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-[13px] leading-relaxed text-[var(--cw-ink-muted)]">
                    No exact page was captured for this site — it came from the referring-domain
                    list rather than the per-link list. You have the site, not the URL. Use the
                    outreach check to find a way in.
                  </p>
                )}
              </div>
            ) : null}

            {section === "outreach" ? (
              <div className="animate-soft-rise space-y-4">
                {!probe && !probing ? (
                  <div className="rounded-2xl border border-dashed border-[var(--cw-hairline-strong)] px-5 py-8 text-center">
                    <FiSearch className="mx-auto size-6 text-[var(--cw-ink-faint)]" />
                    <p className="font-heading mt-3 text-sm font-semibold text-[var(--cw-ink)]">
                      Find the actual way in
                    </p>
                    <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-[var(--cw-ink-muted)]">
                      Visits {prospect.domain} and looks for a contribute, submit, listing, resource
                      or contact page, and any email address it exposes. Costs no API credits.
                    </p>
                    <Btn variant="primary" className="mt-4" icon={FiSearch} onClick={() => runProbe(false)}>
                      Check this site
                    </Btn>
                  </div>
                ) : null}

                {probing ? (
                  <p className="py-8 text-center text-[13px] text-[var(--cw-ink-muted)]">
                    <FiRefreshCw className="mr-2 inline size-4 animate-spin text-[var(--cw-neon)]" />
                    Checking {prospect.domain}…
                  </p>
                ) : null}

                {probeError ? (
                  <p className="rounded-xl border border-[color-mix(in_srgb,var(--cw-danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--cw-danger)_8%,transparent)] px-4 py-3 text-[13px] text-[var(--cw-danger)]">
                    {probeError}
                  </p>
                ) : null}

                {probe && !probing ? (
                  <>
                    <div className={`rounded-2xl border px-4 py-3.5 ${verdictTone.cls}`}>
                      <p className="flex items-center gap-2 text-sm font-bold">
                        <VerdictIcon className="size-4" />
                        {probe.verdictLabel}
                      </p>
                      <p className="mt-1.5 text-[12px] leading-relaxed opacity-90">
                        {probe.verdictNote}
                      </p>
                    </div>

                    {probe.routes?.length ? (
                      <div>
                        <p className="mb-2 text-[10px] font-bold tracking-[0.12em] text-[var(--cw-ink-faint)] uppercase">
                          Routes found
                        </p>
                        <ul className="space-y-1.5">
                          {probe.routes.map((route, i) => (
                            <li key={`${route.url}-${i}`}>
                              <a
                                href={route.url}
                                target="_blank"
                                rel="noreferrer"
                                className="transition-smooth flex items-center justify-between gap-3 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3.5 py-2.5 hover:border-[color-mix(in_srgb,var(--cw-neon)_35%,transparent)]"
                              >
                                <span className="min-w-0">
                                  <span className="block text-[13px] font-semibold text-[var(--cw-ink)]">
                                    {route.label}
                                  </span>
                                  <span className="block truncate font-mono text-[11px] text-[var(--cw-ink-muted)]">
                                    {route.url}
                                  </span>
                                </span>
                                <span className="shrink-0 text-[10px] text-[var(--cw-ink-faint)]">
                                  {route.via}
                                </span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {probe.emails?.length ? (
                      <div>
                        <p className="mb-2 text-[10px] font-bold tracking-[0.12em] text-[var(--cw-ink-faint)] uppercase">
                          Contacts exposed on the site
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {probe.emails.map((email) => (
                            <a
                              key={email}
                              href={`mailto:${email}`}
                              className="transition-smooth inline-flex items-center gap-1.5 rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-2.5 py-1.5 font-mono text-[12px] text-[var(--cw-ink-dim)] hover:border-[color-mix(in_srgb,var(--cw-neon)_35%,transparent)] hover:text-[var(--cw-neon)]"
                            >
                              <FiMail className="size-3" />
                              {email}
                            </a>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between gap-2 border-t border-[var(--cw-hairline)] pt-3">
                      <span className="font-mono text-[10px] text-[var(--cw-ink-faint)]">
                        {probe.checkedCount} pages checked{probe.cached ? " · cached" : ""}
                      </span>
                      <Btn variant="ghost" size="xs" icon={FiRefreshCw} onClick={() => runProbe(true)}>
                        Re-check
                      </Btn>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(overlay, document.body) : overlay;
}
