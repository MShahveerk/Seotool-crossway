-- Content Autoscheduler (posts + blogs)

CREATE TABLE "content_autoschedule_configs" (
    "id" VARCHAR(191) NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "site_link" VARCHAR(512) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "horizon_days" INTEGER NOT NULL DEFAULT 14,
    "items_per_day" INTEGER NOT NULL DEFAULT 1,
    "schedule_hour" INTEGER NOT NULL DEFAULT 10,
    "schedule_minute" INTEGER NOT NULL DEFAULT 0,
    "last_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "content_autoschedule_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "content_autoschedule_kind_site_unique" ON "content_autoschedule_configs"("kind", "site_link");
CREATE INDEX "content_autoschedule_enabled_idx" ON "content_autoschedule_configs"("enabled");
