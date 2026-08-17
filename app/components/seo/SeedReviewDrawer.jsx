"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  FiX,
  FiZap,
  FiArrowRight,
  FiEdit3,
  FiPlus,
  FiRefreshCw,
  FiFileText,
  FiFeather,
  FiInstagram,
} from "react-icons/fi";

const DESTINATIONS = [
  { id: "blog", label: "Blog Studio", icon: FiFileText, ready: true, hint: "Long-form articles" },
  { id: "social", label: "Social posts", icon: FiInstagram, ready: false, hint: "Short-form captions" },
  { id: "both", label: "Blog + Social", icon: FiFeather, ready: false, hint: "One idea, both formats" },
];

function splitKeywords(value) {
  return String(value || "")
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Review-and-send drawer for the SERP "turn this into content" flow.
 *
 * Ideas arrive un-saved (preview). The user tweaks titles/keywords, drops any
 * they dislike, then commits — the parent persists the edited set and walks the
 * user straight into the Studio. Nothing is written until they hit send.
 */
export default function SeedReviewDrawer({
  open,
  keyword,
  location,
  seeds = [],
  sending = false,
  error = "",
  onSend,
  onClose,
}) {
  const [shown, setShown] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [destination, setDestination] = useState("blog");
  const [keywordInput, setKeywordInput] = useState({});
  const [initFor, setInitFor] = useState(null);

  // Reset the editable state whenever a new batch of ideas is opened. Done in
  // render (guarded) rather than an effect so there are no cascading renders.
  if (open) {
    if (initFor !== seeds) {
      setInitFor(seeds);
      setDrafts(
        seeds.map((s, i) => {
          const p = s?.payload && typeof s.payload === "object" ? s.payload : s || {};
          return {
            key: `idea-${i}`,
            payload: p,
            title: String(p.title || p.topic || "").trim(),
            keywords: splitKeywords(p.mustFollowKeywords),
            include: true,
          };
        })
      );
      setDestination("blog");
      setKeywordInput({});
      setShown(false);
    }
  } else if (initFor !== null) {
    setInitFor(null);
  }

  // Slide-in animation only — async setState is safe inside an effect.
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => setShown(true), 10);
    return () => clearTimeout(t);
  }, [open]);

  const included = useMemo(() => drafts.filter((d) => d.include), [drafts]);

  if (!open || typeof document === "undefined") return null;

  const patch = (key, next) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...next } : d)));

  const addKeyword = (key) => {
    const raw = String(keywordInput[key] || "").trim();
    if (!raw) return;
    setDrafts((prev) =>
      prev.map((d) =>
        d.key === key && !d.keywords.includes(raw)
          ? { ...d, keywords: [...d.keywords, raw] }
          : d
      )
    );
    setKeywordInput((prev) => ({ ...prev, [key]: "" }));
  };

  const removeKeyword = (key, kw) =>
    setDrafts((prev) =>
      prev.map((d) => (d.key === key ? { ...d, keywords: d.keywords.filter((k) => k !== kw) } : d))
    );

  const handleSend = () => {
    const payloads = included.map((d) => ({
      ...d.payload,
      title: d.title || d.payload.title || d.payload.topic,
      topic: d.title || d.payload.topic || d.payload.title,
      mustFollowKeywords: d.keywords.join("\n"),
    }));
    onSend?.(payloads, destination);
  };

  const close = () => {
    setShown(false);
    setTimeout(() => onClose?.(), 180);
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex justify-end">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-gray-900/40 backdrop-blur-[2px] transition-opacity duration-200 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
        onClick={close}
      />

      {/* Panel */}
      <div
        className={`relative flex h-full w-full max-w-xl flex-col bg-[#fbfcfb] shadow-2xl transition-transform duration-200 ease-out ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="relative overflow-hidden border-b border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-white px-6 pb-5 pt-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl border border-emerald-100 bg-white p-2.5 shadow-sm">
                <FiEdit3 className="size-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold leading-tight text-gray-900">
                  Turn this into content
                </h2>
                <p className="mt-0.5 text-sm text-gray-500">
                  {drafts.length} ideas from{" "}
                  <span className="font-semibold text-emerald-700">“{keyword}”</span>
                  {location ? ` · ${location}` : ""} — review, tweak, then send.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={close}
              className="rounded-lg p-1.5 text-gray-400 transition hover:bg-white hover:text-gray-700"
              aria-label="Close"
            >
              <FiX className="size-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          {drafts.map((d, idx) => (
            <div
              key={d.key}
              className={`group rounded-2xl border bg-white p-4 transition-all ${
                d.include
                  ? "border-gray-200 shadow-sm"
                  : "border-dashed border-gray-200 opacity-55"
              }`}
            >
              <div className="flex items-start gap-3">
                <label className="mt-1 flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={d.include}
                    onChange={(e) => patch(d.key, { include: e.target.checked })}
                    className="size-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                </label>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-700">
                      {idx + 1}
                    </span>
                    <input
                      value={d.title}
                      onChange={(e) => patch(d.key, { title: e.target.value })}
                      disabled={!d.include}
                      className="w-full rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-sm font-bold text-gray-900 transition hover:border-gray-200 focus:border-emerald-400 focus:bg-white focus:outline-none disabled:cursor-not-allowed"
                      placeholder="Idea title"
                    />
                  </div>

                  {d.payload.why ? (
                    <p className="mt-1.5 pl-7 text-xs leading-relaxed text-gray-500">
                      {d.payload.why}
                    </p>
                  ) : null}

                  {/* Meta chips */}
                  <div className="mt-2 flex flex-wrap gap-1.5 pl-7">
                    {d.payload.contentType ? (
                      <span className="rounded-md bg-gray-50 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 ring-1 ring-inset ring-gray-200">
                        {d.payload.contentType}
                      </span>
                    ) : null}
                    {d.payload.wordCountRange ? (
                      <span className="rounded-md bg-gray-50 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 ring-1 ring-inset ring-gray-200">
                        {d.payload.wordCountRange} words
                      </span>
                    ) : null}
                  </div>

                  {/* Keywords */}
                  {d.include ? (
                    <div className="mt-2.5 pl-7">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {d.keywords.map((k) => (
                          <span
                            key={k}
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-900"
                          >
                            {k}
                            <button
                              type="button"
                              onClick={() => removeKeyword(d.key, k)}
                              className="text-emerald-500 transition hover:text-emerald-800"
                              aria-label={`Remove ${k}`}
                            >
                              <FiX className="size-3" />
                            </button>
                          </span>
                        ))}
                        <span className="inline-flex items-center rounded-md border border-dashed border-gray-300 bg-white pl-1.5">
                          <input
                            value={keywordInput[d.key] || ""}
                            onChange={(e) =>
                              setKeywordInput((prev) => ({ ...prev, [d.key]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addKeyword(d.key);
                              }
                            }}
                            placeholder="add keyword"
                            className="w-24 bg-transparent py-0.5 text-[11px] text-gray-700 placeholder:text-gray-400 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => addKeyword(d.key)}
                            className="px-1 text-gray-400 transition hover:text-emerald-600"
                            aria-label="Add keyword"
                          >
                            <FiPlus className="size-3" />
                          </button>
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 bg-white px-6 py-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
            Send to
          </p>
          <div className="mb-4 grid grid-cols-3 gap-2">
            {DESTINATIONS.map((dst) => {
              const active = destination === dst.id;
              const Icon = dst.icon;
              return (
                <button
                  key={dst.id}
                  type="button"
                  disabled={!dst.ready}
                  onClick={() => dst.ready && setDestination(dst.id)}
                  title={dst.ready ? dst.hint : "Coming soon"}
                  className={`relative flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center transition ${
                    active
                      ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500"
                      : dst.ready
                        ? "border-gray-200 bg-white hover:border-gray-300"
                        : "cursor-not-allowed border-gray-100 bg-gray-50"
                  }`}
                >
                  <Icon
                    className={`size-4 ${
                      active ? "text-emerald-600" : dst.ready ? "text-gray-500" : "text-gray-300"
                    }`}
                  />
                  <span
                    className={`text-[11px] font-bold ${
                      active ? "text-emerald-800" : dst.ready ? "text-gray-700" : "text-gray-400"
                    }`}
                  >
                    {dst.label}
                  </span>
                  {!dst.ready ? (
                    <span className="absolute -right-1 -top-1 rounded-full bg-gray-200 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-gray-500">
                      Soon
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={close}
              className="rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-500 transition hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !included.length}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {sending ? (
                <FiRefreshCw className="size-4 animate-spin" />
              ) : (
                <FiZap className="size-4" />
              )}
              {sending
                ? "Sending…"
                : `Send ${included.length} idea${included.length === 1 ? "" : "s"} to Studio`}
              {!sending ? <FiArrowRight className="size-4" /> : null}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
