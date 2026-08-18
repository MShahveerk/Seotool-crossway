import prisma from "../prisma.js";
import { monthlyBudget, manualReserve } from "./config.js";

function monthKey(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

async function getLedger(mk = monthKey()) {
  return prisma.serankingCreditLedger.upsert({
    where: { monthKey: mk },
    create: { monthKey: mk, creditsUsed: 0, creditsBudget: monthlyBudget() },
    update: {},
  });
}

export async function getCreditStatus() {
  const mk = monthKey();
  const ledger = await getLedger(mk);
  const budget = ledger.creditsBudget || monthlyBudget();
  const used = ledger.creditsUsed || 0;
  const reserve = manualReserve();
  const remaining = Math.max(0, budget - used);
  const schedulable = Math.max(0, remaining - reserve);
  return {
    monthKey: mk,
    budget,
    used,
    remaining,
    reserve,
    schedulable,
    percentUsed: budget > 0 ? Math.round((used / budget) * 1000) / 10 : 0,
  };
}

/**
 * The app-internal credit cap has been removed — your real SE Ranking account
 * is the only limit. This always allows the spend; we keep the function so
 * callers/log bookkeeping stay intact.
 *
 * @returns {Promise<{ ok: boolean, reason?: string, remaining?: number }>}
 */
export async function canSpendCredits() {
  return { ok: true };
}

export async function recordCreditSpend({
  credits,
  endpoint,
  siteUrl = null,
  status = "success",
  detail = null,
}) {
  const mk = monthKey();
  const amount = Math.max(0, Math.floor(Number(credits) || 0));
  await prisma.$transaction([
    prisma.serankingCreditLedger.upsert({
      where: { monthKey: mk },
      create: { monthKey: mk, creditsUsed: amount, creditsBudget: monthlyBudget() },
      update: { creditsUsed: { increment: amount } },
    }),
    prisma.serankingCreditLog.create({
      data: {
        monthKey: mk,
        siteUrl,
        endpoint,
        credits: amount,
        status,
        detail: detail ? String(detail).slice(0, 512) : null,
      },
    }),
  ]);
  return getCreditStatus();
}

export async function logBlockedAttempt({ endpoint, siteUrl, estimate, reason }) {
  const mk = monthKey();
  await prisma.serankingCreditLog.create({
    data: {
      monthKey: mk,
      siteUrl,
      endpoint,
      credits: 0,
      status: "blocked",
      detail: `${reason} (est. ${estimate})`.slice(0, 512),
    },
  });
}
