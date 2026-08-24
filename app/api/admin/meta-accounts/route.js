import { requireGlobalSiteAccess } from "../../../../lib/adminAuth";
import { requireSuperAdmin } from "../../../../lib/middleware/auth";
import { fetchAndPersistMetaPages, loadMetaAccounts } from "../../../../lib/metaAccounts";

export const runtime = "nodejs";

function jsonResult(payload, extra = {}) {
  const { accounts, error, warning, stats, graphErrors, tokensConfigured, persisted } = payload;
  return Response.json({
    accounts: accounts || [],
    stats,
    tokensConfigured,
    graphErrors,
    ...(typeof persisted === "number" ? { persisted } : {}),
    ...(warning ? { warning } : {}),
    ...(error ? { error } : {}),
    ...extra,
  });
}

export async function GET() {
  try {
    await requireGlobalSiteAccess();

    const loaded = await loadMetaAccounts({
      includeDatabase: true,
    });

    return jsonResult(loaded);
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

/** Super admin: pull pages from Graph, save them, return the list as projects. */
export async function POST() {
  try {
    await requireSuperAdmin();
    const loaded = await fetchAndPersistMetaPages();
    return jsonResult(loaded, {
      message:
        loaded.persisted > 0
          ? `Fetched and saved ${loaded.persisted} Meta ${loaded.persisted === 1 ? "page" : "pages"} as projects.`
          : loaded.error || "Meta Graph returned no pages to save.",
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
