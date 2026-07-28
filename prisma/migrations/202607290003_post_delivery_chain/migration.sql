-- Post outbound delivery chain (Meta, webhook, API, email)

ALTER TABLE "site_post_configs" ADD COLUMN IF NOT EXISTS "delivery_chain" JSONB NOT NULL DEFAULT '["meta","webhook","api","email"]';
ALTER TABLE "site_post_configs" ADD COLUMN IF NOT EXISTS "webhook_url" VARCHAR(2048);
ALTER TABLE "site_post_configs" ADD COLUMN IF NOT EXISTS "webhook_secret" VARCHAR(512);
ALTER TABLE "site_post_configs" ADD COLUMN IF NOT EXISTS "api_url" VARCHAR(2048);
ALTER TABLE "site_post_configs" ADD COLUMN IF NOT EXISTS "api_key" VARCHAR(512);
ALTER TABLE "site_post_configs" ADD COLUMN IF NOT EXISTS "api_headers" JSONB;
ALTER TABLE "site_post_configs" ADD COLUMN IF NOT EXISTS "email_recipients" TEXT;
ALTER TABLE "site_post_configs" ADD COLUMN IF NOT EXISTS "publish_to_facebook" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "site_post_configs" ADD COLUMN IF NOT EXISTS "publish_to_instagram" BOOLEAN NOT NULL DEFAULT true;
