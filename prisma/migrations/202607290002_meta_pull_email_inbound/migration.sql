-- Meta draft pull timestamps + IMAP email inbound for posts and blogs

ALTER TABLE "site_post_configs" ADD COLUMN IF NOT EXISTS "last_meta_pull_at" TIMESTAMP(3);
ALTER TABLE "site_post_configs" ADD COLUMN IF NOT EXISTS "email_inbound_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "site_post_configs" ADD COLUMN IF NOT EXISTS "imap_host" VARCHAR(255);
ALTER TABLE "site_post_configs" ADD COLUMN IF NOT EXISTS "imap_port" INTEGER NOT NULL DEFAULT 993;
ALTER TABLE "site_post_configs" ADD COLUMN IF NOT EXISTS "imap_user" VARCHAR(255);
ALTER TABLE "site_post_configs" ADD COLUMN IF NOT EXISTS "imap_password" TEXT;
ALTER TABLE "site_post_configs" ADD COLUMN IF NOT EXISTS "imap_folder" VARCHAR(128) NOT NULL DEFAULT 'INBOX';
ALTER TABLE "site_post_configs" ADD COLUMN IF NOT EXISTS "last_email_pull_at" TIMESTAMP(3);

ALTER TABLE "site_publish_configs" ADD COLUMN IF NOT EXISTS "email_inbound_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "site_publish_configs" ADD COLUMN IF NOT EXISTS "imap_host" VARCHAR(255);
ALTER TABLE "site_publish_configs" ADD COLUMN IF NOT EXISTS "imap_port" INTEGER NOT NULL DEFAULT 993;
ALTER TABLE "site_publish_configs" ADD COLUMN IF NOT EXISTS "imap_user" VARCHAR(255);
ALTER TABLE "site_publish_configs" ADD COLUMN IF NOT EXISTS "imap_password" TEXT;
ALTER TABLE "site_publish_configs" ADD COLUMN IF NOT EXISTS "imap_folder" VARCHAR(128) NOT NULL DEFAULT 'INBOX';
ALTER TABLE "site_publish_configs" ADD COLUMN IF NOT EXISTS "last_email_pull_at" TIMESTAMP(3);
