/**
 * Post Studio Humanizer config in AppSetting (no Prisma column migration).
 */
import prisma from "../prisma.js";
import { applyHumanizerPatch } from "./humanizerFields.js";

export {
  defaultsFromSite,
  HUMANIZER_FIELDS,
  mergeHumanizerConfig,
  humanizerFieldsTouched,
} from "./humanizerFields.js";

function settingKey(siteLink) {
  return `post_studio_humanizer:${String(siteLink || "").trim()}`;
}

export async function readHumanizerConfig(siteLink) {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: settingKey(siteLink) } });
    if (!row?.value) return {};
    const parsed = JSON.parse(row.value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function writeHumanizerConfig(siteLink, patch = {}) {
  const existing = await readHumanizerConfig(siteLink);
  const next = applyHumanizerPatch(existing, patch);
  await prisma.appSetting.upsert({
    where: { key: settingKey(siteLink) },
    create: { key: settingKey(siteLink), value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  return next;
}
