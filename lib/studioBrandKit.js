/**
 * Per-site Instagram-style brand frame (matte + logo), optional AI chrome, Figma template pull.
 */
import sharp from "sharp";
import { loadBlogUploadBuffer, saveBlogFeaturedImageFromBuffer } from "./blogMedia.js";
import { DEFAULT_BRAND_KIT, SECRET_MASK } from "./studioBrandKitDefaults.js";

export { DEFAULT_BRAND_KIT, SECRET_MASK };

export function normalizeBrandKit(raw) {
  const src =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? raw
      : typeof raw === "string"
        ? (() => {
            try {
              return JSON.parse(raw);
            } catch {
              return {};
            }
          })()
        : {};
  const mode = ["matte", "ai", "figma"].includes(String(src.mode || ""))
    ? String(src.mode)
    : "matte";
  const corner = ["bottom-right", "bottom-left", "top-right", "top-left"].includes(
    String(src.logoCorner || "")
  )
    ? String(src.logoCorner)
    : "bottom-right";
  return {
    ...DEFAULT_BRAND_KIT,
    ...src,
    enabled: Boolean(src.enabled),
    mode,
    logoPath: String(src.logoPath || "").trim(),
    matteColor: normalizeHex(src.matteColor) || DEFAULT_BRAND_KIT.matteColor,
    mattePaddingPct: clampNum(src.mattePaddingPct, 2, 20, DEFAULT_BRAND_KIT.mattePaddingPct),
    logoCorner: corner,
    logoScalePct: clampNum(src.logoScalePct, 6, 28, DEFAULT_BRAND_KIT.logoScalePct),
    logoPaddingPct: clampNum(src.logoPaddingPct, 1, 12, DEFAULT_BRAND_KIT.logoPaddingPct),
    figmaApiToken: String(src.figmaApiToken || ""),
    figmaFileUrl: String(src.figmaFileUrl || "").trim(),
    figmaNodeId: String(src.figmaNodeId || "").trim(),
    figmaTemplatePath: String(src.figmaTemplatePath || "").trim(),
    aiBrandNotes: String(src.aiBrandNotes || "").trim().slice(0, 2000),
  };
}

export function brandKitForClient(raw) {
  const kit = normalizeBrandKit(raw);
  const hasToken = Boolean(kit.figmaApiToken && kit.figmaApiToken !== SECRET_MASK);
  return {
    ...kit,
    figmaApiToken: hasToken ? SECRET_MASK : "",
    figmaTokenReady: hasToken || Boolean(process.env.FIGMA_API_TOKEN),
  };
}

export function mergeBrandKitForSave(inputKit, existingKit) {
  const prev = normalizeBrandKit(existingKit);
  if (inputKit === undefined) return prev;
  const next = normalizeBrandKit({ ...prev, ...inputKit });
  const incomingToken = inputKit?.figmaApiToken;
  if (incomingToken === undefined || incomingToken === SECRET_MASK || incomingToken === "") {
    next.figmaApiToken = incomingToken === "" ? "" : prev.figmaApiToken;
  } else {
    next.figmaApiToken = String(incomingToken).trim();
  }
  return next;
}

function clampNum(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeHex(v) {
  const s = String(v || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s.toLowerCase()}`;
  return null;
}

function hexToRgb(hex) {
  const h = normalizeHex(hex) || "#0a0a0a";
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

/**
 * Instagram-style matte: pad image on solid color, stamp logo in a corner.
 * Optionally composites a Figma template overlay (PNG with transparency works best).
 */
export async function applyBrandFrame(imageBuffer, config = {}) {
  const kit = normalizeBrandKit(config.brandKitJson ?? config.brandKit ?? config);
  if (!kit.enabled) {
    return { buffer: imageBuffer, applied: false, mode: kit.mode };
  }

  let pipeline = sharp(imageBuffer).rotate();
  const meta = await pipeline.metadata();
  const width = meta.width || 1536;
  const height = meta.height || 1024;
  const pad = Math.round((Math.min(width, height) * kit.mattePaddingPct) / 100);
  const bg = hexToRgb(kit.matteColor);

  let framed = pipeline.extend({
    top: pad,
    bottom: pad,
    left: pad,
    right: pad,
    background: { ...bg, alpha: 1 },
  });

  const framedMeta = await framed.metadata();
  const fw = framedMeta.width || width + pad * 2;
  const fh = framedMeta.height || height + pad * 2;
  const composites = [];

  if (kit.logoPath) {
    const logoRow = await loadBlogUploadBuffer(kit.logoPath);
    if (logoRow?.buffer?.length) {
      const targetW = Math.max(48, Math.round((fw * kit.logoScalePct) / 100));
      const logoBuf = await sharp(logoRow.buffer)
        .resize({ width: targetW, withoutEnlargement: false })
        .png()
        .toBuffer();
      const logoMeta = await sharp(logoBuf).metadata();
      const lw = logoMeta.width || targetW;
      const lh = logoMeta.height || Math.round(targetW / 2);
      const inset = Math.round((Math.min(fw, fh) * kit.logoPaddingPct) / 100);
      let left = inset;
      let top = inset;
      if (kit.logoCorner.includes("right")) left = fw - lw - inset;
      if (kit.logoCorner.includes("bottom")) top = fh - lh - inset;
      composites.push({ input: logoBuf, left: Math.max(0, left), top: Math.max(0, top) });
    }
  }

  if (kit.mode === "figma" && kit.figmaTemplatePath) {
    const frameRow = await loadBlogUploadBuffer(kit.figmaTemplatePath);
    if (frameRow?.buffer?.length) {
      const overlay = await sharp(frameRow.buffer)
        .resize(fw, fh, { fit: "fill" })
        .png()
        .toBuffer();
      composites.push({ input: overlay, left: 0, top: 0 });
    }
  }

  if (composites.length) {
    framed = framed.composite(composites);
  }

  const out = await framed.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  return { buffer: out, applied: true, mode: kit.mode, width: fw, height: fh };
}

/** Extra prompt lines when mode=ai (model paints chrome; still recommend post matte off or light). */
export function aiBrandPromptBlock(kitRaw) {
  const kit = normalizeBrandKit(kitRaw);
  if (!kit.enabled || kit.mode !== "ai") return "";
  return [
    "BRAND CHROME (required): Apply an Instagram-style solid matte/border around the image.",
    "Place the brand logo from the attached logo reference clearly in a corner — sharp, readable, not distorted.",
    "Do not invent a different logo. Keep the photo subject clean inside the matte.",
    kit.aiBrandNotes ? `Brand notes: ${kit.aiBrandNotes}` : "",
    kit.matteColor ? `Prefer matte color close to ${kit.matteColor}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function loadBrandLogoAsReference(kitRaw) {
  const kit = normalizeBrandKit(kitRaw);
  if (!kit.enabled || !kit.logoPath) return null;
  const row = await loadBlogUploadBuffer(kit.logoPath);
  if (!row?.buffer?.length) return null;
  return {
    buffer: Buffer.isBuffer(row.buffer) ? row.buffer : Buffer.from(row.buffer),
    mime: String(row.mime || "image/png").split(";")[0] || "image/png",
    fileName: String(row.fileName || "brand-logo.png"),
  };
}

export function parseFigmaFileKey(urlOrKey) {
  const s = String(urlOrKey || "").trim();
  if (!s) return "";
  if (/^[a-zA-Z0-9]{10,}$/.test(s) && !s.includes("/")) return s;
  const m = s.match(/figma\.com\/(?:file|design|proto)\/([a-zA-Z0-9]+)/i);
  return m?.[1] || "";
}

export function parseFigmaNodeId(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  // URL hash node-id=1-2 or 1:2
  const fromQuery = s.match(/node-id=([^&]+)/i);
  if (fromQuery) s = decodeURIComponent(fromQuery[1]);
  return s.replace(/-/g, ":");
}

/**
 * Export a Figma node to PNG and store as a blog upload path.
 */
export async function pullFigmaTemplate({
  figmaApiToken,
  figmaFileUrl,
  figmaNodeId,
  envFallbackToken = process.env.FIGMA_API_TOKEN,
} = {}) {
  const token = String(figmaApiToken || envFallbackToken || "").trim();
  if (!token || token === SECRET_MASK) {
    const err = new Error("Paste a Figma personal access token first.");
    err.status = 400;
    throw err;
  }
  const fileKey = parseFigmaFileKey(figmaFileUrl);
  const nodeId = parseFigmaNodeId(figmaNodeId) || parseFigmaNodeId(figmaFileUrl);
  if (!fileKey) {
    const err = new Error("Paste a Figma file URL (or file key).");
    err.status = 400;
    throw err;
  }
  if (!nodeId) {
    const err = new Error("Paste a Figma node id (from the URL node-id=… or the Layers panel).");
    err.status = 400;
    throw err;
  }

  const apiUrl = `https://api.figma.com/v1/images/${encodeURIComponent(fileKey)}?ids=${encodeURIComponent(nodeId)}&format=png&scale=2`;
  const metaRes = await fetch(apiUrl, {
    headers: { "X-Figma-Token": token },
  });
  const meta = await metaRes.json().catch(() => ({}));
  if (!metaRes.ok) {
    const err = new Error(meta?.err || meta?.message || `Figma API error (${metaRes.status})`);
    err.status = metaRes.status === 403 ? 403 : 502;
    throw err;
  }
  const imageUrl = meta?.images?.[nodeId] || meta?.images?.[Object.keys(meta.images || {})[0]];
  if (!imageUrl) {
    const err = new Error("Figma returned no image for that node. Check the node id and file access.");
    err.status = 502;
    throw err;
  }
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    const err = new Error("Failed to download Figma export.");
    err.status = 502;
    throw err;
  }
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const path = await saveBlogFeaturedImageFromBuffer(buf, "image/png");
  return { path, fileKey, nodeId };
}

/**
 * Suggest matte color + notes from the uploaded logo using a lightweight sharp stats heuristic
 * (no LLM required). Optional LLM polish can wrap this later.
 */
export async function suggestBrandKitFromLogo(logoPath, existingKit = {}) {
  const kit = normalizeBrandKit(existingKit);
  const row = await loadBlogUploadBuffer(logoPath || kit.logoPath);
  if (!row?.buffer?.length) {
    const err = new Error("Upload a site logo first.");
    err.status = 400;
    throw err;
  }
  const { dominant } = await sharp(row.buffer).stats();
  const r = Math.round(dominant.r);
  const g = Math.round(dominant.g);
  const b = Math.round(dominant.b);
  // Prefer a near-black matte if logo is light; otherwise deepen the dominant hue.
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  let matteColor;
  if (luminance > 0.65) {
    matteColor = "#0a0a0a";
  } else {
    const darken = (c) => Math.max(0, Math.round(c * 0.35));
    matteColor = `#${[darken(r), darken(g), darken(b)].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
  }
  return normalizeBrandKit({
    ...kit,
    enabled: true,
    mode: kit.mode || "matte",
    logoPath: logoPath || kit.logoPath,
    matteColor,
    mattePaddingPct: 7,
    logoScalePct: 14,
    logoCorner: "bottom-right",
    aiBrandNotes:
      kit.aiBrandNotes ||
      "Clean Instagram matte; keep logo crisp in the corner; no extra watermarks.",
  });
}
