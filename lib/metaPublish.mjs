import axios from 'axios';

// Fallback logger for the standalone scheduler
const logger = {
  info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
  error: (msg, data) => console.error(`[ERROR] ${msg}`, data || '')
};

const getPublicUrl = (imagePath) => {
  const publicBase = process.env.PUBLIC_URL || process.env.NEXTAUTH_URL;
  const base = publicBase.replace(/\/+$/, '');
  const path = imagePath.replace(/^\/+/, '');
  return `${base}/${path}`;
};

export async function publishToFacebookPage(pageId, accessToken, imagePath, message) {
  if (!pageId || !accessToken) {
    throw new Error("Missing Facebook Page ID or Access Token");
  }

  // Dynamically resolve Page Access Token if a User Access Token is provided
  let pageToken = accessToken;
  try {
    const tokenRes = await axios.get(
      `https://graph.facebook.com/v20.0/${pageId}?fields=access_token&access_token=${accessToken}`
    );
    if (tokenRes.data?.access_token) {
      pageToken = tokenRes.data.access_token;
      logger.info("Successfully exchanged User Token for Page Access Token", { pageId });
    }
  } catch (err) {
    logger.info("Falling back to original token (exchanging failed or token is already a Page token).");
  }

  try {
    const url = `https://graph.facebook.com/v20.0/${pageId}/photos`;
    const absoluteImageUrl = getPublicUrl(imagePath);

    logger.info("Publishing to Facebook Page", { pageId, imageUrl: absoluteImageUrl });

    const response = await axios.post(url, {
      url: absoluteImageUrl,
      message: message || "",
      access_token: pageToken,
    });

    return { success: true, id: response.data.id, data: response.data };
  } catch (error) {
    logger.error("Facebook publish error", { error: error.response?.data || error.message });
    throw new Error(error.response?.data?.error?.message || "Failed to publish to Facebook");
  }
}

export async function publishToInstagram(igUserId, accessToken, imagePath, caption) {
  if (!igUserId || !accessToken) {
    throw new Error("Missing Instagram User ID or Access Token");
  }

  // Dynamically resolve Page Access Token for the linked Instagram account
  let pageToken = accessToken;
  try {
    const accountsRes = await axios.get(
      `https://graph.facebook.com/v20.0/me/accounts?fields=instagram_business_account,access_token&access_token=${accessToken}`
    );
    const matchedPage = (accountsRes.data?.data || []).find(
      (page) => page.instagram_business_account?.id === igUserId
    );
    if (matchedPage?.access_token) {
      pageToken = matchedPage.access_token;
      logger.info("Successfully resolved Instagram linked Page Access Token", { igUserId });
    }
  } catch (err) {
    logger.info("Falling back to original token for Instagram publishing.");
  }

  try {
    const absoluteImageUrl = getPublicUrl(imagePath);
    logger.info("Publishing to Instagram (Step 1: Container)", { igUserId, imageUrl: absoluteImageUrl });

    const containerUrl = `https://graph.facebook.com/v20.0/${igUserId}/media`;
    const containerResponse = await axios.post(containerUrl, {
      image_url: absoluteImageUrl,
      caption: caption || "",
      access_token: pageToken,
    });

    const creationId = containerResponse.data.id;
    if (!creationId) {
      throw new Error("Failed to get creation_id from Instagram");
    }

    // Poll the container status before publishing
    let isReady = false;
    let retries = 5;
    while (retries > 0 && !isReady) {
      try {
        const statusRes = await axios.get(
          `https://graph.facebook.com/v20.0/${creationId}?fields=status_code&access_token=${pageToken}`
        );
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

    const publishUrl = `https://graph.facebook.com/v20.0/${igUserId}/media_publish`;
    const publishResponse = await axios.post(publishUrl, {
      creation_id: creationId,
      access_token: pageToken,
    });

    return { success: true, id: publishResponse.data.id, data: publishResponse.data };
  } catch (error) {
    logger.error("Instagram publish error", { error: error.response?.data || error.message });
    throw new Error(error.response?.data?.error?.message || "Failed to publish to Instagram");
  }
}