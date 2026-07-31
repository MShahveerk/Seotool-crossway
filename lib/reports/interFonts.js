/**
 * Embed Inter (Anthropic-like geometric sans) into pdf-lib documents.
 */
import fs from "fs";
import path from "path";
import fontkit from "@pdf-lib/fontkit";

const cache = {};

function loadFontBytes(filename) {
  if (cache[filename]) return cache[filename];
  const candidate = path.join(process.cwd(), "public", "fonts", filename);
  if (!fs.existsSync(candidate)) {
    throw new Error(`Font missing: public/fonts/${filename}`);
  }
  cache[filename] = fs.readFileSync(candidate);
  return cache[filename];
}

export async function embedInterFonts(pdfDoc) {
  pdfDoc.registerFontkit(fontkit);
  const regular = await pdfDoc.embedFont(loadFontBytes("Inter-Regular.ttf"));
  const semibold = await pdfDoc.embedFont(loadFontBytes("Inter-SemiBold.ttf"));
  const bold = await pdfDoc.embedFont(loadFontBytes("Inter-Bold.ttf"));
  return {
    regular,
    semibold,
    bold,
    body: regular,
    display: bold,
    bodyBold: semibold,
  };
}
