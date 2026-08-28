/** MySQL VARCHAR limits used by Prisma @db.VarChar columns. */
export const DB_VARCHAR_ID = 191;
export const DB_VARCHAR_SHORT = 32;
export const DB_VARCHAR_TOPIC = 512;
export const DB_VARCHAR_SITE = 512;

export function clipVarchar(value, max) {
  const s = String(value ?? "");
  if (!s) return s;
  const n = Number(max) || 0;
  if (n <= 0 || s.length <= n) return s;
  return s.slice(0, n);
}
