-- Keyword Planner API cache (historical metrics + idea lists per site/geo)
CREATE TABLE `keyword_planner_cache` (
    `id` VARCHAR(191) NOT NULL,
    `site_url` VARCHAR(512) NOT NULL,
    `cache_type` VARCHAR(32) NOT NULL,
    `geo_target_id` INTEGER NOT NULL,
    `language_id` INTEGER NOT NULL DEFAULT 1000,
    `payload` JSON NOT NULL,
    `fetched_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `kw_planner_cache_unique`(`site_url`, `cache_type`, `geo_target_id`, `language_id`),
    INDEX `kw_planner_cache_fetched_idx`(`fetched_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
