import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

/**
 * Bump when the Prisma schema adds/changes models or fields so the dev server must
 * drop `globalThis.prisma` (HMR can keep an old PrismaClient that rejects new fields, e.g. skippedAssigneeReview).
 */
const PRISMA_SCHEMA_REVISION = 10;

const log =
  process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"];

/** Cap the Prisma pool so a stampede of snapshot writes cannot exhaust Postgres. */
function databaseUrlWithPoolLimits(url) {
  if (!url || /[?&]connection_limit=/i.test(url)) return url;
  const sep = url.includes("?") ? "&" : "?";
  const extra = ["connection_limit=8"];
  if (!/[?&]pool_timeout=/i.test(url)) extra.push("pool_timeout=20");
  return `${url}${sep}${extra.join("&")}`;
}

function newPrismaClient() {
  const url = databaseUrlWithPoolLimits(process.env.DATABASE_URL);
  return new PrismaClient({
    log,
    ...(url ? { datasources: { db: { url } } } : {}),
  });
}

let prisma = globalForPrisma.prisma;
const storedRevision = globalForPrisma.prismaSchemaRevision ?? 0;

if (!prisma) {
  prisma = newPrismaClient();
} else if (
  process.env.NODE_ENV !== "production" &&
  (typeof prisma.approval === "undefined" || storedRevision < PRISMA_SCHEMA_REVISION)
) {
  prisma.$disconnect().catch(() => {});
  prisma = newPrismaClient();
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaSchemaRevision = PRISMA_SCHEMA_REVISION;
}

export default prisma;
