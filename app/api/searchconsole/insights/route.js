import {
  getDeviceBreakdown,
  getSearchAppearanceBreakdown,
  getQueryPageMatrix,
  getStrikingDistanceQueries,
} from "../../../../lib/searchconsole";
import { resolveSearchConsoleRequest } from "../../../../lib/searchConsoleRequest";

export const runtime = "nodejs";

/**
 * GET /api/searchconsole/insights
 * Query: url, range|startDate/endDate, view=device|appearance|matrix|striking|all
 */
export async function GET(req) {
  try {
    const { siteUrl, startDate, endDate, range } = await resolveSearchConsoleRequest(req);
    const view = String(req.nextUrl.searchParams.get("view") || "all").toLowerCase();

    const payload = {
      siteUrl,
      dateRange: { startDate, endDate, range },
      lastUpdated: new Date().toISOString(),
    };

    if (view === "device" || view === "all") {
      payload.devices = (await getDeviceBreakdown(siteUrl, startDate, endDate)).devices;
    }
    if (view === "appearance" || view === "all") {
      payload.appearances = (
        await getSearchAppearanceBreakdown(siteUrl, startDate, endDate, 50)
      ).appearances;
    }
    if (view === "matrix" || view === "all") {
      payload.pairs = (await getQueryPageMatrix(siteUrl, startDate, endDate, 500)).pairs;
    }
    if (view === "striking" || view === "all") {
      payload.opportunities = (
        await getStrikingDistanceQueries(siteUrl, startDate, endDate, 100)
      ).opportunities;
    }

    if (view !== "all" && view !== "device" && view !== "appearance" && view !== "matrix" && view !== "striking") {
      return new Response(
        JSON.stringify({ error: "Invalid view. Use device, appearance, matrix, striking, or all." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const status = error.status || 500;
    return new Response(
      JSON.stringify({ error: error.message || "Failed to fetch Search Console insights." }),
      { status, headers: { "Content-Type": "application/json" } }
    );
  }
}
