"use client";

import { useState } from "react";
import { FiImage, FiRefreshCw, FiUpload } from "react-icons/fi";
import { DEFAULT_BRAND_KIT } from "@/lib/studioBrandKitDefaults.js";

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500";
const labelClass = "block text-[11px] font-semibold uppercase tracking-wide text-gray-500";

export default function StudioBrandKit({
  brandKit,
  apiUrl,
  onConfig,
  onMessage,
  onPatchLocal,
}) {
  const kit = { ...DEFAULT_BRAND_KIT, ...(brandKit || {}) };
  const source = kit.source === "ai" ? "ai" : "manual";
  const [busy, setBusy] = useState("");
  const [createBrief, setCreateBrief] = useState("");
  const [replaceLogo, setReplaceLogo] = useState(false);

  const patch = (partial) => {
    const next = { ...kit, ...partial };
    onPatchLocal?.(next);
  };

  const setSource = (nextSource) => {
    patch({ source: nextSource });
  };

  const postJson = async (body, busyKey) => {
    if (!apiUrl) return;
    setBusy(busyKey);
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Brand kit request failed");
      if (data.config) onConfig?.(data.config);
      onMessage?.(
        busyKey === "figma"
          ? "Figma template pulled."
          : busyKey === "preview"
            ? "Preview ready — scroll down to see it."
            : busyKey === "create"
              ? data.brandSummary
                ? `AI brand frame ready — ${data.brandSummary}${
                    data.frameGenerated ? " · frame overlay saved" : ""
                  }${data.logoGenerated ? " · logo generated" : ""}. Preview updated below.`
                : "AI brand frame ready. Preview updated below."
              : "Brand kit updated."
      );
    } catch (err) {
      onMessage?.(err.message || "Brand kit failed");
    } finally {
      setBusy("");
    }
  };

  const uploadLogo = async (file) => {
    if (!file || !apiUrl) return;
    setBusy("logo");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(apiUrl, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Logo upload failed");
      if (data.config) onConfig?.(data.config);
      onMessage?.("Site logo uploaded — using your own brand kit.");
    } catch (err) {
      onMessage?.(err.message || "Logo upload failed");
    } finally {
      setBusy("");
    }
  };

  return (
    <div
      id="studio-ai-brand-kit"
      className="rounded-2xl border-2 border-emerald-500 bg-white p-5 space-y-4 shadow-sm scroll-mt-24"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
            Brand kit
          </p>
          <h3 className="text-base font-bold text-gray-900 mt-0.5">
            Choose AI-generated or your own
          </h3>
          <p className="mt-1 text-sm text-gray-600 max-w-2xl leading-relaxed">
            Pick how this site’s Instagram frame is built. Either upload your logo and set colors,
            or let AI design the full kit. Internal Studio image runs stamp the saved frame.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-800">
          <input
            type="checkbox"
            className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            checked={Boolean(kit.enabled)}
            onChange={(e) => patch({ enabled: e.target.checked })}
          />
          Frame enabled
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setSource("manual")}
          className={`rounded-xl border-2 px-4 py-3 text-left transition ${
            source === "manual"
              ? "border-emerald-600 bg-emerald-50 shadow-sm"
              : "border-gray-200 bg-white hover:border-gray-300"
          }`}
        >
          <p className="text-sm font-bold text-gray-900">Your own brand kit</p>
          <p className="mt-1 text-xs text-gray-600 leading-relaxed">
            Upload your logo, pick matte color and corner placement yourself.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setSource("ai")}
          className={`rounded-xl border-2 px-4 py-3 text-left transition ${
            source === "ai"
              ? "border-emerald-600 bg-emerald-50 shadow-sm"
              : "border-gray-200 bg-white hover:border-gray-300"
          }`}
        >
          <p className="text-sm font-bold text-gray-900">AI brand kit</p>
          <p className="mt-1 text-xs text-gray-600 leading-relaxed">
            AI invents a real border/frame overlay from scratch (with a transparent photo window) plus
            optional logo — not just a color tweak.
          </p>
        </button>
      </div>

      {source === "ai" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
          <div>
            <label className={labelClass}>AI create full brand frame</label>
            <p className="mt-1 text-xs text-gray-600">
              Generates a production frame PNG (designed chrome + cut-out window), optional logo, and a
              real preview. Needs Agents image API key. ~30–90s.
            </p>
          </div>
          <textarea
            className={`${inputClass} min-h-[72px]`}
            value={createBrief}
            onChange={(e) => setCreateBrief(e.target.value)}
            placeholder="Optional brief: brand name, vibe, colors to avoid, industry…"
            disabled={Boolean(busy)}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={Boolean(busy) || !apiUrl}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 text-white px-4 py-2.5 text-sm font-bold disabled:opacity-50"
              onClick={() =>
                postJson(
                  {
                    action: "ai-create-kit",
                    brief: createBrief,
                    generateLogo: true,
                    replaceLogo,
                  },
                  "create"
                )
              }
            >
              {busy === "create" ? (
                <FiRefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <FiImage className="w-4 h-4" />
              )}
              {busy === "create" ? "Creating AI frame…" : "AI create brand frame"}
            </button>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-700">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                checked={replaceLogo}
                onChange={(e) => setReplaceLogo(e.target.checked)}
                disabled={Boolean(busy)}
              />
              Replace existing logo
            </label>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
          <div>
            <label className={labelClass}>Your logo & settings</label>
            <p className="mt-1 text-xs text-gray-600">
              Upload the real brand mark, then tune matte/logo below and Save.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800">
              <FiUpload className="w-3.5 h-3.5" />
              {busy === "logo" ? "Uploading…" : "Upload site logo"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                disabled={Boolean(busy)}
                onChange={(e) => uploadLogo(e.target.files?.[0])}
              />
            </label>
            <button
              type="button"
              disabled={Boolean(busy) || !kit.logoPath}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800 disabled:opacity-50"
              onClick={() => postJson({ action: "suggest" }, "suggest")}
            >
              {busy === "suggest" ? (
                <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FiImage className="w-3.5 h-3.5" />
              )}
              Auto suggest colors from logo
            </button>
            {kit.logoPath ? (
              <span className="text-[11px] text-gray-500 truncate max-w-[220px]">
                Logo: {kit.logoPath}
              </span>
            ) : (
              <span className="text-[11px] text-amber-700">No logo uploaded yet</span>
            )}
          </div>
          {kit.logoPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={kit.logoPath}
              alt="Site logo"
              className="h-16 w-auto object-contain rounded-lg border border-gray-100 bg-white p-2"
            />
          ) : null}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={labelClass}>Mode</label>
          <select
            className={`${inputClass} mt-1`}
            value={kit.mode || "matte"}
            onChange={(e) => patch({ mode: e.target.value })}
          >
            <option value="matte">Matte + logo (Sharp)</option>
            <option value="frame">Designed frame overlay (AI)</option>
            <option value="ai">Prompt paints brand chrome</option>
            <option value="figma">Figma overlay</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Matte color</label>
          <div className="mt-1 flex gap-2">
            <input
              type="color"
              className="h-10 w-12 rounded border border-gray-200"
              value={kit.matteColor || "#0a0a0a"}
              onChange={(e) => patch({ matteColor: e.target.value, source: "manual" })}
            />
            <input
              className={inputClass}
              value={kit.matteColor || "#0a0a0a"}
              onChange={(e) => patch({ matteColor: e.target.value, source: "manual" })}
            />
          </div>
        </div>
        <div>
          <label className={labelClass}>Logo corner</label>
          <select
            className={`${inputClass} mt-1`}
            value={kit.logoCorner || "bottom-right"}
            onChange={(e) => patch({ logoCorner: e.target.value })}
          >
            <option value="bottom-right">Bottom right</option>
            <option value="bottom-left">Bottom left</option>
            <option value="top-right">Top right</option>
            <option value="top-left">Top left</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Matte padding %</label>
          <input
            type="number"
            min={2}
            max={20}
            className={`${inputClass} mt-1`}
            value={kit.mattePaddingPct ?? 7}
            onChange={(e) => patch({ mattePaddingPct: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className={labelClass}>Logo size %</label>
          <input
            type="number"
            min={6}
            max={28}
            className={`${inputClass} mt-1`}
            value={kit.logoScalePct ?? 14}
            onChange={(e) => patch({ logoScalePct: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className={labelClass}>Logo inset %</label>
          <input
            type="number"
            min={1}
            max={12}
            className={`${inputClass} mt-1`}
            value={kit.logoPaddingPct ?? 3.5}
            onChange={(e) => patch({ logoPaddingPct: Number(e.target.value) })}
          />
        </div>
      </div>

      {source === "ai" && (kit.frameTemplatePath || kit.logoPath) ? (
        <div className="flex flex-wrap items-end gap-4">
          {kit.frameTemplatePath ? (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                AI frame overlay
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={kit.frameTemplatePath}
                alt="AI brand frame overlay"
                className="max-h-40 w-auto object-contain rounded-lg border border-gray-200 bg-gray-100 p-1"
              />
            </div>
          ) : null}
          {kit.logoPath ? (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                Logo mark
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={kit.logoPath}
                alt="Brand logo"
                className="h-16 w-auto object-contain rounded-lg border border-gray-100 bg-gray-50 p-2"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={Boolean(busy)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 text-white px-3 py-2 text-xs font-semibold disabled:opacity-50"
          onClick={() =>
            postJson({ action: "save", brandKitJson: { ...kit, source } }, "save")
          }
        >
          {busy === "save" ? "Saving…" : "Save brand kit"}
        </button>
        <button
          type="button"
          disabled={Boolean(busy) || !kit.enabled}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 disabled:opacity-50"
          onClick={() =>
            postJson(
              { action: "preview", brandKitJson: { ...kit, source, enabled: true } },
              "preview"
            )
          }
        >
          {busy === "preview" ? (
            <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <FiImage className="w-3.5 h-3.5" />
          )}
          Preview frame now
        </button>
        <span className="text-[11px] font-semibold text-gray-500">
          Active path: {source === "ai" ? "AI brand kit" : "Your own brand kit"}
        </span>
      </div>

      {kit.previewPath ? (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
            Latest preview
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={kit.previewPath}
            alt="Brand frame preview"
            className="max-h-72 w-auto rounded-xl border border-gray-200 shadow-sm"
          />
        </div>
      ) : null}

      <div>
        <label className={labelClass}>Brand notes (used in AI chrome mode)</label>
        <textarea
          className={`${inputClass} mt-1 min-h-[70px]`}
          value={kit.aiBrandNotes || ""}
          onChange={(e) => patch({ aiBrandNotes: e.target.value })}
          placeholder="Keep logo crisp bottom-right; deep charcoal matte; no extra text…"
        />
      </div>

      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-900">Figma template (optional)</p>
        <p className="text-xs text-gray-600 leading-relaxed">
          Paste a Figma personal access token + file URL and node id. We’ll export that frame and use it
          as an overlay when mode is <span className="font-semibold">Figma</span>.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className={labelClass}>Figma API token</label>
            <input
              type="password"
              className={`${inputClass} mt-1`}
              value={kit.figmaApiToken || ""}
              onChange={(e) => patch({ figmaApiToken: e.target.value })}
              placeholder={kit.figmaTokenReady ? "•••••••• (saved)" : "figd_…"}
            />
          </div>
          <div>
            <label className={labelClass}>File URL or key</label>
            <input
              className={`${inputClass} mt-1`}
              value={kit.figmaFileUrl || ""}
              onChange={(e) => patch({ figmaFileUrl: e.target.value })}
              placeholder="https://www.figma.com/design/…"
            />
          </div>
          <div>
            <label className={labelClass}>Node id</label>
            <input
              className={`${inputClass} mt-1`}
              value={kit.figmaNodeId || ""}
              onChange={(e) => patch({ figmaNodeId: e.target.value })}
              placeholder="1:23 or from node-id= in URL"
            />
          </div>
        </div>
        <button
          type="button"
          disabled={Boolean(busy)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800 disabled:opacity-50"
          onClick={() =>
            postJson(
              {
                action: "figma-pull",
                figmaApiToken: kit.figmaApiToken,
                figmaFileUrl: kit.figmaFileUrl,
                figmaNodeId: kit.figmaNodeId,
              },
              "figma"
            )
          }
        >
          {busy === "figma" ? (
            <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : null}
          Pull Figma template
        </button>
        {kit.figmaTemplatePath ? (
          <p className="text-[11px] text-gray-500">Template: {kit.figmaTemplatePath}</p>
        ) : null}
      </div>
    </div>
  );
}
