-- Excel campaign queue for Blog Automation Studio

ALTER TABLE "blog_automation_site_configs" ADD COLUMN "auto_source" VARCHAR(32) NOT NULL DEFAULT 'seed';

CREATE TABLE "blog_automation_campaigns" (
    "id" VARCHAR(191) NOT NULL,
    "site_link" VARCHAR(512) NOT NULL,
    "file_name" VARCHAR(512),
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "headers_json" JSONB,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "blog_automation_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "blog_automation_campaigns_site_created_idx" ON "blog_automation_campaigns"("site_link", "created_at");

CREATE TABLE "blog_automation_queue_rows" (
    "id" VARCHAR(191) NOT NULL,
    "campaign_id" VARCHAR(191) NOT NULL,
    "site_link" VARCHAR(512) NOT NULL,
    "row_index" INTEGER NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "topic" VARCHAR(512),
    "keywords" TEXT,
    "seed_context" TEXT,
    "image_prompt" TEXT,
    "audience" TEXT,
    "cta_text" VARCHAR(512),
    "cta_url" VARCHAR(2048),
    "notes" TEXT,
    "raw_json" JSONB,
    "run_id" VARCHAR(191),
    "blog_post_id" VARCHAR(191),
    "error_message" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "blog_automation_queue_rows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "blog_automation_queue_campaign_row_unique" ON "blog_automation_queue_rows"("campaign_id", "row_index");
CREATE INDEX "blog_automation_queue_site_status_idx" ON "blog_automation_queue_rows"("site_link", "status", "row_index");

ALTER TABLE "blog_automation_queue_rows" ADD CONSTRAINT "blog_automation_queue_rows_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "blog_automation_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
