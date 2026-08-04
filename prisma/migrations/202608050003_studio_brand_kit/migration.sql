-- Per-site brand frame kit (Instagram matte + logo / Figma / AI chrome) for Blog + Post studios.
ALTER TABLE `blog_automation_site_configs`
  ADD COLUMN `brand_kit_json` JSON NULL;

ALTER TABLE `post_automation_site_configs`
  ADD COLUMN `brand_kit_json` JSON NULL;
