/**
 * Persist / read weekly SEO digest settings (superadmin-managed).
 */
import prisma from "./prisma.js";

const ENABLED_KEY = "seo_digest_enabled";

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function isValidEmail(email) {
  const e = normalizeEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export async function getSeoDigestEnabled() {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: ENABLED_KEY } });
    if (!row) return null;
    const v = String(row.value || "").trim().toLowerCase();
    if (v === "true" || v === "1" || v === "yes") return true;
    if (v === "false" || v === "0" || v === "no") return false;
    return null;
  } catch {
    return null;
  }
}

export async function setSeoDigestEnabled(enabled) {
  const value = enabled ? "true" : "false";
  await prisma.appSetting.upsert({
    where: { key: ENABLED_KEY },
    create: { key: ENABLED_KEY, value },
    update: { value },
  });
  return enabled;
}

export async function listSeoDigestRecipients() {
  try {
    return await prisma.seoDigestRecipient.findMany({
      orderBy: { email: "asc" },
      select: { id: true, email: true, label: true, createdAt: true },
    });
  } catch {
    return [];
  }
}

export async function replaceSeoDigestRecipients(emails = []) {
  const cleaned = [];
  const seen = new Set();
  for (const raw of emails) {
    const email = normalizeEmail(typeof raw === "string" ? raw : raw?.email);
    if (!isValidEmail(email) || seen.has(email)) continue;
    seen.add(email);
    const label =
      typeof raw === "object" && raw?.label != null
        ? String(raw.label).trim().slice(0, 255) || null
        : null;
    cleaned.push({ email, label });
  }

  await prisma.$transaction(async (tx) => {
    await tx.seoDigestRecipient.deleteMany({});
    if (cleaned.length) {
      await tx.seoDigestRecipient.createMany({ data: cleaned });
    }
  });

  return listSeoDigestRecipients();
}

export async function addSeoDigestRecipient(email, label = null) {
  const e = normalizeEmail(email);
  if (!isValidEmail(e)) {
    const err = new Error("A valid email address is required.");
    err.status = 400;
    throw err;
  }
  try {
    return await prisma.seoDigestRecipient.create({
      data: {
        email: e,
        label: label != null ? String(label).trim().slice(0, 255) || null : null,
      },
    });
  } catch (err) {
    if (String(err?.code) === "P2002") {
      const conflict = new Error("That email is already on the digest list.");
      conflict.status = 409;
      throw conflict;
    }
    throw err;
  }
}

export async function removeSeoDigestRecipient(idOrEmail) {
  const key = String(idOrEmail || "").trim();
  if (!key) {
    const err = new Error("Recipient id or email is required.");
    err.status = 400;
    throw err;
  }
  if (key.includes("@")) {
    await prisma.seoDigestRecipient.deleteMany({ where: { email: normalizeEmail(key) } });
    return { ok: true };
  }
  await prisma.seoDigestRecipient.delete({ where: { id: key } }).catch(() => null);
  return { ok: true };
}

export { isValidEmail, normalizeEmail, ENABLED_KEY };
