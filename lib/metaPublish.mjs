import axios from "axios";

const GRAPH = "https://graph.facebook.com/v20.0";

const logger = {
  info: (msg, data) => console.log(`[INFO] ${msg}`, data || ""),
  error: (msg, data) => console.error(`[ERROR] ${msg}`, data || ""),
};

const getPublicUrl = (imagePath) => {
  const raw = String(imagePath || "").trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  const publicBase = process.env.PUBLIC_URL || process.env.NEXTAUTH_URL;
  if (!publicBase) {
    throw new Error("PUBLIC_URL or NEXTAUTH_URL is required to publish media to Meta.");
  }
  const base = publicBase.replace(/\/+$/, "");
  const path = raw.replace(/^\/+/, "");
  return `${base}/${path}`;
};

function graphError(error, fallback) {
  return error.response?.data?.error?.message || error.message || fallback;
}

function isAlreadyGone(error) {
  const code = error.response?.data?.error?.code;
  const sub = error.response?.data?.error?.error_subcode;
  const message = String(error.response?.data?.error?.message || error.message || "").toLowerCase();
  if (code === 100 || code === 803 || sub === 33) return true;
  return message.includes("does not exist") || message.includes("unsupported get request");
}

/**
 * User tokens must be exchanged for a Page token. Page tokens pass through.
 */
export async function exchangePageAccessToken(pageId, accessToken) {
  const id = String(pageId || "").trim();
  const token = String(accessToken || "").trim();
  if (!id || !token) return token;
  try {
    const tokenRes = await axios.get(`${GRAPH}/${id}`, {
      params: { fields: "access_token,instagram_business_account", access_token: token },
      timeout: 15000,
    });
    if (tokenRes.data?.access_token) {
      logger.info("Successfully exchanged User Token for Page Access Token", { pageId: id });
      return tokenRes.data.access_token;
    }
  } catch {
    logger.info("Falling back to original token (exchanging failed or token is already a Page token).");
  }
  return token;
}

export async function publishToFacebookPage(pageId, accessToken, imagePath, message) {
  if (!pageId || !accessToken) {
    throw new Error("Missing Facebook Page ID or Access Token");
  }

  const pageToken = await exchangePageAccessToken(pageId, accessToken);

  try {
    const url = `${GRAPH}/${pageId}/photos`;
    const absoluteImageUrl = getPublicUrl(imagePath);

    logger.info("Publishing to Facebook Page", { pageId, imageUrl: absoluteImageUrl });

    const response = await axios.post(url, {
      url: absoluteImageUrl,
      message: message || "",
      access_token: pageToken,
    });

    const photoId = response.data?.id ? String(response.data.id) : null;
    const postId = response.data?.post_id ? String(response.data.post_id) : photoId;
    return { success: true, id: postId || photoId, photoId, postId, data: response.data };
  } catch (error) {
    logger.error("Facebook publish error", { error: error.response?.data || error.message });
    throw new Error(graphError(error, "Failed to publish to Facebook"));
  }
}

export async function publishToInstagram(igUserId, accessToken, imagePath, caption, { pageId } = {}) {
  if (!igUserId || !accessToken) {
    throw new Error("Missing Instagram User ID or Access Token");
  }

  let pageToken = accessToken;
  if (pageId) {
    pageToken = await exchangePageAccessToken(pageId, accessToken);
  } else {
    try {
      const accountsRes = await axios.get(`${GRAPH}/me/accounts`, {
        params: { fields: "instagram_business_account,access_token", access_token: accessToken },
        timeout: 20000,
      });
      const matchedPage = (accountsRes.data?.data || []).find(
        (page) => page.instagram_business_account?.id === igUserId
      );
      if (matchedPage?.access_token) {
        pageToken = matchedPage.access_token;
        logger.info("Successfully resolved Instagram linked Page Access Token", { igUserId });
      }
    } catch {
      logger.info("Falling back to original token for Instagram publishing.");
    }
  }

  try {
    const absoluteImageUrl = getPublicUrl(imagePath);
    logger.info("Publishing to Instagram (Step 1: Container)", { igUserId, imageUrl: absoluteImageUrl });

    const containerUrl = `${GRAPH}/${igUserId}/media`;
    const containerResponse = await axios.post(containerUrl, {
      image_url: absoluteImageUrl,
      caption: caption || "",
      access_token: pageToken,
    });

    const creationId = containerResponse.data.id;
    if (!creationId) {
      throw new Error("Failed to get creation_id from Instagram");
    }

    let isReady = false;
    let retries = 5;
    while (retries > 0 && !isReady) {
      try {
        const statusRes = await axios.get(`${GRAPH}/${creationId}`, {
          params: { fields: "status_code", access_token: pageToken },
          timeout: 15000,
        });
        const status = statusRes.data?.status_code;
        if (status === "FINISHED") {
          isReady = true;
          logger.info(`Instagram media container is ready for publishing (retries left: ${retries})`);
        } else if (status === "ERROR") {
          throw new Error("Instagram media processing failed with status ERROR");
        } else {
          logger.info(`Instagram media container processing in progress: ${status}. Waiting...`);
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      } catch (err) {
        if (err.message.includes("failed with status ERROR")) throw err;
        logger.info("Error checking status, retrying...", err.message);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      retries--;
    }

    if (!isReady) {
      throw new Error("Instagram media container did not finish processing in time.");
    }

    logger.info("Publishing to Instagram (Step 2: Publish)", { igUserId, creationId });

    const publishUrl = `${GRAPH}/${igUserId}/media_publish`;
    const publishResponse = await axios.post(publishUrl, {
      creation_id: creationId,
      access_token: pageToken,
    });

    return { success: true, id: publishResponse.data.id, data: publishResponse.data };
  } catch (error) {
    logger.error("Instagram publish error", { error: error.response?.data || error.message });
    throw new Error(graphError(error, "Failed to publish to Instagram"));
  }
}

async function deleteGraphObject(objectId, pageToken, label) {
  const id = String(objectId || "").trim();
  if (!id || !pageToken) return { ok: false, skipped: true, reason: "missing_id" };
  try {
    await axios.delete(`${GRAPH}/${id}`, {
      params: { access_token: pageToken },
      timeout: 20000,
    });
    logger.info(`Deleted ${label} on Meta`, { id });
    return { ok: true, id };
  } catch (error) {
    if (isAlreadyGone(error)) {
      logger.info(`${label} already gone on Meta`, { id });
      return { ok: true, id, alreadyGone: true };
    }
    logger.error(`${label} delete error`, { error: error.response?.data || error.message });
    return { ok: false, id, error: graphError(error, `Failed to delete ${label}`) };
  }
}

export async function deleteFacebookPost(pageId, accessToken, objectId) {
  const pageToken = pageId ? await exchangePageAccessToken(pageId, accessToken) : accessToken;
  return deleteGraphObject(objectId, pageToken, "Facebook post");
}

export async function deleteInstagramMedia(pageId, accessToken, objectId) {
  const pageToken = pageId ? await exchangePageAccessToken(pageId, accessToken) : accessToken;
  return deleteGraphObject(objectId, pageToken, "Instagram media");
}
