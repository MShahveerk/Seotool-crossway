/**
 * Embed Nunito (Regular / SemiBold / Bold) into pdf-lib documents.
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
    regular: [
      path.join(root, "Nunito-Regular.ttf"),
      path.join(root, "Nunito.ttf"),
    ],
    semibold: [
      path.join(root, "Nunito-SemiBold.ttf"),
      path.join(root, "Nunito-Bold.ttf"),
      path.join(root, "Nunito.ttf"),
    ],
    bold: [
      path.join(root, "Nunito-ExtraBold.ttf"),
      path.join(root, "Nunito-Bold.ttf"),
      path.join(root, "Nunito.ttf"),
    ],
  };
}

/** Register fontkit and return { regular, semibold, bold } Nunito embeds. */
export async function embedNunitoFonts(pdfDoc) {
  pdfDoc.registerFontkit(fontkit);
  const roots = fontRoots();
  const regularFile = readFirstExisting(roots.regular);
  const semiboldFile = readFirstExisting(roots.semibold);
  const boldFile = readFirstExisting(roots.bold);

  if (!regularFile || !boldFile) {
    throw new Error("Nunito font files missing from public/fonts/.");
  }

  const regular = await pdfDoc.embedFont(regularFile.bytes, { subset: true });
  const bold = await pdfDoc.embedFont(boldFile.bytes, { subset: true });
  const semibold = semiboldFile
    ? await pdfDoc.embedFont(semiboldFile.bytes, { subset: true })
    : bold;

  return {
    regular,
    semibold,
    bold,
    body: regular,
    display: bold,
    bodyBold: semibold,
    family: "Nunito",
  };
}
