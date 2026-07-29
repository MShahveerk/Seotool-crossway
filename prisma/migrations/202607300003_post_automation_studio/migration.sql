-- Post Automation Studio

CREATE TABLE "post_automation_site_configs" (
    "id" VARCHAR(191) NOT NULL,
    "site_link" VARCHAR(512) NOT NULL,
    "auto_enabled" BOOLEAN NOT NULL DEFAULT false,
    "auto_interval_minutes" INTEGER NOT NULL DEFAULT 720,
    "last_auto_at" TIMESTAMP(3),
    "auto_source" VARCHAR(32) NOT NULL DEFAULT 'seed',
    "seed_prompt" TEXT,
    "hooks_or_keywords" TEXT,
    "tone" TEXT,
    "hashtag_policy" TEXT,
    "default_platform" VARCHAR(32) NOT NULL DEFAULT 'both',
    "cta_text" VARCHAR(512),
    "cta_url" VARCHAR(2048),
    "brand_notes" TEXT,
    "reference_image_path" VARCHAR(512),
    "image_prompt" TEXT,
    "agent1_prompt" TEXT,
    "agent2_prompt" TEXT,
    "interpreter_prompt" TEXT,
    "image_prompt_system" TEXT,
    "agent1_provider" VARCHAR(32) NOT NULL DEFAULT 'openai',
    "agent1_model" VARCHAR(128) NOT NULL DEFAULT 'gpt-5.4-mini',
    "agent2_provider" VARCHAR(32) NOT NULL DEFAULT 'openai',
    "agent2_model" VARCHAR(128) NOT NULL DEFAULT 'gpt-5.4-mini',
    "interpreter_provider" VARCHAR(32) NOT NULL DEFAULT 'openai',
    "interpreter_model" VARCHAR(128) NOT NULL DEFAULT 'gpt-5.4-mini',
    "image_provider" VARCHAR(32) NOT NULL DEFAULT 'openai',
    "image_model" VARCHAR(128) NOT NULL DEFAULT 'gpt-image-1',
    "openai_api_key" TEXT,
    "anthropic_api_key" TEXT,
    "openrouter_api_key" TEXT,
    "pricing_overrides" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "post_automation_site_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "post_automation_site_configs_site_link_key" ON "post_automation_site_configs"("site_link");

CREATE TABLE "post_automation_runs" (
    "id" VARCHAR(191) NOT NULL,
    "site_link" VARCHAR(512) NOT NULL,
    "trigger" VARCHAR(32) NOT NULL DEFAULT 'manual',
    "status" VARCHAR(32) NOT NULL DEFAULT 'queued',
    "topic" VARCHAR(512),
    "seed_prompt_snapshot" TEXT,
    "keywords_snapshot" TEXT,
    "stages_json" JSONB,
    "draft_preview_json" JSONB,
    "approval_id" VARCHAR(191),
    "total_cost_usd" DOUBLE PRECISION,
    "error_message" TEXT,
    "cancel_requested" BOOLEAN NOT NULL DEFAULT false,
    "triggered_by_id" VARCHAR(191),
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "post_automation_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "post_automation_runs_site_created_idx" ON "post_automation_runs"("site_link", "created_at");
CREATE INDEX "post_automation_runs_status_idx" ON "post_automation_runs"("status");

ALTER TABLE "post_automation_runs" ADD CONSTRAINT "post_automation_runs_triggered_by_id_fkey" FOREIGN KEY ("triggered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "post_automation_campaigns" (
    "id" VARCHAR(191) NOT NULL,
    "site_link" VARCHAR(512) NOT NULL,
    "file_name" VARCHAR(512),
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "headers_json" JSONB,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "post_automation_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "post_automation_campaigns_site_created_idx" ON "post_automation_campaigns"("site_link", "created_at");

CREATE TABLE "post_automation_queue_rows" (
    "id" VARCHAR(191) NOT NULL,
    "campaign_id" VARCHAR(191) NOT NULL,
    "site_link" VARCHAR(512) NOT NULL,
    "row_index" INTEGER NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "topic" VARCHAR(512),
    "keywords" TEXT,
    "seed_context" TEXT,
    "image_prompt" TEXT,
    "platform" VARCHAR(32),
    "cta_text" VARCHAR(512),
    "cta_url" VARCHAR(2048),
    "notes" TEXT,
    "raw_json" JSONB,
    "run_id" VARCHAR(191),
    "approval_id" VARCHAR(191),
    "error_message" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "post_automation_queue_rows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "post_automation_queue_campaign_row_unique" ON "post_automation_queue_rows"("campaign_id", "row_index");
CREATE INDEX "post_automation_queue_site_status_idx" ON "post_automation_queue_rows"("site_link", "status", "row_index");

ALTER TABLE "post_automation_queue_rows" ADD CONSTRAINT "post_automation_queue_rows_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "post_automation_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
