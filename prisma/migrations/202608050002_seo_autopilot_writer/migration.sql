-- Writer agent columns + writer send payloads for Blog Studio
ALTER TABLE "seo_autopilot_site_configs"
  ADD COLUMN IF NOT EXISTS "writer_provider" VARCHAR(32) NOT NULL DEFAULT 'anthropic',
  ADD COLUMN IF NOT EXISTS "writer_model" VARCHAR(128) NOT NULL DEFAULT 'claude-sonnet-4-6',
  ADD COLUMN IF NOT EXISTS "writer_prompt" TEXT;

CREATE TABLE IF NOT EXISTS "seo_autopilot_writer_sends" (
    "id" VARCHAR(191) NOT NULL,
    "site_link" VARCHAR(512) NOT NULL,
    "run_id" VARCHAR(191),
    "title" VARCHAR(512),
    "topic" VARCHAR(512),
    "payload_json" JSONB NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ready',
    "blog_run_id" VARCHAR(191),
    "last_run_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seo_autopilot_writer_sends_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "seo_autopilot_writer_sends_site_status_idx"
  ON "seo_autopilot_writer_sends"("site_link", "status", "created_at");
