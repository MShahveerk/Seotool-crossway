-- Site audit crawl snapshots (history kept for health trends)
CREATE TABLE "site_audit_snapshots" (
    "id" VARCHAR(191) NOT NULL,
    "site_url" VARCHAR(512) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'running',
    "health_score" INTEGER,
    "total_pages" INTEGER NOT NULL DEFAULT 0,
    "critical_count" INTEGER NOT NULL DEFAULT 0,
    "warning_count" INTEGER NOT NULL DEFAULT 0,
    "notice_count" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "site_audit_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "site_audit_site_started_idx" ON "site_audit_snapshots"("site_url", "started_at");

-- Daily Open PageRank authority scores per domain
CREATE TABLE "authority_snapshots" (
    "id" VARCHAR(191) NOT NULL,
    "domain" VARCHAR(255) NOT NULL,
    "score" DOUBLE PRECISION,
    "global_rank" INTEGER,
    "fetched_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "authority_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "authority_domain_date_unique" ON "authority_snapshots"("domain", "fetched_date");
CREATE INDEX "authority_domain_date_idx" ON "authority_snapshots"("domain", "fetched_date");
