ALTER TABLE "site_publish_configs" ADD COLUMN IF NOT EXISTS "wordpress_pull_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "site_publish_configs" ADD COLUMN IF NOT EXISTS "wordpress_pull_statuses" JSONB DEFAULT '["draft","future"]';
ALTER TABLE "site_publish_configs" ADD COLUMN IF NOT EXISTS "last_wordpress_pull_at" TIMESTAMP(3);
