-- App settings (key/value) + SEO digest recipient list
CREATE TABLE IF NOT EXISTS "app_settings" (
    "key" VARCHAR(191) NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "seo_digest_recipients" (
    "id" VARCHAR(191) NOT NULL,
    "email" VARCHAR(191) NOT NULL,
    "label" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_digest_recipients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "seo_digest_recipients_email_key" ON "seo_digest_recipients"("email");
