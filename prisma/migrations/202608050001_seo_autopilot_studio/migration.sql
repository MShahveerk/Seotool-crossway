-- SEO Autopilot studio tables
CREATE TABLE IF NOT EXISTS "seo_autopilot_site_configs" (
    "id" VARCHAR(191) NOT NULL,
    "site_link" VARCHAR(512) NOT NULL,
    "auto_enabled" BOOLEAN NOT NULL DEFAULT false,
    "auto_interval_minutes" INTEGER NOT NULL DEFAULT 10080,
    "last_auto_at" TIMESTAMP(3),
    "brand_name" VARCHAR(256),
    "category" VARCHAR(512),
    "buying_questions" TEXT,
    "competitors" TEXT,
    "proof_point" TEXT,
    "brand_notes" TEXT,
    "enabled_agents" TEXT,
    "openai_api_key" TEXT,
    "anthropic_api_key" TEXT,
    "openrouter_api_key" TEXT,
    "smtp_host" VARCHAR(256),
    "smtp_port" INTEGER,
    "smtp_user" VARCHAR(256),
    "smtp_pass" TEXT,
    "smtp_from" VARCHAR(256),
    "auditor_provider" VARCHAR(32) NOT NULL DEFAULT 'openai',
    "auditor_model" VARCHAR(128) NOT NULL DEFAULT 'gpt-5.4-mini',
    "auditor_prompt" TEXT,
    "geo_spy_provider" VARCHAR(32) NOT NULL DEFAULT 'openai',
    "geo_spy_model" VARCHAR(128) NOT NULL DEFAULT 'gpt-5.4-mini',
    "geo_spy_prompt" TEXT,
    "diagnoser_provider" VARCHAR(32) NOT NULL DEFAULT 'openai',
    "diagnoser_model" VARCHAR(128) NOT NULL DEFAULT 'gpt-5.4-mini',
    "diagnoser_prompt" TEXT,
    "fixer_provider" VARCHAR(32) NOT NULL DEFAULT 'anthropic',
    "fixer_model" VARCHAR(128) NOT NULL DEFAULT 'claude-sonnet-4-6',
    "fixer_prompt" TEXT,
    "foundation_provider" VARCHAR(32) NOT NULL DEFAULT 'openai',
    "foundation_model" VARCHAR(128) NOT NULL DEFAULT 'gpt-5.4-mini',
    "foundation_prompt" TEXT,
    "pitcher_provider" VARCHAR(32) NOT NULL DEFAULT 'anthropic',
    "pitcher_model" VARCHAR(128) NOT NULL DEFAULT 'claude-sonnet-4-6',
    "pitcher_prompt" TEXT,
    "tracker_provider" VARCHAR(32) NOT NULL DEFAULT 'openai',
    "tracker_model" VARCHAR(128) NOT NULL DEFAULT 'gpt-5.4-mini',
    "tracker_prompt" TEXT,
    "latest_scorecard_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seo_autopilot_site_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "seo_autopilot_site_configs_site_link_key" ON "seo_autopilot_site_configs"("site_link");

CREATE TABLE IF NOT EXISTS "seo_autopilot_runs" (
    "id" VARCHAR(191) NOT NULL,
    "site_link" VARCHAR(512) NOT NULL,
    "trigger" VARCHAR(32) NOT NULL DEFAULT 'manual',
    "status" VARCHAR(32) NOT NULL DEFAULT 'queued',
    "agents_json" JSONB,
    "stages_json" JSONB,
    "scorecard_json" JSONB,
    "artifacts_json" JSONB,
    "total_cost_usd" DOUBLE PRECISION,
    "error_message" TEXT,
    "cancel_requested" BOOLEAN NOT NULL DEFAULT false,
    "triggered_by_id" VARCHAR(191),
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seo_autopilot_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "seo_autopilot_runs_site_created_idx" ON "seo_autopilot_runs"("site_link", "created_at");
CREATE INDEX IF NOT EXISTS "seo_autopilot_runs_status_idx" ON "seo_autopilot_runs"("status");

CREATE TABLE IF NOT EXISTS "seo_autopilot_artifacts" (
    "id" VARCHAR(191) NOT NULL,
    "site_link" VARCHAR(512) NOT NULL,
    "run_id" VARCHAR(191),
    "kind" VARCHAR(64) NOT NULL,
    "title" VARCHAR(512),
    "page_url" VARCHAR(2048),
    "content_text" TEXT,
    "content_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seo_autopilot_artifacts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "seo_autopilot_artifacts_site_kind_idx" ON "seo_autopilot_artifacts"("site_link", "kind", "created_at");

CREATE TABLE IF NOT EXISTS "seo_autopilot_pitches" (
    "id" VARCHAR(191) NOT NULL,
    "site_link" VARCHAR(512) NOT NULL,
    "run_id" VARCHAR(191),
    "source" VARCHAR(64) NOT NULL DEFAULT 'editorial',
    "title" VARCHAR(512),
    "target_name" VARCHAR(256),
    "target_url" VARCHAR(2048),
    "target_email" VARCHAR(256),
    "subject" VARCHAR(512),
    "body_text" TEXT,
    "body_html" TEXT,
    "do_follow" BOOLEAN,
    "domain_authority" INTEGER,
    "status" VARCHAR(32) NOT NULL DEFAULT 'draft',
    "error_message" TEXT,
    "meta_json" JSONB,
    "sent_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seo_autopilot_pitches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "seo_autopilot_pitches_site_status_idx" ON "seo_autopilot_pitches"("site_link", "status", "created_at");

DO $$ BEGIN
  ALTER TABLE "seo_autopilot_runs"
    ADD CONSTRAINT "seo_autopilot_runs_triggered_by_id_fkey"
    FOREIGN KEY ("triggered_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
