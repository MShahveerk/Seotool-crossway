import { requireGlobalSiteAccess } from "../../../../lib/adminAuth";
import axios from "axios";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireGlobalSiteAccess();

    const metaToken = process.env.META_PAGE_ACCESS_TOKEN || process.env.META_APP_ACCESS_TOKEN;
    if (!metaToken) {
      return new Response(JSON.stringify({ accounts: [], error: "No META_PAGE_ACCESS_TOKEN found in .env" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Attempt to fetch accounts/pages the token has access to
    // Let's query the `website` field to see if we can resolve the site URL automatically.
    let accounts = [];

    const extractFirstUrl = (text) => {
      if (!text) return "";
      const match = String(text).match(/https?:\/\/[^\s,;]+/i);
      if (match) return match[0];
      const domainMatch = String(text).match(/[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/[^\s,;]*)?/i);
      if (domainMatch) return `https://${domainMatch[0]}`;
      return text;
    };

    try {
      const url = `https://graph.facebook.com/v20.0/me/accounts?fields=id,name,website,instagram_business_account&access_token=${metaToken}`;
      const response = await axios.get(url);

      if (response.data && response.data.data) {
        accounts = response.data.data.map((page) => ({
          id: page.id,
          name: page.name,
          facebookPageId: page.id,
          instagramUserId: page.instagram_business_account?.id || null,
          siteLink: page.website ? extractFirstUrl(page.website) : "",
        }));
      }
    } catch (err) {
      console.warn("Failed to fetch /me/accounts. Token might be a direct Page Access Token.", err.response?.data || err.message);

      // Fallback: If it's a direct Page Access Token, we might just be able to fetch "me"
      try {
        const url = `https://graph.facebook.com/v20.0/me?fields=id,name,website,instagram_business_account&access_token=${metaToken}`;
        const response = await axios.get(url);

        if (response.data && response.data.id) {
          accounts = [
            {
              id: response.data.id,
              name: response.data.name || "Configured Page",
              facebookPageId: response.data.id,
              instagramUserId: response.data.instagram_business_account?.id || null,
              siteLink: response.data.website ? extractFirstUrl(response.data.website) : "",
            },
          ];
        }
      } catch (innerErr) {
        console.error("Fallback /me fetch also failed", innerErr.response?.data || innerErr.message);
        throw new Error("Invalid or expired Meta token");
      }
    }

    return new Response(JSON.stringify({ accounts }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error.message || "Failed to fetch Meta accounts";
    const forbidden =
      msg === "Unauthorized" ||
      msg.includes("Forbidden") ||
      msg.includes("Insufficient permissions") ||
      msg.includes("Super admin");
    return new Response(JSON.stringify({ error: msg }), {
      status: forbidden ? 403 : 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
