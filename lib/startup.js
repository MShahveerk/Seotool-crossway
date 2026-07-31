/**
 * Startup Validation
 * Validates environment and configuration on application startup
 */

import { validateEnv } from "./env";
import { logger } from "./logger";

/**
 * Run startup validations
 * Should be called at application startup
 */
export async function validateStartup() {
  try {
    logger.info("Starting application validation...");
    
    // Validate environment variables
    validateEnv();

    // Persistent media disk — posts + blogs must survive deploys (/var/data)
    try {
      const { ensureUploadDirs } = await import("./uploadPaths.js");
      const dirs = ensureUploadDirs();
      logger.info("Upload directories ready", dirs);
    } catch (uploadErr) {
      const msg = uploadErr?.message || String(uploadErr);
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          `Upload disk not writable (${msg}). Mount a persistent volume at /var/data (or set UPLOADS_ROOT) and ensure the app user can write to uploads/approvals and uploads/blogs.`
        );
      }
      logger.warn("Upload directories not ready (non-blocking in development)", { error: msg });
    }
    
    logger.info("Application validation completed successfully");
    return true;
  } catch (error) {
    const isProduction = process.env.NODE_ENV === "production";
    
    // In development, log warning but don't block startup
    if (!isProduction) {
      logger.warn("Startup validation failed (non-blocking in development)", { error: error.message });
      return false;
    }
    
    // In production, throw error to block startup
    logger.error("Startup validation failed", { error: error.message });
    throw error;
  }
}

