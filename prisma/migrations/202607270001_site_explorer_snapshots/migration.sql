-- Daily Common Crawl + Open PageRank site explorer snapshots per domain.

CREATE TABLE "site_explorer_snapshots" (
    "id" VARCHAR(191) NOT NULL,
    "domain" VARCHAR(255) NOT NULL,
    "site_url" VARCHAR(512) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'running',
    "crawl_id" VARCHAR(64),
    "crawl_name" VARCHAR(128),
    "indexed_urls" INTEGER NOT NULL DEFAULT 0,
    "subdomain_count" INTEGER NOT NULL DEFAULT 0,
    "referring_domains_count" INTEGER NOT NULL DEFAULT 0,
    "referring_domains_opr" INTEGER,
    "authority_score" DOUBLE PRECISION,
    "global_rank" INTEGER,
    "payload" JSONB,
    "error_message" TEXT,
    "fetched_date" DATE NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "site_explorer_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "site_explorer_domain_date_unique" ON "site_explorer_snapshots"("domain", "fetched_date");
CREATE INDEX "site_explorer_domain_date_idx" ON "site_explorer_snapshots"("domain", "fetched_date");

ALTER TABLE "authority_snapshots" ADD COLUMN IF NOT EXISTS "referring_domains" INTEGER;
