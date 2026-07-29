-- Blog Automation Studio: per-site config + run logs (PostgreSQL)

CREATE TABLE "blog_automation_site_configs" (
    "id" VARCHAR(191) NOT NULL,
    "site_link" VARCHAR(512) NOT NULL,
    "auto_enabled" BOOLEAN NOT NULL DEFAULT false,
    "auto_interval_minutes" INTEGER NOT NULL DEFAULT 1440,
    "last_auto_at" TIMESTAMP(3),
    "seed_prompt" TEXT,
    "must_follow_keywords" TEXT,
    "internal_links_json" JSONB,
    "external_links_json" JSONB,
    "secondary_keywords" TEXT,
    "target_audience" TEXT,
    "location" VARCHAR(512),
    "cta_text" VARCHAR(512),
    "cta_url" VARCHAR(2048),
    "word_count_range" VARCHAR(64),
    "content_type" VARCHAR(128),
    "brand_notes" TEXT,
    "serp_notes" TEXT,
    "reference_image_path" VARCHAR(512),
    "image_prompt" TEXT,
    "agent1_prompt" TEXT,
    "agent2_prompt" TEXT,
    "agent3_prompt" TEXT,
    "interpreter_prompt" TEXT,
    "image_prompt_system" TEXT,
    "agent1_provider" VARCHAR(32) NOT NULL DEFAULT 'openai',
    "agent1_model" VARCHAR(128) NOT NULL DEFAULT 'gpt-5.4-mini',
    "agent2_provider" VARCHAR(32) NOT NULL DEFAULT 'openai',
    "agent2_model" VARCHAR(128) NOT NULL DEFAULT 'gpt-5.4-mini',
    "agent3_provider" VARCHAR(32) NOT NULL DEFAULT 'anthropic',
    "agent3_model" VARCHAR(128) NOT NULL DEFAULT 'claude-sonnet-4-6',
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

    CONSTRAINT "blog_automation_site_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "blog_automation_site_configs_site_link_key" ON "blog_automation_site_configs"("site_link");

CREATE TABLE "blog_automation_runs" (
    "id" VARCHAR(191) NOT NULL,
    "site_link" VARCHAR(512) NOT NULL,
    "trigger" VARCHAR(32) NOT NULL DEFAULT 'manual',
    "status" VARCHAR(32) NOT NULL DEFAULT 'queued',
    "topic" VARCHAR(512),
    "seed_prompt_snapshot" TEXT,
    "keywords_snapshot" TEXT,
    "stages_json" JSONB,
    "draft_preview_json" JSONB,
    "blog_post_id" VARCHAR(191),
    "total_cost_usd" DOUBLE PRECISION,
    "error_message" TEXT,
    "cancel_requested" BOOLEAN NOT NULL DEFAULT false,
    "triggered_by_id" VARCHAR(191),
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_automation_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "blog_automation_runs_site_created_idx" ON "blog_automation_runs"("site_link", "created_at");
CREATE INDEX "blog_automation_runs_status_idx" ON "blog_automation_runs"("status");

ALTER TABLE "blog_automation_runs" ADD CONSTRAINT "blog_automation_runs_triggered_by_id_fkey" FOREIGN KEY ("triggered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
