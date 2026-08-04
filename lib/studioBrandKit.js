/**
 * Per-site Instagram-style brand frame (matte + logo), optional AI chrome, Figma template pull.
 */
import sharp from "sharp";
import { loadBlogUploadBuffer, saveBlogFeaturedImageFromBuffer } from "./blogMedia.js";
import { chatCompletion, generateImage } from "./blogStudio/providers.js";
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
  const mode = ["matte", "frame", "ai", "figma"].includes(String(src.mode || ""))
    ? String(src.mode)
    : "matte";
  const source = ["manual", "ai"].includes(String(src.source || ""))
    ? String(src.source)
    : "manual";
  const corner = ["bottom-right", "bottom-left", "top-right", "top-left"].includes(
    String(src.logoCorner || "")
  )
    ? String(src.logoCorner)
    : "bottom-right";
  return {
    ...DEFAULT_BRAND_KIT,
    ...src,
    enabled: Boolean(src.enabled),
    source,
    mode,
    logoPath: String(src.logoPath || "").trim(),
    frameTemplatePath: String(src.frameTemplatePath || "").trim(),
    matteColor: normalizeHex(src.matteColor) || DEFAULT_BRAND_KIT.matteColor,
    mattePaddingPct: clampNum(src.mattePaddingPct, 0, 20, DEFAULT_BRAND_KIT.mattePaddingPct),
    logoCorner: corner,
    logoScalePct: clampNum(src.logoScalePct, 6, 28, DEFAULT_BRAND_KIT.logoScalePct),
    logoPaddingPct: clampNum(src.logoPaddingPct, 1, 12, DEFAULT_BRAND_KIT.logoPaddingPct),
    figmaApiToken: String(src.figmaApiToken || ""),
    figmaFileUrl: String(src.figmaFileUrl || "").trim(),
    figmaNodeId: String(src.figmaNodeId || "").trim(),
    figmaTemplatePath: String(src.figmaTemplatePath || "").trim(),
    previewPath: String(src.previewPath || "").trim(),
    aiBrandNotes: String(src.aiBrandNotes || "").trim().slice(0, 2000),
    brandSummary: String(src.brandSummary || "").trim().slice(0, 500),
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

/** Make near-chroma-green pixels transparent so photo shows through the frame window. */
export async function punchChromaGreenWindow(pngBuffer, { tolerance = 55 } = {}) {
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    // Pure #00FF00 window + near-green spill from generators
    const isGreenWindow = g >= 180 && g - r >= 40 && g - b >= 40 && r <= 120 && b <= 120;
    const nearKey =
      Math.abs(r - 0) <= tolerance &&
      Math.abs(g - 255) <= tolerance &&
      Math.abs(b - 0) <= tolerance;
    if (isGreenWindow || nearKey) {
      out[i + 3] = 0;
    }
  }
  return sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

function resolveFrameTemplatePath(kit) {
  if (kit.frameTemplatePath) return kit.frameTemplatePath;
  if (kit.mode === "figma" && kit.figmaTemplatePath) return kit.figmaTemplatePath;
  return "";
}

/**
 * Brand frame: solid matte+logo and/or a designed overlay (AI frame / Figma) with transparent window.
 */
export async function applyBrandFrame(imageBuffer, config = {}) {
  const kit = normalizeBrandKit(config.brandKitJson ?? config.brandKit ?? config);
  if (!kit.enabled) {
    return { buffer: imageBuffer, applied: false, mode: kit.mode };
  }

  const templatePath = resolveFrameTemplatePath(kit);
  const useOverlay = Boolean(templatePath);
  // Overlay frames already include the border — skip solid pad unless operator still wants matte.
  const skipMatte = useOverlay && (kit.mode === "frame" || kit.mode === "figma" || kit.source === "ai");

  let pipeline = sharp(imageBuffer).rotate();
  const meta = await pipeline.metadata();
  const width = meta.width || 1536;
  const height = meta.height || 1024;
  const pad = skipMatte
    ? 0
    : Math.round((Math.min(width, height) * kit.mattePaddingPct) / 100);
  const bg = hexToRgb(kit.matteColor);

  let framed =
    pad > 0
      ? pipeline.extend({
          top: pad,
          bottom: pad,
          left: pad,
          right: pad,
          background: { ...bg, alpha: 1 },
        })
      : pipeline;

  const framedMeta = await framed.metadata();
  const fw = framedMeta.width || width + pad * 2;
  const fh = framedMeta.height || height + pad * 2;
  const composites = [];

  if (templatePath) {
    const frameRow = await loadBlogUploadBuffer(templatePath);
    if (frameRow?.buffer?.length) {
      const overlay = await sharp(frameRow.buffer)
        .resize(fw, fh, { fit: "fill" })
        .ensureAlpha()
        .png()
        .toBuffer();
      composites.push({ input: overlay, left: 0, top: 0 });
    }
  }

  // Corner logo stamp (manual matte kits, or optional mark on top of an AI/Figma frame).
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
/** Photo-like sample content used under the brand frame for operator preview. */
async function buildPreviewContentImage() {
  const svg = Buffer.from(
    `<svg width="1536" height="1024" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#7eb6d9"/>
          <stop offset="55%" stop-color="#d9e8f2"/>
          <stop offset="55%" stop-color="#c4a574"/>
          <stop offset="100%" stop-color="#8b6914"/>
        </linearGradient>
        <radialGradient id="sun" cx="78%" cy="22%" r="18%">
          <stop offset="0%" stop-color="#ffe9a8"/>
          <stop offset="100%" stop-color="#ffe9a800"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#sky)"/>
      <rect width="100%" height="100%" fill="url(#sun)"/>
      <ellipse cx="320" cy="420" rx="160" ry="50" fill="#ffffff66"/>
      <ellipse cx="480" cy="400" rx="120" ry="40" fill="#ffffff55"/>
      <rect x="0" y="560" width="1536" height="464" fill="#5c7a3a"/>
      <rect x="0" y="700" width="1536" height="324" fill="#3d5228"/>
      <text x="50%" y="48%" fill="#ffffffee" font-size="42" font-family="Georgia,serif" text-anchor="middle">Sample photo content</text>
      <text x="50%" y="54%" fill="#ffffff99" font-size="24" font-family="Arial,sans-serif" text-anchor="middle">Your Studio images sit here inside the brand frame</text>
    </svg>`
  );
  return sharp(svg).jpeg({ quality: 90 }).toBuffer();
}

/** Build a sample framed image so operators can see the real brand chrome. */
export async function previewBrandFrame(kitRaw) {
  const kit = normalizeBrandKit(kitRaw);
  if (!kit.enabled) {
    const err = new Error("Enable the brand frame first, then preview.");
    err.status = 400;
    throw err;
  }
  const hasFrame = Boolean(resolveFrameTemplatePath(kit));
  if (!kit.logoPath && !hasFrame) {
    const err = new Error("Upload a logo or create an AI frame first, then preview.");
    err.status = 400;
    throw err;
  }

  const base = await buildPreviewContentImage();
  const framed = await applyBrandFrame(base, { ...kit, enabled: true });
  const path = await saveBlogFeaturedImageFromBuffer(framed.buffer, "image/jpeg");
  return { path, applied: framed.applied, mode: kit.mode };
}

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
    source: "manual",
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

function resolveImageGenSettings(siteConfig = {}) {
  const imageProvider = String(siteConfig.imageProvider || "openai").toLowerCase();
  let imageModel = String(siteConfig.imageModel || "").trim();
  if (!imageModel) {
    imageModel =
      imageProvider === "openrouter" ? "openai/gpt-image-2" : "gpt-image-2";
  }
  if (/mini/i.test(imageModel)) {
    imageModel =
      imageProvider === "openrouter" ? "openai/gpt-image-2" : "gpt-image-2";
  }
  return { imageProvider, imageModel };
}

/**
 * AI builds a real social brand FRAME from scratch (designed border overlay with photo window),
 * optional logo mark, then a live preview with sample content underneath.
 */
export async function createFullBrandKitWithAi({
  siteConfig = {},
  brief = "",
  generateLogo = true,
  replaceLogo = false,
} = {}) {
  const existing = normalizeBrandKit(siteConfig.brandKitJson);
  const siteLink = String(siteConfig.siteLink || "").trim();
  const brandNotes = String(siteConfig.brandNotes || "").trim();
  const imagePrompt = String(siteConfig.imagePrompt || "").trim();
  const operatorBrief = String(brief || "").trim().slice(0, 1500);
  const { imageProvider, imageModel } = resolveImageGenSettings(siteConfig);

  const chatProvider = siteConfig.interpreterProvider || siteConfig.agent1Provider || "openai";
  const chatModel = siteConfig.interpreterModel || siteConfig.agent1Model || "gpt-5.4-mini";

  const designRes = await chatCompletion({
    provider: chatProvider,
    model: chatModel,
    siteConfig,
    temperature: 0.5,
    maxTokens: 1800,
    jsonMode: true,
    system: [
      "You are an art director for Instagram/Facebook content branding.",
      "Design a production-ready PHOTO FRAME (border chrome) that will be composited onto marketing images.",
      "The frame must leave a large center window for the real photo — never fill the center with a fake photo.",
      "Return JSON only.",
    ].join(" "),
    user: [
      `Site: ${siteLink || "unknown"}`,
      brandNotes ? `Brand notes: ${brandNotes}` : "",
      imagePrompt ? `Usual image style: ${imagePrompt}` : "",
      operatorBrief ? `Operator brief: ${operatorBrief}` : "",
      existing.logoPath ? `Existing logo on file: yes` : "Existing logo on file: no",
      "",
      "Return JSON with keys:",
      "{",
      '  "matteColor": "#rrggbb (deep border base color)",',
      '  "logoCorner": "bottom-right" | "bottom-left" | "top-right" | "top-left",',
      '  "logoScalePct": number 10-16,',
      '  "logoPaddingPct": number 2-5,',
      '  "aiBrandNotes": "short production notes",',
      '  "brandSummary": "one sentence describing the frame",',
      '  "framePrompt": "detailed image prompt to GENERATE the frame template (see rules)",',
      '  "logoPrompt": "prompt for a simple flat corner logo mark"',
      "}",
      "",
      "framePrompt RULES (critical):",
      "- Landscape social template 3:2, professional brand border / Instagram matte chrome.",
      "- Center MUST be a large flat rectangle of pure chroma green #00FF00 (about 80% width × 75% height, centered) — no texture, people, or objects in that green window (it will be cut out).",
      "- Design ONLY the surrounding border: matte bars, corner accents, subtle brand pattern, tasteful typography band if needed.",
      "- Put a clean logo mark area in the chosen corner of the BORDER (outside the green window).",
      "- No mockups of phones, no fake UI chrome, no watermark text like Template, no photo of a real scene in the center.",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  const design = designRes?.json && typeof designRes.json === "object" ? designRes.json : {};
  let costUsd = Number(designRes?.costUsd || 0);

  const framePrompt = String(
    design.framePrompt ||
      [
        `Professional Instagram/Facebook content FRAME template for ${siteLink || "a brand"}.`,
        operatorBrief ? `Brand direction: ${operatorBrief}.` : "",
        brandNotes ? `Brand notes: ${brandNotes}.` : "",
        "Landscape 3:2 layout. Design a polished brand border and matte chrome around the edges only.",
        "CRITICAL: the entire center content window (roughly 80% width and 75% height, perfectly centered) must be a flat solid pure chroma green #00FF00 with zero texture, gradients, photos, or objects — this green will be removed for real photos.",
        "Border should feel premium and usable on marketing photos: deep matte color, clean geometric accents, optional thin inner rule, logo lockup space bottom-right outside the green window.",
        "No phone mockup, no fake UI, no people, no scenic photo filling the center.",
      ]
        .filter(Boolean)
        .join(" ")
  ).slice(0, 4000);

  const frameImg = await generateImage({
    provider: imageProvider,
    model: imageModel,
    prompt: framePrompt,
    siteConfig,
    size: "1536x1024",
    quality: "high",
    outputFormat: "png",
  });
  costUsd += Number(frameImg.costUsd || 0);

  let framePng = await sharp(frameImg.buffer).ensureAlpha().png().toBuffer();
  framePng = await punchChromaGreenWindow(framePng, { tolerance: 60 });

  // Safety: if almost nothing became transparent, force a centered transparent window.
  const alphaStats = await sharp(framePng).stats();
  const alphaChannel = alphaStats.channels?.[3];
  const meanAlpha = Number(alphaChannel?.mean ?? 255);
  if (meanAlpha > 240) {
    const meta = await sharp(framePng).metadata();
    const fw = meta.width || 1536;
    const fh = meta.height || 1024;
    const holeW = Math.round(fw * 0.8);
    const holeH = Math.round(fh * 0.75);
    const left = Math.round((fw - holeW) / 2);
    const top = Math.round((fh - holeH) / 2);
    const hole = await sharp({
      create: {
        width: holeW,
        height: holeH,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();
    framePng = await sharp(framePng)
      .composite([{ input: hole, left, top }])
      .png()
      .toBuffer();
  }

  const frameTemplatePath = await saveBlogFeaturedImageFromBuffer(framePng, "image/png");

  let logoPath = existing.logoPath;
  let logoGenerated = false;
  const needLogo = generateLogo && (!logoPath || replaceLogo);
  if (needLogo) {
    const logoPrompt = String(
      design.logoPrompt ||
        `Minimal flat vector brand logo mark for ${siteLink || "a professional brand"}. Simple geometric icon, high contrast, centered on plain background, clean edges, no photo, no mockup, suitable as a small corner stamp.`
    ).slice(0, 4000);
    const logoImg = await generateImage({
      provider: imageProvider,
      model: imageModel,
      prompt: logoPrompt,
      siteConfig,
      size: "1024x1024",
      quality: "high",
      outputFormat: "png",
    });
    costUsd += Number(logoImg.costUsd || 0);
    logoPath = await saveBlogFeaturedImageFromBuffer(logoImg.buffer, "image/png");
    logoGenerated = true;
  }

  let kit = normalizeBrandKit({
    ...existing,
    enabled: true,
    source: "ai",
    mode: "frame",
    frameTemplatePath,
    logoPath: logoPath || existing.logoPath,
    matteColor: normalizeHex(design.matteColor) || existing.matteColor || "#0a0a0a",
    mattePaddingPct: 0,
    logoCorner: design.logoCorner || "bottom-right",
    logoScalePct: design.logoScalePct ?? 12,
    logoPaddingPct: design.logoPaddingPct ?? 3,
    brandSummary: String(design.brandSummary || "").trim(),
    aiBrandNotes:
      String(design.aiBrandNotes || "").trim() ||
      "AI-designed frame overlay; photo shows through the transparent window; keep logo crisp in the border.",
  });

  // Real preview: sample content under the new frame.
  const preview = await previewBrandFrame(kit);
  kit = normalizeBrandKit({ ...kit, previewPath: preview.path });

  return {
    brandKitJson: kit,
    logoGenerated,
    frameGenerated: true,
    brandSummary: kit.brandSummary || "AI brand frame ready.",
    costUsd,
  };
}
