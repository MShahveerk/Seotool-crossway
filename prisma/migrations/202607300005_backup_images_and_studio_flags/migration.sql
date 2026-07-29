-- Backup creatives on approvals / blogs + studio toggle

ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "backup_image_paths" JSONB;
ALTER TABLE "blog_posts" ADD COLUMN IF NOT EXISTS "backup_image_paths" JSONB;

ALTER TABLE "blog_automation_site_configs" ADD COLUMN IF NOT EXISTS "generate_backup_images" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "post_automation_site_configs" ADD COLUMN IF NOT EXISTS "generate_backup_images" BOOLEAN NOT NULL DEFAULT false;
