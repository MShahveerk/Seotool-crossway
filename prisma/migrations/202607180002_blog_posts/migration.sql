-- Blog approval + publishing (additive)

CREATE TABLE "blog_posts" (
    "id" VARCHAR(191) NOT NULL,
    "site_link" VARCHAR(512) NOT NULL,
    "assignee_id" VARCHAR(191) NOT NULL,
    "created_by_id" VARCHAR(191) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "source" VARCHAR(32) NOT NULL DEFAULT 'manual',
    "external_id" VARCHAR(191),
    "title" VARCHAR(512) NOT NULL,
    "slug" VARCHAR(255),
    "excerpt" TEXT,
    "content" TEXT NOT NULL,
    "wp_status" VARCHAR(32) NOT NULL DEFAULT 'draft',
    "featured_image_path" VARCHAR(512),
    "featured_image_alt" VARCHAR(512),
    "payload" JSONB NOT NULL,
    "user_edited_title" VARCHAR(512),
    "user_edited_slug" VARCHAR(255),
    "user_edited_excerpt" TEXT,
    "user_edited_content" TEXT,
    "scheduled_for" TIMESTAMP(3),
    "publish_status" VARCHAR(32) DEFAULT 'unpublish',
    "publish_error" TEXT,
    "external_post_id" VARCHAR(191),
    "responded_at" TIMESTAMP(3),
    "last_action" VARCHAR(32),
    "awaiting_admin_review" BOOLEAN NOT NULL DEFAULT false,
    "hidden_from_assignee" BOOLEAN NOT NULL DEFAULT false,
    "skipped_assignee_review" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "site_publish_configs" (
    "id" VARCHAR(191) NOT NULL,
    "site_link" VARCHAR(512) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "inbound_secret" VARCHAR(191),
    "delivery_chain" JSONB NOT NULL DEFAULT '["webhook","wordpress","api","email"]',
    "webhook_url" VARCHAR(2048),
    "webhook_secret" VARCHAR(512),
    "api_url" VARCHAR(2048),
    "api_key" VARCHAR(512),
    "api_headers" JSONB,
    "wordpress_url" VARCHAR(2048),
    "wordpress_username" VARCHAR(191),
    "wordpress_app_password" VARCHAR(512),
    "email_recipients" TEXT,
    "default_categories" JSONB,
    "default_tags" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_publish_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "blog_publish_logs" (
    "id" VARCHAR(191) NOT NULL,
    "blog_post_id" VARCHAR(191) NOT NULL,
    "method" VARCHAR(32) NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "external_id" VARCHAR(191),
    "response_body" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blog_publish_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "blog_post_site_external_unique" ON "blog_posts"("site_link", "external_id");
CREATE INDEX "blog_posts_assignee_id_idx" ON "blog_posts"("assignee_id");
CREATE INDEX "blog_posts_site_link_idx" ON "blog_posts"("site_link");
CREATE INDEX "blog_posts_status_idx" ON "blog_posts"("status");
CREATE INDEX "blog_posts_scheduled_for_idx" ON "blog_posts"("scheduled_for");
CREATE INDEX "blog_posts_publish_status_idx" ON "blog_posts"("publish_status");
CREATE UNIQUE INDEX "site_publish_configs_site_link_key" ON "site_publish_configs"("site_link");
CREATE INDEX "blog_publish_logs_post_created_idx" ON "blog_publish_logs"("blog_post_id", "created_at");

ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "blog_publish_logs" ADD CONSTRAINT "blog_publish_logs_blog_post_id_fkey" FOREIGN KEY ("blog_post_id") REFERENCES "blog_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
