/**
 * Environment Variable Validation
 * Validates all required environment variables at startup
 */

const isProdEnv = process.env.NODE_ENV === "production";

const requiredEnvVars = {
  DATABASE_URL: {
    required: true,
    description: "PostgreSQL connection string",
  },
  NEXTAUTH_SECRET: {
    required: isProdEnv, // Only required in production
    description: "NextAuth secret for JWT signing",
    minLength: 32,
  },
  NEXTAUTH_URL: {
    required: isProdEnv,
    description: "NextAuth URL (required in production)",
  },
  PAGESPEED_API_KEY: {
    required: false,
    description: "Google PageSpeed Insights API key (optional; PageSpeed features disabled if missing)",
  },
};

const optionalEnvVars = {
  GOOGLE_APPLICATION_CREDENTIALS_JSON: {
    description: "Google service account credentials (optional)",
  },
  GA_PROPERTY_PREFIX: {
    description: "Google Analytics property prefix (optional)",
    default: "properties/",
  },
  NODE_ENV: {
    description: "Node environment",
    default: "development",
  },
};

/**
 * Validate environment variables
 * @throws {Error} If required variables are missing or invalid
 */
export function validateEnv() {
  const errors = [];
  const warnings = [];

  // Check required variables
  for (const [key, config] of Object.entries(requiredEnvVars)) {
    const value = process.env[key];

    if (config.required && !value) {
      errors.push(`Missing required environment variable: ${key} (${config.description})`);
      continue;
    }

    if (value && config.minLength && value.length < config.minLength) {
      errors.push(
        `Invalid environment variable: ${key} must be at least ${config.minLength} characters`
      );
    }

    // Security checks (only in production)
    if (isProdEnv && key === "NEXTAUTH_SECRET" && value === "your-secret-key-change-in-production") {
      errors.push(
        "NEXTAUTH_SECRET must be changed from the default value in production"
      );
    }
  }

  // Check optional variables and set defaults
  for (const [key, config] of Object.entries(optionalEnvVars)) {
    if (!process.env[key] && config.default) {
      process.env[key] = config.default;
    }
  }

  // Production-specific checks
  if (isProdEnv) {
    if (!process.env.NEXTAUTH_URL) {
      errors.push("NEXTAUTH_URL is required in production");
    }

    if (process.env.NEXTAUTH_URL && !process.env.NEXTAUTH_URL.startsWith("https://")) {
      warnings.push("NEXTAUTH_URL should use HTTPS in production");
    }

    if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("postgres://") && !process.env.DATABASE_URL.includes("postgresql://")) {
      warnings.push("DATABASE_URL format may be invalid");
    }
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.join("\n")}`);
  }

  if (isProdEnv) {
    if (!process.env.SMM_COLLECT_SECRET?.trim()) {
      warnings.push(
        "SMM_COLLECT_SECRET is not set — GTM ingestion at /api/smm/collect will return 503 until configured."
      );
    }
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim()) {
      warnings.push(
        "GOOGLE_APPLICATION_CREDENTIALS_JSON is not set — Google Search Console API features will not work until configured."
      );
    }
    const uploadsRoot = String(process.env.UPLOADS_ROOT || process.env.CROSSWAY_UPLOADS_ROOT || "").trim();
    if (!uploadsRoot) {
      warnings.push(
        "UPLOADS_ROOT unset — production media defaults to /var/data/uploads. Mount a persistent disk there (or set UPLOADS_ROOT) so post/blog images survive deploys."
      );
    }
  }

  if (warnings.length > 0 && process.env.NODE_ENV === "production") {
    console.warn("Environment warnings:\n" + warnings.join("\n"));
  }

  return true;
}

/**
 * Check if running in production
 * @returns {boolean}
 */
export function isProduction() {
  return process.env.NODE_ENV === "production";
}

