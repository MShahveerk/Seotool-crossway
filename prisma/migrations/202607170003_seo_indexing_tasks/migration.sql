CREATE TABLE IF NOT EXISTS "seo_indexing_tasks" (
    "id" VARCHAR(191) NOT NULL,
    "site_url" VARCHAR(512) NOT NULL,
    "page_url" VARCHAR(2048) NOT NULL,
    "title" VARCHAR(512) NOT NULL,
    "issue_type" VARCHAR(64) NOT NULL,
    "cause" TEXT,
    "coverage_state" VARCHAR(255),
    "verdict" VARCHAR(64),
    "summary" TEXT,
    "steps" JSONB NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'open',
    "source_snapshot_id" VARCHAR(191),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "seo_indexing_tasks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "seo_indexing_task_site_page_unique"
  ON "seo_indexing_tasks"("site_url", "page_url");

CREATE INDEX IF NOT EXISTS "seo_indexing_task_site_status_idx"
  ON "seo_indexing_tasks"("site_url", "status");

CREATE INDEX IF NOT EXISTS "seo_indexing_task_issue_idx"
  ON "seo_indexing_tasks"("issue_type");
