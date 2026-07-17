-- Daily URL Inspection monitor
CREATE TABLE IF NOT EXISTS "url_inspection_snapshots" (
    "id" VARCHAR(191) NOT NULL,
    "site_url" VARCHAR(512) NOT NULL,
    "run_date" DATE NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'running',
    "total_urls" INTEGER NOT NULL DEFAULT 0,
    "indexed_count" INTEGER NOT NULL DEFAULT 0,
    "not_indexed_count" INTEGER NOT NULL DEFAULT 0,
    "unknown_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "error_message" TEXT,

    CONSTRAINT "url_inspection_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "url_inspection_snapshot_site_date_unique"
  ON "url_inspection_snapshots"("site_url", "run_date");

CREATE INDEX IF NOT EXISTS "url_inspection_snapshot_site_date_idx"
  ON "url_inspection_snapshots"("site_url", "run_date");

CREATE TABLE IF NOT EXISTS "url_inspection_results" (
    "id" VARCHAR(191) NOT NULL,
    "snapshot_id" VARCHAR(191) NOT NULL,
    "inspection_url" VARCHAR(2048) NOT NULL,
    "category" VARCHAR(32) NOT NULL DEFAULT 'unknown',
    "verdict" VARCHAR(64),
    "coverage_state" VARCHAR(255),
    "indexing_state" VARCHAR(255),
    "robots_txt_state" VARCHAR(128),
    "page_fetch_state" VARCHAR(128),
    "last_crawl_time" TIMESTAMP(3),
    "google_canonical" VARCHAR(2048),
    "user_canonical" VARCHAR(2048),
    "cause" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "url_inspection_results_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "url_inspection_result_snapshot_cat_idx"
  ON "url_inspection_results"("snapshot_id", "category");

CREATE INDEX IF NOT EXISTS "url_inspection_result_url_idx"
  ON "url_inspection_results"("inspection_url");

ALTER TABLE "url_inspection_results"
  ADD CONSTRAINT "url_inspection_results_snapshot_id_fkey"
  FOREIGN KEY ("snapshot_id") REFERENCES "url_inspection_snapshots"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
