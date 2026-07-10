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

  try {
    const url = `https://graph.facebook.com/v20.0/${pageId}/photos`;
    const absoluteImageUrl = getPublicUrl(imagePath);

    logger.info("Publishing to Facebook Page", { pageId, imageUrl: absoluteImageUrl });

    const response = await axios.post(url, {
      url: absoluteImageUrl,
      message: message || "",
      access_token: accessToken,
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

  try {
    const absoluteImageUrl = getPublicUrl(imagePath);
    logger.info("Publishing to Instagram (Step 1: Container)", { igUserId, imageUrl: absoluteImageUrl });

    const containerUrl = `https://graph.facebook.com/v20.0/${igUserId}/media`;
    const containerResponse = await axios.post(containerUrl, {
      image_url: absoluteImageUrl,
      caption: caption || "",
      access_token: accessToken,
    });

    const creationId = containerResponse.data.id;
    if (!creationId) {
      throw new Error("Failed to get creation_id from Instagram");
    }

    logger.info("Publishing to Instagram (Step 2: Publish)", { igUserId, creationId });

    const publishUrl = `https://graph.facebook.com/v20.0/${igUserId}/media_publish`;
    const publishResponse = await axios.post(publishUrl, {
      creation_id: creationId,
      access_token: accessToken,
    });

    return { success: true, id: publishResponse.data.id, data: publishResponse.data };
  } catch (error) {
    logger.error("Instagram publish error", { error: error.response?.data || error.message });
    throw new Error(error.response?.data?.error?.message || "Failed to publish to Instagram");
  }
}