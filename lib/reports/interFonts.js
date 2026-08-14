/**
 * Embed Inter (Regular / SemiBold / Bold) into pdf-lib documents.
 *
 * Inter is what the app UI uses, so the Carbon Neon PDFs are set in the same
 * face as the screens they recreate.
 */
import fs from "fs";
import path from "path";
import fontkit from "@pdf-lib/fontkit";

const cache = {};

function readFirstExisting(paths) {
  for (const p of paths) {
    if (fs.existsSync(p)) {
      if (!cache[p]) cache[p] = fs.readFileSync(p);
      return { bytes: cache[p], path: p };
    }
  }
  return null;
}

function fontRoots() {
  const root = path.join(process.cwd(), "public", "fonts");
  return {
    regular: [path.join(root, "Inter-Regular.ttf"), path.join(root, "Nunito.ttf")],
    semibold: [
      path.join(root, "Inter-SemiBold.ttf"),
      path.join(root, "Inter-Bold.ttf"),
      path.join(root, "Inter-Regular.ttf"),
    ],
    bold: [
      path.join(root, "Inter-Bold.ttf"),
      path.join(root, "Inter-SemiBold.ttf"),
      path.join(root, "Inter-Regular.ttf"),
    ],
  };
}

/** Register fontkit and return { regular, semibold, bold } Inter embeds. */
export async function embedInterFonts(pdfDoc) {
  pdfDoc.registerFontkit(fontkit);
  const roots = fontRoots();
  const regularFile = readFirstExisting(roots.regular);
  const semiboldFile = readFirstExisting(roots.semibold);
  const boldFile = readFirstExisting(roots.bold);

  if (!regularFile || !boldFile) {
    throw new Error("Inter font files missing from public/fonts/.");
  }

  const regular = await pdfDoc.embedFont(regularFile.bytes, { subset: true });
  const bold = await pdfDoc.embedFont(boldFile.bytes, { subset: true });
  const semibold = semiboldFile
    ? await pdfDoc.embedFont(semiboldFile.bytes, { subset: true })
    : bold;

  return { regular, semibold, bold, body: regular, display: bold, bodyBold: semibold, family: "Inter" };
}
