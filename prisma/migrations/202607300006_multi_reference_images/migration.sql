-- Multiple Assets style-reference images (up to 4) for blog + post studios.
-- Keeps legacy reference_image_path as the primary (first) path.

ALTER TABLE "blog_automation_site_configs" ADD COLUMN IF NOT EXISTS "reference_image_paths" JSONB;
ALTER TABLE "post_automation_site_configs" ADD COLUMN IF NOT EXISTS "reference_image_paths" JSONB;

-- Backfill arrays from the existing single path where present.
UPDATE "blog_automation_site_configs"
SET "reference_image_paths" = jsonb_build_array("reference_image_path")
WHERE "reference_image_path" IS NOT NULL
  AND ("reference_image_paths" IS NULL OR "reference_image_paths" = 'null'::jsonb);

UPDATE "post_automation_site_configs"
SET "reference_image_paths" = jsonb_build_array("reference_image_path")
WHERE "reference_image_path" IS NOT NULL
  AND ("reference_image_paths" IS NULL OR "reference_image_paths" = 'null'::jsonb);
