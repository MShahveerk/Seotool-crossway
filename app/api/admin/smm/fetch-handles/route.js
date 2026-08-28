import { requireSuperAdmin } from "../../../../../lib/middleware/auth";
import { getUserById } from "../../../../../lib/auth";
import { normalizeSiteOrigin } from "../../../../../lib/validation";
import { fetchTikTokUserByUsername, getTikTokClientAccessToken } from "../../../../../lib/tiktokApi";
import { formatMetaTokenReconnectHint, isInvalidatedMetaTokenError } from "../../../../../lib/metaAccounts";

function normalizePlatform(value) {
  const p = String(value || "").trim().toLowerCase();
  if (p === "linkedin") return "";
  return p === "x" ? "tiktok" : p;
}

/** Meta Graph errors often mean expired token — surface a fix hint for admins. */
function formatMetaAccessTokenHint(message) {
  const raw = String(message || "").trim();
  if (!raw) return raw;
  if (isInvalidatedMetaTokenError(raw)) return formatMetaTokenReconnectHint(raw);
  if (/expired|Session has expired|invalid.*session|OAuthException|invalid oauth|Error validating access token/i.test(raw)) {
    return `${raw} — Regenerate a Page access token in Meta for Developers (Graph API Explorer: select your Page → get Page token, or use a System User token). Update META_PAGE_ACCESS_TOKEN in .env.local; optional META_APP_ACCESS_TOKEN for app-level calls. Restart npm run dev.`;
  }
  return raw;
}

function extractHandle(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";

  if (value.startsWith("@")) {
    return value.slice(1).trim();
  }

  try {
    const parsed = new URL(value);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    if (pathParts[0] === "@") {
      return pathParts[1] || "";
    }
    if (pathParts[0]?.startsWith("@")) {
      return pathParts[0].slice(1);
    }
    if (pathParts[0] === "channel" || pathParts[0] === "c" || pathParts[0] === "user") {
      return pathParts[1] || "";
    }
  } catch {
    // fall through
  }

  return value.replace(/^@/, "").trim();
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function resolvePlatformInput(platform, rawInput) {
  const raw = String(rawInput || "").trim();
  const parsed = parseUrl(raw);
  const isUrl = Boolean(parsed);
  const host = parsed?.hostname?.toLowerCase() || "";
  const parts = parsed?.pathname?.split("/").filter(Boolean) || [];

  if (platform === "facebook") {
    if (isUrl && host.includes("facebook.com")) {
      if (parts[0] === "profile.php") {
        const id = parsed.searchParams.get("id") || "";
        return {
          identifier: id || "profile.php",
          profileUrl: raw,
          normalizedHandle: id || raw,
          candidates: [id].filter(Boolean),
        };
      }
      if (parts[0] === "people" && parts[2]) {
        const slug = parts[1] || "";
        const id = parts[2] || "";
        return {
          identifier: id,
          profileUrl: raw,
          normalizedHandle: slug || id,
          candidates: [id, slug].filter(Boolean),
        };
      }
      if (parts[0]) {
        return {
          identifier: parts[0],
          profileUrl: raw,
          normalizedHandle: parts[0],
          candidates: [parts[0]].filter(Boolean),
        };
      }
    }
    const handle = extractHandle(raw);
    return {
      identifier: handle,
      profileUrl: `https://www.facebook.com/${encodeURIComponent(handle)}`,
      normalizedHandle: handle,
      candidates: [handle].filter(Boolean),
    };
  }

  if (platform === "youtube") {
    if (isUrl && (host.includes("youtube.com") || host.includes("youtu.be"))) {
      if (parts[0] === "channel" && parts[1]) {
        const channelId = parts[1].trim();
        return {
          identifier: channelId,
          channelId,
          profileUrl: raw,
          normalizedHandle: channelId,
        };
      }
      const atPart = parts.find((p) => p.startsWith("@"));
      if (atPart) {
        const handle = atPart.replace(/^@/, "");
        return {
          identifier: handle,
          profileUrl: `https://www.youtube.com/@${encodeURIComponent(handle)}`,
          normalizedHandle: handle,
        };
      }
      if (parts[0] === "c" && parts[1]) {
        return {
          identifier: parts[1],
          profileUrl: raw,
          normalizedHandle: parts[1],
          youtubeCustomUrl: parts[1],
        };
      }
      if (parts[0] === "user" && parts[1]) {
        return {
          identifier: parts[1],
          profileUrl: raw,
          normalizedHandle: parts[1],
        };
      }
    }
    const rawValue = String(raw || "").trim();
    if (/^UC[\w-]{22}$/i.test(rawValue)) {
      return {
        identifier: rawValue,
        channelId: rawValue,
        profileUrl: `https://www.youtube.com/channel/${encodeURIComponent(rawValue)}`,
        normalizedHandle: rawValue,
      };
    }
    const handle = extractHandle(rawValue);
    return {
      identifier: handle,
      profileUrl: handle
        ? `https://www.youtube.com/@${encodeURIComponent(handle.replace(/^@/, ""))}`
        : raw,
      normalizedHandle: handle.replace(/^@/, ""),
    };
  }

  if (platform === "instagram") {
    if (isUrl && host.includes("instagram.com") && parts[0]) {
      const handle = parts[0].replace(/^@/, "");
      return {
        identifier: handle,
        profileUrl: `https://www.instagram.com/${encodeURIComponent(handle)}/`,
        normalizedHandle: handle,
      };
    }
    const handle = extractHandle(raw);
    return {
      identifier: handle,
      profileUrl: `https://www.instagram.com/${encodeURIComponent(handle)}/`,
      normalizedHandle: handle,
    };
  }

  if (platform === "tiktok") {
    if (isUrl && host.includes("tiktok.com")) {
      const fromAt = parts.find((p) => p.startsWith("@"));
      let handle = "";
      if (fromAt) {
        handle = fromAt.replace(/^@/, "").trim();
      } else if (
        parts[0] &&
        !["video", "embed", "t", "share", "live", "music", "tag"].includes(parts[0].toLowerCase())
      ) {
        handle = parts[0].replace(/^@/, "").trim();
      }
      if (handle) {
        return {
          identifier: handle,
          profileUrl: raw.startsWith("http") ? raw : `https://www.tiktok.com/@${encodeURIComponent(handle)}`,
          normalizedHandle: handle,
        };
      }
    }
    if (isUrl && (host.includes("x.com") || host.includes("twitter.com"))) {
      return {
        identifier: "",
        unsupported: "X (Twitter) is not supported. Use a TikTok @handle or https://www.tiktok.com/@user URL.",
      };
    }
    const rawValue = String(raw || "").trim();
    const handle = extractHandle(rawValue);
    return {
      identifier: handle,
      profileUrl: `https://www.tiktok.com/@${encodeURIComponent(handle)}`,
      normalizedHandle: handle,
    };
  }

  const handle = extractHandle(raw);
  return { identifier: handle, profileUrl: raw, normalizedHandle: handle };
}

function parseAbbrevNumber(value) {
  const raw = String(value || "").trim().toUpperCase().replace(/,/g, "");
  const match = raw.match(/^(\d+(?:\.\d+)?)([KMB])?$/);
  if (!match) return Number(raw) || 0;
  const num = Number(match[1] || 0);
  const unit = match[2] || "";
  if (unit === "K") return Math.round(num * 1_000);
  if (unit === "M") return Math.round(num * 1_000_000);
  if (unit === "B") return Math.round(num * 1_000_000_000);
  return Math.round(num);
}

async function fetchText(url, extraHeaders = {}) {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "accept-language": "en-US,en;q=0.9",
      ...extraHeaders,
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}) for ${url}`);
  }
  return res.text();
}

async function fetchTextWithFallback(urls, extraHeaders = {}) {
  const errors = [];
  for (const url of urls) {
    try {
      const text = await fetchText(url, extraHeaders);
      return { text, url };
    } catch (error) {
      errors.push(error.message || String(error));
    }
  }
  throw new Error(errors[errors.length - 1] || "All fallback requests failed.");
}

function youtubeResultFromChannelItem(item, displayHandle) {
  if (!item) return null;
  const hidden = Boolean(item?.statistics?.hiddenSubscriberCount);
  const count = Number(item?.statistics?.subscriberCount || 0);
  if (hidden && count === 0) {
    return {
      error:
        "YouTube hides subscriber count for this channel (API returns 0). Open the channel in YouTube to confirm, or enter followers manually.",
    };
  }
  const handle =
    displayHandle ||
    item?.snippet?.customUrl?.replace(/^@/, "") ||
    item?.snippet?.title ||
    "youtube";
  return {
    platform: "youtube",
    accountName: item?.snippet?.title || "YouTube",
    accountHandle: handle.startsWith("@") ? handle : `@${String(handle).replace(/^@/, "")}`,
    followers: count,
  };
}

function formatYoutubeApiError(payload) {
  const err = payload?.error;
  if (!err) return null;
  const msg = [err.message, ...(err.errors || []).map((e) => e.reason || e.message)].filter(Boolean).join(" — ");
  if (/youtube.*not enabled|accessNotConfigured|API key not valid/i.test(msg)) {
    return `${msg} Enable "YouTube Data API v3" in Google Cloud for this key (PageSpeed keys do not work here — use a dedicated YOUTUBE_API_KEY).`;
  }
  if (/quota|dailyLimit|rateLimit/i.test(msg)) {
    return `${msg} YouTube API quota exceeded; try again later or increase quota in Google Cloud.`;
  }
  return msg || "YouTube API error.";
}

async function fetchYoutubeChannelById(channelId, apiKey) {
  const channelRes = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${encodeURIComponent(
      channelId
    )}&key=${encodeURIComponent(apiKey)}`
  );
  const channelData = await channelRes.json();
  const apiErr = formatYoutubeApiError(channelData);
  if (apiErr) return { ok: false, reason: apiErr };
  const item = channelData?.items?.[0];
  if (!item) {
    return { ok: false, reason: `No YouTube channel found for ID ${channelId}.` };
  }
  const mapped = youtubeResultFromChannelItem(item, channelId);
  if (mapped?.error) return { ok: false, reason: mapped.error };
  return { ok: true, data: mapped };
}

async function fetchYoutubeSubscribers(input, apiKey) {
  const channelId = String(input.channelId || "").trim();
  const directId =
    channelId || (/^UC[\w-]{22}$/i.test(String(input.identifier || "").trim()) ? input.identifier.trim() : "");
  if (directId) {
    return fetchYoutubeChannelById(directId, apiKey);
  }

  const handle = String(input.normalizedHandle || input.identifier || "")
    .replace(/^@/, "")
    .trim();
  if (!handle) {
    return { ok: false, reason: "Enter a YouTube @handle, channel URL, or channel ID (UC…)." };
  }

  // Preferred for @handles (YouTube Data API v3)
  const forHandleRes = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&forHandle=${encodeURIComponent(
      handle
    )}&key=${encodeURIComponent(apiKey)}`
  );
  const forHandleData = await forHandleRes.json();
  const forHandleErr = formatYoutubeApiError(forHandleData);
  if (forHandleErr && !forHandleData?.items?.length) {
    // continue to search fallback unless hard API misconfiguration
    if (/not enabled|API key not valid|accessNotConfigured/i.test(forHandleErr)) {
      return { ok: false, reason: forHandleErr };
    }
  }
  const forHandleItem = forHandleData?.items?.[0];
  if (forHandleItem) {
    const mapped = youtubeResultFromChannelItem(forHandleItem, handle);
    if (mapped?.error) return { ok: false, reason: mapped.error };
    if (mapped) return { ok: true, data: mapped };
  }

  const q = encodeURIComponent(`@${handle}`);
  const searchRes = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=5&q=${q}&key=${encodeURIComponent(
      apiKey
    )}`
  );
  const searchData = await searchRes.json();
  const searchErr = formatYoutubeApiError(searchData);
  if (searchErr && !searchData?.items?.length) {
    return { ok: false, reason: searchErr };
  }

  const items = Array.isArray(searchData?.items) ? searchData.items : [];
  const exact = items.find(
    (it) =>
      String(it?.snippet?.customUrl || "")
        .replace(/^@/, "")
        .toLowerCase() === handle.toLowerCase()
  );
  const channelIdFromSearch = (exact || items[0])?.snippet?.channelId;
  if (!channelIdFromSearch) {
    return {
      ok: false,
      reason: `Channel not found for "@${handle}". Use the full channel URL (youtube.com/channel/UC…) or the exact @handle from the channel page.`,
    };
  }

  return fetchYoutubeChannelById(channelIdFromSearch, apiKey);
}

async function fetchFacebookFollowers(input) {
  const { profileUrl, normalizedHandle } = input;
  const candidates = Array.from(new Set((input.candidates || [input.identifier]).filter(Boolean)));
  const appToken = process.env.META_APP_ACCESS_TOKEN || "";
  const reasons = [];
  if (appToken) {
    try {
      // Resolve object id by profile URL first, then read metrics from that id.
      const lookupRes = await fetch(
        `https://graph.facebook.com/v20.0/?id=${encodeURIComponent(profileUrl)}&access_token=${encodeURIComponent(
          appToken
        )}`
      );
      const lookupData = await lookupRes.json();
      const objectId = String(lookupData?.id || "").trim();
      if (objectId) {
        const fieldCombos = ["fan_count,followers_count", "fan_count", "followers_count", "name,fan_count"];
        for (const fields of fieldCombos) {
          const metricsRes = await fetch(
            `https://graph.facebook.com/v20.0/${encodeURIComponent(
              objectId
            )}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(appToken)}`
          );
          const metricsData = await metricsRes.json();
          const lookupFollowers = Number(metricsData?.followers_count || metricsData?.fan_count || 0);
          if (lookupFollowers > 0) {
            return {
              ok: true,
              data: {
                platform: "facebook",
                accountName: metricsData?.name || normalizedHandle || "Facebook",
                accountHandle: `@${normalizedHandle}`,
                followers: lookupFollowers,
              },
            };
          }
          if (metricsData?.error?.message) {
            reasons.push(`Graph object metrics [${fields}]: ${metricsData.error.message}`);
          }
        }
      }
      if (lookupData?.error?.message) reasons.push(`Graph URL lookup: ${lookupData.error.message}`);
    } catch {
      // continue
    }

    for (const candidate of candidates) {
      try {
        const res = await fetch(
          `https://graph.facebook.com/v20.0/${encodeURIComponent(
            candidate
          )}?fields=fan_count,followers_count&access_token=${encodeURIComponent(appToken)}`
        );
        const data = await res.json();
        const followers = Number(data?.followers_count || data?.fan_count || 0);
        if (followers > 0) {
          return {
            ok: true,
            data: {
              platform: "facebook",
              accountName: normalizedHandle || "Facebook",
              accountHandle: `@${normalizedHandle}`,
              followers,
            },
          };
        }
        if (data?.error?.message) reasons.push(`Graph candidate '${candidate}': ${data.error.message}`);
      } catch {
        // continue to fallback
      }
    }
  }

  const variants = Array.from(
    new Set(
      [
        profileUrl,
        profileUrl.replace("https://www.facebook.com/", "https://m.facebook.com/"),
        profileUrl.replace("https://www.facebook.com/", "https://mbasic.facebook.com/"),
        `https://r.jina.ai/http://${profileUrl.replace(/^https?:\/\//, "")}`,
      ].filter(Boolean)
    )
  );
  const { text: html } = await fetchTextWithFallback(variants);
  const followerMatch = html.match(/([\d,.]+(?:[KMB])?)\s+followers/gi)?.[0] || "";
  const metaMatch = html.match(/"follower_count"\s*:\s*"?([\d,.KMB]+)"?/i)?.[1] || "";
  const count = parseAbbrevNumber(followerMatch.replace(/followers/i, "").trim());
  const fallbackCount = parseAbbrevNumber(metaMatch);
  if (count > 0 || fallbackCount > 0) {
    return {
      ok: true,
      data: {
        platform: "facebook",
        accountName: "Facebook",
        accountHandle: `@${normalizedHandle}`,
        followers: count || fallbackCount,
      },
    };
  }
  return {
    ok: false,
    reason:
      reasons[0] ||
      "Public followers not found. Page may hide follower count, require Graph permissions, or provided URL is not a public page endpoint.",
  };
}

async function fetchInstagramGraphById(igUserId, token, displayHandle) {
  const igRes = await fetch(
    `https://graph.facebook.com/v20.0/${encodeURIComponent(
      String(igUserId).trim()
    )}?fields=username,followers_count,name&access_token=${encodeURIComponent(token)}`
  );
  const igData = await igRes.json();
  if (igData?.error?.message) {
    return { ok: false, reason: formatMetaAccessTokenHint(igData.error.message) };
  }
  if (igRes.ok && (igData?.username != null || igData?.id != null)) {
    const count = Number(igData?.followers_count ?? 0);
    const username = igData?.username || displayHandle || "instagram";
    return {
      ok: true,
      data: {
        platform: "instagram",
        accountName: igData?.name || username,
        accountHandle: `@${String(username).replace(/^@/, "")}`,
        followers: count,
      },
    };
  }
  return { ok: false, reason: "Instagram Graph returned no user for this ID." };
}

async function getPageLinkedInstagramAccount(pageId, token) {
  const res = await fetch(
    `https://graph.facebook.com/v20.0/${encodeURIComponent(
      String(pageId).trim()
    )}?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(token)}`
  );
  const data = await res.json();
  if (data?.error?.message) {
    return { ok: false, reason: formatMetaAccessTokenHint(data.error.message) };
  }
  const ig = data?.instagram_business_account;
  if (!ig?.id) {
    return {
      ok: false,
      reason:
        "No Instagram Business account linked to this Facebook Page. Connect IG to the Page in Meta Business Suite, then retry.",
    };
  }
  return { ok: true, id: String(ig.id), username: String(ig.username || "").replace(/^@/, "") };
}

async function fetchInstagramBusinessDiscovery(igBusinessAccountId, username, token) {
  const user = String(username || "")
    .replace(/^@/, "")
    .trim();
  if (!user) return { ok: false, reason: "Instagram username missing." };

  const fields = `business_discovery.username(${user}){username,followers_count,name}`;
  const res = await fetch(
    `https://graph.facebook.com/v20.0/${encodeURIComponent(
      igBusinessAccountId
    )}?fields=${fields}&access_token=${encodeURIComponent(token)}`
  );
  const data = await res.json();
  if (data?.error?.message) {
    const msg = formatMetaAccessTokenHint(data.error.message);
    const hint = /business_discovery|permission|capability/i.test(msg)
      ? " Token needs instagram_basic and instagram_manage_insights; the Page’s linked IG account must be Business/Creator."
      : "";
    return { ok: false, reason: `${msg}${hint}` };
  }
  const discovered = data?.business_discovery;
  if (!discovered?.username) {
    return {
      ok: false,
      reason: `Instagram business_discovery found no public data for @${user}.`,
    };
  }
  return {
    ok: true,
    data: {
      platform: "instagram",
      accountName: discovered?.name || discovered.username,
      accountHandle: `@${discovered.username}`,
      followers: Number(discovered?.followers_count ?? 0),
    },
  };
}

async function fetchInstagramViaPageScrape(handle, profileUrl) {
  const h = String(handle || "")
    .replace(/^@/, "")
    .trim();
  if (!h) return { ok: false, reason: "Instagram handle missing." };

  const urls = Array.from(
    new Set(
      [
        profileUrl,
        `https://www.instagram.com/${encodeURIComponent(h)}/`,
        `https://r.jina.ai/https://www.instagram.com/${encodeURIComponent(h)}/`,
      ].filter(Boolean)
    )
  );

  try {
    const { text: html } = await fetchTextWithFallback(urls);
    const jsonMetric =
      html.match(/"edge_followed_by"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i) ||
      html.match(/"follower_count"\s*:\s*(\d+)/i) ||
      html.match(/"followers_count"\s*:\s*(\d+)/i);
    const textMetric = html.match(/([\d,.]+(?:[KMB])?)\s+followers/i);
    const parsed = jsonMetric
      ? Number(jsonMetric[1] || 0)
      : textMetric
        ? parseAbbrevNumber(textMetric[1])
        : 0;
    if (parsed > 0) {
      return {
        ok: true,
        data: {
          platform: "instagram",
          accountName: "Instagram",
          accountHandle: `@${h}`,
          followers: parsed,
        },
      };
    }
    return { ok: false, reason: "Could not read follower count from the Instagram profile page." };
  } catch (err) {
    return { ok: false, reason: err.message || "Instagram page fetch failed." };
  }
}

async function fetchInstagramFollowers(input, ctx) {
  const token = String(ctx?.token || "").trim();
  const handle = String(input?.normalizedHandle || extractHandle(input?.identifier) || "")
    .replace(/^@/, "")
    .trim();
  const igUserId = String(ctx?.instagramUserId || "").trim();
  const facebookPageId = String(ctx?.facebookPageId || "").trim();
  const reasons = [];

  if (!token) {
    return {
      ok: false,
      reason: "Missing META_PAGE_ACCESS_TOKEN (or META_APP_ACCESS_TOKEN).",
    };
  }

  if (igUserId) {
    const direct = await fetchInstagramGraphById(igUserId, token, handle);
    if (direct.ok) return direct;
    reasons.push(`By stored IG User ID: ${direct.reason}`);
  }

  if (handle && /^\d{10,25}$/.test(handle)) {
    const byHandleId = await fetchInstagramGraphById(handle, token, handle);
    if (byHandleId.ok) return byHandleId;
    reasons.push(`By numeric handle: ${byHandleId.reason}`);
  }

  let igBusinessAccountId = igUserId;
  if (facebookPageId) {
    const linked = await getPageLinkedInstagramAccount(facebookPageId, token);
    if (linked.ok) {
      igBusinessAccountId = linked.id;
      if (
        handle &&
        linked.username &&
        handle.toLowerCase() === linked.username.toLowerCase()
      ) {
        const own = await fetchInstagramGraphById(linked.id, token, handle);
        if (own.ok) return own;
        reasons.push(`Linked IG account: ${own.reason}`);
      }
    } else {
      reasons.push(`Page → IG link: ${linked.reason}`);
    }
  }

  if (igBusinessAccountId && handle && !/^\d{10,25}$/.test(handle)) {
    const discovery = await fetchInstagramBusinessDiscovery(
      igBusinessAccountId,
      handle,
      token
    );
    if (discovery.ok) return discovery;
    reasons.push(`business_discovery: ${discovery.reason}`);
  }

  if (handle) {
    const scrape = await fetchInstagramViaPageScrape(handle, input.profileUrl);
    if (scrape.ok) return scrape;
    reasons.push(`Page scrape: ${scrape.reason}`);
  }

  return {
    ok: false,
    reason:
      reasons.filter(Boolean).join(" — ") ||
      "Instagram: add Facebook Page ID (with linked IG Business account) or numeric Instagram User ID in User Management → Edit user.",
  };
}

async function fetchTikTokViaPageScrape(handle, profileUrl) {
  const h = String(handle || "")
    .replace(/^@/, "")
    .trim();
  if (!h) return { ok: false, reason: "TikTok handle missing." };

  const urls = Array.from(
    new Set(
      [
        profileUrl,
        `https://www.tiktok.com/@${encodeURIComponent(h)}`,
        `https://r.jina.ai/https://www.tiktok.com/@${encodeURIComponent(h)}`,
      ].filter(Boolean)
    )
  );

  try {
    const { text: html } = await fetchTextWithFallback(urls);
    const jsonMetric =
      html.match(/"followerCount"\s*:\s*(\d+)/i) ||
      html.match(/"follower_count"\s*:\s*(\d+)/i) ||
      html.match(/"fans"\s*:\s*(\d+)/i);
    const textMetric = html.match(/([\d,.]+(?:[KMB])?)\s+Followers/i);
    const parsed = jsonMetric
      ? Number(jsonMetric[1] || 0)
      : textMetric
        ? parseAbbrevNumber(textMetric[1])
        : 0;
    if (parsed > 0) {
      return {
        ok: true,
        data: {
          platform: "tiktok",
          accountName: "TikTok",
          accountHandle: `@${h}`,
          followers: parsed,
        },
      };
    }
    return {
      ok: false,
      reason: "Could not read follower count from the TikTok profile page (layout may have changed).",
    };
  } catch (err) {
    return { ok: false, reason: err.message || "TikTok page fetch failed." };
  }
}

/** TikTok @handle or tiktok.com URL — Research API + page scrape. */
async function fetchTiktokFollowers(input) {
  const { profileUrl, normalizedHandle, identifier } = input;
  const handle = String(normalizedHandle || identifier || "")
    .replace(/^@/, "")
    .trim();
  if (!handle) {
    return { ok: false, reason: "Enter a TikTok @handle or https://www.tiktok.com/@user profile URL." };
  }

  const tiktokProfileUrl =
    profileUrl && /tiktok\.com/i.test(profileUrl)
      ? profileUrl
      : `https://www.tiktok.com/@${encodeURIComponent(handle)}`;

  const clientKey = process.env.TIKTOK_CLIENT_KEY || "";
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET || "";
  const reasons = [];

  if (clientKey && clientSecret) {
    const tokenResult = await getTikTokClientAccessToken(clientKey, clientSecret);
    if (!tokenResult.ok) {
      return tokenResult;
    }
    const research = await fetchTikTokUserByUsername(handle, tokenResult.accessToken);
    if (research.ok) {
      return research;
    }
    reasons.push(research.reason || "TikTok Research API failed.");
  } else {
    reasons.push(
      "TIKTOK_CLIENT_KEY/SECRET not set — using page scrape only (add keys from developers.tiktok.com for Research API)."
    );
  }

  const scrape = await fetchTikTokViaPageScrape(handle, tiktokProfileUrl);
  if (scrape.ok) return scrape;
  reasons.push(scrape.reason || "TikTok page scrape failed.");

  return {
    ok: false,
    reason: reasons.filter(Boolean).join(" "),
  };
}

export async function POST(req) {
  try {
    await requireSuperAdmin();
    const body = await req.json();
    const { userId, siteUrl, accounts, facebookPageId, instagramUserId } = body || {};

    if (!userId) {
      return new Response(JSON.stringify({ error: "userId is required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const user = await getUserById(userId);
    if (!user) {
      return new Response(JSON.stringify({ error: "User not found." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const normalizedSite = normalizeSiteOrigin(siteUrl || user.siteLink || "");
    if (!normalizedSite) {
      return new Response(JSON.stringify({ error: "A valid integrated site URL is required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();
    const globalSite = await prisma.site.findUnique({
      where: { siteUrl: normalizedSite }
    });

    const rows = Array.isArray(accounts) ? accounts : [];
    if (!rows.length) {
      return new Response(JSON.stringify({ error: "accounts array is required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const youtubeApiKey = process.env.YOUTUBE_API_KEY || process.env.PAGESPEED_API_KEY || "";
    const metaToken =
      process.env.META_PAGE_ACCESS_TOKEN || process.env.META_APP_ACCESS_TOKEN || "";
    const fbPageIdResolved = String(facebookPageId || globalSite?.facebookPageId || user.facebookPageId || "").trim();
    const igUserIdResolved = String(instagramUserId || globalSite?.instagramUserId || user.instagramUserId || "").trim();
    const resolved = [];
    const skipped = [];

    for (const row of rows) {
      const platform = normalizePlatform(row.platform);
      if (!platform) {
        skipped.push({
          platform: String(row.platform || "").trim() || "unknown",
          accountHandle: row.accountHandle,
          reason: "This platform is not supported for auto-fetch.",
        });
        continue;
      }
      const input = resolvePlatformInput(platform, row.accountHandle);
      if (input.unsupported) {
        skipped.push({
          platform,
          accountHandle: row.accountHandle,
          reason: input.unsupported,
        });
        continue;
      }
      if (!input.identifier) continue;

      if (platform === "youtube") {
        try {
          if (!youtubeApiKey) {
            skipped.push({
              platform,
              accountHandle: row.accountHandle,
              reason: "Missing YOUTUBE_API_KEY (or PAGESPEED_API_KEY fallback).",
            });
            continue;
          }
          const ytResult = await fetchYoutubeSubscribers(input, youtubeApiKey);
          if (ytResult.ok && ytResult.data) {
            resolved.push(ytResult.data);
          } else {
            skipped.push({
              platform,
              accountHandle: row.accountHandle,
              reason: ytResult.reason || "Channel not found from handle.",
            });
          }
        } catch (error) {
          skipped.push({
            platform,
            accountHandle: row.accountHandle,
            reason: error.message || "Failed to fetch YouTube subscribers.",
          });
        }
      } else if (platform === "facebook") {
        try {
          if (fbPageIdResolved) {
            if (!metaToken) {
              skipped.push({
                platform,
                accountHandle: row.accountHandle,
                reason: "Missing META_PAGE_ACCESS_TOKEN (or META_APP_ACCESS_TOKEN).",
              });
              continue;
            }
            const pageRes = await fetch(
              `https://graph.facebook.com/v20.0/${encodeURIComponent(
                fbPageIdResolved
              )}?fields=name,followers_count,fan_count&access_token=${encodeURIComponent(metaToken)}`
            );
            const pageData = await pageRes.json();
            const count = Number(pageData?.followers_count || pageData?.fan_count || 0);
            if (count > 0) {
              resolved.push({
                platform: "facebook",
                accountName: pageData?.name || "facebook",
                accountHandle: row.accountHandle || `@${fbPageIdResolved}`,
                followers: count,
              });
              continue;
            }
            if (pageData?.error?.message) {
              skipped.push({
                platform,
                accountHandle: row.accountHandle,
                reason: `Facebook Graph by Page ID failed: ${formatMetaAccessTokenHint(pageData.error.message)}`,
              });
              continue;
            }
          }

          const result = await fetchFacebookFollowers(input);
          if (result.ok && result.data) {
            resolved.push(result.data);
          } else {
            skipped.push({
              platform,
              accountHandle: row.accountHandle,
              reason: formatMetaAccessTokenHint(result.reason) || result.reason || "Unable to resolve Facebook followers from handle/link.",
            });
          }
        } catch (error) {
          skipped.push({
            platform,
            accountHandle: row.accountHandle,
            reason: error.message || "Failed to fetch Facebook followers.",
          });
        }
      } else if (platform === "instagram") {
        try {
          const result = await fetchInstagramFollowers(input, {
            token: metaToken,
            instagramUserId: igUserIdResolved,
            facebookPageId: fbPageIdResolved,
          });
          if (result.ok && result.data) {
            resolved.push(result.data);
          } else {
            skipped.push({
              platform,
              accountHandle: row.accountHandle,
              reason: result.reason || "Unable to resolve Instagram followers.",
            });
          }
        } catch (error) {
          skipped.push({
            platform,
            accountHandle: row.accountHandle,
            reason: error.message || "Failed to fetch Instagram followers.",
          });
        }
      } else if (platform === "tiktok") {
        try {
          const result = await fetchTiktokFollowers(input);
          if (result.ok && result.data) {
            resolved.push(result.data);
          } else {
            skipped.push({
              platform,
              accountHandle: row.accountHandle,
              reason: result.reason || "Unable to resolve TikTok followers.",
            });
          }
        } catch (error) {
          skipped.push({
            platform,
            accountHandle: row.accountHandle,
            reason: error.message || "Failed to fetch TikTok followers.",
          });
        }
      } else {
        skipped.push({
          platform,
          accountHandle: row.accountHandle,
          reason: "Platform is not supported for auto-fetch yet.",
        });
      }
    }

    return new Response(
      JSON.stringify({
        message: "Handle fetch completed.",
        siteUrl: normalizedSite,
        userId,
        resolved,
        skipped,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    if (error.message === "Unauthorized" || error.message.includes("Super admin")) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Super admin access required" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ error: error.message || "Failed to fetch handle data." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

