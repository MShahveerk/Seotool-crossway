import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { ROLES } from "../../../../lib/rbac";
import axios from "axios";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== ROLES.SUPER_ADMIN) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const metaToken = process.env.META_PAGE_ACCESS_TOKEN || process.env.META_APP_ACCESS_TOKEN;
    if (!metaToken) {
      return new Response(JSON.stringify({ accounts: [], error: "No META_PAGE_ACCESS_TOKEN found in .env" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Attempt to fetch accounts/pages the token has access to
    // The `me/accounts` endpoint works for User Access Tokens. If the token is already a Page Access Token,
    // this might fail or return just that page. Let's try `me/accounts` first.
    let accounts = [];

    try {
      const url = `https://graph.facebook.com/v20.0/me/accounts?fields=id,name,instagram_business_account&access_token=${metaToken}`;
      const response = await axios.get(url);

      if (response.data && response.data.data) {
        accounts = response.data.data.map(page => ({
          id: page.id,
          name: page.name,
          facebookPageId: page.id,
          instagramUserId: page.instagram_business_account?.id || null,
        }));
      }
    } catch (err) {
      console.warn("Failed to fetch /me/accounts. Token might be a direct Page Access Token.", err.response?.data || err.message);

      // Fallback: If it's a direct Page Access Token, we might just be able to fetch "me"
      try {
        const url = `https://graph.facebook.com/v20.0/me?fields=id,name,instagram_business_account&access_token=${metaToken}`;
        const response = await axios.get(url);

        if (response.data && response.data.id) {
          accounts = [{
            id: response.data.id,
            name: response.data.name || "Configured Page",
            facebookPageId: response.data.id,
            instagramUserId: response.data.instagram_business_account?.id || null,
          }];
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
    return new Response(JSON.stringify({ error: error.message || "Failed to fetch Meta accounts" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}