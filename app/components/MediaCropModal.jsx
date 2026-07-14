"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactCrop from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { FiCheck, FiX, FiImage } from "react-icons/fi";

const PLATFORMS = [
  {
    key: "facebook",
    label: "Facebook",
    icon: "🟦",
    aspect: 1200 / 628,
    outputW: 1200,
    outputH: 628,
    hint: "1200 × 628 px (1.91:1)",
    color: "#1877F2",
  },
  {
    key: "instagram",
    label: "Instagram",
    icon: "🟣",
    aspect: 1,
    outputW: 1080,
    outputH: 1080,
    hint: "1080 × 1080 px (1:1 Square)",
    color: "#E1306C",
  },
];

/** Returns a cropped blob from an HTMLImageElement and a PixelCrop */
function cropImageToBlob(image, pixelCrop, outputW, outputH, mimeType = "image/jpeg") {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = outputW;
    canvas.height = outputH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return reject(new Error("Canvas 2D context unavailable"));

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      outputW,
      outputH
    );
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("Canvas toBlob returned null"));
        resolve(blob);
      },
      mimeType,
      0.92
    );
  });
}

/** Converts a percentage-based crop to pixel values for a given image */
function percentToPixelCrop(crop, imgWidth, imgHeight) {
  return {
    x: (crop.x / 100) * imgWidth,
    y: (crop.y / 100) * imgHeight,
    width: (crop.width / 100) * imgWidth,
    height: (crop.height / 100) * imgHeight,
  };
}

/** Renders a small live preview of the current crop selection */
function CropPreview({ imgRef, crop, aspect, outputW, outputH }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || !crop || !crop.width || !crop.height) return;

    const pixelCrop = percentToPixelCrop(crop, img.naturalWidth, img.naturalHeight);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(
      img,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      canvas.width,
      canvas.height
    );
  }, [imgRef, crop, outputW, outputH]);

  // Preview canvas display dimensions
  const displayW = aspect >= 1 ? 200 : Math.round(200 * aspect);
  const displayH = aspect <= 1 ? 200 : Math.round(200 / aspect);

  return (
    <canvas
      ref={canvasRef}
      width={outputW}
      height={outputH}
      style={{ width: displayW, height: displayH }}
      className="rounded-lg border border-gray-200 bg-gray-100 shadow-sm object-cover"
    />
  );
}

/**
 * MediaCropModal
 *
 * Props:
 *   file         — the raw File object selected by the user
 *   platforms    — array of platform keys to show: ["facebook"], ["instagram"], or ["facebook","instagram"]
 *   onConfirm(croppedFiles) — called with { facebook?: File, instagram?: File }
 *   onUseOriginal()         — called when user skips cropping
 *   onCancel()              — called when user cancels entirely
 */
export default function MediaCropModal({ file, platforms = ["facebook", "instagram"], onConfirm, onUseOriginal, onCancel }) {
  const [imgSrc, setImgSrc] = useState("");
  const [activeTab, setActiveTab] = useState(platforms[0] ?? "facebook");
  const [crops, setCrops] = useState({});       // { facebook: %-based crop, instagram: %-based crop }
  const [confirming, setConfirming] = useState(false);
  const imgRef = useRef(null);

  const activePlatforms = PLATFORMS.filter((p) => platforms.includes(p.key));

  // Load the file into a data URL
  useEffect(() => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => setImgSrc(e.target?.result ?? "");
    reader.readAsDataURL(file);
  }, [file]);

  // When image loads, set a default centred crop for every platform
  const onImageLoad = useCallback(
    (e) => {
      const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
      const defaultCrops = {};
      for (const p of activePlatforms) {
        const imgAspect = w / h;
        let cropWidthPct, cropHeightPct;
        if (imgAspect > p.aspect) {
          // Image is wider than desired — crop width
          cropHeightPct = 100;
          cropWidthPct = (p.aspect / imgAspect) * 100;
        } else {
          // Image is taller than desired — crop height
          cropWidthPct = 100;
          cropHeightPct = (imgAspect / p.aspect) * 100;
        }
        defaultCrops[p.key] = {
          unit: "%",
          x: (100 - cropWidthPct) / 2,
          y: (100 - cropHeightPct) / 2,
          width: cropWidthPct,
          height: cropHeightPct,
        };
      }
      setCrops(defaultCrops);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [platforms.join(",")]
  );

  const handleCropChange = (_, percentCrop) => {
    setCrops((prev) => ({ ...prev, [activeTab]: percentCrop }));
  };

  const handleConfirm = async () => {
    const img = imgRef.current;
    if (!img) return;
    setConfirming(true);
    try {
      const mimeType = file?.type === "image/png" ? "image/png" : "image/jpeg";
      const ext = mimeType === "image/png" ? ".png" : ".jpg";
      const result = {};

      for (const p of activePlatforms) {
        const crop = crops[p.key];
        if (!crop || !crop.width || !crop.height) continue;
        const pixelCrop = percentToPixelCrop(crop, img.naturalWidth, img.naturalHeight);
        const blob = await cropImageToBlob(img, pixelCrop, p.outputW, p.outputH, mimeType);
        const fileName = `${file.name.replace(/\.[^.]+$/, "")}_${p.key}${ext}`;
        result[p.key] = new File([blob], fileName, { type: mimeType });
      }

      onConfirm(result);
    } catch (err) {
      console.error("Crop failed", err);
    } finally {
      setConfirming(false);
    }
  };

  const currentPlatform = activePlatforms.find((p) => p.key === activeTab);
  const currentCrop = crops[activeTab];

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  if (!imgSrc) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-sm p-3"
      role="dialog"
      aria-modal="true"
      aria-label="Crop image for platforms"
    >
      <div
        className="relative flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-4xl max-h-[95vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2">
            <FiImage className="w-5 h-5 text-gray-600" />
            <h2 className="text-base font-bold text-gray-900">Crop for Platforms</h2>
            <span className="text-xs text-gray-500 ml-1">Drag the box to reposition</span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-2 rounded-full text-gray-500 hover:bg-gray-100"
            aria-label="Cancel crop"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Platform tabs (only if multiple platforms) */}
        {activePlatforms.length > 1 && (
          <div className="flex gap-1 px-5 pt-3 shrink-0">
            {activePlatforms.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setActiveTab(p.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  activeTab === p.key
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <span>{p.icon}</span>
                {p.label}
              </button>
            ))}
          </div>
        )}

        {/* Crop area + live preview */}
        <div className="flex flex-col sm:flex-row gap-4 overflow-y-auto flex-1 p-5 min-h-0">
          {/* Crop editor */}
          <div className="flex-1 flex flex-col items-center gap-3 min-w-0">
            {currentPlatform && (
              <div
                className="text-xs font-semibold px-3 py-1 rounded-full text-white"
                style={{ backgroundColor: currentPlatform.color }}
              >
                {currentPlatform.label} — {currentPlatform.hint}
              </div>
            )}
            <div className="w-full flex justify-center">
              <ReactCrop
                crop={currentCrop}
                onChange={handleCropChange}
                aspect={currentPlatform?.aspect}
                keepSelection
                className="max-w-full"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imgRef}
                  src={imgSrc}
                  alt="Crop source"
                  onLoad={onImageLoad}
                  className="max-w-full max-h-[50vh] object-contain rounded-lg"
                  style={{ display: "block" }}
                />
              </ReactCrop>
            </div>
          </div>

          {/* Live previews for all platforms */}
          <div className="shrink-0 flex flex-col gap-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Live Previews</p>
            {activePlatforms.map((p) => (
              <div key={p.key} className="flex flex-col items-center gap-1">
                <div
                  className="text-xs font-bold px-2 py-0.5 rounded-full text-white mb-1"
                  style={{ backgroundColor: p.color }}
                >
                  {p.icon} {p.label}
                </div>
                {imgRef.current && crops[p.key]?.width ? (
                  <CropPreview
                    imgRef={imgRef}
                    crop={crops[p.key]}
                    aspect={p.aspect}
                    outputW={p.outputW}
                    outputH={p.outputH}
                  />
                ) : (
                  <div
                    className="rounded-lg border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-xs text-gray-400"
                    style={{
                      width: p.aspect >= 1 ? 200 : Math.round(200 * p.aspect),
                      height: p.aspect <= 1 ? 200 : Math.round(200 / p.aspect),
                    }}
                  >
                    Preview
                  </div>
                )}
                <span className="text-[10px] text-gray-400">{p.hint}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm font-medium text-gray-600 hover:text-gray-900 underline underline-offset-2"
          >
            Cancel
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onUseOriginal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50"
            >
              Use original
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirming}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-black text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-60"
            >
              <FiCheck className="w-4 h-4" />
              {confirming ? "Cropping…" : "Use cropped"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
