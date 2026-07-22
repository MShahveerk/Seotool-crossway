-- Cached PageSpeed Insights runs per site + strategy (refreshed by in-app cron)
CREATE TABLE "pagespeed_snapshots" (
    "id" VARCHAR(191) NOT NULL,
    "site_url" VARCHAR(512) NOT NULL,
    "strategy" VARCHAR(16) NOT NULL DEFAULT 'mobile',
    "status" VARCHAR(32) NOT NULL DEFAULT 'success',
    "payload" JSONB,
    "error_message" TEXT,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pagespeed_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pagespeed_snapshot_site_strategy_unique" ON "pagespeed_snapshots"("site_url", "strategy");
CREATE INDEX "pagespeed_snapshots_fetched_at_idx" ON "pagespeed_snapshots"("fetched_at");
