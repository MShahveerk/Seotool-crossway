import { requireSuperAdmin } from "../../../../lib/middleware/auth";
import {
  getSeoDigestEnabled,
  listSeoDigestRecipients,
  replaceSeoDigestRecipients,
  addSeoDigestRecipient,
  removeSeoDigestRecipient,
  setSeoDigestEnabled,
} from "../../../../lib/seoDigestSettings";
import {
  listWebsiteUrls,
  resolveSeoDigestRecipients,
  isSeoDigestEnabled,
  envFlag,
} from "../../../../lib/seoJobs";

export const runtime = "nodejs";

/**
 * GET /api/admin/seo-digest
 * Superadmin: digest toggle, recipients, and which websites are included.
 */
export async function GET() {
  try {
    await requireSuperAdmin();
    const [dbEnabled, recipients, sites, resolved, effectiveEnabled] = await Promise.all([
      getSeoDigestEnabled(),
      listSeoDigestRecipients(),
      listWebsiteUrls(),
      resolveSeoDigestRecipients(),
      isSeoDigestEnabled(),
    ]);

    return new Response(
      JSON.stringify({
        enabled: dbEnabled === true ? true : dbEnabled === false ? false : null,
        effectiveEnabled,
        envDigestFlag: envFlag("SEO_DIGEST_EMAIL"),
        recipients,
        resolvedRecipients: resolved.emails,
        recipientSource: resolved.source,
        sites,
        siteCount: sites.length,
        schedule: "Mondays 06:00 (server local time)",
        note:
          "One digest email covers every website in Manage Sites & Tracking (plus any unique user website URLs). Meta-only pages are excluded.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
      }
    );
  } catch (error) {
    const status =
      error.message === "Unauthorized" || String(error.message || "").includes("Super admin")
        ? 403
        : 500;
    return new Response(
      JSON.stringify({ error: status === 403 ? "Forbidden: Super admin access required" : error.message }),
      { status, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * PUT /api/admin/seo-digest
 * Body: { enabled?: boolean, recipients?: string[] | {email,label?}[] }
 */
export async function PUT(req) {
  try {
    await requireSuperAdmin();
    const body = await req.json().catch(() => ({}));

    let enabled = await getSeoDigestEnabled();
    if (typeof body.enabled === "boolean") {
      enabled = await setSeoDigestEnabled(body.enabled);
    }

    let recipients = await listSeoDigestRecipients();
    if (Array.isArray(body.recipients)) {
      recipients = await replaceSeoDigestRecipients(body.recipients);
    }

    const [sites, resolved, effectiveEnabled] = await Promise.all([
      listWebsiteUrls(),
      resolveSeoDigestRecipients(),
      isSeoDigestEnabled(),
    ]);

    return new Response(
      JSON.stringify({
        ok: true,
        enabled,
        effectiveEnabled,
        recipients,
        resolvedRecipients: resolved.emails,
        recipientSource: resolved.source,
        sites,
        siteCount: sites.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    const status =
      error.status ||
      (error.message === "Unauthorized" || String(error.message || "").includes("Super admin")
        ? 403
        : 500);
    return new Response(JSON.stringify({ error: error.message || "Failed to save digest settings." }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * POST /api/admin/seo-digest — add one recipient
 * Body: { email, label? }
 */
export async function POST(req) {
  try {
    await requireSuperAdmin();
    const body = await req.json().catch(() => ({}));
    const row = await addSeoDigestRecipient(body.email, body.label);
    const recipients = await listSeoDigestRecipients();
    return new Response(JSON.stringify({ ok: true, recipient: row, recipients }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const status =
      error.status ||
      (error.message === "Unauthorized" || String(error.message || "").includes("Super admin")
        ? 403
        : 500);
    return new Response(JSON.stringify({ error: error.message || "Failed to add recipient." }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * DELETE /api/admin/seo-digest?id=... or ?email=...
 */
export async function DELETE(req) {
  try {
    await requireSuperAdmin();
    const id = req.nextUrl.searchParams.get("id");
    const email = req.nextUrl.searchParams.get("email");
    await removeSeoDigestRecipient(id || email);
    const recipients = await listSeoDigestRecipients();
    return new Response(JSON.stringify({ ok: true, recipients }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const status =
      error.status ||
      (error.message === "Unauthorized" || String(error.message || "").includes("Super admin")
        ? 403
        : 500);
    return new Response(JSON.stringify({ error: error.message || "Failed to remove recipient." }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
