import { requireGlobalSiteAccess } from "../../../../lib/adminAuth";
import { loadMetaAccounts } from "../../../../lib/metaAccounts";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireGlobalSiteAccess();

    const { accounts, error } = await loadMetaAccounts({ includeDatabase: true });

    if (error && accounts.length === 0) {
      return Response.json({ accounts: [], error }, { status: 200 });
    }

    return Response.json({
      accounts,
      ...(error ? { warning: error } : {}),
    });
  } catch (error) {
    const msg = error.message || "Failed to fetch Meta accounts";
    const forbidden =
      msg === "Unauthorized" ||
      msg.includes("Forbidden") ||
      msg.includes("Insufficient permissions") ||
      msg.includes("Super admin");
    return Response.json({ error: msg, accounts: [] }, { status: forbidden ? 403 : 500 });
  }
}
