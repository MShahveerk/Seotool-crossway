import { getServerSession } from "next-auth";
import { getSearchConsoleReport } from "../../../lib/searchconsole";
import { authOptions } from "../auth/[...nextauth]/route";
import { ROLES } from "../../../lib/rbac";
import { canAccessSection } from "../../../lib/modulePermissions";
import { isValidUrl, normalizeSiteOrigin } from "../../../lib/validation";

// Ensure this route runs in the Node.js runtime
export const runtime = "nodejs";

export async function POST(req) {
  // Check authentication
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new Response(
      JSON.stringify({ error: "Unauthorized. Please log in." }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  if (!canAccessSection(session.user, "website-statistics")) {
    return new Response(JSON.stringify({ error: "Forbidden: Website Statistics access not granted." }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body in request." }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const { url, days } = body ?? {};

  if (!url || typeof url !== "string" || !isValidUrl(url)) {
    return new Response(
      JSON.stringify({
        error: "Invalid or missing 'url'. Please provide a fully-qualified URL.",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const normalizedUrl = normalizeSiteOrigin(url);
  if (!normalizedUrl) {
    return new Response(
      JSON.stringify({
        error: "Invalid or missing 'url'. Please provide a fully-qualified URL.",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
  const daysToFetch = days && typeof days === "number" ? Math.min(Math.max(days, 1), 90) : 30;

  // Access control: Regular users can only query their own siteLink
  const userRole = session.user.role || ROLES.USER;
  if (userRole === ROLES.USER) {
    const userSiteLink = session.user.siteLink;
    if (!userSiteLink) {
      return new Response(
        JSON.stringify({
          error: "No website URL linked to your account. Please contact an administrator.",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    
    const normalizedUserSiteLink = normalizeSiteOrigin(userSiteLink);
    if (normalizedUrl !== normalizedUserSiteLink) {
      return new Response(
        JSON.stringify({
          error: "Access denied. You can only query your own website URL.",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  try {
    const report = await getSearchConsoleReport(normalizedUrl, daysToFetch);

    return new Response(JSON.stringify(report), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const errorMessage = err?.message ?? String(err);
    if (process.env.NODE_ENV === "development") {
      console.error("Search Console API error:", err);
    }
    return new Response(
      JSON.stringify({
        error: "Failed to fetch Search Console data.",
        details: process.env.NODE_ENV === "development" ? errorMessage : "Please check your Search Console configuration and ensure the site is verified.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

