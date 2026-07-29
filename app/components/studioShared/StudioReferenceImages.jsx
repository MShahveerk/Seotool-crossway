"use client";

import { FiUpload, FiX } from "react-icons/fi";
import { publicMediaUrl } from "@/lib/publicMediaUrl";

const MAX = 4;

/**
 * Assets multi-reference uploader (up to 4). First image = primary look lock.
 */
export default function StudioReferenceImages({
  paths = [],
  uploadUrl,
  disabled = false,
  onConfig,
  onMessage,
}) {
  const list = (Array.isArray(paths) ? paths : []).filter(Boolean).slice(0, MAX);
  const canAdd = list.length < MAX && Boolean(uploadUrl) && !disabled;

  const uploadFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length || !uploadUrl) return;
    let lastConfig = null;
    let uploaded = 0;
    for (const file of files) {
      if (list.length + uploaded >= MAX) break;
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(uploadUrl, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onMessage?.({ ok: false, text: data.error || "Upload failed." });
        return;
      }
      lastConfig = data.config;
      uploaded += 1;
    }
    if (lastConfig) {
      onConfig?.(lastConfig);
      onMessage?.({
        ok: true,
        text:
          uploaded === 1
            ? "Reference image added — used on every image run."
            : `${uploaded} reference images added — used on every image run.`,
      });
    }
  };

  const removePath = async (path) => {
    if (!uploadUrl || !path) return;
    const url = `${uploadUrl}${uploadUrl.includes("?") ? "&" : "?"}path=${encodeURIComponent(path)}`;
    const res = await fetch(url, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      onMessage?.({ ok: false, text: data.error || "Could not remove image." });
      return;
    }
    onConfig?.(data.config);
    onMessage?.({ ok: true, text: "Reference image removed." });
  };

  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
        Reference images
      </label>
      <p className="mt-0.5 text-xs text-gray-500 mb-1">
        Up to {MAX} style locks. Every image run uses OpenAI edits with high input fidelity.
        The <strong>first</strong> image is the primary look (richest fidelity); extras add
        secondary cues. Re-upload if a run says a reference could not be loaded.
      </p>
      <div className="mt-2 flex flex-wrap items-start gap-3">
        <label
          className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:border-[#1d9c35] ${
            !canAdd ? "opacity-50 pointer-events-none" : ""
          }`}
        >
          <FiUpload /> {list.length ? "Add image" : "Upload image"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="sr-only"
            disabled={!canAdd}
            onChange={async (e) => {
              await uploadFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <span className="self-center text-[11px] text-gray-400">
          {list.length}/{MAX}
        </span>
      </div>
      {list.length > 0 ? (
        <ul className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {list.map((path, idx) => (
            <li
              key={`${path}-${idx}`}
              className="relative overflow-hidden rounded-xl border border-gray-200 bg-slate-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={publicMediaUrl(path)}
                alt={idx === 0 ? "Primary reference" : `Reference ${idx + 1}`}
                className="aspect-square w-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/55 px-1.5 py-1">
                <span className="text-[10px] font-semibold text-white">
                  {idx === 0 ? "Primary" : `#${idx + 1}`}
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => removePath(path)}
                  className="rounded p-0.5 text-white/90 hover:bg-white/20 disabled:opacity-50"
                  title="Remove"
                >
                  <FiX className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
