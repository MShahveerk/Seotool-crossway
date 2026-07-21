/**
 * Embed Nunito into pdf-lib documents (used by all Crossway PDF reports).
 */
import fs from "fs";
import path from "path";
import fontkit from "@pdf-lib/fontkit";

let cachedBytes = null;

function loadNunitoBytes() {
  if (cachedBytes) return cachedBytes;
  const candidates = [
    path.join(process.cwd(), "public", "fonts", "Nunito.ttf"),
    path.join(process.cwd(), "public", "fonts", "Nunito-Regular.ttf"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      cachedBytes = fs.readFileSync(candidate);
      return cachedBytes;
    }
  }
  throw new Error("Nunito font file missing from public/fonts/.");
}

/** Register fontkit and return { regular, bold } Nunito embeds (same face; size conveys weight). */
export async function embedNunitoFonts(pdfDoc) {
  pdfDoc.registerFontkit(fontkit);
  const bytes = loadNunitoBytes();
  const regular = await pdfDoc.embedFont(bytes);
  const bold = await pdfDoc.embedFont(bytes);
  return { regular, bold, body: regular, display: bold, bodyBold: bold };
}
