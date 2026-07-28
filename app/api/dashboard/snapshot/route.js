import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { buildDashboardSnapshot } from "../../../../lib/dashboardSnapshot.js";

export const runtime = "nodejs";

/**
 * GET /api/dashboard/snapshot
 * Single aggregated payload for the dashboard overview.
 * Query: super_admin / smm may pass `url` for the selected client site.
 */
export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized. Please log in." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const urlParam = req.nextUrl.searchParams.get("url");
    const snapshot = await buildDashboardSnapshot(session, urlParam);

    return new Response(JSON.stringify(snapshot), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    const status = error?.status || 500;
    return new Response(
      JSON.stringify({
        error: error?.message || "Failed to load dashboard snapshot.",
      }),
      {
        status,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
