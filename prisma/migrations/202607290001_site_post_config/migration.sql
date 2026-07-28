-- SMM post ingestion config + approval source tracking

ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "source" VARCHAR(32) NOT NULL DEFAULT 'manual';
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "external_id" VARCHAR(191);

CREATE INDEX IF NOT EXISTS "approvals_fb_external_idx" ON "approvals"("facebook_page_id", "external_id");
CREATE INDEX IF NOT EXISTS "approvals_site_external_idx" ON "approvals"("site_link", "external_id");

CREATE TABLE IF NOT EXISTS "site_post_configs" (
    "id" VARCHAR(191) NOT NULL,
    "site_key" VARCHAR(512) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "inbound_secret" VARCHAR(191),
    "meta_page_access_token" TEXT,
    "meta_pull_enabled" BOOLEAN NOT NULL DEFAULT false,
    "facebook_page_id" VARCHAR(191),
    "instagram_user_id" VARCHAR(191),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_post_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "site_post_configs_site_key_key" ON "site_post_configs"("site_key");
CREATE INDEX IF NOT EXISTS "site_post_configs_fb_idx" ON "site_post_configs"("facebook_page_id");
