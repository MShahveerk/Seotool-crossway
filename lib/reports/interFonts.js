/**
 * Embed Inter (preferred) or Nunito fallback into pdf-lib documents.
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
      path.join(root, "Inter-Regular.ttf"),
      path.join(root, "Nunito.ttf"),
      path.join(root, "Nunito-Regular.ttf"),
    ],
    semibold: [
      path.join(root, "Inter-SemiBold.ttf"),
      path.join(root, "Inter-Bold.ttf"),
      path.join(root, "Nunito.ttf"),
      path.join(root, "Nunito-Regular.ttf"),
    ],
    bold: [
      path.join(root, "Inter-Bold.ttf"),
      path.join(root, "Nunito.ttf"),
      path.join(root, "Nunito-Regular.ttf"),
    ],
  };
}

export async function embedInterFonts(pdfDoc) {
  pdfDoc.registerFontkit(fontkit);
  const roots = fontRoots();
  const regularFile = readFirstExisting(roots.regular);
  const semiboldFile = readFirstExisting(roots.semibold);
  const boldFile = readFirstExisting(roots.bold);

  if (!regularFile || !boldFile) {
    throw new Error("No Inter/Nunito font files found in public/fonts/");
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
    family: /nunito/i.test(regularFile.path) ? "Nunito" : "Inter",
  };
}
